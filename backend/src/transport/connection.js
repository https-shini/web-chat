/**
 * Ciclo de vida de uma conexão WebSocket: entrada do protocolo.
 *
 * Responsabilidades (e só estas):
 *  1. aplicar os limites de taxa da conexão (sinais e mensagens separados —
 *     Fase 1, P02);
 *  2. validar o envelope de cada quadro;
 *  3. encaminhar o evento ao hub e transformar recusas em respostas de erro;
 *  4. exigir que a conexão comece uma sessão dentro do prazo (Fase 3);
 *  5. pausar a sessão e limpar os timers quando a conexão termina;
 *  6. registrar métricas do que recebeu e processou.
 *
 * Nenhuma regra de negócio vive aqui: quem decide se um login, uma sala, uma
 * mensagem ou um sinal é válido é `room/hub.js` (e, por ele, as salas).
 */

import crypto from "node:crypto";
import { describeError, ERROR_CODES, logLevelFor } from "../errors.js";
import {
    CLIENT_EVENTS,
    CLOSE_CODES,
    errorCodeForEnvelope,
    isSignal,
    parseEnvelope,
    serverMessage,
} from "../protocol.js";
import { createRateLimiter } from "../rateLimiter.js";
import { readClientId, readConversationId } from "../validation.js";

/** No máximo um aviso de "rápido demais" por segundo (anti-amplificação). */
export const RATE_LIMIT_NOTICE_INTERVAL_MS = 1000;

/** Código de fechamento para conexão que não entrou na sala a tempo. */
export const LOGIN_TIMEOUT_CLOSE_CODE = 4001;

/** Eventos cujo excesso recebe aviso de limite (os demais são descartados). */
const NOTIFY_WHEN_LIMITED = new Set([
    CLIENT_EVENTS.CHAT_MESSAGE,
    CLIENT_EVENTS.COMMAND,
    CLIENT_EVENTS.ROOM_CREATE,
    CLIENT_EVENTS.ROOM_JOIN,
]);

/** Métricas no-op: o handler funciona sem instrumentação (testes de unidade). */
const NO_METRICS = { count() {}, observeProcessing() {} };

