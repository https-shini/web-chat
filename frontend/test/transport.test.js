// O transporte repassa o `id` do envelope (F1-10).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport } from "../src/transport/socket.js";

class FakeWebSocket {
    static OPEN = 1;
    /** @type {FakeWebSocket[]} */
    static instances = [];
    readyState = 0;
    /** @type {Record<string, ((event: any) => void)[]>} */
    listeners = {};
    sent = [];
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
        this.sent.push(frame);
    }
    close() {}
}

test("eventos recebidos carregam o id e a conversa do servidor quando existem", () => {
    globalThis.WebSocket = /** @type {any} */ (FakeWebSocket);
    const events = [];
    const transport = createTransport({
        url: "ws://teste",
        onStatus: () => {},
        onQueueChange: () => {},
        onOpen: () => {},
        onEvent: (event) => events.push(event),
    });
    transport.open();
    const socket = FakeWebSocket.instances.at(-1);
    socket.readyState = 1;
    socket.emit("open");

    socket.emit("message", {
        data: JSON.stringify({ type: "chat_message", id: "m-1", payload: {} }),
    });
    socket.emit("message", { data: JSON.stringify({ type: "user_list", payload: [] }) });
    socket.emit("message", { data: JSON.stringify({ type: "x", id: 7, payload: {} }) });
    socket.emit("message", { data: "não é json" });
    // Fase 2 da evolução: o escopo da conversa vem no topo do envelope.
    socket.emit("message", {
        data: JSON.stringify({
            type: "room_joined",
            conversationId: "r_sala00000001",
            payload: {},
        }),
    });
    socket.emit("message", {
        data: JSON.stringify({ type: "user_list", conversationId: 9, payload: [] }),
    });

    assert.deepEqual(events, [
        { type: "chat_message", id: "m-1", payload: {} },
        { type: "user_list", payload: [] },
        { type: "x", payload: {} },
        { type: "room_joined", conversationId: "r_sala00000001", payload: {} },
        { type: "user_list", payload: [] },
    ]);
    transport.close();
});
