/**
 * A sala: quem está nela, o que foi dito e quem está digitando — e, desde a
 * Fase 4, presença, nomes, papéis e moderação.
 *
 * Regras de negócio puras. Não conhece WebSocket, HTTP, rate limit nem
 * comandos: recebe a conexão como um valor opaco ("member") e entrega quadros
 * por uma função `deliver(member, data)` injetada. Por isso pode ser testada
 * com objetos simples no lugar de conexões.
 *
 * Invariantes:
 *  - uma conexão entra uma única vez (segundo login é recusado);
 *  - a identidade de uma mensagem é sempre a da conexão, nunca a do payload;
 *  - só quem entrou recebe eventos da sala (Fase 1, P37);
 *  - uma identidade tem no máximo uma conexão: retomar com a antiga ainda
 *    presente substitui a antiga, sem avisos e sem duplicar a lista;
 *  - toda mensagem — digitada ou produzida por comando — passa por
 *    `publish`: silêncio, anti-duplicação e histórico valem para todas;
 *  - autorização (quem pode moderar quem) é decidida em `policy.js`, por
 *    quem chama as operações administrativas.
 */

import crypto from "node:crypto";
import { ERROR_CODES } from "../errors.js";
import { LIMITS, MESSAGE_KINDS, ROLES, TONES, serverMessage } from "../protocol.js";
import {
    normalizeText,
    readClientId,
    readContent,
    readName,
    readResumeToken,
    readUsername,
} from "../validation.js";
import { isMuted } from "./policy.js";

/** Intervalo mínimo entre duas trocas de nome da mesma pessoa. */
export const RENAME_COOLDOWN_MS = 10_000;

/** Mensagens recentes guardadas por identidade para ignorar reenvios. */
export const RECENT_MESSAGES_PER_IDENTITY = 20;

