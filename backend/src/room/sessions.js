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

/**
 * Por quanto tempo uma identidade desconectada pode ser retomada — e, junto
 * com ela, por quanto tempo o username fica reservado para a mesma pessoa.
 * Eram 10 min; com username exclusivo, 10 min de reserva prenderiam o
 * @nome de quem só fechou a aba. 2 min cobrem com folga as 6 tentativas
 * automáticas de reconexão do cliente (cerca de 40 s no pior caso).
 */
export const RESUME_TTL_MS = 2 * 60 * 1000;
export const MAX_RELEASED_IDENTITIES = 2000;

/**
 * @typedef {object} Identity
 * @property {string} id
 * @property {string} name
 * @property {string} username  único entre as identidades vivas (minúsculo, sem o arroba)
 * @property {unknown} holder        conexão que detém a identidade, ou null
 * @property {number | null} releasedAt
 * @property {string | null} [tokenHash]  hash do token válido (interno; nunca enviado)
 * @property {"member" | "admin"} role   papel global: `admin` vale em todas as salas
 * @property {string | null} away        texto de ausência, ou null se presente
 * @property {Set<string>} rooms          conversas (salas) de que participa
 * @property {number} joinedAt
 * @property {number} messageCount
 * @property {number} lastRenameAt
 * @property {Map<string, unknown>} recent  clientMsgId → mensagem (anti-duplicação)
 * @property {boolean} retired          identidade encerrada (não volta mais)
 */

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * @param {{
 *   ttlMs?: number,
 *   maxReleased?: number,
 *   now?: () => number,
 *   newId?: () => string,
 *   newToken?: () => string,
 *   onRetire?: (identity: Identity) => void,
 * }} [options]
 */
export const createIdentityStore = ({
    ttlMs = RESUME_TTL_MS,
    maxReleased = MAX_RELEASED_IDENTITIES,
    now = Date.now,
    newId = () => crypto.randomUUID(),
    newToken = () => crypto.randomBytes(32).toString("base64url"),
    onRetire = () => {},
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
    /** @type {Map<string, Identity>} username → identidade viva (conectada ou retomável) */
    const usernames = new Map();

    const forget = (identity) => {
        released.delete(identity);
        if (identity.tokenHash) byTokenHash.delete(identity.tokenHash);
        identity.tokenHash = null;
    };

    const expired = (identity, time) =>
        identity.holder === null && time - /** @type {number} */ (identity.releasedAt) > ttlMs;

    /**
     * Fim definitivo da identidade: token inválido e username livre. Quem
     * criou o armazenamento é avisado (uma vez) para desfazer o que estava
     * ligado a ela — as salas de que participava, por exemplo.
     */
    const retire = (identity) => {
        forget(identity);
        if (usernames.get(identity.username) === identity) usernames.delete(identity.username);
        if (identity.retired) return;
        identity.retired = true;
        onRetire(identity);
    };

    return {
        /**
         * Nova identidade, ainda sem conexão, com o username reservado. Quem
         * chama confere antes com `isUsernameTaken`.
         * @param {string} name
         * @param {string} username
         * @returns {Identity}
         */
        create(name, username) {
            /** @type {Identity} */
            const identity = {
                id: newId(),
                name,
                username,
                holder: null,
                releasedAt: null,
                role: "member",
                away: null,
                rooms: new Set(),
                joinedAt: now(),
                messageCount: 0,
                lastRenameAt: -Infinity,
                recent: new Map(),
                retired: false,
            };
            usernames.set(username, identity);
            return identity;
        },

        /**
         * O username está com alguma identidade viva? Uma identidade
         * desconectada além do prazo de retomada é encerrada aqui mesmo, sem
         * esperar a varredura periódica.
         * @param {string} username
         */
        /**
         * Busca limitada às identidades conectadas. Não expõe tokens,
         * identidades desconectadas nem o cadastro interno.
         * @param {string} query prefixo ou trecho normalizado
         * @param {string} excludeId
         * @param {number} [limit]
         */
        searchOnline(query, excludeId, limit = 10) {
            /** @type {{id: string, name: string, username: string}[]} */
            const results = [];
            for (const [username, identity] of usernames) {
                if (
                    username.includes(query) &&
                    identity.id !== excludeId &&
                    identity.holder !== null &&
                    !identity.retired
                ) {
                    results.push({
                        id: identity.id,
                        name: identity.name,
                        username: identity.username,
                    });
                }
            }
            return results
                .sort((a, b) => {
                    const aPrefix = a.username.startsWith(query) ? 0 : 1;
                    const bPrefix = b.username.startsWith(query) ? 0 : 1;
                    return aPrefix - bPrefix || a.username.localeCompare(b.username);
                })
                .slice(0, limit);
        },

        /** @param {string} username */
        findOnline(username) {
            const identity = usernames.get(username);
            return identity && identity.holder !== null && !identity.retired ? identity : null;
        },

        isUsernameTaken(username) {
            const holder = usernames.get(username);
            if (!holder) return false;
            if (expired(holder, now())) {
                retire(holder);
                return false;
            }
            return true;
        },

        /**
         * Encerra a identidade: o token deixa de valer e o username fica
         * livre na hora. Usado ao remover alguém da sala e quando a própria
         * pessoa sai (a volta é sempre como identidade nova).
         * @param {Identity} identity
         */
        revoke(identity) {
            retire(identity);
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
            // Uso único: o token deixa de valer de qualquer forma.
            if (isExpired) retire(identity);
            else forget(identity);
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
                retire(oldest);
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
                retire(identity);
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

        /** Usernames reservados agora (conectados ou retomáveis). */
        get usernameCount() {
            return usernames.size;
        },
    };
};
