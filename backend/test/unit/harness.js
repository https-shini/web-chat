// Montagem das salas para testes de unidade, sem rede: conexões são objetos
// simples, `deliver` grava o que cada uma receberia, o relógio é manual e os
// agendadores só disparam quando o teste manda (`runTimers`).

import { createRoomDirectory } from "../../src/room/directory.js";
import { createHub } from "../../src/room/hub.js";
import { createJoinGuard } from "../../src/room/joinGuard.js";
import { createRoom } from "../../src/room/room.js";
import { createIdentityStore } from "../../src/room/sessions.js";
import { withUsername } from "../identity.js";

/**
 * Agendador manual: guarda os callbacks com o instante em que venceriam.
 * @param {() => number} clock
 */
export const manualScheduler = (clock) => {
    let next = 0;
    /** @type {Map<number, {at: number, callback: () => void}>} */
    const pending = new Map();
    return {
        pending,
        schedule: (callback, ms = 0) => {
            next += 1;
            pending.set(next, { at: clock() + ms, callback });
            return next;
        },
        cancel: (handle) => pending.delete(/** @type {number} */ (handle)),
        /** Dispara o que já venceu (ou tudo, com `all`). */
        run({ all = false } = {}) {
            for (const [handle, entry] of [...pending]) {
                if (all || entry.at <= clock()) {
                    pending.delete(handle);
                    entry.callback();
                }
            }
        },
    };
};

/**
 * @param {{
 *   historySize?: number,
 *   historyOnJoin?: number,
 *   leaveGraceMs?: number,
 *   coalesce?: boolean,
 *   limits?: Record<string, number>,
 *   joinGuard?: Parameters<typeof createJoinGuard>[0],
 *   ttlMs?: number,
 * }} [options]
 */
export const setup = ({
    historySize = 1000,
    historyOnJoin = 50,
    leaveGraceMs = 0,
    coalesce = false,
    limits = {},
    joinGuard = {},
    ttlMs,
} = {}) => {
    let clock = 0;
    let nextId = 0;
    const now = () => clock;
    const timers = manualScheduler(now);
    const listTimers = manualScheduler(now);
    /** @type {Map<object, any[]>} */
    const inbox = new Map();
    const logs = [];
    const log = (level, event, fields) => logs.push({ level, event, ...fields });
    /** @type {ReturnType<typeof createHub> | null} */
    let hub = null;
    const capabilityChanges = [];

    const identities = createIdentityStore({
        now,
        newId: () => `user-${++nextId}`,
        newToken: () => `token-${++nextId}`,
        onRetire: (identity) => hub?.forget(identity),
        ...(ttlMs === undefined ? {} : { ttlMs }),
    });
    const deliver = (member, data) => {
        if (!inbox.has(member)) inbox.set(member, []);
        inbox.get(member).push(JSON.parse(data));
    };
    let codeCounter = 0;
    const directory = createRoomDirectory({
        log,
        limits: { emptyTtlMs: 60_000, ...limits },
        destroyScheduler: timers,
        // Códigos previsíveis: "aaa-aaaa-aab", "aaa-aaaa-aac"...
        newCode: () => {
            codeCounter += 1;
            const letters = codeCounter.toString(26).padStart(10, "0");
            const mapped = [...letters]
                .map((c) => "abcdefghijklmnopqrstuvwxyz"[parseInt(c, 26)])
                .join("");
            return `${mapped.slice(0, 3)}-${mapped.slice(3, 7)}-${mapped.slice(7)}`;
        },
        newConversationId: () => `r_room${String(++nextId).padStart(8, "0")}`,
        makeRoom: ({ id, code, name }) =>
            createRoom({
                id,
                code,
                name,
                log,
                historySize,
                historyOnJoin,
                deliver,
                now: () => new Date(Date.UTC(2026, 10, 7, 10, 0, 0) + clock),
                newMessageId: () => `msg-${++nextId}`,
                userListScheduler: coalesce ? listTimers : null,
                leaveGraceMs,
                leaveScheduler: timers,
                onPresenceChange: (identity) => hub?.refreshEverywhere(identity),
            }),
    });
    hub = createHub({
        identities,
        directory,
        joinGuard: createJoinGuard({ now, ...joinGuard }),
        deliver,
        log,
        now,
        onCapabilitiesChange: (identity) => capabilityChanges.push(identity.id),
    });

    const member = (name) => ({ name });
    const all = (m) => inbox.get(m) ?? [];
    const received = (m, type, conversationId) =>
        all(m).filter(
            (x) =>
                x.type === type &&
                (conversationId === undefined || x.conversationId === conversationId),
        );
    const login = (m, payload = {}) =>
        hub.login(m, withUsername({ userName: m.name, ...payload }), `conn-${m.name}`);

    /** Sala compartilhada dos testes que só precisam de "uma sala". */
    let shared = null;
    /**
     * Entra no chat e na sala compartilhada (a primeira pessoa a cria).
     * @param {object} m
     * @param {Record<string, unknown>} [payload]
     */
    const enter = (m, payload = {}) => {
        const result = login(m, payload);
        if (!result.ok) return result;
        if (shared === null || !directory.byId(shared.id)) {
            const created = hub.createRoom(m, {});
            shared = created.ok ? created.room : null;
        } else {
            hub.joinRoom(m, { code: shared.code });
        }
        return result;
    };

    /** Atalhos que falam na sala compartilhada. */
    const post = (m, payload) => hub.post(m, { conversationId: shared?.id, ...payload });
    const command = (m, text, extra = {}) => ({ conversationId: shared?.id, text, ...extra });

    return {
        hub,
        identities,
        directory,
        inbox,
        logs,
        member,
        all,
        received,
        login,
        enter,
        post,
        command,
        capabilityChanges,
        // Proxy: desestruturar `room` antes de a sala existir continua valendo.
        room: new Proxy(
            {},
            {
                get(_, key) {
                    if (shared === null) throw new Error("nenhuma sala compartilhada ainda");
                    const value = shared[key];
                    return typeof value === "function" ? value.bind(shared) : value;
                },
            },
        ),
        currentRoom: () => shared,
        tick: (ms) => (clock += ms),
        runTimers: (options) => timers.run(options),
        flushLists: () => listTimers.run({ all: true }),
        timers,
        listTimers,
    };
};
