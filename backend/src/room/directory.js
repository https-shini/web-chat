/**
 * Diretório de salas — só em memória.
 *
 * Guarda as salas ativas por `conversationId` e por código de convite, gera
 * códigos únicos e aplica os limites de criação e participação. É também
 * quem decide quando uma sala acaba: sem nenhuma participação (nem de quem
 * está na janela de retomada), ela espera `emptyTtlMs` (zero por padrão) e é destruída junto
 * com o histórico. Entrar de novo durante a espera a mantém viva.
 *
 * Nada aqui sobrevive ao processo: reiniciar o servidor apaga todas as
 * salas, códigos e mensagens.
 *
 * Não conhece WebSocket nem login: recebe identidades já resolvidas.
 */

import crypto from "node:crypto";
import { ERROR_CODES } from "../errors.js";
import { formatRoomCode, ROOM_CODE_LETTERS } from "../validation.js";
import { REMOVAL_REASONS } from "./room.js";

/** Limites padrão; todos configuráveis por variável de ambiente. */
export const ROOM_DEFAULTS = Object.freeze({
    /** Salas ativas no servidor inteiro (protege a memória). */
    maxRooms: 500,
    /** Salas de que uma identidade participa ao mesmo tempo. */
    maxRoomsPerIdentity: 10,
    /** Salas ativas criadas por uma mesma identidade. */
    maxCreatedPerIdentity: 5,
    /** Tolerância de uma sala vazia antes de ser destruída. */
    emptyTtlMs: 0,
});

/** Código novo `abc-defg-hij`, com sorteio criptograficamente seguro. */
export const generateRoomCode = () => {
    let letters = "";
    for (let i = 0; i < 10; i += 1) {
        letters += ROOM_CODE_LETTERS[crypto.randomInt(ROOM_CODE_LETTERS.length)];
    }
    return formatRoomCode(letters);
};

/** Id opaco da conversa; não tem relação com o código. */
export const generateConversationId = () => `r_${crypto.randomBytes(12).toString("base64url")}`;

/** Quantas vezes tentar um código livre antes de desistir (colisão é rara). */
const CODE_ATTEMPTS = 20;

/**
 * @typedef {import("./sessions.js").Identity} Identity
 * @typedef {ReturnType<typeof import("./room.js").createRoom>} Room
 * @typedef {{schedule: (callback: () => void, ms?: number) => unknown, cancel: (handle: unknown) => void}} Scheduler
 */

/**
 * @param {{
 *   makeRoom: (identity: {id: string, code: string, name: string}) => Room,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   limits?: Partial<typeof ROOM_DEFAULTS>,
 *   destroyScheduler?: Scheduler | null,
 *   newCode?: () => string,
 *   newConversationId?: () => string,
 * }} options
 */
