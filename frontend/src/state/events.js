// @ts-check

import { format, strings } from "../i18n/strings.js";
import { ERROR_CODES, MESSAGE_FORMATS, MESSAGE_KINDS, SERVER_EVENTS, TONES } from "../protocol.js";

/**
 * Tradutor de eventos: recebe um fato já decodificado e o transforma em
 * ação de estado. Não sabe por onde o fato chegou — só o que ele significa.
 * Todo payload vem de fora e é normalizado aqui antes de chegar ao estado.
 *
 * @typedef {import("./store.js").Message} Message
 * @typedef {import("./store.js").Store} Store
 */

/** @type {Set<string>} */
const VARIANTS = new Set(Object.values(MESSAGE_KINDS));
/** @type {Set<string>} */
const FORMATS = new Set(Object.values(MESSAGE_FORMATS));
/** @type {Set<string>} */
const KNOWN_TONES = new Set(Object.values(TONES));

/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value : "");

/**
 * Converte uma mensagem de chat em fato de domínio. O `id` é o atribuído
 * pelo servidor — o mesmo nas mensagens ao vivo e no histórico. Só um
 * servidor antigo, que não o envia, faz cair no id local.
 * @param {any} raw `{ id, payload }`
 * @param {string | null} meId
 * @returns {Message | null}
 */
const toMessage = (raw, meId) => {
    const payload = raw?.payload;
    if (!payload || typeof payload.content !== "string") return null;
    const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : crypto.randomUUID();
    return {
        id,
        key: id,
        kind: "chat",
        userId: String(payload.userId ?? ""),
        userName: String(payload.userName ?? ""),
        ...(typeof payload.username === "string" && payload.username
            ? { username: payload.username }
            : {}),
        content: payload.content,
        timestamp: String(payload.timestamp ?? new Date().toISOString()),
        own: Boolean(meId) && payload.userId === meId,
        variant: VARIANTS.has(payload.kind) ? payload.kind : "text",
        format: FORMATS.has(payload.format) ? payload.format : null,
        clientMsgId: typeof payload.clientMsgId === "string" ? payload.clientMsgId : null,
        delivery: "confirmed",
    };
};

/** Recusas de pedidos de sala (entrar, criar). */
const ROOM_REFUSALS = new Set([
    ERROR_CODES.INVALID_ROOM_CODE,
    ERROR_CODES.ROOM_NOT_FOUND,
    ERROR_CODES.REMOVED_FROM_ROOM,
    ERROR_CODES.ROOM_JOIN_LIMIT,
    ERROR_CODES.ROOM_CREATE_LIMIT,
    ERROR_CODES.ROOMS_FULL,
    ERROR_CODES.ROOM_JOIN_LOCKED,
]);

/**
 * Entrada de sistema (entrada/saída, avisos do servidor).
 * @param {string} content
 * @param {string} timestamp
 * @param {{id?: string, tone?: string, event?: "join" | "leave"}} [extra]
 * @returns {Message}
 */
export const systemMessage = (content, timestamp, extra = {}) => {
    const id = extra.id ?? crypto.randomUUID();
    return {
        id,
        key: id,
        kind: "system",
        userId: "",
        userName: "",
        content,
        timestamp,
        own: false,
        delivery: "confirmed",
        tone: extra.tone,
        ...(extra.event ? { event: extra.event } : {}),
    };
};

/**
 * Resposta visível só para você (comando ou aviso local).
 * @param {{tone: string, text: string, title?: string, lines?: string[]}} notice
 * @returns {Message}
 */
export const noticeMessage = ({ tone, text: content, title, lines }) => {
    const id = `notice:${crypto.randomUUID()}`;
    return {
        id,
        key: id,
        kind: "notice",
        userId: "",
        userName: "",
        content,
        timestamp: new Date().toISOString(),
        own: false,
        delivery: "confirmed",
        tone: KNOWN_TONES.has(tone) ? tone : TONES.INFO,
        ...(title ? { title } : {}),
        ...(lines && lines.length ? { lines } : {}),
    };
};

/**
 * @param {{
 *   store: Store,
 *   toasts: {show: (text: string, kind?: "info" | "error", options?: {announce?: boolean}) => void},
 *   notifier: {show: (title: string, body: string) => void},
 *   typingTracker: {set: (id: string, name: string, isTyping: boolean) => void, remove?: (id: string) => void},
 *   onSession?: (resumeToken: string | null, resumed: boolean) => void,
 *   onRoomJoined?: (room: import("./store.js").RoomInfo) => void,
 *   onRoomLeft?: (reason: string) => void,
 *   onRoomRefused?: (code: string, message: string) => void,
 *   onLoginRejected?: (message: string, field: "name" | "username") => void,
 *   onCommandResult?: (requestId: string | null, result: {tone: string, text: string, title?: string, lines?: string[], code?: string, data?: Record<string, unknown>}) => void,
 * }} deps
 * @returns {(event: {type: string, payload: unknown, id?: string, conversationId?: string}) => void}
 */
