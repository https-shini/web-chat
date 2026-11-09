/**
 * Contrato do protocolo WebSocket — fonte única no servidor.
 *
 * Todo quadro é JSON `{ type, payload }`; mensagens de chat têm também `id`
 * no topo. Erros são `{ type: "error", payload: { code, message } }`.
 *
 * Conversas (Fase 2 da evolução): uma identidade participa de várias salas
 * ao mesmo tempo. Todo evento que pertence a uma conversa leva
 * `conversationId` no TOPO do envelope (como o `id` das mensagens), e o
 * payload continua com o formato de antes. No sentido inverso, o cliente
 * informa a conversa dentro do payload (`payload.conversationId`), e o
 * servidor confere se a conexão participa dela antes de qualquer efeito.
 * O `conversationId` é opaco e não é o código de convite: o código só é
 * entregue a quem está na sala e nunca vai para o log.
 *
 * O cliente tem o espelho deste contrato em `frontend/src/protocol.js`; um
 * teste (`test/unit/contract.test.js`) falha se os dois divergirem. Os dois
 * arquivos não são compartilhados por import porque o frontend precisa
 * funcionar servido sem build e o backend precisa poder ser publicado
 * sozinho.
 */

import { describeError, ERROR_CODES } from "./errors.js";

/** Limites do contrato, aplicados pelo servidor e espelhados no cliente. */
export const LIMITS = Object.freeze({
    /** Nome completo de exibição. */
    nameMaxLength: 60,
    /** Username (`@nome`): único entre as identidades vivas da sala. */
    usernameMinLength: 3,
    usernameMaxLength: 20,
    messageMaxLength: 1000,
    resumeTokenMaxLength: 100,
    /** Texto bruto de um comando (`/nome argumentos`). */
    commandMaxLength: 1000,
    /** Id de correlação gerado pelo cliente (`clientMsgId`, `requestId`). */
    clientIdMaxLength: 64,
    /** Texto de ausência (`/afk motivo`). */
    awayTextMaxLength: 60,
    /** Nome opcional de uma sala. */
    roomNameMaxLength: 40,
    /** Código de convite como digitado (com espaços, hífens ou o link inteiro). */
    roomCodeInputMaxLength: 200,
    /** `conversationId` recebido do cliente. */
    conversationIdMaxLength: 64,
});

/** Eventos que o cliente envia. */
export const CLIENT_EVENTS = Object.freeze({
    LOGIN: "user_login",
    CHAT_MESSAGE: "chat_message",
    TYPING_START: "typing_start",
    TYPING_STOP: "typing_stop",
    COMMAND: "command",
    /** Encerrar a sessão: libera a identidade temporária e o username na hora. */
    LOGOUT: "user_logout",
    /** Criar uma sala nova; quem cria entra como anfitrião. */
    ROOM_CREATE: "room_create",
    /** Entrar numa sala pelo código de convite. */
    ROOM_JOIN: "room_join",
    /** Sair de uma sala (a identidade continua nas outras). */
    ROOM_LEAVE: "room_leave",
    /** Pedir a lista das salas de que a identidade participa. */
    ROOM_LIST: "room_list",
    USER_SEARCH: "user_search",
});

/** Eventos que o servidor envia. */
export const SERVER_EVENTS = Object.freeze({
    SESSION: "session",
    MESSAGE_HISTORY: "message_history",
    CHAT_MESSAGE: "chat_message",
    USER_JOINED: "user_joined",
    USER_LEFT: "user_left",
    USER_LIST: "user_list",
    USER_TYPING: "user_typing",
    ERROR: "error",
    COMMAND_CATALOG: "command_catalog",
    COMMAND_RESULT: "command_result",
    NOTICE: "notice",
    CHAT_CLEARED: "chat_cleared",
    /** Você está numa sala: resumo dela (seguido de histórico e lista). */
    ROOM_JOINED: "room_joined",
    /** Você não está mais numa sala (saiu, foi removido ou ela acabou). */
    ROOM_LEFT: "room_left",
    /** Resposta a `room_list`. */
    ROOM_LIST: "room_list",
    /** O resumo de uma sala mudou (ex.: anfitrião novo). */
    ROOM_UPDATED: "room_updated",
    USER_SEARCH_RESULTS: "user_search_results",
});

