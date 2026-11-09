/**
 * Sessões e conversas: o ponto de encontro entre conexões, identidades e
 * salas.
 *
 * Antes da Fase 2 da evolução, entrar no chat e entrar na sala eram a mesma
 * coisa. Agora são passos separados:
 *  1. `login` cria (ou retoma) a identidade temporária da conexão — nome,
 *     @username e id emitido pelo servidor — sem entrar em sala nenhuma;
 *  2. `createRoom` / `joinRoom` / `leaveRoom` cuidam das participações;
 *  3. toda operação numa conversa traz o `conversationId`, e o hub confere
 *     que a identidade DESTA conexão participa dela antes de qualquer
 *     efeito. "A conversa não existe" e "você não participa dela" são a
 *     mesma resposta.
 *
 * Ciclo de vida (tudo em memória):
 *  - a conexão cai: a identidade fica retomável por 2 min (`sessions.js`) e
 *    continua nas salas; quem voltar com o token recebe tudo de novo;
 *  - a identidade acaba (prazo vencido, saída voluntária): sai de todas as
 *    salas, sem poder voltar — `onRetire` do armazenamento chama `forget`;
 *  - sala sem ninguém: o diretório a destrói depois da tolerância.
 *
 * Também concentra o que é da IDENTIDADE e não de uma sala: nome, ausência
 * e papel de administrador, refletidos em todas as salas da pessoa.
 */

import { ERROR_CODES } from "../errors.js";
import { createRateLimiter } from "../rateLimiter.js";
import { LIMITS, ROLES, serverMessage } from "../protocol.js";
import {
    normalizeText,
    readConversationId,
    readName,
    readResumeToken,
    readRoomCode,
    readRoomName,
    readUsername,
} from "../validation.js";
import { isHost } from "./policy.js";
import { REMOVAL_REASONS, RENAME_COOLDOWN_MS } from "./room.js";

/**
 * @typedef {import("./sessions.js").Identity} Identity
 * @typedef {ReturnType<typeof import("./room.js").createRoom>} Room
 * @typedef {{ok: false, code: string}} Refusal
 */

/**
 * @param {{
 *   identities: ReturnType<typeof import("./sessions.js").createIdentityStore>,
 *   directory: ReturnType<typeof import("./directory.js").createRoomDirectory>,
 *   joinGuard: ReturnType<typeof import("./joinGuard.js").createJoinGuard>,
 *   deliver: (holder: unknown, data: string) => void,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   now?: () => number,
 *   onCapabilitiesChange?: (identity: Identity) => void,
 * }} options
 */
