/**
 * Composição do servidor: HTTP + WebSocket + sala + heartbeat + métricas +
 * desligamento.
 *
 * `createChatServer` não tem efeito colateral ao ser importado nem ao ser
 * criado: nada escuta porta e nenhum timer começa até `listen()`, e `close()`
 * desfaz tudo o que `listen()` criou. Isso permite subir servidores isolados
 * nos testes.
 */

import http from "node:http";
import { WebSocketServer } from "ws";
import { createDefaultRegistry } from "../commands/index.js";
import { createAdminAuth } from "../commands/adminAuth.js";
import { createCommandExecutor } from "../commands/executor.js";
import { createMetrics } from "../metrics.js";
import { createIdentityStore } from "../room/sessions.js";
import { createRoom } from "../room/room.js";
import { createConnectionHandler } from "./connection.js";
import { createHttpHandler } from "./http.js";

/** Tempo máximo para os clientes fecharem antes de o processo desistir. */
export const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Janela de agrupamento da lista de pessoas. Entradas e saídas dentro dela
 * geram um único envio da lista, com o estado final. Escolhida por medição
 * (relatório da Fase 3): perceptível como instantânea e suficiente para
 * absorver uma tempestade de reconexões.
 */
export const USER_LIST_COALESCE_MS = 50;

/**
 * @param {{
 *   config: import("../config.js").Config,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   version?: string,
 * }} options
 */
