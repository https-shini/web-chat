// Fase 4, continuação: quem saiu, cor por autor, não lidas com a aba
// escondida. (Rascunhos e conversa privada pelo cartão são de main.js e
// têm teste no navegador.)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createEventHandler } from "../src/state/events.js";
import { createStore, authorKey } from "../src/state/store.js";
import { departedAuthors } from "../src/state/departed.js";
import { hueForAuthor, hueFor } from "../src/ui/identity.js";

const A = "r_salaA0000001";
const B = "r_salaB0000002";

const setup = () => {
    const store = createStore();
    const handle = createEventHandler({
        store,
        toasts: { show: () => {} },
        notifier: { show: () => {} },
        typingTracker: { set: () => {}, remove: () => {} },
    });
    store.actions.startJoin({ id: "eu", name: "Eu", username: "eu" });
    handle({ type: "session", payload: { username: "eu", name: "Eu", resumeToken: "t" } });
    const room = (id, author = 1) =>
        handle({
            type: "room_joined",
            conversationId: id,
            payload: { code: "abc-defg-hij", name: id, role: "member", author, historyVersion: 0 },
        });
    const list = (id, people) =>
        handle({
            type: "user_list",
            conversationId: id,
            payload: people.map(([username, author]) => ({ name: username, username, author })),
        });
    const say = (id, msgId, username, author) =>
        handle({
            type: "chat_message",
            id: msgId,
            conversationId: id,
            payload: { username, userName: username, author, content: msgId },
        });
    return { store, handle, room, list, say };
};

describe("quem saiu da conversa", () => {
    test("chave de autor: @ mais o número; sem número não há chave", () => {
        assert.equal(authorKey("bia", 2), "bia#2");
        assert.equal(authorKey("bia", null), null);
        assert.equal(authorKey(undefined, 2), null);
    });

    test("quem sai fica marcado; quem volta (mesmo número) deixa de estar", () => {
        const { store, handle, room, list, say } = setup();
        room(A);
        list(A, [
            ["eu", 1],
            ["bia", 2],
        ]);
        say(A, "m1", "bia", 2);
        assert.deepEqual([...departedAuthors(store.getState())], []);
        handle({
            type: "user_left",
            conversationId: A,
            payload: { userName: "Bia", username: "bia", author: 2 },
        });
        assert.deepEqual([...departedAuthors(store.getState())], ["bia#2"]);
        handle({
            type: "user_joined",
            conversationId: A,
            payload: { userName: "Bia", username: "bia", author: 2 },
        });
        assert.deepEqual([...departedAuthors(store.getState())], []);
    });

    test("@ reaproveitado: a pessoa nova não tira a marca da antiga", () => {
        const { store, handle, room, list, say } = setup();
        room(A);
        list(A, [
            ["eu", 1],
            ["bia", 2],
        ]);
        say(A, "m1", "bia", 2);
        handle({ type: "user_left", conversationId: A, payload: { username: "bia", author: 2 } });
        handle({ type: "user_joined", conversationId: A, payload: { username: "bia", author: 4 } });
        list(A, [
            ["eu", 1],
            ["bia", 4],
        ]);
        say(A, "m2", "bia", 4);
        assert.deepEqual([...departedAuthors(store.getState())], ["bia#2"]);
    });

    test("quem escreveu no histórico e não está na sala desde que você entrou saiu", () => {
        const { store, handle, room, list } = setup();
        room(A, 3);
        handle({
            type: "message_history",
            conversationId: A,
            payload: [
                {
                    id: "h1",
                    payload: { username: "ana", userName: "Ana", author: 1, content: "x" },
                },
                {
                    id: "h2",
                    payload: { username: "bia", userName: "Bia", author: 2, content: "y" },
                },
            ],
        });
        assert.deepEqual(
            [...departedAuthors(store.getState())],
            [],
            "sem lista ainda, ninguém é marcado",
        );
        list(A, [
            ["bia", 2],
            ["eu", 3],
        ]);
        assert.deepEqual([...departedAuthors(store.getState())], ["ana#1"]);
    });

    test("a marca acompanha cada conversa, também quando ela não está aberta", () => {
        const { store, handle, room, list, say } = setup();
        room(A);
        room(B);
        list(B, [
            ["eu", 1],
            ["caio", 2],
        ]);
        say(B, "b1", "caio", 2);
        handle({ type: "user_left", conversationId: B, payload: { username: "caio", author: 2 } });
        assert.deepEqual(
            [...departedAuthors(store.getState())],
            [],
            "a aberta (A) não tem ninguém marcado",
        );
        store.actions.openConversation(B);
        assert.deepEqual([...departedAuthors(store.getState())], ["caio#2"]);
        store.actions.openConversation(A);
        store.actions.openConversation(B);
        assert.deepEqual([...departedAuthors(store.getState())], ["caio#2"], "sobrevive à troca");
    });

    test("conversa privada não marca ninguém", () => {
        const state = {
            room: { conversationId: "d_x", kind: "dm", name: "Bia", role: "member" },
            authorsLeft: ["bia#2"],
            authorsSeen: ["bia#2"],
            messages: [],
        };
        assert.equal(departedAuthors(/** @type {any} */ (state)).size, 0);
    });
});

