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
        toasts: {
            show: (text, kind, options) =>
                toasts.push(options ? { text, kind, ...options } : { text, kind }),
        },
        notifier: { show: () => {} },
        typingTracker: { set: () => {} },
        onSession: (token) => calls.sessions.push(token),
        onLoginRejected: (message) => calls.rejected.push(message),
    });
    store.actions.enterRoom({ id: "id-local-provisorio", name: "Ana" });
    return { store, toasts, calls, handle };
};

const chat = (
    id,
    username,
    content,
    userName = "Alguém",
    timestamp = "2026-11-07T10:00:00.000Z",
) => ({
    type: "chat_message",
    id,
    payload: { username, userName, content, timestamp },
});

describe("identidade", () => {
    test("session troca a chave provisória pelo @ e entrega o token de retomada", () => {
        const { store, calls, handle } = setup();
        handle({ type: "session", payload: { username: "ana", name: "Ana", resumeToken: "tok" } });
        // O servidor não envia id interno: a chave da pessoa na interface é o @.
        assert.deepEqual(store.getState().me, { id: "ana", name: "Ana", username: "ana" });
        assert.deepEqual(calls.sessions, ["tok"]);
    });

    test("a própria mensagem é reconhecida pelo @, não pela chave provisória", () => {
        const { store, handle } = setup();
        handle({ type: "session", payload: { username: "ana", name: "Ana", resumeToken: "t" } });
        handle(chat("m1", "ana", "minha"));
        handle(chat("m2", "id-local-provisorio", "com a chave antiga"));
        const [mine, forged] = store.getState().messages;
        assert.equal(mine?.own, true);
        assert.equal(forged?.own, false);
    });

    test("mensagem com o seu @ escrita antes de você existir é de quem usou o @ antes", () => {
        const { store, handle } = setup();
        handle({
            type: "session",
            payload: {
                username: "ana",
                name: "Ana",
                resumeToken: "t",
                since: "2026-11-07T10:00:00.000Z",
            },
        });
        handle({
            type: "message_history",
            payload: [
                chat("velha", "ana", "da Ana anterior", "Ana", "2026-11-07T09:59:59.000Z"),
                chat("nova", "ana", "minha", "Ana", "2026-11-07T10:00:01.000Z"),
            ],
        });
        assert.deepEqual(
            store.getState().messages.map((m) => [m.content, m.own]),
            [
                ["da Ana anterior", false],
                ["minha", true],
            ],
        );
    });

    test("session malformada é ignorada", () => {
        const { store, calls, handle } = setup();
        handle({ type: "session", payload: { username: 42 } });
        handle({ type: "session", payload: { id: "so-id-sem-username", name: "X" } });
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
            payload: { username: "u", userName: "x", content: "sem id" },
        });
        assert.equal(typeof store.getState().messages[0]?.id, "string");
    });
});

describe("erros com código", () => {
    test("rate_limited com ref marca a mensagem como não enviada e avisa", () => {
        const { store, toasts, handle } = setup();
        store.actions.addMessage({
            id: "local:c1",
            key: "c:c1",
            kind: "chat",
            userId: "id-local-provisorio",
            userName: "Ana",
            content: "oi",
            timestamp: "2026-11-07T10:00:00Z",
            own: true,
            clientMsgId: "c1",
            delivery: "pending",
            sentAt: 1,
        });
        handle({ type: "error", payload: { code: "rate_limited", message: "texto", ref: "c1" } });
        const [message] = store.getState().messages;
        assert.equal(message?.delivery, "failed");
        // A falha já é anunciada pela lista de mensagens: o toast é só visual.
        assert.deepEqual(toasts, [
            { text: strings.errors.rateLimited, kind: "error", announce: false },
        ]);
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

describe("presença e digitação", () => {
    test("user_list normaliza entradas malformadas", () => {
        const { store, handle } = setup();
        handle({
            type: "user_list",
            // Um `id` vindo da rede é ignorado: a chave da pessoa é o @.
            payload: [{ username: "ana", name: "Ana", id: "x" }, null, { username: 2 }],
        });
        assert.deepEqual(store.getState().people, [
            {
                id: "ana",
                name: "Ana",
                username: "ana",
                author: null,
                status: "online",
                role: "member",
            },
            { id: "", name: "", username: "", author: null, status: "online", role: "member" },
            { id: "", name: "", username: "", author: null, status: "online", role: "member" },
        ]);
        handle({ type: "user_list", payload: "lixo" });
        assert.deepEqual(store.getState().people, []);
    });

    test("entrada e saída viram avisos de sistema com o horário do servidor", () => {
        const { store, handle } = setup();
        handle({
            type: "user_joined",
            payload: { userName: "Bia", timestamp: "2026-11-07T10:00:00Z" },
        });
        handle({
            type: "user_left",
            payload: { userName: "Bia", timestamp: "2026-11-07T10:05:00Z" },
        });
        assert.deepEqual(
            store.getState().messages.map((m) => [m.kind, m.content, m.timestamp]),
            [
                ["system", "Bia entrou na sala", "2026-11-07T10:00:00Z"],
                ["system", "Bia saiu da sala", "2026-11-07T10:05:00Z"],
            ],
        );
    });

    test("user_typing de outra pessoa vai para o rastreador; o próprio é ignorado", () => {
        const store = createStore();
        const typing = [];
        const handle = createEventHandler({
            store,
            toasts: { show: () => {} },
            notifier: { show: () => {} },
            typingTracker: { set: (id, name, isTyping) => typing.push([id, name, isTyping]) },
        });
        store.actions.enterRoom({ id: "eu", name: "Eu", username: "eu" });
        handle({
            type: "user_typing",
            payload: { username: "outra", userName: "Bia", isTyping: true },
        });
        handle({
            type: "user_typing",
            payload: { username: "eu", userName: "Eu", isTyping: true },
        });
        handle({ type: "user_typing", payload: { userName: "sem @", isTyping: true } });
        assert.deepEqual(typing, [["outra", "Bia", true]]);
    });

    test("mensagem de outra pessoa notifica; a própria não", () => {
        const store = createStore();
        const notified = [];
        const handle = createEventHandler({
            store,
            toasts: { show: () => {} },
            notifier: { show: (title, body) => notified.push([title, body]) },
            typingTracker: { set: () => {} },
        });
        store.actions.enterRoom({ id: "eu", name: "Eu", username: "eu" });
        handle({
            type: "chat_message",
            id: "1",
            payload: { username: "outra", userName: "Bia", content: "oi" },
        });
        handle({
            type: "chat_message",
            id: "2",
            payload: { username: "eu", userName: "Eu", content: "olá" },
        });
        assert.deepEqual(notified, [["Bia", "oi"]]);
    });

    test("tipo desconhecido é ignorado (compatível com servidor mais novo)", () => {
        const { store, toasts, handle } = setup();
        const before = store.getState();
        handle({ type: "evento_do_futuro", payload: {} });
        assert.equal(store.getState(), before);
        assert.equal(toasts.length, 0);
    });
});
