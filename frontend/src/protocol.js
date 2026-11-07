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
});

/** Eventos que o cliente envia. */
export const CLIENT_EVENTS = Object.freeze({
    LOGIN: "user_login",
    CHAT_MESSAGE: "chat_message",
    TYPING_START: "typing_start",
    TYPING_STOP: "typing_stop",
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
});

/** Códigos de erro que o cliente trata de forma específica. */
export const ERROR_CODES = Object.freeze({
    INVALID_NAME: "invalid_name",
    RATE_LIMITED: "rate_limited",
});
