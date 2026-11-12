// Fase A no cliente: username na entrada, recusas por campo, saída com fila
// descartada e fechamento definitivo (4004).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isUsernameFormatValid, normalizeUsername } from "../src/ui/entry.js";
import { createEventHandler } from "../src/state/events.js";
import { createStore } from "../src/state/store.js";
import { createTransport } from "../src/transport/socket.js";
import { strings } from "../src/i18n/strings.js";
import { CLOSE_CODES } from "../src/protocol.js";

describe("username na entrada (espelho da regra do servidor)", () => {
    test("normaliza: sem @, aparado, minúsculo", () => {
        assert.equal(normalizeUsername("  @AnaCarolina "), "anacarolina");
    });

    test("aceita e recusa os mesmos formatos que o servidor", () => {
        for (const ok of ["ana", "ana.souza", "ana_82", "a1b", "_ana_"]) {
            assert.equal(isUsernameFormatValid(ok), true, ok);
        }
        for (const bad of [
            "ab",
            "a".repeat(21),
            "ána",
            "ana souza",
            "ana-x",
            ".ana",
            "ana.",
            "a..b",
        ]) {
            assert.equal(isUsernameFormatValid(bad), false, bad);
        }
    });
});

describe("eventos de identidade", () => {
    const setup = () => {
        const store = createStore();
        const rejected = [];
        const handle = createEventHandler({
            store,
            toasts: { show: () => {} },
            notifier: { show: () => {} },
            typingTracker: { set: () => {} },
            onSession: () => {},
            onLoginRejected: (message, field) => rejected.push({ message, field }),
        });
        store.actions.enterRoom({ id: "provisorio", name: "Ana Souza", username: "ana" });
        return { store, rejected, handle };
    };

    test("a sessão traz o username definitivo do servidor", () => {
        const { store, handle } = setup();
        handle({
            type: "session",
            payload: { name: "Ana Souza", username: "ana", resumeToken: "t" },
        });
        assert.deepEqual(store.getState().me, { id: "ana", name: "Ana Souza", username: "ana" });
    });

    test("username em uso ou inválido volta para a entrada com o erro no campo do username", () => {
        const { rejected, handle } = setup();
        handle({ type: "error", payload: { code: "username_taken", message: "x" } });
        handle({ type: "error", payload: { code: "invalid_username", message: "x" } });
        handle({ type: "error", payload: { code: "invalid_name", message: "x" } });
        assert.deepEqual(rejected, [
            { message: strings.errors.usernameTaken, field: "username" },
            { message: strings.errors.invalidUsername, field: "username" },
            { message: strings.errors.invalidName, field: "name" },
        ]);
    });

    test("mensagens e lista de pessoas carregam o username", () => {
        const { store, handle } = setup();
        handle({
            type: "user_list",
            payload: [{ id: "u1", name: "Bia", username: "bia" }],
        });
        handle({
            type: "chat_message",
            id: "m1",
            payload: { userName: "Bia", username: "bia", content: "oi" },
        });
        assert.equal(store.getState().people[0].username, "bia");
        assert.equal(store.getState().messages.at(-1).username, "bia");
    });
});

describe("transporte na saída", () => {
    class FakeWebSocket {
        static OPEN = 1;
        /** @type {FakeWebSocket[]} */
        static instances = [];
        readyState = 0;
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

    const setup = () => {
        globalThis.WebSocket = /** @type {any} */ (FakeWebSocket);
        const statuses = [];
        const queued = [];
        const transport = createTransport({
            url: "ws://teste",
            onStatus: (status, detail) => statuses.push({ status, ...detail }),
            onQueueChange: (n) => queued.push(n),
            onOpen: () => {},
            onEvent: () => {},
        });
        return { transport, statuses, queued };
    };

    test("close() descarta a fila: nada da participação anterior sai depois", () => {
        const { transport, queued } = setup();
        transport.send("chat_message", { content: "na fila" });
        assert.equal(queued.at(-1), 1);
        transport.close();
        assert.equal(queued.at(-1), 0);
        transport.open();
        const socket = FakeWebSocket.instances.at(-1);
        socket.readyState = 1;
        socket.emit("open");
        assert.deepEqual(socket.sent, []);
        transport.close();
    });

    test("fechamento 4004 (saiu da sala) é definitivo: não reconecta", () => {
        const { transport, statuses } = setup();
        transport.open();
        const socket = FakeWebSocket.instances.at(-1);
        socket.readyState = 1;
        socket.emit("open");
        const before = FakeWebSocket.instances.length;
        socket.emit("close", { code: CLOSE_CODES.LOGGED_OUT });
        assert.equal(statuses.at(-1).status, "offline");
        assert.equal(statuses.at(-1).closeCode, 4004);
        assert.equal(FakeWebSocket.instances.length, before);
        transport.close();
    });

    test("signal() fora do ar não enfileira (a saída nunca fica pendente)", () => {
        const { transport, queued } = setup();
        transport.signal("user_logout");
        assert.equal(queued.length, 0);
        transport.close();
    });
});
