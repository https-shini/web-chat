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
    nameMaxLength: 30,
    messageMaxLength: 1000,
    commandMaxLength: 1000,
});

/** Eventos que o cliente envia. */
export const CLIENT_EVENTS = Object.freeze({
    LOGIN: "user_login",
    CHAT_MESSAGE: "chat_message",
    TYPING_START: "typing_start",
    TYPING_STOP: "typing_stop",
    COMMAND: "command",
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
});

/** Códigos de erro que o cliente trata de forma específica. */
export const ERROR_CODES = Object.freeze({
    INVALID_NAME: "invalid_name",
    RATE_LIMITED: "rate_limited",
    MUTED: "muted",
});
