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

/**
 * Conteúdo de uma mensagem de chat.
 * @param {unknown} raw
 * @returns {{ok: true, content: string} | {ok: false, code: string}}
 */
export const readContent = (raw) => {
    if (typeof raw !== "string") return { ok: false, code: ERROR_CODES.INVALID_MESSAGE };
    const content = normalizeText(raw, LIMITS.messageMaxLength);
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
