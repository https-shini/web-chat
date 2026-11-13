// Entrega confirmada, falha, reenvio e limpezas (store + eventos).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/state/store.js";
import { createEventHandler } from "../src/state/events.js";

const pending = (clientMsgId, extra = {}) => ({
    id: `local:${clientMsgId}`,
    key: `c:${clientMsgId}`,
    kind: "chat",
    userId: "eu",
    userName: "Eu",
    content: "oi",
    timestamp: "2026-11-07T10:00:00Z",
    own: true,
    clientMsgId,
    delivery: "pending",
    sentAt: 1000,
    ...extra,
});

const setup = () => {
    const store = createStore();
    const results = [];
    const toasts = [];
    const handle = createEventHandler({
        store,
        toasts: { show: (text) => toasts.push(text) },
        notifier: { show() {} },
        typingTracker: { set() {}, remove() {} },
        onCommandResult: (requestId, result) => results.push({ requestId, result }),
    });
    store.actions.enterRoom({ id: "eu", name: "Eu" });
    return { store, handle, results, toasts };
};

const echo = (id, clientMsgId, extra = {}) => ({
    type: "chat_message",
    id,
    payload: {
        userId: "eu",
        userName: "Eu",
        content: "oi",
        timestamp: "2026-11-07T10:00:01Z",
        clientMsgId,
        ...extra,
    },
});

describe("confirmação de entrega", () => {
    test("o eco do servidor confirma a pendente no lugar, com o id do servidor", () => {
        const { store, handle } = setup();
        store.actions.addMessage(pending("c1"));
        handle(echo("srv-1", "c1"));
        const messages = store.getState().messages;
        assert.equal(messages.length, 1);
        assert.equal(messages[0]?.id, "srv-1");
        assert.equal(messages[0]?.key, "c:c1", "a chave não muda: nada é redesenhado");
        assert.equal(messages[0]?.delivery, "confirmed");
    });

    test("sem confirmação no prazo vira falha; reenvio volta a pendente; eco tardio confirma", () => {
        const { store, handle } = setup();
        store.actions.addMessage(pending("c2", { sentAt: 0 }));
        assert.equal(store.actions.expirePending(5_000, 10_000, "x"), false);
        assert.equal(store.actions.expirePending(10_001, 10_000, "sem confirmação"), true);
        assert.equal(store.getState().messages[0]?.delivery, "failed");
        store.actions.retryMessage("c2", 20_000);
        assert.equal(store.getState().messages[0]?.delivery, "pending");
        handle(echo("srv-2", "c2"));
        assert.equal(store.getState().messages[0]?.delivery, "confirmed");
    });

    test("pendente na fila (sem sentAt) não expira até a conexão voltar", () => {
        const { store } = setup();
        store.actions.addMessage(pending("c3", { sentAt: null }));
        assert.equal(store.actions.expirePending(999_999, 10_000, "x"), false);
        store.actions.markPendingSent(50);
        assert.equal(store.getState().messages[0]?.sentAt, 50);
    });

    test("histórico na reconexão confirma pendentes e não duplica", () => {
        const { store, handle } = setup();
        store.actions.addMessage(pending("c4"));
        handle({ type: "message_history", payload: [{ id: "srv-4", ...echo("srv-4", "c4") }] });
        assert.equal(store.getState().messages.length, 1);
        assert.equal(store.getState().messages[0]?.delivery, "confirmed");
    });

    test("erro com ref marca só aquela mensagem como não enviada", () => {
        const { store, handle } = setup();
        store.actions.addMessage(pending("c5"));
        store.actions.addMessage(pending("c6"));
        handle({ type: "error", payload: { code: "muted", message: "silenciado", ref: "c6" } });
        const [first, second] = store.getState().messages;
        assert.equal(first?.delivery, "pending");
        assert.equal(second?.delivery, "failed");
        assert.equal(second?.failReason, "silenciado");
    });
});

