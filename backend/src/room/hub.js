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
 *
 * Conversas privadas (Fase 3 da evolução): busca por @ exato, abrir,
 * encerrar e bloquear. Salas e conversas privadas são tipos distintos de
 * conversa, com autorização própria, mas passam pelo mesmo caminho de
 * mensagem e digitação (`resolveConversation`).
 */

import { ERROR_CODES } from "../errors.js";
import { LIMITS, ROLES, serverMessage } from "../protocol.js";
import { createRateLimiter } from "../rateLimiter.js";
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
 * @typedef {import("./direct.js").DirectConversation} DirectConversation
 * @typedef {{ok: false, code: string}} Refusal
 */

/**
 * Limites contra abuso das conversas privadas, por identidade.
 *  - busca por @: 20 seguidas, depois 1 a cada 3 s — encontrar um conhecido
 *    é fácil; varrer @ às cegas, não;
 *  - conversas NOVAS: 10 seguidas, depois 1 a cada 30 s — reabrir uma
 *    conversa existente não conta;
 *  - bloqueios: até 100 por sessão.
 *
 * E no servidor inteiro (`global`): cada conexão nova pode criar uma
 * identidade nova, com baldes cheios. Sem o teto global, abrir muitas
 * conexões contornaria o limite por identidade e permitiria varrer quem
 * está online. Esgotado o global, buscas e conversas novas são recusadas por
 * um instante para todos — inclusive para quem acertaria o @.
 */
export const DM_GUARD_DEFAULTS = Object.freeze({
    lookup: Object.freeze({ capacity: 20, refillPerSecond: 1 / 3 }),
    newConversation: Object.freeze({ capacity: 10, refillPerSecond: 1 / 30 }),
    maxBlocked: 100,
    global: Object.freeze({
        lookup: Object.freeze({ capacity: 100, refillPerSecond: 5 }),
        newConversation: Object.freeze({ capacity: 60, refillPerSecond: 2 }),
    }),
});