/**
 * Variedades de mensagem de chat (`payload.kind`). Só `text` pode vir de um
 * `chat_message` do cliente; as demais são produzidas pelo servidor ao
 * executar comandos — o cliente não consegue forjar um anúncio.
 */
export const MESSAGE_KINDS = Object.freeze({
    TEXT: "text",
    ACTION: "action",
    ROLL: "roll",
    ANNOUNCEMENT: "announcement",
});

/** Formatação de uma mensagem (`payload.format`), aplicada por comandos. */
export const MESSAGE_FORMATS = Object.freeze({
    BOLD: "bold",
    ITALIC: "italic",
    CODE: "code",
    SPOILER: "spoiler",
});

/** Estados de presença em `user_list`. */
export const PRESENCE = Object.freeze({ ONLINE: "online", AWAY: "away" });

/**
 * Papéis. `admin` é global (chave do servidor) e vale em todas as salas;
 * `host` (anfitrião) vale só na sala em que a pessoa o recebeu.
 */
export const ROLES = Object.freeze({ MEMBER: "member", ADMIN: "admin", HOST: "host" });

/** Por que alguém deixou de estar numa sala (`room_left`). */
export const ROOM_LEFT_REASONS = Object.freeze({
    /** A própria pessoa saiu. */
    LEFT: "left",
    /** Removida por quem modera a sala. */
    REMOVED: "removed",
    /** A sala acabou (servidor desligando). */
    CLOSED: "closed",
});

/** Tons de `command_result` e `notice`. */
export const TONES = Object.freeze({
    INFO: "info",
    SUCCESS: "success",
    WARNING: "warning",
    ERROR: "error",
    RESULT: "result",
    ADMIN: "admin",
});

/** Códigos de fechamento da conexão definidos pela aplicação. */
export const CLOSE_CODES = Object.freeze({
    LOGIN_TIMEOUT: 4001,
    REMOVED: 4003,
    /** A própria pessoa saiu (`user_logout`); o cliente não reconecta. */
    LOGGED_OUT: 4004,
});

const SIGNAL_EVENTS = new Set([CLIENT_EVENTS.TYPING_START, CLIENT_EVENTS.TYPING_STOP]);
const KNOWN_CLIENT_EVENTS = new Set(Object.values(CLIENT_EVENTS));

/**
 * Sinais efêmeros ("digitando"): têm limite de taxa próprio e, se excedidos,
 * são descartados sem resposta — perder um sinal não é perder dado.
 * @param {string} type
 */
export const isSignal = (type) => SIGNAL_EVENTS.has(type);

const isPlainObject = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Valida o envelope de um quadro recebido. Entrada inválida não é exceção:
 * volta como `{ ok: false, reason }`, para ser registrada sem stack trace.
 *
 * @param {Buffer | string} data
 * @param {boolean} isBinary
 * @returns {{ok: true, type: string, payload: Record<string, unknown>}
 *   | {ok: false, reason: string, type?: string}}
 */
export const parseEnvelope = (data, isBinary) => {
    if (isBinary) return { ok: false, reason: "binary_frame" };
    let value;
    try {
        value = JSON.parse(data.toString("utf8"));
    } catch {
        return { ok: false, reason: "invalid_json" };
    }
    if (!isPlainObject(value)) return { ok: false, reason: "not_an_object" };
    if (typeof value.type !== "string") return { ok: false, reason: "missing_type" };
    if (!KNOWN_CLIENT_EVENTS.has(value.type)) {
        // Prévia curta só para diagnóstico; o logger a escapa.
        return { ok: false, reason: "unknown_type", type: value.type.slice(0, 40) };
    }
    const payload = value.payload === undefined ? {} : value.payload;
    if (!isPlainObject(payload)) return { ok: false, reason: "invalid_payload", type: value.type };
    return { ok: true, type: value.type, payload };
};