export const createHub = ({
    identities,
    directory,
    joinGuard,
    deliver,
    log,
    now = Date.now,
    onCapabilitiesChange = () => {},
}) => {
    /** Conexões com sessão. @type {Map<unknown, {identity: Identity, label: string}>} */
    const connections = new Map();

    // Consultas parciais não podem se transformar em enumeração ilimitada.
    // Balde global impede que trocar repetidamente de identidade reinicie
    // a cota do servidor; o balde individual limita o abuso por conta.
    const globalSearchLimit = createRateLimiter({
        capacity: 100,
        refillPerSecond: 20,
        now,
    });
    /** @type {WeakMap<Identity, () => boolean>} */
    const searchLimiters = new WeakMap();
    /** @param {Identity} identity */
    const searchAllowed = (identity) => {
        let allowed = searchLimiters.get(identity);
        if (!allowed) {
            allowed = createRateLimiter({ capacity: 5, refillPerSecond: 2, now });
            searchLimiters.set(identity, allowed);
        }
        return allowed() && globalSearchLimit();
    };

    /** @param {unknown} member @param {Record<string, unknown>} message */
    const sendTo = (member, message) => deliver(member, JSON.stringify(message));

    /** @param {unknown} member */
    const entryOf = (member) => connections.get(member) ?? null;

    /**
     * Identidade da conexão e a sala pedida, se ela participa.
     * @param {unknown} member
     * @param {unknown} rawConversationId
     * @returns {{ok: true, identity: Identity, room: Room} | Refusal}
     */
    const resolve = (member, rawConversationId) => {
        const entry = connections.get(member);
        if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
        const room = directory.roomFor(entry.identity, readConversationId(rawConversationId));
        if (!room) return { ok: false, code: ERROR_CODES.CONVERSATION_NOT_FOUND };
        return { ok: true, identity: entry.identity, room };
    };

    /**
     * Fim da identidade (chamado pelo armazenamento): sai de todas as salas.
     * @param {Identity} identity
     */
    const forget = (identity) => {
        for (const room of directory.roomsOf(identity)) {
            directory.leave(identity, room.id, REMOVAL_REASONS.ENDED);
        }
        identity.rooms.clear();
        identity.recent.clear();
        log("info", "identity_ended", { user: identity.id });
    };

    /** Presença ou papel mudou: listas de todas as salas da pessoa. @param {Identity} identity */
    const refreshEverywhere = (identity) => {
        for (const room of directory.roomsOf(identity)) room.refreshUserList();
        onCapabilitiesChange(identity);
    };

    return {
        forget,
        refreshEverywhere,

        /**
         * Começa (ou retoma) a sessão da conexão. Com `resumeToken` válido,
         * a identidade anterior volta com as mesmas salas; sem ele, uma
         * identidade nova é criada — `userId` do payload nunca é lido.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload
         * @param {string} label id curto da conexão, só para log
         * @returns {{ok: true, user: {id: string, name: string}, replaced: unknown, resumed: boolean} | Refusal}
         */
        login(member, payload, label) {
            if (connections.has(member)) return { ok: false, code: ERROR_CODES.ALREADY_LOGGED_IN };

            const requested = readName(payload.userName);
            if (!requested.ok) return requested;
            const requestedUsername = readUsername(payload.username);
            if (!requestedUsername.ok) return requestedUsername;

            const token = readResumeToken(payload.resumeToken);
            let identity = identities.claim(token);
            const resumed = identity !== null;
            let replaced = null;

            if (identity === null) {
                // Entrada nova: nome e username obrigatórios, e o username não
                // pode estar com outra identidade viva.
                if (!requested.name) return { ok: false, code: ERROR_CODES.INVALID_NAME };
                if (!requestedUsername.username) {
                    return { ok: false, code: ERROR_CODES.INVALID_USERNAME };
                }
                if (identities.isUsernameTaken(requestedUsername.username)) {
                    return { ok: false, code: ERROR_CODES.USERNAME_TAKEN };
                }
                identity = identities.create(requested.name, requestedUsername.username);
            } else if (identity.holder !== null && identity.holder !== member) {
                // A conexão antiga ainda consta (queda não detectada): a pessoa
                // é a mesma, então a antiga sai em silêncio e a nova assume.
                replaced = identity.holder;
                connections.delete(replaced);
            }

            const resumeToken = identities.attach(identity, member);
            connections.set(member, { identity, label });
            log("info", "session_started", { connection: label, user: identity.id, resumed });

            // A sessão chega antes de tudo: o cliente precisa do próprio id
            // para reconhecer as próprias mensagens nos históricos.
            sendTo(member, serverMessage.session(identity, resumeToken, resumed));
            for (const room of directory.roomsOf(identity)) room.reconnect(identity);
            return {
                ok: true,
                user: { id: identity.id, name: identity.name },
                replaced,
                resumed,
            };
        },

        /**
         * A conexão terminou (queda, fechamento, remoção): a identidade fica
         * retomável e continua nas salas, fora das listas.
         * @param {unknown} member
         * @returns {boolean} se a conexão tinha sessão
         */
        disconnect(member) {
            const entry = connections.get(member);
            if (!entry) return false;
            connections.delete(member);
            const { identity } = entry;
            if (identity.holder !== member) return true; // já substituída por outra conexão
            for (const room of directory.roomsOf(identity)) room.disconnect(identity);
            identities.release(identity, member);
            log("info", "session_paused", { connection: entry.label, user: identity.id });
            return true;
        },

        /**
         * A própria pessoa encerra a sessão: sai de todas as salas na hora,
         * o token deixa de valer e o username fica livre. Quem chama fecha a
         * conexão.
         * @param {unknown} member
         * @returns {boolean} se a conexão tinha sessão
         */
        logout(member) {
            const entry = connections.get(member);
            if (!entry) return false;
            connections.delete(member);
            const { identity } = entry;
            identities.revoke(identity); // → onRetire → forget: sai de todas as salas
            identity.holder = null;
            log("info", "session_ended", { connection: entry.label, user: identity.id });
            return true;
        },

        /**
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ name? }`
         * @returns {{ok: true, room: Room} | Refusal}
         */
        createRoom(member, payload) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const read = readRoomName(payload.name);
            if (!read.ok) return read;
            const name =
                read.name ||
                normalizeText(`Sala de ${entry.identity.name}`, LIMITS.roomNameMaxLength);
            const result = directory.create(entry.identity, name);
            if (result.ok) onCapabilitiesChange(entry.identity);
            return result;
        },

        /**
         * Entra numa sala pelo código. Erros de código contam para o limite
         * contra adivinhação; acerto não conta.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ code }`
         * @returns {{ok: true, room: Room, already: boolean} | Refusal}
         */
        joinRoom(member, payload) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const { identity } = entry;
            if (!joinGuard.allows(identity)) {
                log("warn", "room_join_locked", { user: identity.id });
                return { ok: false, code: ERROR_CODES.ROOM_JOIN_LOCKED };
            }
            const read = readRoomCode(payload.code);
            if (!read.ok) {
                joinGuard.fail(identity);
                return read;
            }
            const result = directory.join(identity, read.code);
            if (!result.ok && result.code === ERROR_CODES.ROOM_NOT_FOUND) joinGuard.fail(identity);
            return result;
        },

        /**
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ conversationId }`
         * @returns {{ok: true} | Refusal}
         */
        leaveRoom(member, payload) {
            const found = resolve(member, payload.conversationId);
            if (!found.ok) return found;
            const wasHost = isHost(found.room.membershipOf(found.identity));
            directory.leave(found.identity, found.room.id, REMOVAL_REASONS.LEFT);
            if (wasHost) onCapabilitiesChange(found.identity);
            return { ok: true };
        },

        /**
         * Resumo das salas da conexão.
         * @param {unknown} member
         */
        roomsOf(member) {
            const entry = connections.get(member);
            if (!entry) return null;
            return directory.roomsOf(entry.identity).map((room) => room.summaryFor(entry.identity));
        },

        resolve,

        /**
         * Pesquisa limitada por identificador público @username.
         * Só retorna pessoas online; dados da sessão nunca são enviados.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload
         * @returns {{ok: true, users: {id: string, name: string, username: string}[], query: string} | Refusal}
         */
        searchUsers(member, payload) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            if (!searchAllowed(entry.identity)) {
                return { ok: false, code: ERROR_CODES.RATE_LIMITED };
            }
            if (typeof payload.query !== "string" || payload.query.length > 40) {
                return { ok: false, code: ERROR_CODES.INVALID_USERNAME };
            }
            const query = payload.query.trim().replace(/^@/, "").toLowerCase();
            if (
                query.length < LIMITS.usernameMinLength ||
                query.length > LIMITS.usernameMaxLength ||
                !/^[a-z0-9_.]+$/.test(query)
            ) {
                return { ok: false, code: ERROR_CODES.INVALID_USERNAME };
            }
            return {
                ok: true,
                query,
                users: identities.searchOnline(query, entry.identity.id, 10),
            };
        },

        /**
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ conversationId, content, clientMsgId? }`
         */
        post(member, payload) {
            const found = resolve(member, payload.conversationId);
            if (!found.ok) return found;
            return found.room.post(found.identity, payload);
        },

        /**
         * Sinal de digitação. Conversa inválida é ignorada em silêncio.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload
         * @param {boolean} isTyping
         */
        typing(member, payload, isTyping) {
            const found = resolve(member, payload.conversationId);
            if (found.ok) found.room.typing(found.identity, isTyping);
        },

        /**
         * Troca o nome de exibição (vale em todas as salas). O id não muda.
         * @param {unknown} member
         * @param {unknown} rawName
         * @returns {{ok: true, changed: boolean, name: string}
         *   | {ok: false, code: string, retryInMs?: number}}
         */
        rename(member, rawName) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const read = readName(rawName);
            if (!read.ok || !read.name) return { ok: false, code: ERROR_CODES.INVALID_NAME };
            const { identity } = entry;
            if (read.name === identity.name)
                return { ok: true, changed: false, name: identity.name };
            const wait = identity.lastRenameAt + RENAME_COOLDOWN_MS - now();
            if (wait > 0) return { ok: false, code: "cooldown", retryInMs: wait };

            const previous = identity.name;
            identity.name = read.name;
            identity.lastRenameAt = now();
            log("info", "user_renamed", { user: identity.id });
            for (const room of directory.roomsOf(identity)) room.announceRename(identity, previous);
            return { ok: true, changed: true, name: identity.name };
        },

        /**
         * Marca ausência (com motivo opcional) ou volta a ficar presente —
         * em todas as salas da pessoa.
         * @param {unknown} member
         * @param {unknown} rawText texto, ou null para voltar
         * @returns {{ok: true, away: string | null} | Refusal}
         */
        setAway(member, rawText) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const text = rawText === null ? null : normalizeText(rawText, LIMITS.awayTextMaxLength);
            entry.identity.away = rawText === null ? null : text || "ausente";
            for (const room of directory.roomsOf(entry.identity)) room.refreshUserList();
            return { ok: true, away: entry.identity.away };
        },

        /**
         * Concede o papel de administrador global (quem chama já verificou a chave).
         * @param {unknown} member
         */
        grantAdmin(member) {
            const entry = connections.get(member);
            if (!entry) return false;
            entry.identity.role = ROLES.ADMIN;
            log("info", "admin_granted", { user: entry.identity.id });
            for (const room of directory.roomsOf(entry.identity))
                room.announceAdmin(entry.identity);
            return true;
        },

        /**
         * A identidade é anfitriã de alguma sala? (catálogo de comandos)
         * @param {Identity} identity
         */
        hostsAnyRoom: (identity) =>
            directory.roomsOf(identity).some((room) => isHost(room.membershipOf(identity))),

        entryOf,

        /** @param {unknown} member */
        isLoggedIn: (member) => connections.has(member),

        /** @param {unknown} member @returns {string | null} */
        userIdOf: (member) => connections.get(member)?.identity.id ?? null,

        /** Sessões com conexão aberta. */
        get sessionCount() {
            return connections.size;
        },

        get roomCount() {
            return directory.size;
        },

        /** Desligamento: nenhuma sala anuncia saídas nem deixa timer pendente. */
        silence() {
            for (const room of directory.all()) room.silence();
        },

        /** Fim do processo: salas e históricos descartados. */
        closeAll() {
            directory.closeAll();
        },
    };
};
