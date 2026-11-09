/**
 * Uma sala: quem participa dela, o que foi dito e quem está digitando — com
 * presença, papéis e moderação próprios.
 *
 * Desde a Fase 2 da evolução existem várias salas, e uma mesma identidade
 * participa de várias ao mesmo tempo. Por isso a participação é da
 * IDENTIDADE, não da conexão: se a conexão cai e volta dentro da janela de
 * retomada, a pessoa continua nas mesmas salas, com o mesmo papel.
 *
 * Regras de negócio puras. Não conhece WebSocket, HTTP, rate limit nem
 * comandos, e não faz login: quem chama (`room/hub.js`) já resolveu a
 * identidade. Entrega quadros pela função `deliver(holder, data)` injetada,
 * sempre à conexão atual da identidade (`identity.holder`); identidade
 * momentaneamente desconectada não recebe nada e, ao voltar, recebe o
 * estado da sala de novo.
 *
 * Invariantes:
 *  - todo quadro que sai daqui leva o `conversationId` da sala: nada de uma
 *    sala é entregue a quem não participa dela;
 *  - a identidade de uma mensagem é sempre a da participação, nunca a do
 *    payload;
 *  - toda mensagem — digitada ou produzida por comando — passa por
 *    `publish`: silêncio, anti-duplicação e histórico valem para todas;
 *  - silêncio, papel de anfitrião e remoção valem só nesta sala;
 *  - autorização (quem pode moderar quem) é decidida em `policy.js`, por
 *    quem chama as operações de moderação.
 */

import crypto from "node:crypto";
import { ERROR_CODES } from "../errors.js";
import {
    MESSAGE_KINDS,
    ROLES,
    ROOM_LEFT_REASONS,
    TONES,
    scoped,
    serverMessage,
} from "../protocol.js";
import { readClientId, readContent } from "../validation.js";
import { isMuted } from "./policy.js";

/** Intervalo mínimo entre duas trocas de nome da mesma pessoa. */
export const RENAME_COOLDOWN_MS = 10_000;

/** Mensagens recentes guardadas por identidade para ignorar reenvios. */
export const RECENT_MESSAGES_PER_IDENTITY = 20;

/**
 * Por que uma participação termina.
 *  - left: a pessoa saiu da sala (`room_left` para ela);
 *  - removed: removida por quem modera (`room_left` para ela, e não volta);
 *  - ended: a identidade acabou (saiu da sessão ou não voltou a tempo).
 */
export const REMOVAL_REASONS = Object.freeze({
    LEFT: "left",
    REMOVED: "removed",
    ENDED: "ended",
});

/**
 * @typedef {import("./sessions.js").Identity} Identity
 * @typedef {{
 *   role: "host" | "member",
 *   mutedUntil: number | null,
 *   joinedAt: number,
 *   connected: boolean,
 *   pendingLeave: unknown,
 * }} Membership
 * @typedef {{ok: true} | {ok: false, code: string}} Result
 * @typedef {{schedule: (callback: () => void, ms?: number) => unknown, cancel: (handle: unknown) => void}} Scheduler
 */

/**
 * @param {{
 *   id: string,
 *   code: string,
 *   name: string,
 *   kind?: "room" | "dm",
 *   deliver: (holder: unknown, data: string) => void,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   historySize: number,
 *   historyOnJoin: number,
 *   now?: () => Date,
 *   newMessageId?: () => string,
 *   userListScheduler?: Scheduler | null,
 *   onUserList?: () => void,
 *   leaveGraceMs?: number,
 *   leaveScheduler?: Scheduler | null,
 *   onPresenceChange?: (identity: Identity) => void,
 * }} options
 */
