/**
 * Composição do servidor: HTTP + WebSocket + sala + heartbeat + desligamento.
 *
 * `createChatServer` não tem efeito colateral ao ser importado nem ao ser
 * criado: nada escuta porta até `listen()`. Isso permite subir servidores
 * isolados nos testes.
 */

import http from "node:http";
import { WebSocketServer } from "ws";
import { createIdentityStore } from "../room/sessions.js";
import { createRoom } from "../room/room.js";
import { createConnectionHandler } from "./connection.js";
import { createHttpHandler } from "./http.js";

/** Tempo máximo para os clientes fecharem antes de o processo desistir. */
export const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * @param {{
 *   config: import("../config.js").Config,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 * }} options
 */
export const createChatServer = ({ config, log }) => {
    const identities = createIdentityStore();
    const room = createRoom({
        identities,
        log,
        historySize: config.historySize,
        historyOnJoin: config.historyOnJoin,
        deliver: (member, data) => {
            const ws = /** @type {import("ws").WebSocket} */ (member);
            if (ws.readyState === ws.OPEN) ws.send(data);
        },
    });

    const httpServer = http.createServer(
        createHttpHandler({
            stats: () => ({ connections: wss.clients.size, users: room.memberCount }),
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
                      callback(ok, ok ? undefined : 403, ok ? undefined : "Origem não permitida");
                  },
    });

    const handleConnection = createConnectionHandler({
        room,
        log,
        messageRate: config.messageRate,
        signalRate: config.signalRate,
    });

    /** Conexão → respondeu ao último ping. */
    const alive = new WeakMap();
    let closing = false;
    let listening = false;

    // O `ws` reemite aqui os erros do servidor HTTP. Sem ouvinte, um erro
    // (porta ocupada, por exemplo) derrubava o processo com stack trace.
    // Antes do `listen` concluir, quem trata é a rejeição de `listen()`;
    // depois, o erro é registrado como falha de infraestrutura.
    wss.on("error", (error) => {
        if (!listening) return;
        log("error", "server_error", {
            code: /** @type {NodeJS.ErrnoException} */ (error).code,
            message: error.message,
        });
    });
    /** @type {ReturnType<typeof setInterval> | null} */
    let heartbeat = null;

    wss.on("connection", (ws) => {
        if (closing) {
            ws.close(1001, "Servidor reiniciando");
            return;
        }
        // Teto de conexões: independe de proxy/IP e protege a memória.
        if (wss.clients.size > config.maxConnections) {
            ws.close(1013, "Servidor cheio, tente novamente em instantes");
            return;
        }
        alive.set(ws, true);
        ws.on("pong", () => alive.set(ws, true));
        handleConnection(ws);
    });

    // Heartbeat (Fase 1, P10): quem não responde ao ping até o ciclo seguinte
    // é encerrado, o que dispara a saída normal da sala. Navegadores
    // respondem ping automaticamente.
    const beat = () => {
        for (const client of wss.clients) {
            if (alive.get(client) === false) {
                const user = room.userIdOf(client);
                log("info", "heartbeat_timeout", user ? { user } : {});
                client.terminate();
                continue;
            }
            alive.set(client, false);
            try {
                client.ping();
            } catch {
                // Conexão já fechando: o `close` cuidará dela.
            }
        }
        identities.sweep();
    };

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
                    const address = httpServer.address();
                    resolve(typeof address === "object" && address ? address.port : port);
                });
            });
        },

        /**
         * Desligamento gracioso (Fase 1, P11): para de aceitar conexões,
         * fecha os clientes com 1001 ("indo embora") e encerra o HTTP.
         * Saídas não são anunciadas durante o desligamento.
         * @returns {Promise<void>}
         */
        close() {
            closing = true;
            room.silence();
            if (heartbeat !== null) clearInterval(heartbeat);
            for (const client of wss.clients) client.close(1001, "Servidor reiniciando");
            wss.close();
            return new Promise((resolve) => httpServer.close(() => resolve()));
        },

        get connections() {
            return wss.clients.size;
        },
    };
};
