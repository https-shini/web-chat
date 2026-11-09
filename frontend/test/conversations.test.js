import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/state/store.js";
import { createEventHandler } from "../src/state/events.js";

const room = (conversationId, name) => ({
    conversationId,
    code: "abc-defg-hij",
    name,
    role: "member",
    kind: "room",
});

const message = (id, content) => ({
    id,
    key: id,
    kind: "chat",
    userId: "other",
    userName: "Outra pessoa",
    content,
    timestamp: "2026-11-09T10:00:00.000Z",
    own: false,
    delivery: "confirmed",
});

test("alternar entre salas não apaga transcrições nem participações", () => {
    const store = createStore();
    store.actions.registerRoom(room("a", "Primeira"));
    store.actions.registerRoom(room("b", "Segunda"));
    assert.equal(store.getState().screen, "entry");
    assert.equal(store.actions.openConversation("a"), true);
    store.actions.addConversationMessage("a", message("a1", "Olá A"));
    store.actions.goHome();
    assert.equal(store.getState().conversations.length, 2);
    assert.equal(store.actions.openConversation("b"), true);
    store.actions.addConversationMessage("b", message("b1", "Olá B"));
    store.actions.openConversation("a");
    assert.deepEqual(store.getState().messages.map((item) => item.id), ["a1"]);
    store.actions.openConversation("b");
    assert.deepEqual(store.getState().messages.map((item) => item.id), ["b1"]);
});

test("mensagens da sala não selecionada acumulam não lidas e são deduplicadas", () => {
    const store = createStore();
    store.actions.registerRoom(room("a", "Primeira"));
    store.actions.registerRoom(room("b", "Segunda"));
    store.actions.openConversation("a");
    store.actions.addConversationMessage("b", message("b1", "Não lida"));
    store.actions.addConversationMessage("b", message("b1", "Não lida"));
    assert.equal(store.getState().conversations.find((item) => item.conversationId === "b")?.unread, 1);
    store.actions.openConversation("b");
    assert.equal(store.getState().conversations.find((item) => item.conversationId === "b")?.unread, 0);
    assert.equal(store.getState().messages.length, 1);
});

test("room_list reconcilia conversas com o estado autoritativo do servidor", () => {
    const store = createStore();
    store.actions.registerRoom(room("old", "Antiga"));
    store.actions.registerRoom(room("current", "Atual"));
    store.actions.openConversation("old");
    store.actions.syncRooms([room("current", "Atual")]);
    assert.equal(store.getState().screen, "home");
    assert.deepEqual(store.getState().conversations.map((item) => item.conversationId), ["current"]);
});

test("eventos de outra sala atualizam o registro sem substituir a tela aberta", () => {
    const store = createStore();
    const handle = createEventHandler({
        store,
        toasts: { show() {} },
        notifier: { show() {} },
        typingTracker: { set() {} },
    });
    handle({ type: "session", payload: { id: "me", name: "Eu", username: "eu" } });
    for (const id of ["a", "b"]) {
        handle({
            type: "room_joined",
            conversationId: id,
            payload: { code: "abc-defg-hij", name: id, role: "member", historyVersion: 0 },
        });
    }
    store.actions.openConversation("a");
    handle({
        type: "chat_message",
        id: "b-msg",
        conversationId: "b",
        payload: {
            userId: "x",
            userName: "Outro",
            content: "Mensagem da B",
            timestamp: "2026-11-09T10:00:00Z",
        },
    });
    assert.equal(store.getState().room?.conversationId, "a");
    assert.equal(store.getState().messages.length, 0);
    assert.equal(store.getState().conversations.find((item) => item.conversationId === "b")?.unread, 1);
    store.actions.openConversation("b");
    assert.equal(store.getState().messages[0]?.content, "Mensagem da B");
});

test("logout elimina todas as conversas e mensagens locais", () => {
    const store = createStore();
    store.actions.registerRoom(room("a", "A"));
    store.actions.openConversation("a");
    store.actions.addConversationMessage("a", message("m", "Apagar"));
    store.actions.leaveRoom();
    assert.equal(store.getState().screen, "entry");
    assert.deepEqual(store.getState().conversations, []);
    assert.deepEqual(store.getState().messages, []);
});
