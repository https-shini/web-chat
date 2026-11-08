// Fase 3: agrupamento da lista, métricas, readiness e prazo de login, sem rede.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRoom } from "../../src/room/room.js";
import { createIdentityStore } from "../../src/room/sessions.js";
import { withUsername } from "../identity.js";

/** Entra na sala com username automático (ver test/identity.js). */
const joinRoom = (room, member, payload, label) => room.join(member, withUsername(payload), label);
import { createMetrics } from "../../src/metrics.js";
import { createHttpHandler } from "../../src/transport/http.js";
import { createConnectionHandler } from "../../src/transport/connection.js";

describe("agrupamento da lista de pessoas", () => {
    const setup = () => {
        const queue = [];
        const inbox = new Map();
        let lists = 0;
        const room = createRoom({
            identities: createIdentityStore(),
            log: () => {},
            historySize: 10,
            historyOnJoin: 5,
            deliver: (member, data) => {
                if (!inbox.has(member)) inbox.set(member, []);
                inbox.get(member).push(JSON.parse(data));
            },
            userListScheduler: {
                schedule: (callback) => (queue.push(callback), queue.length),
                cancel: (handle) => (queue[handle - 1] = null),
            },
            onUserList: () => (lists += 1),
        });
        const flush = () => {
            const pending = queue.splice(0);
            for (const callback of pending) callback?.();
        };
        return { room, inbox, flush, lists: () => lists };
    };

    test("várias entradas seguidas viram um envio só, com o estado final", () => {
        const { room, inbox, flush, lists } = setup();
        const members = Array.from({ length: 20 }, (_, i) => ({ i }));
        members.forEach((member, i) => joinRoom(room, member, { userName: `p${i}` }, `c${i}`));
        assert.equal(lists(), 0, "nada enviado antes do agendamento disparar");
        flush();
        assert.equal(lists(), 1);
        const last = inbox
            .get(members[0])
            .filter((m) => m.type === "user_list")
            .at(-1);
        assert.equal(last.payload.length, 20);
    });

    test("entrada e saída na mesma janela: a lista reflete só quem ficou", () => {
        const { room, inbox, flush } = setup();
        const a = { a: 1 };
        const b = { b: 1 };
        joinRoom(room, a, { userName: "A" }, "a");
        joinRoom(room, b, { userName: "B" }, "b");
        room.leave(b);
        flush();
        const list = inbox.get(a).filter((m) => m.type === "user_list");
        assert.equal(list.length, 1);
        assert.deepEqual(
            list[0].payload.map((p) => p.name),
            ["A"],
        );
    });

    test("ordem para quem entra continua: sessão antes da lista", () => {
        const { room, inbox, flush } = setup();
        const a = { a: 1 };
        joinRoom(room, a, { userName: "A" }, "a");
        flush();
        assert.deepEqual(
            inbox.get(a).map((m) => m.type),
            ["session", "user_list"],
        );
    });

    test("silence cancela o envio pendente (nenhum timer sobra)", () => {
        const { room, flush, lists } = setup();
        joinRoom(room, { x: 1 }, { userName: "X" }, "x");
        room.silence();
        flush();
        assert.equal(lists(), 0);
    });
});

describe("métricas", () => {
    test("contadores, rótulos e tempo de processamento", () => {
        const metrics = createMetrics();
        metrics.count("connectionsOpened");
        metrics.count("connectionsOpened");
        metrics.count("requestsRejected", "invalid_name");
        metrics.count("framesReceived", "chat_message");
        for (const ms of [0.05, 0.2, 0.3, 4, 200]) metrics.observeProcessing(ms);
        const snapshot = metrics.snapshot({ connections: 1, users: 1, identities: 1 });
        metrics.stop();
        assert.equal(snapshot.counters.connectionsOpened, 2);
        assert.deepEqual(snapshot.counters.requestsRejected, { invalid_name: 1 });
        assert.equal(snapshot.processing.frames, 5);
        assert.equal(snapshot.processing.maxMs, 200);
        assert.equal(typeof snapshot.process.rssMb, "number");
        assert.equal(typeof snapshot.eventLoopDelayMs.p99, "number");
        assert.deepEqual(snapshot.gauges, { connections: 1, users: 1, identities: 1 });
    });

    test("reset zera as janelas, não os contadores cumulativos", () => {
        const metrics = createMetrics();
        metrics.count("messagesAccepted");
        metrics.observeProcessing(9);
        metrics.snapshot({ connections: 0, users: 0, identities: 0 }, { reset: true });
        const next = metrics.snapshot({ connections: 0, users: 0, identities: 0 });
        metrics.stop();
        assert.equal(next.counters.messagesAccepted, 1);
        assert.equal(next.processing.maxMs, 0);
    });
});