/** Código de erro devolvido ao cliente para cada falha de envelope. */
export const errorCodeForEnvelope = (reason) =>
    reason === "unknown_type" ? ERROR_CODES.UNKNOWN_TYPE : ERROR_CODES.INVALID_MESSAGE;

/**
 * Construtores dos quadros enviados pelo servidor. Concentrar o formato aqui
 * é o que garante que um mesmo evento nunca saia com campos diferentes.
 */
/**
 * Põe o quadro no escopo de uma conversa: `conversationId` no topo do
 * envelope, payload intacto.
 * @template {Record<string, unknown>} T
 * @param {string} conversationId
 * @param {T} message
 * @returns {T & {conversationId: string}}
 */
export const scoped = (conversationId, message) => ({ ...message, conversationId });

/**
 * @typedef {object} RoomSummary
 * @property {string} conversationId
 * @property {"room"} kind
 * @property {string} code      código de convite (só para quem está na sala)
 * @property {string} name
 * @property {string} role      papel de quem recebe NESTA sala
 * @property {string | null} hostId
 * @property {number} memberCount
 * @property {number} historyVersion
 */

export const serverMessage = Object.freeze({
    /**
     * Sessão: quem a conexão é. Não diz nada sobre salas — cada sala chega
     * no seu próprio `room_joined`. `resumed` diz se a identidade anterior
     * foi retomada (e, com ela, as salas); sem isso, a identidade é nova e
     * não está em sala nenhuma.
     * @param {{id: string, name: string, username?: string, role?: string}} user
     * @param {string} resumeToken
     * @param {boolean} [resumed]
     */
    session: (user, resumeToken, resumed = false) => ({
        type: SERVER_EVENTS.SESSION,
        payload: {
            id: user.id,
            name: user.name,
            username: user.username ?? "",
            resumeToken,
            role: user.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.MEMBER,
            resumed,
        },
    }),

    /**
     * @param {RoomSummary} summary
     * @param {{created?: boolean, resumed?: boolean}} [how]
     */
    roomJoined: (summary, { created = false, resumed = false } = {}) =>
        scoped(summary.conversationId, {
            type: SERVER_EVENTS.ROOM_JOINED,
            payload: { ...summary, created, resumed },
        }),

    /** @param {RoomSummary} summary */
    roomUpdated: (summary) =>
        scoped(summary.conversationId, { type: SERVER_EVENTS.ROOM_UPDATED, payload: summary }),

    /** @param {string} conversationId @param {string} reason um dos `ROOM_LEFT_REASONS` */
    roomLeft: (conversationId, reason) =>
        scoped(conversationId, { type: SERVER_EVENTS.ROOM_LEFT, payload: { reason } }),

    /** @param {RoomSummary[]} rooms @param {string | null} [requestId] */
    roomList: (rooms, requestId = null) => ({
        type: SERVER_EVENTS.ROOM_LIST,
        payload: { rooms, ...(requestId ? { requestId } : {}) },
    }),

    /** @param {unknown[]} entries mensagens de chat já no formato de envio */
    history: (entries) => ({ type: SERVER_EVENTS.MESSAGE_HISTORY, payload: entries }),

    /**
     * Mensagem de chat. `kind`, `format` e `clientMsgId` são aditivos: só
     * entram no payload quando presentes, e clientes antigos os ignoram.
     * @param {{
     *   id: string, user: {id: string, name: string, username?: string},
     *   content: string, timestamp: string,
     *   kind?: string, format?: string | null, clientMsgId?: string | null,
     * }} message
     */
    chat: ({
        id,
        user,
        content,
        timestamp,
        kind = MESSAGE_KINDS.TEXT,
        format = null,
        clientMsgId = null,
    }) => ({
        id,
        type: SERVER_EVENTS.CHAT_MESSAGE,
        payload: {
            userId: user.id,
            userName: user.name,
            ...(user.username ? { username: user.username } : {}),
            content,
            timestamp,
            ...(kind !== MESSAGE_KINDS.TEXT ? { kind } : {}),
            ...(format ? { format } : {}),
            ...(clientMsgId ? { clientMsgId } : {}),
        },
    }),

    /** @param {string} userName @param {string} timestamp */
    joined: (userName, timestamp) => ({
        type: SERVER_EVENTS.USER_JOINED,
        payload: { userName, timestamp },
    }),

    /**
     * @param {{id: string, name: string}} user
     * @param {string} timestamp
     * @param {string} [reason] "left" (padrão) ou "removed"
     */
    left: (user, timestamp, reason = "left") => ({
        type: SERVER_EVENTS.USER_LEFT,
        payload: { userId: user.id, userName: user.name, timestamp, reason },
    }),

    /**
     * `status` já existia ("online"); agora também "away". `role` e
     * `statusText` são aditivos.
     * `role` é o papel NA SALA: `admin` (global) prevalece sobre `host`.
     * @param {{id: string, name: string, username?: string, role?: string, away?: string | null}[]} users
     */
    userList: (users) => ({
        type: SERVER_EVENTS.USER_LIST,
        payload: users.map((user) => ({
            id: user.id,
            name: user.name,
            username: user.username ?? "",
            status: user.away === null || user.away === undefined ? PRESENCE.ONLINE : PRESENCE.AWAY,
            role: user.role ?? ROLES.MEMBER,
            ...(user.away ? { statusText: user.away } : {}),
        })),
    }),

    /** @param {{id: string, name: string}} user @param {boolean} isTyping */
    typing: (user, isTyping) => ({
        type: SERVER_EVENTS.USER_TYPING,
        payload: { userId: user.id, userName: user.name, isTyping },
    }),

    /**
     * @param {string} code um dos `ERROR_CODES`
     * @param {string | null} [ref] `clientMsgId` ou `requestId` recusado, quando houver
     * @param {string | null} [conversationId] conversa a que o erro se refere
     */
    error: (code, ref = null, conversationId = null) => ({
        type: SERVER_EVENTS.ERROR,
        ...(conversationId ? { conversationId } : {}),
        payload: { code, message: describeError(code).message, ...(ref ? { ref } : {}) },
    }),

    /** @param {unknown[]} commands metadados do registro (ver commands/registry.js) */
    commandCatalog: (commands) => ({
        type: SERVER_EVENTS.COMMAND_CATALOG,
        payload: { commands },
    }),

    /**
     * Resposta de um comando, só para quem o executou.
     * @param {{requestId: string | null, tone: string, text: string, title?: string,
     *   lines?: string[], code?: string, data?: Record<string, unknown>}} result
     */
    commandResult: ({ requestId, tone, text, title, lines, code, data }) => ({
        type: SERVER_EVENTS.COMMAND_RESULT,
        payload: {
            requestId,
            tone,
            text,
            ...(title ? { title } : {}),
            ...(lines && lines.length ? { lines } : {}),
            ...(code ? { code } : {}),
            ...(data ? { data } : {}),
        },
    }),

    /**
     * Aviso de sistema gerado pelo servidor (renomeação, moderação, papéis).
     * @param {{id: string, tone: string, text: string, timestamp: string}} notice
     */
    notice: ({ id, tone, text, timestamp }) => ({
        type: SERVER_EVENTS.NOTICE,
        payload: { id, tone, text, timestamp },
    }),

    /** @param {string} byName @param {string} timestamp @param {number} historyVersion */
    chatCleared: (byName, timestamp, historyVersion) => ({
        type: SERVER_EVENTS.CHAT_CLEARED,
        payload: { byName, timestamp, historyVersion },
    }),
});
