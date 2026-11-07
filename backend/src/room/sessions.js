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

    const expired = (identity, time) =>
        identity.holder === null && time - /** @type {number} */ (identity.releasedAt) > ttlMs;

    return {
        /**
         * Nova identidade, ainda sem conexão.
         * @param {string} name
         * @returns {Identity}
         */
        create(name) {
            return { id: newId(), name, holder: null, releasedAt: null };
        },

        /**
         * Consome um token de retomada. Devolve a identidade se o token for
         * válido e não expirado; caso contrário, `null`.
         * @param {string | null} token
         * @returns {Identity | null}
         */
        claim(token) {
            if (token === null) return null;
            const hash = hashToken(token);
            const identity = byTokenHash.get(hash);
            if (!identity) return null;
            byTokenHash.delete(hash);
            if (expired(identity, now())) return null;
            return identity;
        },

        /**
         * Associa a identidade a uma conexão e devolve o token novo.
         * @param {Identity} identity
         * @param {unknown} holder
         * @returns {string} token em claro, para entregar só ao dono
         */
        attach(identity, holder) {
            identity.holder = holder;
            identity.releasedAt = null;
            const token = newToken();
            byTokenHash.set(hashToken(token), identity);
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
        },

        /** Remove identidades expiradas e o excesso de liberadas. */
        sweep() {
            const time = now();
            let released = 0;
            for (const [hash, identity] of byTokenHash) {
                if (identity.holder !== null) continue;
                if (expired(identity, time)) byTokenHash.delete(hash);
                else released += 1;
            }
            // Map preserva ordem de inserção: os primeiros são os mais antigos.
            for (const [hash, identity] of byTokenHash) {
                if (released <= maxReleased) break;
                if (identity.holder === null) {
                    byTokenHash.delete(hash);
                    released -= 1;
                }
            }
        },

        /** Quantidade de tokens válidos guardados (para testes e métricas). */
        get size() {
            return byTokenHash.size;
        },
    };
};