/**
 * @param {{
 *   hub: ReturnType<typeof import("../room/hub.js").createHub>,
 *   commands?: {execute: (ws: unknown, payload: Record<string, unknown>) => void, sendCatalog: (ws: unknown) => void},
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
    hub,
    commands = null,
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

        // Prazo para começar a sessão. Sem ele, uma conexão que nunca faz login
        // — mas responde ao ping — ocuparia uma vaga do teto indefinidamente.
        // O cliente oficial faz login assim que conecta.
        let loginTimer =
            loginTimeoutMs > 0
                ? setTimeout(() => {
                      loginTimer = null;
                      if (hub.isLoggedIn(ws)) return;
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

        /**
         * Recusa uma operação: registra com contexto e responde com o código.
         * `ref` devolve o id de correlação do cliente (`clientMsgId` ou
         * `requestId`) para que ele saiba QUAL envio falhou; `conversationId`
         * diz a que conversa o erro se refere.
         */
        const reject = (operation, code, ref = null, conversationId = null) => {
            const { category } = describeError(code);
            metrics.count("requestsRejected", code);
            metrics.count("errorsByCategory", category);
            log(logLevelFor(code), "request_rejected", {
                connection: label,
                operation,
                code,
                category,
                ...(hub.isLoggedIn(ws) ? { user: hub.userIdOf(ws) } : {}),
            });
            send(serverMessage.error(code, ref, conversationId));
        };

        /** Id de correlação de um pedido de sala. @param {Record<string, unknown>} payload */
        const requestIdOf = (payload) => readClientId(payload.requestId);

        const handlers = {
            [CLIENT_EVENTS.LOGIN]: (payload) => {
                const result = hub.login(ws, payload, label);
                if (!result.ok) return reject(CLIENT_EVENTS.LOGIN, result.code);
                clearLoginTimer();
                // O catálogo de comandos é a fonte do autocomplete e do /help.
                commands?.sendCatalog(ws);
                // Retomada que substituiu uma conexão antiga ainda aberta.
                if (result.replaced) {
                    /** @type {import("ws").WebSocket} */ (result.replaced).terminate();
                }
            },
            [CLIENT_EVENTS.CHAT_MESSAGE]: (payload) => {
                const result = hub.post(ws, payload);
                if (!result.ok) {
                    return reject(
                        CLIENT_EVENTS.CHAT_MESSAGE,
                        result.code,
                        readClientId(payload.clientMsgId),
                        readConversationId(payload.conversationId),
                    );
                }
                if (!result.duplicate) metrics.count("messagesAccepted");
            },
            [CLIENT_EVENTS.COMMAND]: (payload) => {
                if (!commands) return reject(CLIENT_EVENTS.COMMAND, ERROR_CODES.UNKNOWN_TYPE);
                commands.execute(ws, payload);
            },
            // Encerrar a sessão: a identidade acaba no servidor (token
            // inválido, username livre, fora de todas as salas) e a conexão
            // fecha com um código que o cliente trata como definitivo. Fechar
            // mesmo sem sessão: quem pediu para sair não deve continuar
            // conectado.
            [CLIENT_EVENTS.LOGOUT]: () => {
                if (hub.logout(ws)) metrics.count("logouts");
                clearLoginTimer();
                ws.close(CLOSE_CODES.LOGGED_OUT, "Você saiu");
            },
            [CLIENT_EVENTS.TYPING_START]: (payload) => hub.typing(ws, payload, true),
            [CLIENT_EVENTS.TYPING_STOP]: (payload) => hub.typing(ws, payload, false),
            [CLIENT_EVENTS.ROOM_CREATE]: (payload) => {
                const result = hub.createRoom(ws, payload);
                if (!result.ok) {
                    return reject(CLIENT_EVENTS.ROOM_CREATE, result.code, requestIdOf(payload));
                }
                metrics.count("roomsCreated");
            },
            [CLIENT_EVENTS.ROOM_JOIN]: (payload) => {
                const result = hub.joinRoom(ws, payload);
                if (!result.ok) {
                    return reject(CLIENT_EVENTS.ROOM_JOIN, result.code, requestIdOf(payload));
                }
                if (!result.already) metrics.count("roomJoins");
            },
            [CLIENT_EVENTS.ROOM_LEAVE]: (payload) => {
                const result = hub.leaveRoom(ws, payload);
                if (!result.ok) {
                    return reject(
                        CLIENT_EVENTS.ROOM_LEAVE,
                        result.code,
                        requestIdOf(payload),
                        readConversationId(payload.conversationId),
                    );
                }
                metrics.count("roomLeaves");
            },
            [CLIENT_EVENTS.DM_OPEN]: (payload) => {
                const result = hub.openDirect(ws, payload);
                if (!result.ok) {
                    return reject(CLIENT_EVENTS.DM_OPEN, result.code, requestIdOf(payload));
                }
            },
            [CLIENT_EVENTS.USER_SEARCH]: (payload) => {
                const result = hub.searchUsers(ws, payload);
                if (!result.ok) {
                    return reject(CLIENT_EVENTS.USER_SEARCH, result.code, requestIdOf(payload));
                }
                send(
                    serverMessage.userSearchResults(
                        result.query,
                        result.users,
                        requestIdOf(payload),
                    ),
                );
            },
            [CLIENT_EVENTS.ROOM_LIST]: (payload) => {
                const rooms = hub.roomsOf(ws);
                if (rooms === null) {
                    return reject(
                        CLIENT_EVENTS.ROOM_LIST,
                        ERROR_CODES.NOT_LOGGED_IN,
                        requestIdOf(payload),
                    );
                }
                send(serverMessage.roomList(rooms, requestIdOf(payload)));
            },
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
                    NOTIFY_WHEN_LIMITED.has(envelope.type) &&
                    time - lastRateLimitNotice >= RATE_LIMIT_NOTICE_INTERVAL_MS
                ) {
                    lastRateLimitNotice = time;
                    const payload = envelope.payload;
                    reject(
                        envelope.type,
                        ERROR_CODES.RATE_LIMITED,
                        readClientId(payload.clientMsgId ?? payload.requestId),
                    );
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
        // por aqui: timer de login cancelado e sessão pausada (a identidade
        // fica retomável e continua nas salas até o prazo vencer).
        ws.on("close", (code) => {
            clearLoginTimer();
            metrics.count("connectionsClosed");
            hub.disconnect(ws);
            log("info", "client_disconnected", { connection: label, code });
        });
    };
};