describe("cor por autor", () => {
    test("números seguidos têm cores diferentes até a paleta dar a volta", () => {
        const hues = [1, 2, 3, 4, 5, 6].map(hueForAuthor);
        assert.equal(new Set(hues).size, 6);
        assert.equal(hueForAuthor(7), hueForAuthor(1));
        for (const n of [0, -3, 2.7]) {
            const hue = hueForAuthor(n);
            assert.ok(hue >= 1 && hue <= 6, String(n));
        }
    });

    test("a cor não depende do @ (dois @ com o mesmo número, mesma cor na conversa)", () => {
        assert.equal(hueForAuthor(3), hueForAuthor(3));
        assert.ok(hueFor("qualquer") >= 1 && hueFor("qualquer") <= 6, "reserva sem número");
    });
});

describe("não lidas com a aba escondida", () => {
    test("na conversa aberta, só contam com a aba escondida; voltar zera", () => {
        const { store, room, say } = setup();
        room(A);
        say(A, "m1", "bia", 2);
        assert.equal(store.getState().conversations[0]?.unread, 0);
        store.actions.setPageVisible(false);
        say(A, "m2", "bia", 2);
        say(A, "m3", "eu", 1);
        assert.equal(store.getState().conversations[0]?.unread, 1, "a sua não conta");
        store.actions.setPageVisible(true);
        assert.equal(store.getState().conversations[0]?.unread, 0);
    });

    test("trocar de conversa preserva as contagens das outras", () => {
        const { store, room, say } = setup();
        room(A);
        room(B);
        say(B, "b1", "bia", 2);
        say(B, "b2", "bia", 2);
        store.actions.setPageVisible(false);
        say(A, "a1", "ana", 2);
        store.actions.setPageVisible(true);
        const unread = () =>
            Object.fromEntries(
                store.getState().conversations.map((c) => [c.conversationId, c.unread]),
            );
        assert.deepEqual(unread(), { [A]: 0, [B]: 2 });
        store.actions.openConversation(B);
        assert.deepEqual(unread(), { [A]: 0, [B]: 0 });
    });

    test("sair do chat não esquece se a aba está escondida", () => {
        const { store } = setup();
        store.actions.setPageVisible(false);
        store.actions.leaveRoom();
        assert.equal(store.getState().pageVisible, false);
    });
});