/**
 * @typedef {import("./sessions.js").Identity} Identity
 * @typedef {{ok: true} | {ok: false, code: string}} Result
 * @typedef {{schedule: (callback: () => void, ms?: number) => unknown, cancel: (handle: unknown) => void}} Scheduler
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
 *   userListScheduler?: Scheduler | null,
 *   onUserList?: () => void,
 *   leaveGraceMs?: number,
 *   leaveScheduler?: Scheduler | null,
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
    userListScheduler = null,
    onUserList = () => {},
    leaveGraceMs = 0,
    leaveScheduler = null,
}) => {
    /** @type {Map<unknown, {identity: Identity, label: string}>} */
    const members = new Map();
    /** Mensagens de chat já no formato de envio, da mais antiga à mais nova. */
    const history = [];
    /** Muda a cada limpeza da sala; o cliente a usa para descartar o que viu antes. */
    let historyVersion = 0;
    /** Em desligamento: saídas não são anunciadas. */
    let quiet = false;
    /** Identidades com aviso de saída agendado (janela de retomada). */
    const pendingLeaves = new Set();

    const timestamp = () => now().toISOString();
    const nowMs = () => now().getTime();

    const sendTo = (member, message) => deliver(member, JSON.stringify(message));

    const broadcast = (message, except = null) => {
        const data = JSON.stringify(message);
        for (const member of members.keys()) {
            if (member !== except) deliver(member, data);
        }
    };

    const notice = (tone, text) =>
        broadcast(serverMessage.notice({ id: newMessageId(), tone, text, timestamp: timestamp() }));

    const sendUserList = () => {
        onUserList();
        broadcast(serverMessage.userList([...members.values()].map((entry) => entry.identity)));
    };

    // Lista de pessoas agrupada (Fase 3): várias mudanças próximas viram um
    // envio só, com o estado final. Sem agendador, envio imediato.
    /** @type {unknown} */
    let pendingList = null;
    const broadcastUserList = () => {
        if (!userListScheduler) return sendUserList();
        if (pendingList !== null) return;
        pendingList = userListScheduler.schedule(() => {
            pendingList = null;
            if (!quiet) sendUserList();
        });
    };

    const cancelPendingLeave = (identity) => {
        if (identity.pendingLeave === null || !leaveScheduler) return false;
        leaveScheduler.cancel(identity.pendingLeave);
        identity.pendingLeave = null;
        pendingLeaves.delete(identity);
        return true;
    };

    /**
     * Tira a conexão da sala. Devolve `false` se ela não estava.
     *
     * Saída comum (`reason: "closed"`) com janela de retomada: a lista é
     * atualizada na hora, mas o aviso "saiu da sala" espera `leaveGraceMs`.
     * Se a pessoa voltar com o token dentro da janela, nem "saiu" nem
     * "entrou" são anunciados (F4-01) — uma rede instável deixa de gerar
     * pares de avisos para todos.
     * @param {unknown} member
     * @param {{announce?: boolean, reason?: string}} [options]
     */
    const leave = (member, { announce = true, reason = "closed" } = {}) => {
        const entry = members.get(member);
        if (!entry) return false;
        const { identity } = entry;
        members.delete(member);
        identities.release(identity, member);
        identity.recent.clear();
        log("info", "user_left", { connection: entry.label, user: identity.id, reason });
        if (!announce || quiet) return true;

        const announceLeft = () =>
            broadcast(
                serverMessage.left(
                    identity,
                    timestamp(),
                    reason === "removed" ? "removed" : "left",
                ),
            );

        if (reason === "closed" && leaveGraceMs > 0 && leaveScheduler) {
            identity.pendingLeave = leaveScheduler.schedule(() => {
                identity.pendingLeave = null;
                pendingLeaves.delete(identity);
                if (identity.holder === null && !quiet) announceLeft();
            }, leaveGraceMs);
            pendingLeaves.add(identity);
        } else {
            announceLeft();
        }
        broadcastUserList();
        return true;
    };

    /**
     * Publica uma mensagem na sala. Único caminho de escrita no histórico —
     * mensagem digitada e mensagem produzida por comando seguem as mesmas
     * regras.
     * @param {unknown} member
     * @param {{content: string, kind?: string, format?: string | null, clientMsgId?: string | null}} message
     * @returns {Result & {duplicate?: boolean}}
     */
    const publish = (
        member,
        { content, kind = MESSAGE_KINDS.TEXT, format = null, clientMsgId = null },
    ) => {
        const entry = members.get(member);
        if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
        const { identity } = entry;
        if (isMuted(identity, nowMs())) return { ok: false, code: ERROR_CODES.MUTED };

        // Reenvio da mesma mensagem (retentativa do cliente): devolve a
        // original só para quem enviou, sem duplicar na sala.
        if (clientMsgId) {
            const original = identity.recent.get(clientMsgId);
            if (original) {
                sendTo(member, original);
                return { ok: true, duplicate: true };
            }
        }

        const message = serverMessage.chat({
            id: newMessageId(),
            user: identity,
            content,
            timestamp: timestamp(),
            kind,
            format,
            clientMsgId,
        });
        history.push(message);
        if (history.length > historySize) history.shift();
        identity.messageCount += 1;
        if (clientMsgId) {
            identity.recent.set(clientMsgId, message);
            if (identity.recent.size > RECENT_MESSAGES_PER_IDENTITY) {
                identity.recent.delete(identity.recent.keys().next().value);
            }
        }
        broadcast(message);

        // Falar encerra a ausência.
        if (identity.away !== null) {
            identity.away = null;
            broadcastUserList();
        }
        return { ok: true };
    };

    const entryOf = (member) => members.get(member) ?? null;

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
            const requestedUsername = readUsername(payload.username);
            if (!requestedUsername.ok) return requestedUsername;

            // Entrada nova (sem token válido): nome e username obrigatórios,
            // e o username não pode estar com outra identidade viva.
            const token = readResumeToken(payload.resumeToken);
            const fresh = () => {
                if (!requested.name) return { ok: false, code: ERROR_CODES.INVALID_NAME };
                if (!requestedUsername.username) {
                    return { ok: false, code: ERROR_CODES.INVALID_USERNAME };
                }
                if (identities.isUsernameTaken(requestedUsername.username)) {
                    return { ok: false, code: ERROR_CODES.USERNAME_TAKEN };
                }
                return null;
            };

            let identity = identities.claim(token);
            const resumed = identity !== null;
            let replaced = null;
            let returningInGrace = false;

            if (identity === null) {
                // Retomada com o mesmo id: o username é o guardado; o do
                // payload só vale para uma identidade nova.
                const refused = fresh();
                if (refused) return refused;
                identity = identities.create(requested.name, requestedUsername.username);
            } else if (identity.holder !== null && identity.holder !== member) {
                // A conexão antiga ainda consta (queda não detectada): a pessoa
                // é a mesma, então ela sai em silêncio e a nova assume.
                replaced = identity.holder;
                leave(replaced, { announce: false, reason: "replaced" });
            } else {
                returningInGrace = cancelPendingLeave(identity);
            }

            const resumeToken = identities.attach(identity, member);
            members.set(member, { identity, label });
            log("info", "user_joined", { connection: label, user: identity.id, resumed });

            // A sessão chega antes de tudo: o cliente precisa do próprio id
            // para reconhecer as próprias mensagens no histórico.
            sendTo(member, serverMessage.session(identity, resumeToken, historyVersion));
            if (history.length > 0 && historyOnJoin > 0) {
                sendTo(member, serverMessage.history(history.slice(-historyOnJoin)));
            }
            // Na substituição ou na volta dentro da janela, para os outros a
            // pessoa nunca saiu.
            if (replaced === null && !returningInGrace) {
                broadcast(serverMessage.joined(identity.name, timestamp()), member);
            }
            broadcastUserList();
            return { ok: true, user: { id: identity.id, name: identity.name }, replaced };
        },

        leave,

        /**
         * A própria pessoa sai (`user_logout`): sai na hora, sem janela de
         * retomada, e a identidade é encerrada — token inválido e username
         * livre. Voltar é sempre como identidade nova. Quem chama fecha a
         * conexão.
         * @param {unknown} member
         * @returns {boolean} se a conexão estava na sala
         */
        logout(member) {
            const entry = members.get(member);
            if (!entry) return false;
            leave(member, { reason: "logout" });
            identities.revoke(entry.identity);
            return true;
        },

        /**
         * Mensagem digitada. O autor é a identidade da conexão; `kind` e
         * `format` do payload são ignorados (só comandos os produzem).
         * @param {unknown} member
         * @param {Record<string, unknown>} payload
         * @returns {Result & {duplicate?: boolean}}
         */
        post(member, payload) {
            if (!members.has(member)) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const content = readContent(payload.content);
            if (!content.ok) return content;
            return publish(member, {
                content: content.content,
                clientMsgId: readClientId(payload.clientMsgId),
            });
        },

        publish,

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

        /**
         * Troca o nome de exibição. O id não muda.
         * @param {unknown} member
         * @param {unknown} rawName
         * @returns {{ok: true, changed: boolean, name: string}
         *   | {ok: false, code: "invalid_name" | "cooldown" | "not_logged_in", retryInMs?: number}}
         */
        rename(member, rawName) {
            const entry = entryOf(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const read = readName(rawName);
            if (!read.ok || !read.name) return { ok: false, code: ERROR_CODES.INVALID_NAME };
            const { identity } = entry;
            if (read.name === identity.name)
                return { ok: true, changed: false, name: identity.name };
            const wait = identity.lastRenameAt + RENAME_COOLDOWN_MS - nowMs();
            if (wait > 0) return { ok: false, code: "cooldown", retryInMs: wait };

            const previous = identity.name;
            identity.name = read.name;
            identity.lastRenameAt = nowMs();
            log("info", "user_renamed", { user: identity.id });
            notice(TONES.INFO, `${previous} agora se chama ${identity.name}`);
            broadcastUserList();
            return { ok: true, changed: true, name: identity.name };
        },

        /**
         * Marca ausência (com motivo opcional) ou volta a ficar presente.
         * @param {unknown} member
         * @param {unknown} rawText  texto, ou null para voltar
         * @returns {{ok: true, away: string | null} | {ok: false, code: string}}
         */
        setAway(member, rawText) {
            const entry = entryOf(member);
            if (!entry) return { ok: false, code: ERROR_CODES.NOT_LOGGED_IN };
            const text = rawText === null ? null : normalizeText(rawText, LIMITS.awayTextMaxLength);
            entry.identity.away = rawText === null ? null : text || "ausente";
            broadcastUserList();
            return { ok: true, away: entry.identity.away };
        },

        /**
         * Concede o papel de administrador (quem chama já verificou a chave).
         * @param {unknown} member
         */
        grantAdmin(member) {
            const entry = entryOf(member);
            if (!entry) return false;
            entry.identity.role = ROLES.ADMIN;
            log("info", "admin_granted", { user: entry.identity.id });
            notice(TONES.ADMIN, `${entry.identity.name} agora é administrador da sala`);
            broadcastUserList();
            return true;
        },

        /**
         * Apaga o histórico da sala para todos (quem chama já autorizou).
         * Clientes conectados recebem `chat_cleared`; quem estiver fora
         * descobre pela `historyVersion` da próxima `session`.
         * @param {unknown} actorMember
         */
        clearHistory(actorMember) {
            const actor = entryOf(actorMember);
            if (!actor) return false;
            const removed = history.length;
            history.length = 0;
            historyVersion += 1;
            for (const entry of members.values()) entry.identity.recent.clear();
            log("warn", "admin_action", {
                action: "clear_history",
                actor: actor.identity.id,
                removed,
                historyVersion,
            });
            broadcast(serverMessage.chatCleared(actor.identity.name, timestamp(), historyVersion));
            return true;
        },

        /**
         * Silencia (até `untilMs`, Infinity = sem prazo) ou libera (null).
         * @param {{identity: Identity}} actor
         * @param {{identity: Identity}} target
         * @param {number | null} untilMs
         */
        setMuted(actor, target, untilMs) {
            target.identity.mutedUntil = untilMs;
            log("warn", "admin_action", {
                action: untilMs === null ? "unmute" : "mute",
                actor: actor.identity.id,
                target: target.identity.id,
            });
            if (untilMs === null) {
                notice(TONES.ADMIN, `${target.identity.name} pode voltar a enviar mensagens`);
            } else {
                const minutes =
                    untilMs === Infinity ? null : Math.round((untilMs - nowMs()) / 60_000);
                notice(
                    TONES.ADMIN,
                    minutes === null
                        ? `${target.identity.name} foi silenciado por ${actor.identity.name}`
                        : `${target.identity.name} foi silenciado por ${actor.identity.name} por ${minutes} min`,
                );
            }
        },

        /**
         * Remove alguém da sala: sai na hora (sem janela de retomada) e o
         * token é invalidado — a pessoa pode voltar, mas como identidade
         * nova. Quem chama fecha a conexão.
         * @param {{identity: Identity}} actor
         * @param {{member: unknown, identity: Identity}} target
         */
        remove(actor, target) {
            log("warn", "admin_action", {
                action: "remove",
                actor: actor.identity.id,
                target: target.identity.id,
            });
            leave(target.member, { reason: "removed" });
            identities.revoke(target.identity);
            notice(
                TONES.ADMIN,
                `${target.identity.name} foi removido da sala por ${actor.identity.name}`,
            );
        },

        /** @param {unknown} member */
        isMember: (member) => members.has(member),

        /** @param {unknown} member @returns {string | null} */
        userIdOf: (member) => members.get(member)?.identity.id ?? null,

        /** @param {unknown} member */
        entryOf,

        /** Quem está na sala agora, na ordem de entrada. */
        listMembers: () =>
            [...members.entries()].map(([member, entry]) => ({ member, identity: entry.identity })),

        /**
         * Localiza pessoas na sala por `@username` (exato e único), por id
         * (ou prefixo de id com 6+ caracteres) ou por nome (sem diferenciar
         * maiúsculas; pode haver mais de uma pessoa com o mesmo nome).
         * @param {string} query
         */
        findMembers(query) {
            const wanted = query.trim().toLowerCase();
            if (!wanted) return [];
            const all = [...members.entries()].map(([member, entry]) => ({
                member,
                identity: entry.identity,
            }));
            if (wanted.startsWith("@")) {
                return all.filter(({ identity }) => identity.username === wanted.slice(1));
            }
            const byId = /^[0-9a-f-]{6,36}$/.test(wanted)
                ? all.filter(({ identity }) => identity.id.startsWith(wanted))
                : [];
            if (byId.length > 0) return byId;
            const byName = all.filter(({ identity }) => identity.name.toLowerCase() === wanted);
            if (byName.length > 0) return byName;
            // Sem @ e sem nome igual: o texto ainda pode ser um username.
            return all.filter(({ identity }) => identity.username === wanted);
        },

        get memberCount() {
            return members.size;
        },

        get historyVersion() {
            return historyVersion;
        },

        /**
         * Desligamento: daqui em diante, saídas não são anunciadas, e envios
         * pendentes (lista, avisos de saída) são cancelados — nenhum timer
         * sobra.
         */
        silence() {
            quiet = true;
            if (pendingList !== null && userListScheduler) {
                userListScheduler.cancel(pendingList);
                pendingList = null;
            }
            for (const identity of pendingLeaves) cancelPendingLeave(identity);
        },
    };
};
