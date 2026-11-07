/**
 * Identidades emitidas pelo servidor (Fase 1, P01).
 *
 * O cliente nunca escolhe quem é: o id nasce aqui. Para manter a mesma
 * identidade numa reconexão, a conexão que a detém recebe um token secreto;
 * apresentá-lo de volta é a única forma de reaver o id.
 *
 * Garantias:
 *  - só o hash SHA-256 do token é guardado — o token em claro existe apenas
 *    no retorno de `attach` e nunca é registrado;
 *  - o token é de uso único: `claim` o consome, e `attach` emite outro;
 *  - identidade sem conexão expira após `ttlMs`, e no máximo `maxReleased`
 *    identidades liberadas ficam guardadas (as mais antigas saem primeiro).
 *    O teto vale A TODO MOMENTO: é aplicado na própria liberação. Antes da
 *    Fase 3 ele só era aplicado na varredura periódica, e com muitas
 *    entradas e saídas o mapa chegava a 28.600 identidades entre duas
 *    varreduras (medido).
 *
 * "Holder" é um valor opaco que representa a conexão; este módulo não sabe
 * o que é um WebSocket.
 */

import crypto from "node:crypto";

export const RESUME_TTL_MS = 10 * 60 * 1000;
export const MAX_RELEASED_IDENTITIES = 2000;

/**
 * @typedef {object} Identity
 * @property {string} id
 * @property {string} name
 * @property {unknown} holder        conexão que detém a identidade, ou null
 * @property {number | null} releasedAt
 * @property {string | null} [tokenHash]  hash do token válido (interno; nunca enviado)
 * @property {"member" | "admin"} role   papel na sala (Fase 4)
 * @property {string | null} away        texto de ausência, ou null se presente
 * @property {number | null} mutedUntil  silenciada até (ms epoch; Infinity = sem prazo)
 * @property {number} joinedAt
 * @property {number} messageCount
 * @property {number} lastRenameAt
 * @property {Map<string, unknown>} recent  clientMsgId → mensagem (anti-duplicação)
 * @property {unknown} pendingLeave       aviso de saída agendado (janela de retomada)
 */

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * @param {{
 *   ttlMs?: number,
 *   maxReleased?: number,
 *   now?: () => number,
 *   newId?: () => string,
 *   newToken?: () => string,
 * }} [options]
 */
export const createIdentityStore = ({
    ttlMs = RESUME_TTL_MS,
    maxReleased = MAX_RELEASED_IDENTITIES,
    now = Date.now,
    newId = () => crypto.randomUUID(),
    newToken = () => crypto.randomBytes(32).toString("base64url"),
} = {}) => {
    /** @type {Map<string, Identity>} hash do token → identidade */
    const byTokenHash = new Map();
    /**
     * Identidades liberadas, na ordem em que foram liberadas (Map preserva a
     * ordem de inserção): a primeira é sempre a mais antiga. Permite aplicar
     * o teto e a expiração sem percorrer as identidades ativas.
     * @type {Map<Identity, true>}
     */
    const released = new Map();

    const forget = (identity) => {
        released.delete(identity);
        if (identity.tokenHash) byTokenHash.delete(identity.tokenHash);
        identity.tokenHash = null;
    };

    const expired = (identity, time) =>
        identity.holder === null && time - /** @type {number} */ (identity.releasedAt) > ttlMs;

    return {
        /**
         * Nova identidade, ainda sem conexão.
         * @param {string} name
         * @returns {Identity}
         */
        create(name) {
            return {
                id: newId(),
                name,
                holder: null,
                releasedAt: null,
                role: "member",
                away: null,
                mutedUntil: null,
                joinedAt: now(),
                messageCount: 0,
                lastRenameAt: 0,
                recent: new Map(),
                pendingLeave: null,
            };
        },

        /**
         * Invalida o token da identidade: ela não pode mais ser retomada.
         * Usado ao remover alguém da sala (a pessoa pode voltar, mas como
         * identidade nova).
         * @param {Identity} identity
         */
        revoke(identity) {
            forget(identity);
        },

        /**
         * Consome um token de retomada. Devolve a identidade se o token for
         * válido e não expirado; caso contrário, `null`.
         * @param {string | null} token
         * @returns {Identity | null}
         */
        claim(token) {
            if (token === null) return null;
            const identity = byTokenHash.get(hashToken(token));
            if (!identity) return null;
            const isExpired = expired(identity, now());
            forget(identity); // uso único: o token deixa de valer de qualquer forma
            return isExpired ? null : identity;
        },

        /**
         * Associa a identidade a uma conexão e devolve o token novo.
         * @param {Identity} identity
         * @param {unknown} holder
         * @returns {string} token em claro, para entregar só ao dono
         */
        attach(identity, holder) {
            forget(identity);
            identity.holder = holder;
            identity.releasedAt = null;
            const token = newToken();
            identity.tokenHash = hashToken(token);
            byTokenHash.set(identity.tokenHash, identity);
            return token;
        },

        /**
         * A conexão terminou: a identidade fica retomável até expirar. Só a
         * conexão que a detém pode liberá-la.
         * @param {Identity} identity
         * @param {unknown} holder
         */
        release(identity, holder) {
            if (identity.holder !== holder) return;
            identity.holder = null;
            identity.releasedAt = now();
            released.set(identity, true);
            // Teto aplicado na hora: a mais antiga sai primeiro.
            while (released.size > maxReleased) {
                const oldest = /** @type {Identity} */ (released.keys().next().value);
                forget(oldest);
            }
        },

        /**
         * Remove identidades liberadas que já expiraram. Para na primeira
         * ainda válida (a fila está em ordem de liberação).
         */
        sweep() {
            const time = now();
            for (const identity of released.keys()) {
                if (!expired(identity, time)) break;
                forget(identity);
            }
        },

        /** Quantidade de tokens válidos guardados (para testes e métricas). */
        get size() {
            return byTokenHash.size;
        },

        /** Identidades liberadas ainda retomáveis. */
        get releasedCount() {
            return released.size;
        },
    };
};