export const createEventHandler =
    ({
        store,
        toasts,
        notifier,
        typingTracker,
        onSession = () => {},
        onRoomJoined = () => {},
        onRoomLeft = () => {},
        onRoomRefused = () => {},
        onLoginRejected = () => {},
        onCommandResult = () => {},
    }) =>
    (event) => {
        const state = store.getState();
        const meId = state.me?.id ?? null;
        const payload = /** @type {any} */ (event.payload);

        // Eventos de uma conversa trazem `conversationId` no envelope. A
        // interface mostra uma sala por vez: o que for de outra conversa é
        // ignorado (as próximas fases trazem a navegação entre várias).
        const scope = typeof event.conversationId === "string" ? event.conversationId : null;
        const current = state.room?.conversationId ?? null;
        if (scope !== null && event.type !== SERVER_EVENTS.ROOM_JOINED && scope !== current) {
            return;
        }

        switch (event.type) {
            case SERVER_EVENTS.SESSION: {
                // Identidade atribuída pelo servidor (P01). Chega antes do
                // histórico, então as próprias mensagens já são reconhecidas.
                if (typeof payload?.id !== "string" || payload.id === "") break;
                store.actions.setIdentity(
                    {
                        id: payload.id,
                        name:
                            typeof payload.name === "string"
                                ? payload.name
                                : (state.me?.name ?? ""),
                        username:
                            typeof payload.username === "string" && payload.username
                                ? payload.username
                                : (state.me?.username ?? ""),
                    },
                    payload.role === "admin" ? "admin" : "member",
                );
                // A sessão não põe ninguém em sala: a conversa aparece com o
                // `room_joined` (a retomada traz as salas sozinha).
                onSession(
                    typeof payload.resumeToken === "string" ? payload.resumeToken : null,
                    payload.resumed === true,
                );
                break;
            }

            case SERVER_EVENTS.ROOM_JOINED:
            case SERVER_EVENTS.ROOM_UPDATED: {
                if (
                    scope === null ||
                    typeof payload?.code !== "string" ||
                    typeof payload?.name !== "string"
                ) {
                    break;
                }
                // Outra sala chegando com uma já aberta (ex.: retomada de uma
                // identidade em várias salas): fica para as próximas fases.
                if (current !== null && scope !== current) break;
                /** @type {import("./store.js").RoomInfo} */
                const room = {
                    conversationId: scope,
                    code: payload.code,
                    name: payload.name,
                    role: payload.role === "host" ? "host" : "member",
                };
                store.actions.setRoom(room);
                if (typeof payload.historyVersion === "number") {
                    // A sala foi limpa enquanto você estava fora: a conversa
                    // local deixa de valer antes do histórico novo chegar.
                    store.actions.syncHistoryVersion(payload.historyVersion);
                }
                if (event.type === SERVER_EVENTS.ROOM_JOINED) {
                    // Primeira sala desta entrada: só agora a pessoa sai da
                    // tela de entrada (numa reconexão já está na sala).
                    store.actions.completeJoin();
                    onRoomJoined(room);
                }
                break;
            }

            case SERVER_EVENTS.ROOM_LEFT: {
                onRoomLeft(typeof payload?.reason === "string" ? payload.reason : "left");
                break;
            }

            case SERVER_EVENTS.CHAT_MESSAGE: {
                const message = toMessage({ id: event.id, payload }, meId);
                if (!message) break;
                // Quem envia para de "digitar" no instante em que a mensagem
                // chega, mesmo que o sinal de parada se perca no caminho.
                typingTracker.set(message.userId, message.userName, false);
                store.actions.addMessage(message);
                if (!message.own) {
                    notifier.show(message.userName, message.content);
                }
                break;
            }

            case SERVER_EVENTS.MESSAGE_HISTORY: {
                const list = Array.isArray(payload) ? payload : [];
                const messages = list
                    .map((entry) => toMessage(entry, meId))
                    .filter(
                        /** @returns {item is Message} */
                        (item) => item !== null,
                    );
                store.actions.mergeHistory(messages);
                break;
            }

            case SERVER_EVENTS.USER_LIST: {
                const list = Array.isArray(payload) ? payload : [];
                store.actions.setPeople(
                    list.map((person) => ({
                        id: String(person?.id ?? ""),
                        name: String(person?.name ?? ""),
                        username: typeof person?.username === "string" ? person.username : "",
                        status: person?.status === "away" ? "away" : "online",
                        role:
                            person?.role === "admin"
                                ? "admin"
                                : person?.role === "host"
                                  ? "host"
                                  : "member",
                        ...(typeof person?.statusText === "string"
                            ? { statusText: person.statusText }
                            : {}),
                    })),
                );
                break;
            }

            case SERVER_EVENTS.USER_TYPING: {
                const id = String(payload?.userId ?? "");
                if (id && id !== meId) {
                    typingTracker.set(
                        id,
                        String(payload?.userName ?? ""),
                        Boolean(payload?.isTyping),
                    );
                }
                break;
            }

            case SERVER_EVENTS.USER_JOINED: {
                store.actions.addMessage(
                    systemMessage(
                        format(strings.system.joined, { name: String(payload?.userName ?? "") }),
                        String(payload?.timestamp ?? new Date().toISOString()),
                        { event: "join" },
                    ),
                );
                break;
            }

            case SERVER_EVENTS.USER_LEFT: {
                // Quem saiu deixa de "digitar" na hora.
                if (typeof payload?.userId === "string") typingTracker.remove?.(payload.userId);
                // Remoção por administrador já gera um `notice` próprio.
                if (payload?.reason === "removed") break;
                store.actions.addMessage(
                    systemMessage(
                        format(strings.system.left, { name: String(payload?.userName ?? "") }),
                        String(payload?.timestamp ?? new Date().toISOString()),
                        { event: "leave" },
                    ),
                );
                break;
            }

            case SERVER_EVENTS.NOTICE: {
                if (typeof payload?.text !== "string") break;
                store.actions.addMessage(
                    systemMessage(
                        payload.text,
                        String(payload.timestamp ?? new Date().toISOString()),
                        {
                            id: typeof payload.id === "string" ? payload.id : undefined,
                            tone: KNOWN_TONES.has(payload.tone) ? payload.tone : TONES.INFO,
                        },
                    ),
                );
                break;
            }

            case SERVER_EVENTS.CHAT_CLEARED: {
                const version = Number(payload?.historyVersion);
                if (!Number.isFinite(version)) break;
                store.actions.roomCleared(
                    version,
                    systemMessage(
                        format(strings.system.cleared, { name: text(payload?.byName) }),
                        String(payload?.timestamp ?? new Date().toISOString()),
                        { tone: TONES.ADMIN },
                    ),
                );
                break;
            }

            case SERVER_EVENTS.COMMAND_CATALOG: {
                /** @type {any[]} */
                const list = Array.isArray(payload?.commands) ? payload.commands : [];
                store.actions.setCatalog(
                    list
                        .filter((command) => typeof command?.name === "string")
                        .map((command) => ({
                            name: command.name,
                            aliases: Array.isArray(command.aliases)
                                ? command.aliases.map(String)
                                : [],
                            category: text(command.category),
                            categoryLabel: text(command.categoryLabel) || text(command.category),
                            description: text(command.description),
                            syntax: text(command.syntax) || `/${command.name}`,
                            examples: Array.isArray(command.examples)
                                ? command.examples.map(String)
                                : [],
                            permission: text(command.permission),
                            scope: command.scope === "client" ? "client" : "server",
                            allowed: Boolean(command.allowed),
                        })),
                );
                break;
            }

            case SERVER_EVENTS.COMMAND_RESULT: {
                if (typeof payload?.text !== "string") break;
                onCommandResult(typeof payload.requestId === "string" ? payload.requestId : null, {
                    tone: KNOWN_TONES.has(payload.tone) ? payload.tone : TONES.INFO,
                    text: payload.text,
                    ...(typeof payload.title === "string" ? { title: payload.title } : {}),
                    ...(Array.isArray(payload.lines) ? { lines: payload.lines.map(String) } : {}),
                    ...(typeof payload.code === "string" ? { code: payload.code } : {}),
                    ...(payload.data && typeof payload.data === "object"
                        ? { data: payload.data }
                        : {}),
                });
                break;
            }

            case SERVER_EVENTS.ERROR: {
                const code = typeof payload?.code === "string" ? payload.code : null;
                const message = String(payload?.message ?? strings.errors.generic);
                const ref = typeof payload?.ref === "string" ? payload.ref : null;
                // Entrada recusada: a pessoa volta à tela de entrada, com o
                // erro no campo certo.
                if (code === ERROR_CODES.INVALID_NAME) {
                    onLoginRejected(strings.errors.invalidName, "name");
                    break;
                }
                if (code === ERROR_CODES.INVALID_USERNAME) {
                    onLoginRejected(strings.errors.invalidUsername, "username");
                    break;
                }
                if (code === ERROR_CODES.USERNAME_TAKEN) {
                    onLoginRejected(strings.errors.usernameTaken, "username");
                    break;
                }
                // Pedido de sala recusado (código, limite, remoção).
                if (code !== null && ROOM_REFUSALS.has(code)) {
                    onRoomRefused(code, message);
                    break;
                }
                // Recusa de uma mensagem específica: ela fica marcada como não
                // enviada, com a opção de tentar de novo.
                const failedOne = ref !== null && store.actions.failMessage(ref, message);
                // Mensagem marcada como falha já é anunciada pela lista; o
                // toast, nesse caso, é só reforço visual (sem anúncio duplo).
                if (code === ERROR_CODES.RATE_LIMITED) {
                    toasts.show(strings.errors.rateLimited, "error", { announce: !failedOne });
                    break;
                }
                if (!failedOne) toasts.show(message, "error");
                else if (code === ERROR_CODES.MUTED)
                    toasts.show(message, "error", { announce: false });
                break;
            }

            default: {
                // Tipo desconhecido: ignorar mantém o cliente compatível com
                // um servidor mais novo.
                break;
            }
        }
    };