export const createRoomDirectory = ({
    makeRoom,
    log,
    limits = {},
    destroyScheduler = null,
    newCode = generateRoomCode,
    newConversationId = generateConversationId,
}) => {
    const { maxRooms, maxRoomsPerIdentity, maxCreatedPerIdentity, emptyTtlMs } = {
        ...ROOM_DEFAULTS,
        ...limits,
    };

    /** @type {Map<string, {room: Room, createdBy: string, destroyTimer: unknown}>} */
    const rooms = new Map();
    /** código → conversationId @type {Map<string, string>} */
    const byCode = new Map();
    /** Salas ativas criadas por cada identidade (id → quantidade). @type {Map<string, number>} */
    const created = new Map();

    const destroy = (conversationId) => {
        const entry = rooms.get(conversationId);
        if (!entry) return;
        if (entry.destroyTimer !== null && destroyScheduler) {
            destroyScheduler.cancel(entry.destroyTimer);
        }
        rooms.delete(conversationId);
        byCode.delete(entry.room.code);
        const count = (created.get(entry.createdBy) ?? 1) - 1;
        if (count > 0) created.set(entry.createdBy, count);
        else created.delete(entry.createdBy);
        entry.room.destroy();
    };

    /** Sala sem ninguém: acaba depois da tolerância (ou na hora, sem agendador). */
    const scheduleIfEmpty = (conversationId) => {
        const entry = rooms.get(conversationId);
        if (!entry || entry.room.memberCount > 0 || entry.destroyTimer !== null) return;
        if (emptyTtlMs === 0 || !destroyScheduler) {
            destroy(conversationId);
            return;
        }
        log("info", "room_empty", { conversation: conversationId });
        entry.destroyTimer = destroyScheduler.schedule(() => {
            entry.destroyTimer = null;
            if (entry.room.memberCount === 0) destroy(conversationId);
        }, emptyTtlMs);
    };

    const keepAlive = (entry) => {
        if (entry.destroyTimer !== null && destroyScheduler) {
            destroyScheduler.cancel(entry.destroyTimer);
        }
        entry.destroyTimer = null;
    };

    const freshCode = () => {
        for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
            const code = newCode();
            if (!byCode.has(code)) return code;
        }
        return null;
    };

    const freshConversationId = () => {
        for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
            const id = newConversationId();
            if (!rooms.has(id)) return id;
        }
        return null;
    };

    return {
        /**
         * Cria uma sala; quem cria entra como anfitrião.
         * @param {Identity} identity
         * @param {string} name já validado ("" = sem nome)
         * @returns {{ok: true, room: Room} | {ok: false, code: string}}
         */
        create(identity, name) {
            if (identity.rooms.size >= maxRoomsPerIdentity) {
                return { ok: false, code: ERROR_CODES.ROOM_JOIN_LIMIT };
            }
            if ((created.get(identity.id) ?? 0) >= maxCreatedPerIdentity) {
                return { ok: false, code: ERROR_CODES.ROOM_CREATE_LIMIT };
            }
            if (rooms.size >= maxRooms) return { ok: false, code: ERROR_CODES.ROOMS_FULL };
            const code = freshCode();
            const id = freshConversationId();
            if (code === null || id === null) return { ok: false, code: ERROR_CODES.ROOMS_FULL };

            const room = makeRoom({ id, code, name });
            rooms.set(id, { room, createdBy: identity.id, destroyTimer: null });
            byCode.set(code, id);
            created.set(identity.id, (created.get(identity.id) ?? 0) + 1);
            log("info", "room_created", { conversation: id, user: identity.id });
            room.add(identity, { host: true, created: true });
            return { ok: true, room };
        },

        /**
         * Entra numa sala pelo código (já no formato canônico).
         * @param {Identity} identity
         * @param {string} code
         * @returns {{ok: true, room: Room, already: boolean} | {ok: false, code: string}}
         */
        join(identity, code) {
            const id = byCode.get(code);
            const entry = id === undefined ? undefined : rooms.get(id);
            if (!entry) return { ok: false, code: ERROR_CODES.ROOM_NOT_FOUND };
            const { room } = entry;
            if (!room.has(identity)) {
                if (room.isBanned(identity))
                    return { ok: false, code: ERROR_CODES.REMOVED_FROM_ROOM };
                if (identity.rooms.size >= maxRoomsPerIdentity) {
                    return { ok: false, code: ERROR_CODES.ROOM_JOIN_LIMIT };
                }
            }
            keepAlive(entry);
            const result = room.add(identity);
            if (!result.ok) return result;
            return { ok: true, room, already: result.already };
        },

        /**
         * Encerra uma participação; a sala que ficar vazia entra em contagem.
         * @param {Identity} identity
         * @param {string} conversationId
         * @param {string} [reason] um dos `REMOVAL_REASONS`
         */
        leave(identity, conversationId, reason = REMOVAL_REASONS.LEFT) {
            const entry = rooms.get(conversationId);
            if (!entry || !entry.room.remove(identity, reason)) return false;
            scheduleIfEmpty(conversationId);
            return true;
        },

        /**
         * A sala em que a identidade participa, ou null. "Não existe" e
         * "existe mas você não está nela" são a mesma resposta.
         * @param {Identity} identity
         * @param {string | null} conversationId
         * @returns {Room | null}
         */
        roomFor(identity, conversationId) {
            if (conversationId === null || !identity.rooms.has(conversationId)) return null;
            const room = rooms.get(conversationId)?.room ?? null;
            return room && room.has(identity) ? room : null;
        },

        /**
         * Salas da identidade, na ordem em que entrou nelas.
         * @param {Identity} identity
         * @returns {Room[]}
         */
        roomsOf(identity) {
            return [...identity.rooms].flatMap((id) => {
                const room = rooms.get(id)?.room;
                return room ? [room] : [];
            });
        },

        /**
         * Quantas salas ativas a identidade criou (testes e diagnóstico).
         * @param {Identity} identity
         */
        createdBy: (identity) => created.get(identity.id) ?? 0,

        /** Por código, sem efeito (testes e diagnóstico). @param {string} code */
        byCode: (code) => {
            const id = byCode.get(code);
            return id === undefined ? null : (rooms.get(id)?.room ?? null);
        },

        /** Por id, sem efeito (testes e diagnóstico). @param {string} id */
        byId: (id) => rooms.get(id)?.room ?? null,

        /** Todas as salas ativas. */
        all: () => [...rooms.values()].map((entry) => entry.room),

        get size() {
            return rooms.size;
        },

        /** Desligamento: toda sala é silenciada e destruída, sem timer sobrando. */
        closeAll() {
            for (const entry of rooms.values()) entry.room.silence();
            for (const id of [...rooms.keys()]) destroy(id);
        },
    };
};
