/**
 * Validação e normalização dos campos que vêm do cliente.
 *
 * Sanitização de marcação pertence a quem renderiza (o cliente usa
 * `textContent`); aqui só se remove o que não tem uso legítimo numa linha de
 * texto e se aplica o limite do contrato.
 */

import { ERROR_CODES } from "./errors.js";
import { LIMITS } from "./protocol.js";

// Caracteres de controle (inclui \r e \n): sem uso legítimo em nome ou
// mensagem de uma linha. O regex é deliberado.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/**
 * Controle vira espaço, extremidades aparadas, corte em `maxLength`.
 * Não-string vira string vazia.
 * @param {unknown} value
 * @param {number} maxLength
 */
export const normalizeText = (value, maxLength) => {
    if (typeof value !== "string") return "";
    return value.replace(CONTROL_CHARS, " ").trim().slice(0, maxLength);
};

/**
 * Lê o nome pedido no login.
 *  - tipo errado → recusado de imediato;
 *  - ausente, vazio ou só espaços/controle → `name: ""` (quem chama decide:
 *    numa retomada de sessão o nome guardado vale; numa entrada nova, recusa).
 * @param {unknown} raw
 * @returns {{ok: true, name: string} | {ok: false, code: string}}
 */
export const readName = (raw) => {
    if (raw !== undefined && typeof raw !== "string") {
        return { ok: false, code: ERROR_CODES.INVALID_NAME };
    }
    return { ok: true, name: normalizeText(raw, LIMITS.nameMaxLength) };
};

/**
 * Usernames que imitariam o sistema, a moderação ou uma menção coletiva.
 * Ficam indisponíveis para qualquer pessoa.
 */
export const RESERVED_USERNAMES = new Set([
    "admin",
    "administrador",
    "administrator",
    "adm",
    "mod",
    "moderador",
    "moderator",
    "root",
    "sistema",
    "system",
    "servidor",
    "server",
    "suporte",
    "support",
    "staff",
    "bot",
    "webchat",
    "todos",
    "everyone",
    "all",
    "here",
    "aqui",
    "voce",
    "you",
]);

// Letras minúsculas, números, ponto e _, sem começar ou terminar com ponto
// e sem dois pontos seguidos. O tamanho é conferido à parte.
const USERNAME_PATTERN = /^(?!.*\.\.)[a-z0-9_](?:[a-z0-9_.]*[a-z0-9_])?$/;

/**
 * Lê o username pedido no login.
 *  - tipo errado → recusado de imediato;
 *  - ausente ou vazio → `username: ""` (quem chama decide: numa retomada o
 *    username guardado vale; numa entrada nova, recusa);
 *  - um `@` inicial é aceito e removido; maiúsculas viram minúsculas.
 * @param {unknown} raw
 * @returns {{ok: true, username: string} | {ok: false, code: string}}
 */
export const readUsername = (raw) => {
    if (raw === undefined || raw === null) return { ok: true, username: "" };
    if (typeof raw !== "string") return { ok: false, code: ERROR_CODES.INVALID_USERNAME };
    const username = raw.trim().replace(/^@/, "").toLowerCase();
    if (!username) return { ok: true, username: "" };
    const valid =
        username.length >= LIMITS.usernameMinLength &&
        username.length <= LIMITS.usernameMaxLength &&
        USERNAME_PATTERN.test(username) &&
        !RESERVED_USERNAMES.has(username);
    return valid ? { ok: true, username } : { ok: false, code: ERROR_CODES.INVALID_USERNAME };
};

// Numa mensagem, a quebra de linha tem uso legítimo (listas, código). Os
// demais caracteres de controle continuam sem uso e viram espaço.
// eslint-disable-next-line no-control-regex
const MESSAGE_CONTROL_CHARS = /[\x00-\x08\x0b-\x1f\x7f]/g;

/**
 * Texto de uma mensagem de chat, com quebras de linha (decisão C1):
 * - `\r\n` e `\r` viram `\n`; tabulação vira dois espaços;
 * - outros caracteres de controle viram espaço;
 * - espaços no fim de cada linha somem; mais de uma linha vazia seguida
 *   vira uma só (nada de "parede" de linhas em branco);
 * - no máximo `messageMaxLines` linhas: o que passar disso é juntado na
 *   última, com espaço — nenhum texto se perde, só a quebra;
 * - extremidades aparadas e corte em `messageMaxLength`.
 * A exibição usa `textContent` e `white-space: pre-wrap`: a quebra de linha
 * não abre nenhuma brecha de marcação.
 * @param {string} value
 */
export const normalizeMessage = (value) => {
    const lines = value
        .replace(/\r\n?/g, "\n")
        .replace(/\t/g, "  ")
        .replace(MESSAGE_CONTROL_CHARS, " ")
        .split("\n")
        .map((line) => line.trimEnd());
    /** @type {string[]} */
    const kept = [];
    for (const line of lines) {
        if (line === "" && kept.at(-1) === "") continue;
        kept.push(line);
    }
    const max = LIMITS.messageMaxLines;
    const head = kept.slice(0, max - 1);
    const tail = kept.slice(max - 1).filter((line) => line.trim() !== "");
    if (tail.length) head.push(tail.map((line) => line.trim()).join(" "));
    return head.join("\n").trim().slice(0, LIMITS.messageMaxLength).trim();
};

