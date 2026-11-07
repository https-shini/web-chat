/**
 * A sala: quem está nela, o que foi dito e quem está digitando.
 *
 * Regras de negócio puras. Não conhece WebSocket, HTTP nem rate limit:
 * recebe a conexão como um valor opaco ("member") e entrega quadros por uma
 * função `deliver(member, data)` injetada. Por isso pode ser testada com
 * objetos simples no lugar de conexões.
 *
 * Invariantes:
 *  - uma conexão entra uma única vez (segundo login é recusado);
 *  - a identidade de uma mensagem é sempre a da conexão, nunca a do payload;
 *  - só quem entrou recebe eventos da sala (Fase 1, P37);
 *  - uma identidade tem no máximo uma conexão: retomar com a antiga ainda
 *    presente substitui a antiga, sem avisos e sem duplicar a lista.
 */

import crypto from "node:crypto";
import { ERROR_CODES } from "../errors.js";
import { serverMessage } from "../protocol.js";
import { readContent, readName, readResumeToken } from "../validation.js";

/**
 * @typedef {import("./sessions.js").Identity} Identity
 * @typedef {{ok: true} | {ok: false, code: string}} Result
 */

/**
 * @param {{
 *   identities: ReturnType<typeof import("./sessions.js").createIdentityStore>,
 *   deliver: (member: unknown, data: string) => void,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   historySize: number,
 *   historyOnJoin: number,
 *   now?: () => Date,
 *   newMessageId?: () => string,
 * }} options
 */
export const createRoom = ({
    identities,
    deliver,
    log,
    historySize,
    historyOnJoin,
    now = () => new Date(),
    newMessageId = () => crypto.randomUUID(),
}) => {
    /** @type {Map<unknown, {identity: Identity, label: string}>} */
    const members = new Map();
    /** Mensagens de chat já no formato de envio, da mais antiga à mais nova. */
    const history = [];
    /** Em desligamento: saídas não são anunciadas. */
    let quiet = false;

    const timestamp = () => now().toISOString();

    const sendTo = (member, message) => deliver(member, JSON.stringify(message));

    const broadcast = (message, except = null) => {
        const data = JSON.stringify(message);
        for (const member of members.keys()) {
            if (member !== except) deliver(member, data);
        }
    };

    const broadcastUserList = () =>
        broadcast(serverMessage.userList([...members.values()].map((entry) => entry.identity)));

    /**
     * Tira a conexão da sala. Devolve `false` se ela não estava.
     * @param {unknown} member
     * @param {{announce?: boolean, reason?: string}} [options]
     */
    const leave = (member, { announce = true, reason = "closed" } = {}) => {
        const entry = members.get(member);
        if (!entry) return false;
        members.delete(member);
        identities.release(entry.identity, member);
        log("info", "user_left", { connection: entry.label, user: entry.identity.id, reason });
        if (announce && !quiet) {
            broadcast(serverMessage.left(entry.identity.name, timestamp()));
            broadcastUserList();
        }
        return true;
    };

    return {
        /**
         * Entrada na sala. Com `resumeToken` válido, a identidade anterior é
         * retomada; sem ele, uma identidade nova é criada — `userId` do
         * payload nunca é lido.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload
         * @param {string} label  id curto da conexão, só para log
         * @returns {{ok: true, user: {id: string, name: string}, replaced: unknown}
         *   | {ok: false, code: string}}
         */
        join(member, payload, label) {
            if (members.has(member)) return { ok: false, code: ERROR_CODES.ALREADY_LOGGED_IN };

            const requested = readName(payload.userName);
            if (!requested.ok) return requested;

            let identity = identities.claim(readResumeToken(payload.resumeToken));
            const resumed = identity !== null;
            let replaced = null;

            if (identity === null) {
                if (!requested.name) return { ok: false, code: ERROR_CODES.INVALID_NAME };
                identity = identities.create(requested.name);
            } else if (identity.holder !== null && identity.holder !== member) {
                // A conexão antiga ainda consta (queda não detectada): a pessoa
                // é a mesma, então ela sai em silêncio e a nova assume.
                replaced = identity.holder;
                leave(replaced, { announce: false, reason: "replaced" });
            }

            const resumeToken = identities.attach(identity, member);
            members.set(member, { identity, label });
            log("info", "user_joined", { connection: label, user: identity.id, resumed });

            // A sessão chega antes de tudo: o cliente precisa do próprio id
            // para reconhecer as próprias mensagens no histórico.
            sendTo(member, serverMessage.session(identity, resumeToken));
            if (history.length > 0 && historyOnJoin > 0) {
                sendTo(member, serverMessage.history(history.slice(-historyOnJoin)));
            }
            // Na substituição, para os outros a pessoa nunca saiu.
            if (replaced === null) {
                broadcast(serverMessage.joined(identity.name, timestamp()), member);
            }
            broadcastUserList();
            return { ok: true, user: { id: identity.id, name: identity.name }, replaced };
        },

        leave,

        /**
         * Mensagem de chat. O autor é a identidade da conexão.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload
         * @returns {Result}
         */
        post(member, payload) {
            const entry = members.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const content = readContent(payload.content);
            if (!content.ok) return content;

            const message = serverMessage.chat({
                id: newMessageId(),
                user: entry.identity,
                content: content.content,
                timestamp: timestamp(),
            });
            history.push(message);
            if (history.length > historySize) history.shift();
            broadcast(message);
            return { ok: true };
        },

        /**
         * Sinal de digitação. Conexão fora da sala é ignorada em silêncio.
         * @param {unknown} member
         * @param {boolean} isTyping
         */
        typing(member, isTyping) {
            const entry = members.get(member);
            if (!entry) return;
            broadcast(serverMessage.typing(entry.identity, isTyping), member);
        },

        /** @param {unknown} member */
        isMember: (member) => members.has(member),

        /** @param {unknown} member @returns {string | null} */
        userIdOf: (member) => members.get(member)?.identity.id ?? null,

        get memberCount() {
            return members.size;
        },

        /** Desligamento: daqui em diante, saídas não são anunciadas. */
        silence() {
            quiet = true;
        },
    };
};