describe("variedades de mensagem", () => {
    test("kind e format do servidor são preservados; valores desconhecidos viram padrão", () => {
        const { store, handle } = setup();
        handle({
            type: "chat_message",
            id: "a",
            payload: { username: "x", userName: "X", content: "acena", kind: "action" },
        });
        handle({
            type: "chat_message",
            id: "b",
            payload: { username: "x", userName: "X", content: "s", format: "spoiler" },
        });
        handle({
            type: "chat_message",
            id: "c",
            payload: {
                username: "x",
                userName: "X",
                content: "?",
                kind: "hack",
                format: "<script>",
            },
        });
        const [a, b, c] = store.getState().messages;
        assert.equal(a?.variant, "action");
        assert.equal(b?.format, "spoiler");
        assert.equal(c?.variant, "text");
        assert.equal(c?.format, null);
    });
});

describe("limpezas", () => {
    test("/clear esconde só aqui; o histórico do servidor não traz de volta", () => {
        const { store, handle } = setup();
        handle({
            type: "chat_message",
            id: "m1",
            payload: { username: "x", userName: "X", content: "antiga" },
        });
        store.actions.clearLocal();
        assert.equal(store.getState().messages.length, 0);
        handle({
            type: "message_history",
            payload: [{ id: "m1", payload: { username: "x", userName: "X", content: "antiga" } }],
        });
        assert.equal(store.getState().messages.length, 0);
        handle({
            type: "chat_message",
            id: "m2",
            payload: { username: "x", userName: "X", content: "nova" },
        });
        assert.equal(store.getState().messages.length, 1);
    });

    test("chat_cleared troca a conversa pelo aviso", () => {
        const { store, handle } = setup();
        handle({
            type: "chat_message",
            id: "m1",
            payload: { username: "x", userName: "X", content: "a" },
        });
        handle({
            type: "chat_cleared",
            payload: { byName: "Admin", timestamp: "2026-11-07T10:00:00Z", historyVersion: 1 },
        });
        const messages = store.getState().messages;
        assert.equal(messages.length, 1);
        assert.match(messages[0]?.content ?? "", /apagada para todos por Admin/);
        assert.equal(store.getState().historyVersion, 1);
    });

    test("sala com historyVersion diferente descarta a conversa de antes (limpa enquanto você estava fora)", () => {
        const { store, handle } = setup();
        const joined = (historyVersion) => ({
            type: "room_joined",
            conversationId: "r_sala00000001",
            payload: { code: "abc-defg-hij", name: "Sala", role: "member", historyVersion },
        });
        handle({ type: "session", payload: { username: "eu", name: "Eu", resumeToken: "t" } });
        handle(joined(0));
        handle({
            type: "chat_message",
            id: "m1",
            conversationId: "r_sala00000001",
            payload: { username: "x", userName: "X", content: "a" },
        });
        handle(joined(0));
        assert.equal(store.getState().messages.length, 1, "mesma versão: conversa mantida");
        handle(joined(2));
        assert.equal(store.getState().messages.length, 0);
    });
});

describe("comandos e avisos", () => {
    test("catálogo, resultado e aviso do servidor", () => {
        const { store, handle, results } = setup();
        handle({
            type: "command_catalog",
            payload: {
                commands: [
                    { name: "roll", aliases: ["dice"], scope: "server", allowed: true },
                    { nome: "x" },
                ],
            },
        });
        assert.deepEqual(
            store.getState().catalog.map((c) => c.name),
            ["roll"],
        );
        handle({
            type: "command_result",
            payload: { requestId: "r1", tone: "success", text: "pong" },
        });
        assert.deepEqual(results, [{ requestId: "r1", result: { tone: "success", text: "pong" } }]);
        handle({
            type: "notice",
            payload: { id: "n1", tone: "admin", text: "Ana agora é administrador", timestamp: "t" },
        });
        assert.equal(store.getState().messages.at(-1)?.tone, "admin");
    });

    test("saída por remoção não gera 'saiu da sala' duplicado (o aviso vem por notice)", () => {
        const { store, handle } = setup();
        handle({ type: "user_left", payload: { username: "x", userName: "X", reason: "removed" } });
        handle({ type: "user_left", payload: { username: "y", userName: "Y" } });
        assert.deepEqual(
            store.getState().messages.map((m) => m.content),
            ["Y saiu da sala"],
        );
    });

    test("papel de administrador chega pela sessão", () => {
        const { store, handle } = setup();
        handle({
            type: "session",
            payload: { username: "eu", name: "Eu", role: "admin", historyVersion: 0 },
        });
        assert.equal(store.getState().role, "admin");
    });
});