/**
 * Conteúdo de uma mensagem de chat.
 * @param {unknown} raw
 * @returns {{ok: true, content: string} | {ok: false, code: string}}
 */
export const readContent = (raw) => {
    if (typeof raw !== "string") return { ok: false, code: ERROR_CODES.INVALID_MESSAGE };
    const content = normalizeMessage(raw);
    if (!content) return { ok: false, code: ERROR_CODES.EMPTY_MESSAGE };
    return { ok: true, content };
};

/**
 * Token de retomada: aceito só se for string não vazia dentro do limite.
 * Qualquer outra coisa é tratada como ausente (entrada nova), não como erro.
 * @param {unknown} raw
 * @returns {string | null}
 */
export const readResumeToken = (raw) =>
    typeof raw === "string" && raw.length > 0 && raw.length <= LIMITS.resumeTokenMaxLength
        ? raw
        : null;

const CLIENT_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Id de correlação gerado pelo cliente (`clientMsgId`, `requestId`): só
 * letras, dígitos, `-` e `_`, até o limite. Inválido é tratado como ausente.
 * Nunca é usado como chave de nada além de correlação de respostas.
 * @param {unknown} raw
 * @returns {string | null}
 */
export const readClientId = (raw) =>
    typeof raw === "string" && raw.length <= LIMITS.clientIdMaxLength && CLIENT_ID.test(raw)
        ? raw
        : null;

/** Letras do código de sala, sempre minúsculas e sem acento. */
export const ROOM_CODE_LETTERS = "abcdefghijklmnopqrstuvwxyz";
/** Tamanho de cada grupo do código `abc-defg-hij`. */
export const ROOM_CODE_GROUPS = Object.freeze([3, 4, 3]);
const ROOM_CODE_LENGTH = ROOM_CODE_GROUPS.reduce((sum, size) => sum + size, 0);

/**
 * Formata 10 letras como `abc-defg-hij`.
 * @param {string} letters
 */
export const formatRoomCode = (letters) => {
    const parts = [];
    let start = 0;
    for (const size of ROOM_CODE_GROUPS) {
        parts.push(letters.slice(start, start + size));
        start += size;
    }
    return parts.join("-");
};

/**
 * Código de convite como alguém o digitaria: com ou sem hífens, com espaços,
 * em maiúsculas ou colado de um link (`…#/s/abc-defg-hij`). Devolve o código
 * canônico ou recusa — a recusa de formato é a mesma para qualquer entrada.
 * @param {unknown} raw
 * @returns {{ok: true, code: string} | {ok: false, code: string}}
 */
export const readRoomCode = (raw) => {
    if (typeof raw !== "string" || raw.length > LIMITS.roomCodeInputMaxLength) {
        return { ok: false, code: ERROR_CODES.INVALID_ROOM_CODE };
    }
    // Link de convite: vale o último segmento do caminho ou do fragmento.
    const tail =
        raw
            .trim()
            .split(/[/#?=]/)
            .filter(Boolean)
            .at(-1) ?? "";
    const letters = tail.toLowerCase().replace(/[\s-]/g, "");
    if (letters.length !== ROOM_CODE_LENGTH || !/^[a-z]+$/.test(letters)) {
        return { ok: false, code: ERROR_CODES.INVALID_ROOM_CODE };
    }
    return { ok: true, code: formatRoomCode(letters) };
};

/**
 * Nome opcional de sala. Ausente ou vazio vira `""` (quem chama dá o padrão).
 * @param {unknown} raw
 * @returns {{ok: true, name: string} | {ok: false, code: string}}
 */
export const readRoomName = (raw) => {
    if (raw === undefined || raw === null) return { ok: true, name: "" };
    if (typeof raw !== "string") return { ok: false, code: ERROR_CODES.INVALID_ROOM_NAME };
    if (normalizeText(raw, Infinity).length > LIMITS.roomNameMaxLength) {
        return { ok: false, code: ERROR_CODES.INVALID_ROOM_NAME };
    }
    return { ok: true, name: normalizeText(raw, LIMITS.roomNameMaxLength) };
};

const CONVERSATION_ID = /^[a-z]{1,4}_[A-Za-z0-9_-]{8,48}$/;

/**
 * `conversationId` vindo do cliente: só formato; quem chama confere se a
 * conexão participa da conversa. Inválido é tratado como ausente.
 * @param {unknown} raw
 * @returns {string | null}
 */
export const readConversationId = (raw) =>
    typeof raw === "string" &&
    raw.length <= LIMITS.conversationIdMaxLength &&
    CONVERSATION_ID.test(raw)
        ? raw
        : null;
