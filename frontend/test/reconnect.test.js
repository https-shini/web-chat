// Transporte: backoff exponencial com teto e jitter, teto de tentativas,
// retry manual e fila de envio offline (F2-01).

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../src/transport/socket.js";
import { RECONNECT } from "../src/config.js";

class FakeWebSocket {
    static OPEN = 1;
    /** @type {FakeWebSocket[]} */
    static instances = [];
    readyState = 0;
    listeners = {};
    sent = [];
    closed = false;
    constructor(url) {
        this.url = url;
        FakeWebSocket.instances.push(this);
    }
    addEventListener(type, listener) {
        (this.listeners[type] ??= []).push(listener);
    }
    emit(type, event = {}) {
        for (const listener of this.listeners[type] ?? []) listener(event);
    }
    send(frame) {
        this.sent.push(JSON.parse(frame));
    }
    close() {
        this.closed = true;
    }
    accept() {
        this.readyState = 1;
        this.emit("open");
    }
    drop() {
        this.readyState = 3;
        this.emit("close");
    }
}

/** Relógio controlado: substitui setTimeout/clearTimeout e Math.random. */
let timers;
let originals;
beforeEach(() => {
    FakeWebSocket.instances = [];
    timers = [];
    originals = {
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        random: Math.random,
        WebSocket: globalThis.WebSocket,
    };
    globalThis.WebSocket = /** @type {any} */ (FakeWebSocket);
    globalThis.setTimeout = /** @type {any} */ (
        (callback, ms) => {
            const timer = { callback, ms, cancelled: false };
            timers.push(timer);
            return timer;
        }
    );
    globalThis.clearTimeout = /** @type {any} */ (
        (timer) => {
            if (timer) timer.cancelled = true;
        }
    );
});
afterEach(() => {
    globalThis.setTimeout = originals.setTimeout;
    globalThis.clearTimeout = originals.clearTimeout;
    Math.random = originals.random;
    globalThis.WebSocket = originals.WebSocket;
});

const runNextTimer = () => {
    const timer = timers.find((item) => !item.cancelled);
    assert.ok(timer, "havia uma nova tentativa agendada");
    timer.cancelled = true;
    timer.callback();
    return timer.ms;
};

const setup = () => {
    const statuses = [];
    const queued = [];
    const opens = [];
    const transport = createTransport({
        url: "ws://teste",
        onStatus: (status, detail) => statuses.push({ status, ...detail }),
        onQueueChange: (count) => queued.push(count),
        onOpen: () => opens.push(true),
        onEvent: () => {},
    });
    const current = () => /** @type {FakeWebSocket} */ (FakeWebSocket.instances.at(-1));
    return { transport, statuses, queued, opens, current };
};

test("atrasos crescem exponencialmente até o teto, com jitter de ±30 %", () => {
    Math.random = () => 0.5; // sem jitter: atraso exato
    const { transport, current } = setup();
    transport.open();
    const delays = [];
    for (let attempt = 0; attempt < RECONNECT.maxAttempts; attempt += 1) {
        current().drop();
        delays.push(runNextTimer());
    }
    assert.deepEqual(delays, [500, 1000, 2000, 4000, 8000, 15000]);

    for (const random of [0, 0.999999]) {
        Math.random = () => random;
        const { transport: other, current: socket } = setup();
        other.open();
        socket().drop();
        const delay = timers.filter((item) => !item.cancelled).at(-1).ms;
        assert.ok(delay >= 350 && delay <= 650, `atraso ${delay} fora de ±30 %`);
    }
});

test("após o teto de tentativas fica offline e não agenda mais nada", () => {
    const { transport, statuses, current } = setup();
    transport.open();
    for (let attempt = 0; attempt < RECONNECT.maxAttempts; attempt += 1) {
        current().drop();
        runNextTimer();
    }
    current().drop();
    assert.equal(statuses.at(-1).status, "offline");
    assert.equal(timers.filter((item) => !item.cancelled).length, 0);
});

test("retryNow recomeça a contagem e reconecta", () => {
    const { transport, statuses, current, opens } = setup();
    transport.open();
    for (let attempt = 0; attempt <= RECONNECT.maxAttempts; attempt += 1) {
        current().drop();
        if (attempt < RECONNECT.maxAttempts) runNextTimer();
    }
    transport.retryNow();
    assert.equal(statuses.at(-1).status, "connecting");
    current().accept();
    assert.equal(statuses.at(-1).status, "online");
    assert.equal(opens.length, 1);
});

test("envios fora do ar vão para a fila e saem na ordem, depois do onOpen", () => {
    const { transport, queued, current } = setup();
    transport.open();
    transport.send("chat_message", { content: "1" });
    transport.send("chat_message", { content: "2" });
    assert.deepEqual(queued, [1, 2]);
    current().accept();
    assert.deepEqual(
        current().sent.map((frame) => frame.payload.content),
        ["1", "2"],
    );
    assert.equal(queued.at(-1), 0);
});

test("sinais efêmeros não entram na fila", () => {
    const { transport, queued, current } = setup();
    transport.open();
    transport.signal("typing_start");
    current().accept();
    assert.equal(current().sent.length, 0);
    assert.deepEqual(queued, [0]);
});

test("fila tem teto de 50: acima disso as mais antigas caem", () => {
    const { transport, current } = setup();
    transport.open();
    for (let index = 0; index < 55; index += 1)
        transport.send("chat_message", { content: `${index}` });
    current().accept();
    const sent = current().sent.map((frame) => frame.payload.content);
    assert.equal(sent.length, 50);
    assert.equal(sent[0], "5");
});

test("close() encerra sem tentar reconectar", () => {
    const { transport, current } = setup();
    transport.open();
    current().accept();
    transport.close();
    current().drop();
    assert.equal(timers.filter((item) => !item.cancelled).length, 0);
});
