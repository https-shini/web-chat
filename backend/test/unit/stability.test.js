// Fase 3: agrupamento da lista, métricas, readiness e prazo de login, sem rede.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setup as harness } from "./harness.js";
import { createMetrics } from "../../src/metrics.js";
import { createHttpHandler } from "../../src/transport/http.js";
import { createConnectionHandler } from "../../src/transport/connection.js";

describe("agrupamento da lista de pessoas", () => {
    const setup = () => {
        const h = harness({ coalesce: true });
        const userLists = (m) => h.received(m, "user_list");
        const total = () =>
            [...h.inbox.values()].flat().filter((m) => m.type === "user_list").length;
        return { ...h, userLists, total };
    };

    test("várias entradas seguidas viram um envio só, com o estado final", () => {
        const { member, enter, flushLists, userLists } = setup();
        const members = Array.from({ length: 20 }, (_, i) => member(`p${i}`));
        members.forEach((m) => enter(m));
        assert.equal(userLists(members[0]).length, 0, "nada enviado antes do agendamento disparar");
        flushLists();
        assert.equal(userLists(members[0]).length, 1);
        assert.equal(userLists(members[0]).at(-1).payload.length, 20);
    });

    test("entrada e saída na mesma janela: a lista reflete só quem ficou", () => {
        const { member, enter, hub, flushLists, userLists, room } = setup();
        const a = member("A");
        const b = member("B");
        enter(a);
        enter(b);
        hub.leaveRoom(b, { conversationId: room.id });
        flushLists();
        const list = userLists(a);
        assert.equal(list.length, 1);
        assert.deepEqual(
            list[0].payload.map((p) => p.name),
            ["A"],
        );
    });

    test("ordem para quem entra continua: sessão, sala, depois a lista", () => {
        const { member, enter, flushLists, all } = setup();
        const a = member("A");
        enter(a);
        flushLists();
        assert.deepEqual(
            all(a).map((m) => m.type),
            ["session", "room_joined", "user_list"],
        );
    });

    test("silence cancela o envio pendente (nenhum timer sobra)", () => {
        const { member, enter, hub, flushLists, total } = setup();
        enter(member("X"));
        hub.silence();
        flushLists();
        assert.equal(total(), 0);
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

    test("todo contador usado pelo servidor existe (nenhum vira NaN)", async () => {
        const { readFile, readdir } = await import("node:fs/promises");
        const metrics = createMetrics();
        const snapshot = metrics.snapshot({ connections: 0, users: 0, identities: 0 });
        metrics.stop();
        const dir = new URL("../../src/transport/", import.meta.url);
        const used = new Set();
        for (const file of await readdir(dir)) {
            const source = await readFile(new URL(file, dir), "utf8");
            for (const match of source.matchAll(/metrics\.count\("([A-Za-z]+)"/g))
                used.add(match[1]);
        }
        assert.ok(used.has("roomsCreated"));
        for (const name of used) assert.ok(name in snapshot.counters, name);
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
            login: () => ((member = true), { ok: true, replaced: null }),
            post: () => ({ ok: true }),
            typing() {},
            disconnect() {},
            isLoggedIn: () => member,
            userIdOf: () => null,
        };
        const counted = [];
        const handle = createConnectionHandler({
            hub: /** @type {any} */ (room),
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
            hub: /** @type {any} */ ({
                login: () => ({ ok: false, code: "invalid_name" }),
                post() {},
                typing() {},
                disconnect() {},
                isLoggedIn: () => false,
                userIdOf: () => null,
            }),
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
