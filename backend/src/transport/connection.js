/**
 * Ciclo de vida de uma conexão WebSocket: entrada do protocolo.
 *
 * Responsabilidades (e só estas):
 *  1. aplicar os limites de taxa da conexão (sinais e mensagens separados —
 *     Fase 1, P02);
 *  2. validar o envelope de cada quadro;
 *  3. encaminhar o evento à sala e transformar recusas em respostas de erro;
 *  4. exigir que a conexão entre na sala dentro do prazo (Fase 3);
 *  5. limpar a participação e os timers quando a conexão termina;
 *  6. registrar métricas do que recebeu e processou.
 *
 * Nenhuma regra de negócio vive aqui: quem decide se um login, uma mensagem
 * ou um sinal é válido é `room/room.js`.
 */

import crypto from "node:crypto";
import { describeError, ERROR_CODES, logLevelFor } from "../errors.js";
import {
    CLIENT_EVENTS,
    errorCodeForEnvelope,
    isSignal,
    parseEnvelope,
    serverMessage,
} from "../protocol.js";
import { createRateLimiter } from "../rateLimiter.js";

/** No máximo um aviso de "rápido demais" por segundo (anti-amplificação). */
export const RATE_LIMIT_NOTICE_INTERVAL_MS = 1000;

/** Código de fechamento para conexão que não entrou na sala a tempo. */
export const LOGIN_TIMEOUT_CLOSE_CODE = 4001;

/** Métricas no-op: o handler funciona sem instrumentação (testes de unidade). */
const NO_METRICS = { count() {}, observeProcessing() {} };

/**
 * @param {{
 *   room: ReturnType<typeof import("../room/room.js").createRoom>,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   messageRate: {capacity: number, refillPerSecond: number},
 *   signalRate: {capacity: number, refillPerSecond: number},
 *   loginTimeoutMs?: number,
 *   metrics?: {count: (name: string, label?: string) => void, observeProcessing: (ms: number) => void},
 *   onActivity?: (ws: import("ws").WebSocket) => void,
 *   now?: () => number,
 *   clock?: () => number,
 * }} options
 * @returns {(ws: import("ws").WebSocket) => void}
 */
