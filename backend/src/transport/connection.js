/**
 * Ciclo de vida de uma conexão WebSocket: entrada do protocolo.
 *
 * Responsabilidades (e só estas):
 *  1. aplicar os limites de taxa da conexão (sinais e mensagens separados —
 *     Fase 1, P02);
 *  2. validar o envelope de cada quadro;
 *  3. encaminhar o evento à sala e transformar recusas em respostas de erro;
 *  4. limpar a participação quando a conexão termina.
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

/**
 * @param {{
 *   room: ReturnType<typeof import("../room/room.js").createRoom>,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   messageRate: {capacity: number, refillPerSecond: number},
 *   signalRate: {capacity: number, refillPerSecond: number},
 *   now?: () => number,
 * }} options
 * @returns {(ws: import("ws").WebSocket) => void}
 */
export const createConnectionHandler = ({ room, log, messageRate, signalRate, now = Date.now }) => {
    return (ws) => {
        // Id curto e aleatório, só para correlacionar linhas de log.
        const label = crypto.randomBytes(4).toString("hex");
        const consumeMessage = createRateLimiter({ ...messageRate, now });
        const consumeSignal = createRateLimiter({ ...signalRate, now });
        let lastRateLimitNotice = -Infinity;

        log("info", "client_connected", { connection: label });

        const send = (message) => {
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
        };

        /** Recusa uma operação: registra com contexto e responde com o código. */
        const reject = (operation, code) => {
            log(logLevelFor(code), "request_rejected", {
                connection: label,
                operation,
                code,
                category: describeError(code).category,
                ...(room.isMember(ws) ? { user: room.userIdOf(ws) } : {}),
            });
            send(serverMessage.error(code));
        };

        const handlers = {
            [CLIENT_EVENTS.LOGIN]: (payload) => {
                const result = room.join(ws, payload, label);
                if (!result.ok) return reject(CLIENT_EVENTS.LOGIN, result.code);
                // Retomada que substituiu uma conexão antiga ainda aberta.
                if (result.replaced)
                    /** @type {import("ws").WebSocket} */ (result.replaced).terminate();
            },
            [CLIENT_EVENTS.CHAT_MESSAGE]: (payload) => {
                const result = room.post(ws, payload);
                if (!result.ok) reject(CLIENT_EVENTS.CHAT_MESSAGE, result.code);
            },
            [CLIENT_EVENTS.TYPING_START]: () => room.typing(ws, true),
            [CLIENT_EVENTS.TYPING_STOP]: () => room.typing(ws, false),
        };

        ws.on("message", (data, isBinary) => {
            const envelope = parseEnvelope(/** @type {Buffer} */ (data), isBinary);

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
                }
                return;
            }

            if (!envelope.ok) {
                log("warn", "invalid_message", {
                    connection: label,
                    reason: envelope.reason,
                    ...(envelope.type === undefined ? {} : { type: envelope.type }),
                });
                send(serverMessage.error(errorCodeForEnvelope(envelope.reason)));
                return;
            }

            try {
                handlers[envelope.type](envelope.payload);
            } catch (error) {
                // Só chega aqui defeito do servidor: entrada inválida já foi
                // tratada acima. Este, sim, merece stack trace no log — e o
                // cliente recebe apenas o código genérico.
                log("error", "handler_failed", {
                    connection: label,
                    operation: envelope.type,
                    stack: error instanceof Error ? error.stack : String(error),
                });
                send(serverMessage.error(ERROR_CODES.INTERNAL_ERROR));
            }
        });

        ws.on("error", (error) => {
            log("warn", "socket_error", { connection: label, message: error.message });
        });

        // Toda forma de término (fechamento normal, terminate, queda) passa
        // por aqui: a participação na sala é sempre desfeita.
        ws.on("close", () => room.leave(ws));
    };
};
