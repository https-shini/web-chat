// Tradutor de eventos: identidade do servidor (F1-06), ids preservados e
// histórico mesclado (F1-10), recusa por limite de taxa (F1-09).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createEventHandler } from "../src/state/events.js";
import { createStore } from "../src/state/store.js";
import { strings } from "../src/i18n/strings.js";

const setup = () => {
    const store = createStore();
    const toasts = [];
    const calls = { sessions: [], rateLimited: 0, rejected: [] };
    const handle = createEventHandler({
        store,
        toasts: { show: (text, kind) => toasts.push({ text, kind }) },
        notifier: { show: () => {} },
        typingTracker: { set: () => {} },
        onSession: (token) => calls.sessions.push(token),
        onRateLimited: () => {
            calls.rateLimited += 1;
        },
        onLoginRejected: (message) => calls.rejected.push(message),
    });
    store.actions.enterRoom({ id: "id-local-provisorio", name: "Ana" });
    return { store, toasts, calls, handle };
};

const chat = (id, userId, content, userName = "Alguém") => ({
    type: "chat_message",
    id,
    payload: { userId, userName, content, timestamp: "2026-11-07T10:00:00.000Z" },
});

describe("identidade", () => {
    test("session substitui o id provisório e entrega o token de retomada", () => {
        const { store, calls, handle } = setup();
        handle({ type: "session", payload: { id: "srv-1", name: "Ana", resumeToken: "tok" } });
        assert.deepEqual(store.getState().me, { id: "srv-1", name: "Ana" });
        assert.deepEqual(calls.sessions, ["tok"]);
    });

    test("a própria mensagem é reconhecida pelo id do servidor, não pelo local", () => {
        const { store, handle } = setup();
        handle({ type: "session", payload: { id: "srv-1", name: "Ana", resumeToken: "t" } });
        handle(chat("m1", "srv-1", "minha"));
        handle(chat("m2", "id-local-provisorio", "forjada com meu id antigo"));
        const [mine, forged] = store.getState().messages;
        assert.equal(mine?.own, true);
        assert.equal(forged?.own, false);
    });

    test("session malformada é ignorada", () => {
        const { store, calls, handle } = setup();
        handle({ type: "session", payload: { id: 42 } });
        handle({ type: "session", payload: null });
        assert.equal(store.getState().me?.id, "id-local-provisorio");
        assert.equal(calls.sessions.length, 0);
    });
});

describe("identificadores de mensagem", () => {
    test("o id do servidor é preservado na mensagem ao vivo", () => {
        const { store, handle } = setup();
        handle(chat("srv-msg-1", "u2", "olá"));
        assert.equal(store.getState().messages[0]?.id, "srv-msg-1");
    });

    test("a mesma mensagem ao vivo duas vezes aparece uma vez", () => {
        const { store, handle } = setup();
        handle(chat("m1", "u2", "olá"));
        handle(chat("m1", "u2", "olá"));
        assert.equal(store.getState().messages.length, 1);
    });

    test("histórico na reconexão não duplica nem reordena o que já está na tela", () => {
        const { store, handle } = setup();
        handle(chat("m1", "u2", "primeira"));
        handle({
            type: "user_joined",
            payload: { userName: "Bia", timestamp: "2026-11-07T10:01:00Z" },
        });
        handle(chat("m2", "u2", "segunda"));

        handle({
            type: "message_history",
            payload: [
                chat("m1", "u2", "primeira"),
                chat("m2", "u2", "segunda"),
                chat("m3", "u2", "perdida offline"),
            ],
        });

        const messages = store.getState().messages;
        assert.deepEqual(
            messages.map((message) => message.content),
            ["primeira", "Bia entrou na sala", "segunda", "perdida offline"],
        );
        assert.equal(new Set(messages.map((message) => message.id)).size, messages.length);
    });

    test("primeira entrada: o histórico preenche a conversa vazia, na ordem", () => {
        const { store, handle } = setup();
        handle({ type: "message_history", payload: [chat("a", "u", "1"), chat("b", "u", "2")] });
        assert.deepEqual(
            store.getState().messages.map((message) => message.id),
            ["a", "b"],
        );
    });

    test("servidor antigo sem id: cai num id local sem quebrar", () => {
        const { store, handle } = setup();
        handle({
            type: "chat_message",
            payload: { userId: "u", userName: "x", content: "sem id" },
        });
        assert.equal(typeof store.getState().messages[0]?.id, "string");
    });
});

describe("erros com código", () => {
    test("rate_limited avisa que a mensagem não foi enviada e pede o rascunho de volta", () => {
        const { toasts, calls, handle } = setup();
        handle({ type: "error", payload: { code: "rate_limited", message: "texto do servidor" } });
        assert.equal(calls.rateLimited, 1);
        assert.deepEqual(toasts, [{ text: strings.errors.rateLimited, kind: "error" }]);
    });

    test("invalid_name devolve a pessoa à tela de entrada", () => {
        const { toasts, calls, handle } = setup();
        handle({ type: "error", payload: { code: "invalid_name", message: "x" } });
        assert.deepEqual(calls.rejected, [strings.errors.invalidName]);
        assert.equal(toasts.length, 0);
    });

    test("demais erros continuam exibindo a mensagem do servidor", () => {
        const { toasts, handle } = setup();
        handle({ type: "error", payload: { code: "empty_message", message: "Mensagem vazia." } });
        handle({ type: "error", payload: { message: "Erro sem código (servidor antigo)" } });
        assert.deepEqual(
            toasts.map((toast) => toast.text),
            ["Mensagem vazia.", "Erro sem código (servidor antigo)"],
        );
    });
});