export const createConnectionHandler = ({
    room,
    log,
    messageRate,
    signalRate,
    loginTimeoutMs = 0,
    metrics = NO_METRICS,
    onActivity = () => {},
    now = Date.now,
    clock = () => performance.now(),
}) => {
    return (ws) => {
        // Id curto e aleatório, só para correlacionar linhas de log.
        const label = crypto.randomBytes(4).toString("hex");
        const consumeMessage = createRateLimiter({ ...messageRate, now });
        const consumeSignal = createRateLimiter({ ...signalRate, now });
        let lastRateLimitNotice = -Infinity;

        log("info", "client_connected", { connection: label });

        // Prazo para entrar na sala. Sem ele, uma conexão que nunca faz login
        // — mas responde ao ping — ocuparia uma vaga do teto indefinidamente.
        // O cliente oficial faz login assim que conecta.
        let loginTimer =
            loginTimeoutMs > 0
                ? setTimeout(() => {
                      loginTimer = null;
                      if (room.isMember(ws)) return;
                      metrics.count("loginTimeouts");
                      log("info", "login_timeout", { connection: label });
                      ws.close(LOGIN_TIMEOUT_CLOSE_CODE, "Tempo para entrar na sala esgotado");
                  }, loginTimeoutMs)
                : null;

        const clearLoginTimer = () => {
            if (loginTimer !== null) {
                clearTimeout(loginTimer);
                loginTimer = null;
            }
        };

        const send = (message) => {
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
        };

        /** Recusa uma operação: registra com contexto e responde com o código. */
        const reject = (operation, code) => {
            const { category } = describeError(code);
            metrics.count("requestsRejected", code);
            metrics.count("errorsByCategory", category);
            log(logLevelFor(code), "request_rejected", {
                connection: label,
                operation,
                code,
                category,
                ...(room.isMember(ws) ? { user: room.userIdOf(ws) } : {}),
            });
            send(serverMessage.error(code));
        };

        const handlers = {
            [CLIENT_EVENTS.LOGIN]: (payload) => {
                const result = room.join(ws, payload, label);
                if (!result.ok) return reject(CLIENT_EVENTS.LOGIN, result.code);
                clearLoginTimer();
                // Retomada que substituiu uma conexão antiga ainda aberta.
                if (result.replaced) {
                    /** @type {import("ws").WebSocket} */ (result.replaced).terminate();
                }
            },
            [CLIENT_EVENTS.CHAT_MESSAGE]: (payload) => {
                const result = room.post(ws, payload);
                if (!result.ok) return reject(CLIENT_EVENTS.CHAT_MESSAGE, result.code);
                metrics.count("messagesAccepted");
            },
            [CLIENT_EVENTS.TYPING_START]: () => room.typing(ws, true),
            [CLIENT_EVENTS.TYPING_STOP]: () => room.typing(ws, false),
        };

        const handleFrame = (data, isBinary) => {
            const envelope = parseEnvelope(/** @type {Buffer} */ (data), isBinary);
            metrics.count("framesReceived", envelope.ok ? envelope.type : "invalid");

            // Sinais: balde próprio; excesso descartado em silêncio.
            if (envelope.ok && isSignal(envelope.type)) {
                if (consumeSignal()) handlers[envelope.type](envelope.payload);
                return;
            }

            // Todo o resto — mensagens, login e quadros inválidos — consome o
            // balde de mensagens. Só `chat_message` recusada recebe aviso.
            if (!consumeMessage()) {
                const time = now();
                if (
                    envelope.ok &&
                    envelope.type === CLIENT_EVENTS.CHAT_MESSAGE &&
                    time - lastRateLimitNotice >= RATE_LIMIT_NOTICE_INTERVAL_MS
                ) {
                    lastRateLimitNotice = time;
                    reject(envelope.type, ERROR_CODES.RATE_LIMITED);
                } else {
                    metrics.count("requestsRejected", "rate_limited_silent");
                }
                return;
            }

            if (!envelope.ok) {
                const code = errorCodeForEnvelope(envelope.reason);
                metrics.count("invalidFrames", envelope.reason);
                metrics.count("errorsByCategory", describeError(code).category);
                log("warn", "invalid_message", {
                    connection: label,
                    reason: envelope.reason,
                    ...(envelope.type === undefined ? {} : { type: envelope.type }),
                });
                send(serverMessage.error(code));
                return;
            }

            try {
                handlers[envelope.type](envelope.payload);
            } catch (error) {
                // Só chega aqui defeito do servidor: entrada inválida já foi
                // tratada acima. Este, sim, merece stack trace no log — e o
                // cliente recebe apenas o código genérico.
                metrics.count("errorsByCategory", "internal");
                log("error", "handler_failed", {
                    connection: label,
                    operation: envelope.type,
                    stack: error instanceof Error ? error.stack : String(error),
                });
                send(serverMessage.error(ERROR_CODES.INTERNAL_ERROR));
            }
        };

        ws.on("message", (data, isBinary) => {
            // Qualquer quadro recebido prova que a conexão está viva.
            onActivity(ws);
            const started = clock();
            handleFrame(data, isBinary);
            metrics.observeProcessing(clock() - started);
        });

        ws.on("error", (error) => {
            log("warn", "socket_error", { connection: label, message: error.message });
        });

        // Toda forma de término (fechamento normal, terminate, queda) passa
        // por aqui: timer de login cancelado e participação desfeita.
        ws.on("close", (code) => {
            clearLoginTimer();
            metrics.count("connectionsClosed");
            room.leave(ws);
            log("info", "client_disconnected", { connection: label, code });
        });
    };
};