/**
 * @param {{
 *   identities: ReturnType<typeof import("./sessions.js").createIdentityStore>,
 *   directory: ReturnType<typeof import("./directory.js").createRoomDirectory>,
 *   directs: ReturnType<typeof import("./direct.js").createDirectDirectory>,
 *   dmGuard?: Partial<typeof DM_GUARD_DEFAULTS>,
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
    directs,
    dmGuard = {},
    joinGuard,
    deliver,
    log,
    now = Date.now,
    onCapabilitiesChange = () => {},
}) => {
    /** Conexões com sessão. @type {Map<unknown, {identity: Identity, label: string}>} */
    const connections = new Map();

    /** @param {unknown} member @param {Record<string, unknown>} message */
    const sendTo = (member, message) => deliver(member, JSON.stringify(message));

    /** @param {unknown} member */
    const entryOf = (member) => connections.get(member) ?? null;

    const guard = {
        ...DM_GUARD_DEFAULTS,
        ...dmGuard,
        global: { ...DM_GUARD_DEFAULTS.global, ...dmGuard.global },
    };
    /** Baldes por identidade; somem junto com ela. */
    const buckets = {
        lookup: new WeakMap(),
        newConversation: new WeakMap(),
    };
    /** Baldes do servidor inteiro. */
    const shared = {
        lookup: createRateLimiter({ ...guard.global.lookup, now }),
        newConversation: createRateLimiter({ ...guard.global.newConversation, now }),
    };
    /**
     * Consome uma ficha do balde do servidor e uma do balde da identidade.
     * O global vem primeiro: se ele está esgotado, a identidade não perde nada.
     * @param {"lookup" | "newConversation"} kind
     * @param {Identity} identity
     */
    const consume = (kind, identity) => {
        if (!shared[kind]()) {
            log("warn", "dm_guard_global_limit", { kind });
            return false;
        }
        let take = buckets[kind].get(identity);
        if (!take) {
            take = createRateLimiter({ ...guard[kind], now });
            buckets[kind].set(identity, take);
        }
        return take();
    };

    /** Alguém bloqueou alguém (em qualquer direção)? @param {Identity} x @param {Identity} y */
    const blockedBetween = (x, y) => x.blocked.has(y.id) || y.blocked.has(x.id);

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
     * Identidade da conexão e a conversa pedida — sala OU privada —, se ela
     * participa. As duas têm `post`, `publish` e `typing`.
     * @param {unknown} member
     * @param {unknown} rawConversationId
     * @returns {{ok: true, identity: Identity, conversation: Room | DirectConversation} | Refusal}
     */
    const resolveConversation = (member, rawConversationId) => {
        const entry = connections.get(member);
        if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
        const id = readConversationId(rawConversationId);
        const conversation =
            directory.roomFor(entry.identity, id) ?? directs.forIdentity(entry.identity, id);
        if (!conversation) return { ok: false, code: ERROR_CODES.CONVERSATION_NOT_FOUND };
        return { ok: true, identity: entry.identity, conversation };
    };

    /**
     * Pessoa indicada pelo `@` exato no payload, entre as identidades vivas
     * (conectadas ou na janela de retomada). O id interno nunca vem do
     * cliente nem volta para ele. A busca conta no limite, a menos que as
     * duas já tenham uma conversa privada (aí não revela nada de novo).
     * @param {Identity} identity quem procura
     * @param {Record<string, unknown>} payload `{ username }`
     * @returns {{ok: true, target: Identity | null} | Refusal}
     */
    const findTarget = (identity, payload) => {
        const read = readUsername(payload.username);
        if (!read.ok || !read.username) return { ok: false, code: ERROR_CODES.INVALID_USER };
        const target = identities.findByUsername(read.username);
        const known = target !== null && directs.between(identity, target) !== null;
        if (!known && !consume("lookup", identity)) {
            return { ok: false, code: ERROR_CODES.LOOKUP_LIMITED };
        }
        return { ok: true, target };
    };

    /** Bloqueados da identidade, para `block_list`. @param {Identity} identity */
    const blockedOf = (identity) => [...identity.blocked.values()];

    /**
     * Fim da identidade (chamado pelo armazenamento): sai de todas as salas.
     * @param {Identity} identity
     */
    const forget = (identity) => {
        for (const room of directory.roomsOf(identity)) {
            directory.leave(identity, room.id, REMOVAL_REASONS.ENDED);
        }
        identity.rooms.clear();
        // Conversas privadas acabam junto, com o histórico; a outra pessoa é avisada.
        directs.dropIdentity(identity);
        identity.blocked.clear();
        identity.recent.clear();
        log("info", "identity_ended", { user: identity.id });
    };

    /** Presença ou papel mudou: listas de todas as salas da pessoa. @param {Identity} identity */
    const refreshEverywhere = (identity) => {
        for (const room of directory.roomsOf(identity)) room.refreshUserList();
        onCapabilitiesChange(identity);
    };

    /** Salas e conversas privadas da identidade. @param {Identity} identity */
    const conversationsOf = (identity) => ({
        rooms: directory.roomsOf(identity).map((room) => room.summaryFor(identity)),
        dms: directs.of(identity).map((conversation) => conversation.summaryFor(identity)),
    });

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
            for (const conversation of directs.of(identity)) conversation.reconnect(identity);
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
            // Depois de liberar: a outra pessoa de cada conversa vê "offline".
            for (const conversation of directs.of(identity)) conversation.disconnect(identity);
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

        /**
         * Salas e conversas privadas da conexão (`room_list`).
         * @param {unknown} member
         */
        conversationsOf(member) {
            const entry = connections.get(member);
            return entry ? conversationsOf(entry.identity) : null;
        },

        resolve,
        resolveConversation,

        /**
         * Mensagem numa conversa — sala ou privada.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ conversationId, content, clientMsgId? }`
         */
        post(member, payload) {
            const found = resolveConversation(member, payload.conversationId);
            if (!found.ok) return found;
            return found.conversation.post(found.identity, payload);
        },

        /**
         * Editar, apagar, reagir, fixar ou mudar a descrição, numa conversa
         * de que a conexão participa. Permissão decidida pela conversa.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload
         * @param {"edit" | "removeMessage" | "react" | "pin" | "describe"} action
         * @returns {{ok: true} | {ok: false, code: string, until?: string}}
         */
        conversationAction(member, payload, action) {
            const found = resolveConversation(member, payload.conversationId);
            if (!found.ok) return found;
            return found.conversation[action](found.identity, payload);
        },

        /**
         * Procura alguém conectado pelo @ EXATO. Nunca lista, completa ou
         * sugere: sem o @ certo, nada aparece. Quem bloqueou você também não
         * aparece (a resposta não diz por quê).
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ username }`
         * @returns {{ok: true, user: Identity | null} | Refusal}
         */
        lookup(member, payload) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const { identity } = entry;
            const read = readUsername(payload.username);
            if (!read.ok || !read.username) return { ok: false, code: ERROR_CODES.INVALID_USER };
            if (!consume("lookup", identity))
                return { ok: false, code: ERROR_CODES.LOOKUP_LIMITED };
            const found = identities.findConnected(read.username);
            const visible = found && !found.blocked.has(identity.id) ? found : null;
            return { ok: true, user: visible };
        },

        /**
         * Abre (ou retoma) a conversa privada com alguém, pelo `@` exato (o
         * de uma busca, de uma lista de sala ou de um perfil). Conversa nova
         * exige a outra pessoa conectada; uma existente é devolvida mesmo com
         * ela na janela de retomada.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ username }`
         * @returns {{ok: true, conversation: DirectConversation, created: boolean} | Refusal}
         */
        openDm(member, payload) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const { identity } = entry;
            const found = findTarget(identity, payload);
            if (!found.ok) return found;
            const { target } = found;
            // "Não existe", "não está aqui" e "bloqueou você" são a mesma resposta.
            if (!target || blockedBetween(identity, target)) {
                return { ok: false, code: ERROR_CODES.USER_UNAVAILABLE };
            }
            if (target === identity) return { ok: false, code: ERROR_CODES.DM_SELF };
            const existing = directs.between(identity, target);
            if (!existing) {
                if (target.holder === null)
                    return { ok: false, code: ERROR_CODES.USER_UNAVAILABLE };
                if (!consume("newConversation", identity)) {
                    return { ok: false, code: ERROR_CODES.DM_OPEN_LIMITED };
                }
            }
            const result = existing
                ? { ok: true, conversation: existing, created: false }
                : directs.open(identity, target);
            if (!result.ok) return result;
            result.conversation.open(identity, { created: result.created });
            return result;
        },

        /**
         * Encerra uma conversa privada para as duas pessoas, com o histórico.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ conversationId }`
         * @returns {{ok: true} | Refusal}
         */
        closeDm(member, payload) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const conversation = directs.forIdentity(
                entry.identity,
                readConversationId(payload.conversationId),
            );
            if (!conversation) return { ok: false, code: ERROR_CODES.CONVERSATION_NOT_FOUND };
            directs.close(conversation);
            return { ok: true };
        },

        /**
         * Bloqueia alguém até o fim da sessão: a conversa privada entre as
         * duas acaba, e nenhuma nova pode ser aberta em nenhuma direção. Quem
         * foi bloqueado não é avisado do bloqueio (só vê a conversa encerrada).
         * Vale só para conversas privadas: salas têm moderação própria.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ username }`
         * @returns {{ok: true, blocked: {name: string, username: string}[]} | Refusal}
         */
        block(member, payload) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const { identity } = entry;
            const found = findTarget(identity, payload);
            if (!found.ok) return found;
            const { target } = found;
            if (target === identity) return { ok: false, code: ERROR_CODES.INVALID_USER };
            if (!target) return { ok: false, code: ERROR_CODES.USER_UNAVAILABLE };
            if (!identity.blocked.has(target.id)) {
                if (identity.blocked.size >= guard.maxBlocked) {
                    return { ok: false, code: ERROR_CODES.BLOCK_LIMIT };
                }
                // A chave é o id interno: se a pessoa sair e outra pegar o
                // mesmo @, a nova não herda o bloqueio.
                identity.blocked.set(target.id, { name: target.name, username: target.username });
                const conversation = directs.between(identity, target);
                if (conversation) directs.close(conversation);
                log("info", "user_blocked", { user: identity.id });
            }
            return { ok: true, blocked: blockedOf(identity) };
        },

        /**
         * Desfaz o bloqueio de quem tinha esse `@` quando foi bloqueado.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload `{ username }`
         * @returns {{ok: true, blocked: {name: string, username: string}[]} | Refusal}
         */
        unblock(member, payload) {
            const entry = connections.get(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const read = readUsername(payload.username);
            if (!read.ok || !read.username) return { ok: false, code: ERROR_CODES.INVALID_USER };
            for (const [id, person] of entry.identity.blocked) {
                if (person.username === read.username) entry.identity.blocked.delete(id);
            }
            return { ok: true, blocked: blockedOf(entry.identity) };
        },

        /**
         * Sinal de digitação. Conversa inválida é ignorada em silêncio.
         * @param {unknown} member
         * @param {Record<string, unknown>} payload
         * @param {boolean} isTyping
         */
        typing(member, payload, isTyping) {
            const found = resolveConversation(member, payload.conversationId);
            if (found.ok) found.conversation.typing(found.identity, isTyping);
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
            for (const conversation of directs.of(identity)) conversation.refreshPeerOf(identity);
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

        get dmCount() {
            return directs.size;
        },

        /** Desligamento: nenhuma sala anuncia saídas nem deixa timer pendente. */
        silence() {
            for (const room of directory.all()) room.silence();
        },

        /** Fim do processo: salas, conversas privadas e históricos descartados. */
        closeAll() {
            directory.closeAll();
            directs.closeAll();
        },
    };
};