describe("ciclo de envio: enviando, enviada, falha, reenvio", () => {
    const pending = (clientMsgId) => ({
        id: `local:${clientMsgId}`,
        key: `c:${clientMsgId}`,
        kind: /** @type {const} */ ("chat"),
        userId: "eu",
        userName: "Eu",
        username: "eu",
        content: "texto",
        timestamp: new Date().toISOString(),
        own: true,
        clientMsgId,
        delivery: /** @type {const} */ ("pending"),
        sentAt: 1,
    });

    const wired = () => {
        const store = createStore();
        const calls = { confirmed: [], rejected: [] };
        const handle = createEventHandler({
            store,
            toasts: { show: () => {} },
            notifier: { show: () => {} },
            typingTracker: { set: () => {} },
            onOwnConfirmed: (id) => calls.confirmed.push(id),
            onSendRejected: (id, code) => calls.rejected.push([id, code]),
        });
        store.actions.startJoin({ id: "eu", name: "Eu", username: "eu" });
        handle({ type: "session", payload: { username: "eu", name: "Eu", resumeToken: "t" } });
        handle({
            type: "room_joined",
            conversationId: A,
            payload: {
                code: "abc-defg-hij",
                name: "A",
                role: "member",
                author: 1,
                historyVersion: 0,
            },
        });
        return { store, handle, calls };
    };

    test("confirmação do servidor avisa (o rascunho em trânsito pode ser liberado)", () => {
        const { store, handle, calls } = wired();
        store.actions.addMessage(pending("c1"));
        handle({
            type: "chat_message",
            id: "srv-1",
            conversationId: A,
            payload: {
                username: "eu",
                userName: "Eu",
                author: 1,
                content: "texto",
                clientMsgId: "c1",
            },
        });
        assert.deepEqual(calls.confirmed, ["c1"]);
        assert.equal(store.getState().messages.length, 1, "confirmação não duplica");
        assert.equal(store.getState().messages[0]?.delivery, "confirmed");
    });

    test("confirmação que chega no histórico (depois de uma queda) também conta", () => {
        const { store, handle, calls } = wired();
        store.actions.addMessage(pending("c2"));
        handle({
            type: "message_history",
            conversationId: A,
            payload: [
                {
                    id: "srv-2",
                    payload: {
                        username: "eu",
                        userName: "Eu",
                        author: 1,
                        content: "texto",
                        clientMsgId: "c2",
                    },
                },
            ],
        });
        assert.deepEqual(calls.confirmed, ["c2"]);
        assert.equal(store.getState().messages.length, 1);
    });

    test("recusa com ref marca a falha e avisa com o código", () => {
        const { store, handle, calls } = wired();
        store.actions.addMessage(pending("c3"));
        handle({ type: "error", payload: { code: "muted", message: "silenciado", ref: "c3" } });
        assert.equal(store.getState().messages[0]?.delivery, "failed");
        assert.deepEqual(calls.rejected, [["c3", "muted"]]);
        // Recusa de algo que não é sua mensagem pendente não avisa.
        handle({ type: "error", payload: { code: "muted", message: "x", ref: "outra" } });
        assert.equal(calls.rejected.length, 1);
    });

    test("falha pode sair da tela (o texto volta ao rascunho); pendente e confirmada, não", () => {
        const { store } = wired();
        store.actions.addMessage(pending("c4"));
        assert.equal(store.actions.discardFailed("c4"), false, "pendente ainda pode chegar");
        store.actions.failMessage("c4", "silenciado");
        assert.equal(store.actions.discardFailed("c4"), true);
        assert.equal(store.getState().messages.length, 0);
    });

    test("reenvio conta a tentativa e mantém o mesmo clientMsgId (sem duplicar)", () => {
        const { store, handle } = wired();
        store.actions.addMessage(pending("c5"));
        store.actions.failMessage("c5", "sem resposta");
        store.actions.retryMessage("c5", 2);
        assert.equal(store.getState().messages[0]?.attempt, 2);
        assert.equal(store.getState().messages[0]?.delivery, "pending");
        store.actions.failMessage("c5", "sem resposta");
        store.actions.retryMessage("c5", 3);
        assert.equal(store.getState().messages[0]?.attempt, 3);
        // O servidor devolve a original (deduplicada): uma mensagem só.
        handle({
            type: "chat_message",
            id: "srv-5",
            conversationId: A,
            payload: {
                username: "eu",
                userName: "Eu",
                author: 1,
                content: "texto",
                clientMsgId: "c5",
            },
        });
        handle({
            type: "chat_message",
            id: "srv-5",
            conversationId: A,
            payload: {
                username: "eu",
                userName: "Eu",
                author: 1,
                content: "texto",
                clientMsgId: "c5",
            },
        });
        assert.equal(store.getState().messages.length, 1);
        assert.equal(store.getState().messages[0]?.delivery, "confirmed");
    });
});

