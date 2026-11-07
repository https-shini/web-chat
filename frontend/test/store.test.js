import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/state/store.js";

/** @returns {import("../src/state/store.js").Message} */
const message = (id, content = id) => ({
    id,
    kind: "chat",
    userId: "u",
    userName: "U",
    content,
    timestamp: "2026-11-07T10:00:00Z",
    own: false,
    pending: false,
});

test("setIdentity troca o id e notifica só quando muda", () => {
    const store = createStore();
    let notifications = 0;
    store.subscribe(() => {
        notifications += 1;
    });
    store.actions.enterRoom({ id: "local", name: "Ana" });
    store.actions.setIdentity({ id: "srv", name: "Ana" });
    store.actions.setIdentity({ id: "srv", name: "Ana" });
    assert.deepEqual(store.getState().me, { id: "srv", name: "Ana" });
    assert.equal(notifications, 2);
});

test("mergeHistory acrescenta só o que falta, na ordem recebida", () => {
    const store = createStore();
    store.actions.addMessage(message("a"));
    store.actions.addMessage(message("b"));
    store.actions.mergeHistory([message("a"), message("b"), message("c"), message("c")]);
    assert.deepEqual(
        store.getState().messages.map((item) => item.id),
        ["a", "b", "c"],
    );
});

test("mergeHistory sem novidade não notifica (nada é redesenhado)", () => {
    const store = createStore();
    store.actions.addMessage(message("a"));
    let notified = false;
    store.subscribe(() => {
        notified = true;
    });
    store.actions.mergeHistory([message("a")]);
    assert.equal(notified, false);
});

test("leaveRoom volta ao estado inicial", () => {
    const store = createStore();
    store.actions.enterRoom({ id: "x", name: "y" });
    store.actions.addMessage(message("a"));
    store.actions.leaveRoom();
    const state = store.getState();
    assert.equal(state.screen, "entry");
    assert.equal(state.me, null);
    assert.equal(state.messages.length, 0);
});