describe("readiness e /metrics", () => {
    const call = (handlerOptions, url) => {
        const handler = createHttpHandler({
            stats: () => ({ connections: 0, users: 0 }),
            ...handlerOptions,
        });
        const response = { status: 0, body: "" };
        handler(
            { method: "GET", url },
            {
                writeHead: (status) => (response.status = status),
                end: (body) => (response.body = body ?? ""),
            },
        );
        return response;
    };

    test("/readyz: 200 pronto, 503 desligando ou cheio", () => {
        assert.equal(call({ readiness: () => "ready" }, "/readyz").status, 200);
        const draining = call({ readiness: () => "draining" }, "/readyz");
        assert.equal(draining.status, 503);
        assert.deepEqual(JSON.parse(draining.body), { status: "draining" });
        assert.equal(call({ readiness: () => "full" }, "/readyz").status, 503);
    });

    test("/metrics desligado responde 404; ligado responde o snapshot", () => {
        assert.equal(call({}, "/metrics").status, 404);
        const on = call({ metrics: () => ({ counters: { a: 1 } }) }, "/metrics");
        assert.equal(on.status, 200);
        assert.deepEqual(JSON.parse(on.body), { counters: { a: 1 } });
    });
});

describe("prazo de login e sinal de atividade", () => {
    class FakeSocket extends EventEmitter {
        OPEN = 1;
        readyState = 1;
        closedWith = null;
        send() {}
        close(code) {
            this.closedWith = code;
        }
    }

    test("conexão que não entra a tempo é fechada com 4001; quem entra não", async () => {
        let member = false;
        const room = {
            join: () => ((member = true), { ok: true, replaced: null }),
            post: () => ({ ok: true }),
            typing() {},
            leave() {},
            isMember: () => member,
            userIdOf: () => null,
        };
        const counted = [];
        const handle = createConnectionHandler({
            room,
            log: () => {},
            messageRate: { capacity: 5, refillPerSecond: 1 },
            signalRate: { capacity: 5, refillPerSecond: 1 },
            loginTimeoutMs: 30,
            metrics: { count: (name) => counted.push(name), observeProcessing() {} },
        });
        const idle = new FakeSocket();
        handle(idle);
        await new Promise((resolve) => setTimeout(resolve, 60));
        assert.equal(idle.closedWith, 4001);
        assert.ok(counted.includes("loginTimeouts"));

        member = false;
        const active = new FakeSocket();
        handle(active);
        active.emit(
            "message",
            Buffer.from(
                JSON.stringify({ type: "user_login", payload: { userName: "A", username: "aaa" } }),
            ),
            false,
        );
        await new Promise((resolve) => setTimeout(resolve, 60));
        assert.equal(active.closedWith, null);
        active.emit("close", 1000);
    });

    test("todo quadro recebido sinaliza atividade (heartbeat)", () => {
        const seen = [];
        const handle = createConnectionHandler({
            room: {
                join: () => ({ ok: false, code: "invalid_name" }),
                post() {},
                typing() {},
                leave() {},
                isMember: () => false,
                userIdOf: () => null,
            },
            log: () => {},
            messageRate: { capacity: 5, refillPerSecond: 1 },
            signalRate: { capacity: 5, refillPerSecond: 1 },
            onActivity: (ws) => seen.push(ws),
        });
        const ws = new FakeSocket();
        handle(ws);
        ws.emit("message", Buffer.from("lixo"), false);
        ws.emit("message", Buffer.from(JSON.stringify({ type: "typing_start" })), false);
        assert.equal(seen.length, 2);
        ws.emit("close", 1000);
    });
});