export const createChatServer = ({ config, log, version = "desconhecida" }) => {
    const metrics = createMetrics();
    const identities = createIdentityStore();

    const room = createRoom({
        identities,
        log,
        historySize: config.historySize,
        historyOnJoin: config.historyOnJoin,
        userListScheduler: {
            schedule: (callback) => setTimeout(callback, USER_LIST_COALESCE_MS),
            cancel: (handle) => clearTimeout(/** @type {NodeJS.Timeout} */ (handle)),
        },
        onUserList: () => metrics.count("userListBroadcasts"),
        leaveGraceMs: config.leaveGraceMs,
        leaveScheduler: {
            schedule: (callback, ms) => setTimeout(callback, ms),
            cancel: (handle) => clearTimeout(/** @type {NodeJS.Timeout} */ (handle)),
        },
        deliver: (member, data) => deliver(member, data),
    });

    /**
     * Entrega um quadro a uma conexão (usado pela sala e pelos comandos).
     * @param {unknown} member
     * @param {string} data
     */
    function deliver(member, data) {
        const ws = /** @type {import("ws").WebSocket} */ (member);
        if (ws.readyState !== ws.OPEN) return;
        // Cliente que parou de ler o socket: a fila de envio cresce sem
        // limite na memória do servidor (medido: +56 MB com um único
        // cliente parado). Acima do teto, a conexão é encerrada; o
        // `close` desfaz a participação normalmente.
        if (ws.bufferedAmount > config.maxBufferedBytes) {
            metrics.count("slowConsumerDisconnects");
            const user = room.userIdOf(ws);
            log("warn", "slow_consumer", {
                bufferedBytes: ws.bufferedAmount,
                ...(user ? { user } : {}),
            });
            ws.terminate();
            return;
        }
        ws.send(data);
    }

    const commands = createCommandExecutor({
        registry: createDefaultRegistry(),
        room,
        log,
        metrics,
        services: {
            deliver,
            adminAuth: createAdminAuth({ adminKey: config.adminKey }),
            version,
            startedAt: Date.now(),
            disconnect: (member, code, reason) =>
                /** @type {import("ws").WebSocket} */ (member).close(code, reason),
        },
    });

    let closing = false;
    let listening = false;

    const gauges = () => ({
        connections: wss.clients.size,
        users: room.memberCount,
        identities: identities.size,
    });

    const httpServer = http.createServer(
        createHttpHandler({
            stats: () => ({ connections: wss.clients.size, users: room.memberCount }),
            readiness: () => {
                if (closing || !listening) return "draining";
                return wss.clients.size >= config.maxConnections ? "full" : "ready";
            },
            metrics: config.metricsEnabled ? () => metrics.snapshot(gauges()) : null,
        }),
    );

    const wss = new WebSocketServer({
        server: httpServer,
        // Recusa quadros acima do limite antes de bufferizá-los.
        maxPayload: config.maxPayloadBytes,
        verifyClient:
            config.allowedOrigins.length === 0
                ? undefined
                : (info, callback) => {
                      const ok = config.allowedOrigins.includes(info.origin);
                      if (!ok) metrics.count("connectionsRejected", "origin");
                      callback(ok, ok ? undefined : 403, ok ? undefined : "Origem não permitida");
                  },
    });

    // O `ws` reemite aqui os erros do servidor HTTP. Antes do `listen`
    // concluir, quem trata é a rejeição de `listen()`; depois, o erro é
    // registrado como falha de infraestrutura.
    wss.on("error", (error) => {
        if (!listening) return;
        log("error", "server_error", {
            code: /** @type {NodeJS.ErrnoException} */ (error).code,
            message: error.message,
        });
    });

    /**
     * Pings seguidos sem nenhum sinal de vida (pong ou quadro qualquer).
     * WeakMap: a entrada some com a conexão, sem limpeza manual.
     */
    const missed = new WeakMap();
    const markAlive = (ws) => missed.set(ws, 0);

    const handleConnection = createConnectionHandler({
        room,
        commands,
        log,
        metrics,
        messageRate: config.messageRate,
        signalRate: config.signalRate,
        loginTimeoutMs: config.loginTimeoutMs,
        onActivity: markAlive,
    });

    wss.on("connection", (ws) => {
        if (closing) {
            metrics.count("connectionsRejected", "shutting_down");
            ws.close(1001, "Servidor reiniciando");
            return;
        }
        // Teto de conexões: independe de proxy/IP e protege a memória.
        if (wss.clients.size > config.maxConnections) {
            metrics.count("connectionsRejected", "capacity");
            ws.close(1013, "Servidor cheio, tente novamente em instantes");
            return;
        }
        metrics.count("connectionsOpened");
        markAlive(ws);
        ws.on("pong", () => markAlive(ws));
        handleConnection(ws);
    });

    // Heartbeat (Fase 1, P10; tolerância na Fase 3). A cada intervalo, toda
    // conexão recebe um ping. Pong ou qualquer quadro recebido zera a conta.
    // Só depois de `heartbeatMaxMissed` pings seguidos sem nenhum sinal a
    // conexão é encerrada — uma rede lenta que perde um ping não derruba
    // ninguém. Encerrar dispara a saída normal da sala.
    const beat = () => {
        for (const client of wss.clients) {
            const count = missed.get(client) ?? 0;
            if (count >= config.heartbeatMaxMissed) {
                metrics.count("heartbeatTimeouts");
                const user = room.userIdOf(client);
                log("info", "heartbeat_timeout", { missedPings: count, ...(user ? { user } : {}) });
                client.terminate();
                continue;
            }
            missed.set(client, count + 1);
            try {
                client.ping();
            } catch {
                // Conexão já fechando: o `close` cuidará dela.
            }
        }
        identities.sweep();
    };

    /** @type {NodeJS.Timeout | null} */
    let heartbeat = null;
    /** @type {NodeJS.Timeout | null} */
    let metricsLog = null;

    return {
        /**
         * Começa a escutar. Resolve com a porta efetiva (útil com porta 0).
         * @param {number} port
         * @returns {Promise<number>}
         */
        listen(port) {
            return new Promise((resolve, reject) => {
                httpServer.once("error", reject);
                httpServer.listen(port, () => {
                    httpServer.off("error", reject);
                    listening = true;
                    heartbeat = setInterval(beat, config.heartbeatMs);
                    if (config.metricsLogIntervalMs > 0) {
                        metricsLog = setInterval(() => {
                            log("info", "metrics", metrics.snapshot(gauges(), { reset: true }));
                        }, config.metricsLogIntervalMs);
                    }
                    const address = httpServer.address();
                    resolve(typeof address === "object" && address ? address.port : port);
                });
            });
        },

        /**
         * Desligamento gracioso: para de aceitar conexões, fecha os clientes
         * com 1001 ("indo embora"), cancela todos os timers e encerra o HTTP
         * (inclusive conexões keep-alive ociosas). Saídas não são anunciadas
         * durante o desligamento.
         * @returns {Promise<void>}
         */
        close() {
            closing = true;
            room.silence();
            if (heartbeat !== null) clearInterval(heartbeat);
            if (metricsLog !== null) clearInterval(metricsLog);
            heartbeat = null;
            metricsLog = null;
            metrics.stop();
            for (const client of wss.clients) client.close(1001, "Servidor reiniciando");
            wss.close();
            const closed = new Promise((resolve) => httpServer.close(() => resolve()));
            httpServer.closeIdleConnections();
            return /** @type {Promise<void>} */ (closed);
        },

        get connections() {
            return wss.clients.size;
        },

        /** Fotografia das métricas (usada no log de desligamento). */
        metricsSnapshot: () => metrics.snapshot(gauges()),
    };
};
