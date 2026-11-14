// @ts-check

/**
 * Contrato do protocolo WebSocket — espelho do cliente.
 *
 * A fonte no servidor é `backend/src/protocol.js` (e os códigos de erro,
 * `backend/src/errors.js`). Os valores abaixo precisam ser idênticos aos de
 * lá: `backend/test/unit/contract.test.js` compara os dois arquivos e falha
 * se divergirem. Não é um import compartilhado porque o frontend precisa
 * funcionar servido sem build e o backend precisa poder ser publicado
 * sozinho.
 */

/** Limites do contrato. */
export const LIMITS = Object.freeze({
    nameMaxLength: 60,
    usernameMinLength: 3,
    usernameMaxLength: 20,
    messageMaxLength: 1000,
    /** Linhas de uma mensagem (as que passarem são juntadas na última). */
    messageMaxLines: 20,
    commandMaxLength: 1000,
    roomNameMaxLength: 40,
});

/** Eventos que o cliente envia. */
export const CLIENT_EVENTS = Object.freeze({
    LOGIN: "user_login",
    CHAT_MESSAGE: "chat_message",
    TYPING_START: "typing_start",
    TYPING_STOP: "typing_stop",
    COMMAND: "command",
    LOGOUT: "user_logout",
    ROOM_CREATE: "room_create",
    ROOM_JOIN: "room_join",
    ROOM_LEAVE: "room_leave",
    ROOM_LIST: "room_list",
    USER_LOOKUP: "user_lookup",
    DM_OPEN: "dm_open",
    DM_CLOSE: "dm_close",
    USER_BLOCK: "user_block",
    USER_UNBLOCK: "user_unblock",
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
    ROOM_JOINED: "room_joined",
    ROOM_LEFT: "room_left",
    ROOM_LIST: "room_list",
    ROOM_UPDATED: "room_updated",
    USER_LOOKUP: "user_lookup",
    DM_OPENED: "dm_opened",
    DM_UPDATED: "dm_updated",
    DM_CLOSED: "dm_closed",
    BLOCK_LIST: "block_list",
});

/** Tipos de conversa (o prefixo do `conversationId` diz qual é). */
export const CONVERSATION_KINDS = Object.freeze({ ROOM: "room", DM: "dm" });

/** Por que uma conversa privada acabou (`dm_closed`). */
export const DM_CLOSED_REASONS = Object.freeze({ CLOSED: "closed", ENDED: "ended" });

/**
 * Papéis: `admin` é global; `host` (anfitrião) vale só na sala em que a
 * pessoa o tem.
 */
export const ROLES = Object.freeze({ MEMBER: "member", ADMIN: "admin", HOST: "host" });

/** Por que você deixou de estar numa sala (`room_left`). */
export const ROOM_LEFT_REASONS = Object.freeze({
    LEFT: "left",
    REMOVED: "removed",
    CLOSED: "closed",
});

/** Variedades de mensagem de chat (`payload.kind`; ausente = "text"). */
export const MESSAGE_KINDS = Object.freeze({
    TEXT: "text",
    ACTION: "action",
    ROLL: "roll",
    ANNOUNCEMENT: "announcement",
});

/** Formatação de mensagem (`payload.format`). */
export const MESSAGE_FORMATS = Object.freeze({
    BOLD: "bold",
    ITALIC: "italic",
    CODE: "code",
    SPOILER: "spoiler",
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

/** Códigos de fechamento definidos pela aplicação. */
export const CLOSE_CODES = Object.freeze({
    LOGIN_TIMEOUT: 4001,
    REMOVED: 4003,
    LOGGED_OUT: 4004,
});

/** Códigos de erro que o cliente trata de forma específica. */
export const ERROR_CODES = Object.freeze({
    INVALID_NAME: "invalid_name",
    INVALID_USERNAME: "invalid_username",
    USERNAME_TAKEN: "username_taken",
    RATE_LIMITED: "rate_limited",
    INVALID_MESSAGE: "invalid_message",
    MUTED: "muted",
    INVALID_ROOM_CODE: "invalid_room_code",
    ROOM_NOT_FOUND: "room_not_found",
    CONVERSATION_NOT_FOUND: "conversation_not_found",
    REMOVED_FROM_ROOM: "removed_from_room",
    ROOM_JOIN_LIMIT: "room_join_limit",
    ROOM_CREATE_LIMIT: "room_create_limit",
    ROOMS_FULL: "rooms_full",
    ROOM_JOIN_LOCKED: "room_join_locked",
    INVALID_USER: "invalid_user",
    USER_UNAVAILABLE: "user_unavailable",
    DM_SELF: "dm_self",
    DM_LIMIT: "dm_limit",
    DMS_FULL: "dms_full",
    LOOKUP_LIMITED: "lookup_limited",
    DM_OPEN_LIMITED: "dm_open_limited",
    BLOCK_LIMIT: "block_limit",
});
