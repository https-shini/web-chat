/**
 * Contrato do protocolo WebSocket — fonte única no servidor.
 *
 * Todo quadro é JSON `{ type, payload }`; mensagens de chat têm também `id`
 * no topo. Erros são `{ type: "error", payload: { code, message } }`.
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
    nameMaxLength: 30,
    messageMaxLength: 1000,
    resumeTokenMaxLength: 100,
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
export const serverMessage = Object.freeze({
    /** @param {{id: string, name: string}} user @param {string} resumeToken */
    session: (user, resumeToken) => ({
        type: SERVER_EVENTS.SESSION,
        payload: { id: user.id, name: user.name, resumeToken },
    }),

    /** @param {unknown[]} entries mensagens de chat já no formato de envio */
    history: (entries) => ({ type: SERVER_EVENTS.MESSAGE_HISTORY, payload: entries }),

    /**
     * @param {{id: string, user: {id: string, name: string}, content: string, timestamp: string}} message
     */
    chat: ({ id, user, content, timestamp }) => ({
        id,
        type: SERVER_EVENTS.CHAT_MESSAGE,
        payload: { userId: user.id, userName: user.name, content, timestamp },
    }),

    /** @param {string} userName @param {string} timestamp */
    joined: (userName, timestamp) => ({
        type: SERVER_EVENTS.USER_JOINED,
        payload: { userName, timestamp },
    }),

    /** @param {string} userName @param {string} timestamp */
    left: (userName, timestamp) => ({
        type: SERVER_EVENTS.USER_LEFT,
        payload: { userName, timestamp },
    }),

    /** @param {{id: string, name: string}[]} users */
    userList: (users) => ({
        type: SERVER_EVENTS.USER_LIST,
        payload: users.map((user) => ({ id: user.id, name: user.name, status: "online" })),
    }),

    /** @param {{id: string, name: string}} user @param {boolean} isTyping */
    typing: (user, isTyping) => ({
        type: SERVER_EVENTS.USER_TYPING,
        payload: { userId: user.id, userName: user.name, isTyping },
    }),

    /** @param {string} code um dos `ERROR_CODES` */
    error: (code) => ({
        type: SERVER_EVENTS.ERROR,
        payload: { code, message: describeError(code).message },
    }),
});