describe("notificação do sistema sem conteúdo", () => {
    test("leva só onde há mensagem nova: nem texto, nem quem escreveu; uma por conversa", () => {
        const store = createStore();
        const shown = [];
        const handle = createEventHandler({
            store,
            toasts: { show: () => {} },
            notifier: { show: (title, body, tag) => shown.push({ title, body, tag }) },
            typingTracker: { set: () => {} },
        });
        store.actions.startJoin({ id: "eu", name: "Eu", username: "eu" });
        handle({ type: "session", payload: { username: "eu", name: "Eu", resumeToken: "t" } });
        handle({
            type: "room_joined",
            conversationId: A,
            payload: {
                code: "abc-defg-hij",
                name: "Estudos",
                role: "member",
                author: 1,
                historyVersion: 0,
            },
        });
        handle({
            type: "dm_opened",
            conversationId: "d_x",
            payload: {
                peer: { name: "Bia", username: "bia", online: true, author: 1 },
                author: 2,
                historyVersion: 0,
            },
        });
        const secret = "senha do wifi é 1234";
        handle({
            type: "chat_message",
            id: "m1",
            conversationId: A,
            payload: { username: "ana", userName: "Ana", author: 2, content: secret },
        });
        handle({
            type: "chat_message",
            id: "m2",
            conversationId: "d_x",
            payload: { username: "bia", userName: "Bia", author: 1, content: secret },
        });
        handle({
            type: "chat_message",
            id: "m3",
            conversationId: A,
            payload: { username: "eu", userName: "Eu", author: 1, content: "minha" },
        });
        assert.deepEqual(shown, [
            { title: "Estudos", body: "Nova mensagem", tag: A },
            { title: "Conversa privada", body: "Nova mensagem", tag: "d_x" },
        ]);
        assert.ok(
            !JSON.stringify(shown).includes(secret) && !JSON.stringify(shown).includes("Bia"),
        );
    });
});

describe("limite de mensagens por conversa", () => {
    test("a conversa guarda as mais recentes; a de fundo também", async () => {
        const { MAX_MESSAGES_PER_CONVERSATION } = await import("../src/state/store.js");
        const { store, room, say } = setup();
        room(A);
        room(B);
        const extra = 20;
        for (let i = 0; i < MAX_MESSAGES_PER_CONVERSATION + extra; i += 1) {
            say(A, `a${i}`, "bia", 2);
            say(B, `b${i}`, "bia", 2);
        }
        const open = store.getState().messages;
        assert.equal(open.length, MAX_MESSAGES_PER_CONVERSATION);
        assert.equal(open[0]?.id, `a${extra}`, "saem as mais antigas");
        assert.equal(open.at(-1)?.id, `a${MAX_MESSAGES_PER_CONVERSATION + extra - 1}`);
        store.actions.openConversation(B);
        assert.equal(store.getState().messages.length, MAX_MESSAGES_PER_CONVERSATION);
        assert.equal(store.getState().conversations.find((c) => c.conversationId === B)?.unread, 0);
    });
});

describe("mensagens recebidas durante a queda", () => {
    test("retomada: o que chegou numa conversa de fundo conta como não lido, sem duplicar", () => {
        const { store, handle, room, say } = setup();
        room(A);
        room(B);
        say(B, "b1", "bia", 2);
        store.actions.openConversation(B);
        store.actions.openConversation(A);
        // Queda e volta: o servidor reenvia o resumo (resumed) e o histórico.
        const resumed = (id) =>
            handle({
                type: "room_joined",
                conversationId: id,
                payload: {
                    code: "abc-defg-hij",
                    name: id,
                    role: "member",
                    author: 1,
                    historyVersion: 0,
                    resumed: true,
                },
            });
        resumed(A);
        resumed(B);
        handle({
            type: "message_history",
            conversationId: B,
            payload: [
                {
                    id: "b1",
                    payload: { username: "bia", userName: "Bia", author: 2, content: "b1" },
                },
                {
                    id: "b2",
                    payload: {
                        username: "bia",
                        userName: "Bia",
                        author: 2,
                        content: "durante a queda",
                    },
                },
                {
                    id: "b3",
                    payload: { username: "eu", userName: "Eu", author: 1, content: "minha" },
                },
            ],
        });
        const b = store.getState().conversations.find((c) => c.conversationId === B);
        assert.equal(b?.unread, 1, "só a mensagem nova de outra pessoa");
        store.actions.openConversation(B);
        assert.deepEqual(
            store.getState().messages.map((m) => m.id),
            ["b1", "b2", "b3"],
        );
    });

    test("primeira entrada numa sala: histórico antigo não conta", () => {
        const { store, handle, room } = setup();
        room(A);
        handle({
            type: "room_joined",
            conversationId: B,
            payload: {
                code: "abc-defg-hij",
                name: "B",
                role: "member",
                author: 3,
                historyVersion: 0,
            },
        });
        handle({
            type: "message_history",
            conversationId: B,
            payload: [
                {
                    id: "old",
                    payload: { username: "bia", userName: "Bia", author: 2, content: "antiga" },
                },
            ],
        });
        assert.equal(store.getState().conversations.find((c) => c.conversationId === B)?.unread, 0);
    });
});