export const createRoom = ({
    id,
    code,
    name,
    kind = "room",
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
    onPresenceChange = () => {},
}) => {
    /**
     * Participações, na ordem de entrada (o Map preserva a ordem): a mais
     * antiga é a primeira — é ela quem herda o papel de anfitrião.
     * @type {Map<Identity, Membership>}
     */
    const members = new Map();
    /** Mensagens de chat já no formato de envio, da mais antiga à mais nova. */
    const history = [];
    /** Muda a cada limpeza da sala; o cliente a usa para descartar o que viu antes. */
    let historyVersion = 0;
    /** Em desligamento: saídas não são anunciadas. */
    let quiet = false;
    /** Ids removidos por moderação: não voltam enquanto a sala existir. */
    const banned = new Set();
    /** @type {string | null} */
    let hostId = null;

    const timestamp = () => now().toISOString();
    const nowMs = () => now().getTime();

    /** @param {Identity} identity @param {Record<string, unknown>} message */
    const sendTo = (identity, message) => {
        if (identity.holder !== null) deliver(identity.holder, JSON.stringify(scoped(id, message)));
    };

    /** Para quem está conectado agora, menos `except`. */
    const broadcast = (message, except = null) => {
        const data = JSON.stringify(scoped(id, message));
        for (const [identity, membership] of members) {
            if (identity !== except && membership.connected && identity.holder !== null) {
                deliver(identity.holder, data);
            }
        }
    };

    const notice = (tone, text) =>
        broadcast(serverMessage.notice({ id: newMessageId(), tone, text, timestamp: timestamp() }));

    /** Quem aparece na lista: conectados, com o papel que têm NESTA sala. */
    const present = () => [...members].filter(([, membership]) => membership.connected);

    const sendUserList = () => {
        onUserList();
        broadcast(
            serverMessage.userList(
                present().map(([identity, membership]) => ({
                    id: identity.id,
                    name: identity.name,
                    username: identity.username,
                    away: identity.away,
                    role: identity.role === ROLES.ADMIN ? ROLES.ADMIN : membership.role,
                })),
            ),
        );
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

    /** @param {Membership} membership */
    const cancelPendingLeave = (membership) => {
        if (membership.pendingLeave === null || !leaveScheduler) return false;
        leaveScheduler.cancel(membership.pendingLeave);
        membership.pendingLeave = null;
        return true;
    };

    /** @param {Identity} identity @param {string} reason */
    const announceLeft = (identity, reason) => {
        if (quiet) return;
        broadcast(
            serverMessage.left(
                identity,
                timestamp(),
                reason === REMOVAL_REASONS.REMOVED ? "removed" : "left",
            ),
        );
    };

    /**
     * Resumo da sala do ponto de vista de quem recebe.
     * @param {Identity} identity
     * @returns {import("../protocol.js").RoomSummary}
     */
    const summaryFor = (identity) => ({
        conversationId: id,
        kind,
        code,
        name,
        role: members.get(identity)?.role ?? ROLES.MEMBER,
        hostId,
        memberCount: members.size,
        historyVersion,
    });

    /**
     * Estado completo para quem acabou de entrar ou voltou: resumo, depois
     * histórico recente. A lista vem pelo envio agrupado.
     * @param {Identity} identity
     * @param {{created?: boolean, resumed?: boolean}} how
     */
    const sendState = (identity, how) => {
        if (identity.holder === null) return;
        deliver(
            identity.holder,
            JSON.stringify(serverMessage.roomJoined(summaryFor(identity), how)),
        );
        if (history.length > 0 && historyOnJoin > 0) {
            sendTo(identity, serverMessage.history(history.slice(-historyOnJoin)));
        }
    };

    /** Cada participante recebe o resumo atualizado (o papel difere por pessoa). */
    const broadcastSummary = () => {
        for (const [identity, membership] of members) {
            if (membership.connected && identity.holder !== null) {
                deliver(
                    identity.holder,
                    JSON.stringify(serverMessage.roomUpdated(summaryFor(identity))),
                );
            }
        }
    };

    /**
     * O anfitrião deixou a sala de vez: o papel passa para quem está nela há
     * mais tempo, preferindo quem está conectado. Sala sem ninguém fica sem
     * anfitrião (e é destruída por quem a guarda).
     */
    const transferHost = () => {
        const candidates = [...members];
        const next =
            candidates.find(([, membership]) => membership.connected) ?? candidates[0] ?? null;
        if (!next) {
            hostId = null;
            return;
        }
        const [identity, membership] = next;
        membership.role = ROLES.HOST;
        hostId = identity.id;
        log("info", "room_host_transferred", { conversation: id, user: identity.id });
        notice(TONES.INFO, `${identity.name} agora é anfitrião da sala`);
        broadcastSummary();
        onPresenceChange(identity);
    };

    /**
     * Publica uma mensagem na sala. Único caminho de escrita no histórico —
     * mensagem digitada e mensagem produzida por comando seguem as mesmas
     * regras.
     * @param {Identity} identity
     * @param {{content: string, kind?: string, format?: string | null, clientMsgId?: string | null}} message
     * @returns {Result & {duplicate?: boolean}}
     */
    const publish = (
        identity,
        { content, kind = MESSAGE_KINDS.TEXT, format = null, clientMsgId = null },
    ) => {
        const membership = members.get(identity);
        if (!membership) return { ok: false, code: ERROR_CODES.CONVERSATION_NOT_FOUND };
        if (isMuted(membership, nowMs())) return { ok: false, code: ERROR_CODES.MUTED };

        // Reenvio da mesma mensagem (retentativa do cliente): devolve a
        // original só para quem enviou, sem duplicar na sala. A chave inclui
        // a sala: o mesmo id de correlação em outra sala é outra mensagem.
        const recentKey = clientMsgId ? `${id}:${clientMsgId}` : null;
        if (recentKey) {
            const original = identity.recent.get(recentKey);
            if (original) {
                sendTo(identity, /** @type {Record<string, unknown>} */ (original));
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
        if (recentKey) {
            identity.recent.set(recentKey, message);
            if (identity.recent.size > RECENT_MESSAGES_PER_IDENTITY) {
                identity.recent.delete(identity.recent.keys().next().value);
            }
        }
        broadcast(message);

        // Falar encerra a ausência — em todas as salas da pessoa.
        if (identity.away !== null) {
            identity.away = null;
            onPresenceChange(identity);
        }
        return { ok: true };
    };

    /**
     * Encerra uma participação.
     * @param {Identity} identity
     * @param {string} reason um dos `REMOVAL_REASONS`
     * @returns {boolean} se a identidade participava
     */
    const remove = (identity, reason) => {
        const membership = members.get(identity);
        if (!membership) return false;
        const wasHost = membership.role === ROLES.HOST;
        const pending = cancelPendingLeave(membership);
        members.delete(identity);
        identity.rooms.delete(id);
        log("info", "room_member_left", { conversation: id, user: identity.id, reason });

        // Quem estava conectado (ou desconectado com o aviso ainda pendente)
        // é anunciado agora; quem já teve o aviso dado não é anunciado de novo.
        if (membership.connected || pending) announceLeft(identity, reason);
        if (reason !== REMOVAL_REASONS.ENDED) {
            const why =
                reason === REMOVAL_REASONS.REMOVED
                    ? ROOM_LEFT_REASONS.REMOVED
                    : ROOM_LEFT_REASONS.LEFT;
            if (identity.holder !== null) {
                deliver(identity.holder, JSON.stringify(serverMessage.roomLeft(id, why)));
            }
        }
        if (wasHost) transferHost();
        broadcastUserList();
        return true;
    };

    return {
        id,
        code,
        name,
        kind,

        /**
         * Entrada na sala. Quem já participa recebe o estado de novo, sem
         * avisos para os outros (pedido repetido não duplica nada).
         * @param {Identity} identity
         * @param {{host?: boolean, created?: boolean}} [options]
         * @returns {{ok: true, already: boolean} | {ok: false, code: string}}
         */
        add(identity, { host = false, created = false } = {}) {
            if (banned.has(identity.id)) return { ok: false, code: ERROR_CODES.REMOVED_FROM_ROOM };
            if (members.has(identity)) {
                sendState(identity, { resumed: true });
                return { ok: true, already: true };
            }
            members.set(identity, {
                role: host ? ROLES.HOST : ROLES.MEMBER,
                mutedUntil: null,
                joinedAt: nowMs(),
                connected: identity.holder !== null,
                pendingLeave: null,
            });
            identity.rooms.add(id);
            if (host) hostId = identity.id;
            log("info", "room_member_joined", { conversation: id, user: identity.id, host });
            sendState(identity, { created });
            broadcast(serverMessage.joined(identity.name, timestamp()), identity);
            broadcastUserList();
            return { ok: true, already: false };
        },

        /**
         * A conexão da identidade caiu: ela continua participando (janela de
         * retomada), mas sai da lista. O aviso "saiu" espera `leaveGraceMs`:
         * se a pessoa voltar antes, ninguém vê nem "saiu" nem "entrou".
         * @param {Identity} identity
         */
        disconnect(identity) {
            const membership = members.get(identity);
            if (!membership || !membership.connected) return;
            membership.connected = false;
            if (!quiet) {
                if (leaveGraceMs > 0 && leaveScheduler) {
                    membership.pendingLeave = leaveScheduler.schedule(() => {
                        membership.pendingLeave = null;
                        if (!membership.connected && members.get(identity) === membership) {
                            announceLeft(identity, REMOVAL_REASONS.LEFT);
                        }
                    }, leaveGraceMs);
                } else {
                    announceLeft(identity, REMOVAL_REASONS.LEFT);
                }
            }
            broadcastUserList();
        },

        /**
         * A identidade voltou numa conexão nova: recebe o estado da sala de
         * novo. Dentro da janela, para os outros ela nunca saiu.
         * @param {Identity} identity
         */
        reconnect(identity) {
            const membership = members.get(identity);
            if (!membership) return;
            const wasConnected = membership.connected;
            membership.connected = true;
            const silentReturn = wasConnected || cancelPendingLeave(membership);
            sendState(identity, { resumed: true });
            if (!silentReturn)
                broadcast(serverMessage.joined(identity.name, timestamp()), identity);
            broadcastUserList();
        },

        remove,

        /** Encerramento definitivo de DM: informa os dois participantes e
         * descarta o histórico, independentemente da conexão atual. */
        closeDirect() {
            if (kind !== "dm") return false;
            for (const identity of members.keys()) {
                sendTo(identity, serverMessage.roomLeft(id, ROOM_LEFT_REASONS.CLOSED));
            }
            this.destroy();
            return true;
        },

        /**
         * Mensagem digitada. O autor é a identidade; `kind` e `format` do
         * payload são ignorados (só comandos os produzem).
         * @param {Identity} identity
         * @param {Record<string, unknown>} payload
         * @returns {Result & {duplicate?: boolean}}
         */
        post(identity, payload) {
            if (!members.has(identity))
                return { ok: false, code: ERROR_CODES.CONVERSATION_NOT_FOUND };
            const content = readContent(payload.content);
            if (!content.ok) return content;
            return publish(identity, {
                content: content.content,
                clientMsgId: readClientId(payload.clientMsgId),
            });
        },

        publish,

        /**
         * Sinal de digitação, só para os outros participantes desta sala.
         * @param {Identity} identity
         * @param {boolean} isTyping
         */
        typing(identity, isTyping) {
            if (!members.get(identity)?.connected) return;
            broadcast(serverMessage.typing(identity, isTyping), identity);
        },

        /**
         * O nome da identidade mudou (a troca em si é feita pelo hub).
         * @param {Identity} identity
         * @param {string} previous
         */
        announceRename(identity, previous) {
            if (!members.has(identity)) return;
            notice(TONES.INFO, `${previous} agora se chama ${identity.name}`);
            broadcastUserList();
        },

        /** @param {Identity} identity */
        announceAdmin(identity) {
            if (!members.has(identity)) return;
            notice(TONES.ADMIN, `${identity.name} agora é administrador`);
            broadcastUserList();
        },

        /** Presença ou papel de alguém mudou: a lista é reenviada (agrupada). */
        refreshUserList: broadcastUserList,

        /**
         * Apaga o histórico da sala para todos (quem chama já autorizou).
         * Quem está conectado recebe `chat_cleared`; quem estiver fora
         * descobre pela `historyVersion` do próximo `room_joined`.
         * @param {Identity} actor
         */
        clearHistory(actor) {
            const removed = history.length;
            history.length = 0;
            historyVersion += 1;
            const prefix = `${id}:`;
            for (const identity of members.keys()) {
                for (const key of identity.recent.keys()) {
                    if (key.startsWith(prefix)) identity.recent.delete(key);
                }
            }
            log("warn", "moderation_action", {
                action: "clear_history",
                conversation: id,
                actor: actor.id,
                removed,
                historyVersion,
            });
            broadcast(serverMessage.chatCleared(actor.name, timestamp(), historyVersion));
            return true;
        },

        /**
         * Silencia nesta sala (até `untilMs`, Infinity = sem prazo) ou libera (null).
         * @param {Identity} actor
         * @param {Identity} target
         * @param {number | null} untilMs
         */
        setMuted(actor, target, untilMs) {
            const membership = members.get(target);
            if (!membership) return false;
            membership.mutedUntil = untilMs;
            log("warn", "moderation_action", {
                action: untilMs === null ? "unmute" : "mute",
                conversation: id,
                actor: actor.id,
                target: target.id,
            });
            if (untilMs === null) {
                notice(TONES.ADMIN, `${target.name} pode voltar a enviar mensagens`);
            } else {
                const minutes =
                    untilMs === Infinity ? null : Math.round((untilMs - nowMs()) / 60_000);
                notice(
                    TONES.ADMIN,
                    minutes === null
                        ? `${target.name} foi silenciado por ${actor.name}`
                        : `${target.name} foi silenciado por ${actor.name} por ${minutes} min`,
                );
            }
            return true;
        },

        /**
         * Remove alguém desta sala. A pessoa continua conectada e nas outras
         * salas, mas não volta a esta enquanto ela existir.
         * @param {Identity} actor
         * @param {Identity} target
         */
        kick(actor, target) {
            if (!members.has(target)) return false;
            log("warn", "moderation_action", {
                action: "remove",
                conversation: id,
                actor: actor.id,
                target: target.id,
            });
            banned.add(target.id);
            remove(target, REMOVAL_REASONS.REMOVED);
            notice(TONES.ADMIN, `${target.name} foi removido da sala por ${actor.name}`);
            return true;
        },

        /** @param {Identity} identity */
        has: (identity) => members.has(identity),

        /** @param {Identity} identity @returns {Membership | null} */
        membershipOf: (identity) => members.get(identity) ?? null,

        /** @param {Identity} identity */
        isBanned: (identity) => banned.has(identity.id),

        summaryFor,

        /** Quem está conectado na sala agora, na ordem de entrada. */
        listMembers: () => present().map(([identity, membership]) => ({ identity, membership })),

        /**
         * Localiza pessoas conectadas na sala por `@username` (exato e
         * único), por id (ou prefixo de id com 6+ caracteres) ou por nome
         * (sem diferenciar maiúsculas; pode haver mais de uma pessoa).
         * @param {string} query
         */
        findMembers(query) {
            const wanted = query.trim().toLowerCase();
            if (!wanted) return [];
            const all = present().map(([identity, membership]) => ({ identity, membership }));
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

        /** Participações (inclusive de quem está na janela de retomada). */
        get memberCount() {
            return members.size;
        },

        get connectedCount() {
            return present().length;
        },

        get historyVersion() {
            return historyVersion;
        },

        get historyLength() {
            return history.length;
        },

        get hostId() {
            return hostId;
        },

        /**
         * Desligamento: daqui em diante, saídas não são anunciadas, e envios
         * pendentes (lista, avisos de saída) são cancelados.
         */
        silence() {
            quiet = true;
            if (pendingList !== null && userListScheduler) {
                userListScheduler.cancel(pendingList);
                pendingList = null;
            }
            for (const membership of members.values()) cancelPendingLeave(membership);
        },

        /**
         * Fim da sala: nenhum timer sobra, o histórico é descartado e
         * ninguém continua ligado a ela.
         */
        destroy() {
            this.silence();
            for (const identity of members.keys()) identity.rooms.delete(id);
            members.clear();
            history.length = 0;
            banned.clear();
            hostId = null;
            log("info", "room_destroyed", { conversation: id });
        },
    };
};
