// Várias conversas ao mesmo tempo (Fase 4): lista, não lidas, troca sem
// perder nada, conversas privadas, saída e isolamento.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createEventHandler } from "../src/state/events.js";
import { createStore } from "../src/state/store.js";

const A = "r_salaA0000001";
const B = "r_salaB0000002";
const DM = "d_privada00001";

const setup = () => {
    const store = createStore();
    const calls = { left: [], closed: [], dms: [], typing: [], lookups: [], refused: [] };
    const handle = createEventHandler({
        store,
        toasts: { show: () => {} },
        notifier: { show: () => {} },
        typingTracker: { set: (id, _name, on) => calls.typing.push([id, on]) },
        onRoomLeft: (reason, room) => calls.left.push([reason, room?.name ?? null]),
        onDmOpened: (dm, how) => calls.dms.push([dm.peer?.username, how.created]),
        onDmClosed: (reason, dm) => calls.closed.push([reason, dm?.peer?.username ?? null]),
        onLookup: (requestId, user) => calls.lookups.push([requestId, user]),
        onDmRefused: (code) => calls.refused.push(code),
    });
    store.actions.startJoin({ id: "eu", name: "Eu", username: "eu" });
    handle({ type: "session", payload: { username: "eu", name: "Eu", resumeToken: "t" } });
    const room = (id, name, author) =>
        handle({
            type: "room_joined",
            conversationId: id,
            payload: {
                code: `${name.toLowerCase()}-defg-hij`,
                name,
                role: "member",
                author,
                historyVersion: 0,
            },
        });
    const say = (id, msgId, username, content, author = 2, extra = {}) =>
        handle({
            type: "chat_message",
            id: msgId,
            conversationId: id,
            payload: { username, userName: username.toUpperCase(), author, content, ...extra },
        });
    const dmOpened = (online = true, created = true) =>
        handle({
            type: "dm_opened",
            conversationId: DM,
            payload: {
                kind: "dm",
                peer: { name: "Bia", username: "bia", online, author: 2 },
                author: 1,
                historyVersion: 0,
                created,
            },
        });
    return { store, handle, calls, room, say, dmOpened };
};

const contents = (store) => store.getState().messages.map((m) => m.content);
const unread = (store, id) =>
    store.getState().conversations.find((c) => c.conversationId === id)?.unread;

describe("lista de conversas", () => {
    test("a primeira conversa abre; a segunda entra na lista sem tirar a primeira da tela", () => {
        const { store, room } = setup();
        room(A, "Sala A", 1);
        assert.equal(store.getState().screen, "room");
        room(B, "Sala B", 3);
        assert.equal(store.getState().room?.conversationId, A);
        assert.deepEqual(
            store
                .getState()
                .conversations.map((c) => [c.conversationId, c.name, c.author, c.unread]),
            [
                [A, "Sala A", 1, 0],
                [B, "Sala B", 3, 0],
            ],
        );
    });

    test("mensagens de outra conversa ficam guardadas e contam como não lidas", () => {
        const { store, room, say } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 1);
        say(A, "a1", "ana", "na A");
        say(B, "b1", "beto", "na B");
        say(B, "b2", "beto", "de novo na B");
        assert.deepEqual(contents(store), ["na A"], "a tela só mostra a conversa aberta");
        assert.equal(unread(store, B), 2);
        assert.equal(unread(store, A), 0);
    });

    test("trocar de conversa mostra o que chegou e volta à anterior sem perder nada", () => {
        const { store, room, say } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 1);
        say(A, "a1", "ana", "na A");
        say(B, "b1", "beto", "na B");
        assert.equal(store.actions.openConversation(B), true);
        assert.deepEqual(contents(store), ["na B"]);
        assert.equal(unread(store, B), 0);
        say(A, "a2", "ana", "enquanto eu estava na B");
        assert.equal(unread(store, A), 1);
        store.actions.openConversation(A);
        assert.deepEqual(contents(store), ["na A", "enquanto eu estava na B"]);
        assert.equal(store.actions.openConversation("r_naoexiste000"), false);
    });

    test("a lista de pessoas e o histórico de cada conversa ficam separados", () => {
        const { store, handle, room } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 1);
        handle({
            type: "user_list",
            conversationId: B,
            payload: [{ name: "Beto", username: "beto", author: 2 }],
        });
        handle({
            type: "message_history",
            conversationId: B,
            payload: [
                {
                    id: "h1",
                    payload: { username: "beto", userName: "Beto", content: "antiga", author: 2 },
                },
                {
                    id: "h1",
                    payload: { username: "beto", userName: "Beto", content: "antiga", author: 2 },
                },
            ],
        });
        assert.deepEqual(store.getState().people, []);
        assert.equal(unread(store, B), 0, "histórico não conta como não lido");
        store.actions.openConversation(B);
        assert.deepEqual(
            store.getState().people.map((p) => p.username),
            ["beto"],
        );
        assert.deepEqual(contents(store), ["antiga"], "sem duplicar");
    });

    test("sua mensagem e avisos em outra conversa não contam como não lidos", () => {
        const { store, handle, room, say } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 4);
        say(B, "b1", "eu", "minha", 4);
        handle({
            type: "user_joined",
            conversationId: B,
            payload: { userName: "Caio", username: "caio" },
        });
        handle({ type: "notice", conversationId: B, payload: { text: "aviso" } });
        assert.equal(unread(store, B), 0);
        store.actions.openConversation(B);
        assert.equal(store.getState().messages.find((m) => m.content === "minha")?.own, true);
    });

    test("'você' em cada conversa é o SEU número naquela conversa", () => {
        const { store, room, say } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 5);
        // Na B você é o 5: a mensagem com o seu @ e número 1 é de outra pessoa.
        say(B, "b1", "eu", "de quem usou o @ antes", 1);
        say(B, "b2", "eu", "minha", 5);
        store.actions.openConversation(B);
        assert.deepEqual(
            store.getState().messages.map((m) => [m.content, m.own]),
            [
                ["de quem usou o @ antes", false],
                ["minha", true],
            ],
        );
    });

    test("mensagem sua confirmada depois que você trocou de conversa", () => {
        const { store, room, say } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 1);
        store.actions.addMessage({
            id: "local:c1",
            key: "c:c1",
            kind: "chat",
            userId: "eu",
            userName: "Eu",
            username: "eu",
            content: "enviando",
            timestamp: new Date().toISOString(),
            own: true,
            clientMsgId: "c1",
            delivery: "pending",
            sentAt: Date.now(),
        });
        store.actions.openConversation(B);
        say(A, "srv-1", "eu", "enviando", 1, { clientMsgId: "c1" });
        store.actions.openConversation(A);
        const [message] = store.getState().messages;
        assert.equal(message?.delivery, "confirmed");
        assert.equal(message?.id, "srv-1");
        assert.equal(store.getState().messages.length, 1);
        assert.equal(unread(store, A), 0, "a confirmação não é mensagem nova");
    });

    test("digitação de outra conversa não aparece na aberta", () => {
        const { calls, handle, room } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 1);
        handle({
            type: "user_typing",
            conversationId: B,
            payload: { username: "beto", isTyping: true },
        });
        handle({
            type: "user_typing",
            conversationId: A,
            payload: { username: "ana", isTyping: true },
        });
        assert.deepEqual(calls.typing, [["ana", true]]);
    });

    test("evento de conversa que não está na lista é ignorado", () => {
        const { store, room, say } = setup();
        room(A, "Sala A", 1);
        say("r_estranha00000", "x1", "x", "intrusa");
        assert.deepEqual(contents(store), []);
        assert.equal(store.getState().conversations.length, 1);
    });
});

describe("início e saída", () => {
    test("sem convite, a sessão leva ao início; criar uma sala a abre", () => {
        const store = createStore();
        const handle = createEventHandler({
            store,
            toasts: { show: () => {} },
            notifier: { show: () => {} },
            typingTracker: { set: () => {} },
        });
        store.actions.startJoin({ id: "eu", name: "Eu", username: "eu" });
        handle({ type: "session", payload: { username: "eu", name: "Eu", resumeToken: "t" } });
        store.actions.completeLogin();
        assert.equal(store.getState().screen, "home");
        handle({
            type: "room_joined",
            conversationId: A,
            payload: { code: "abc-defg-hij", name: "Sala A", role: "host", historyVersion: 0 },
        });
        // No início, conversa nova entra na lista; quem decide abrir é a interface.
        assert.equal(store.getState().conversations.length, 1);
        store.actions.openConversation(A);
        assert.equal(store.getState().screen, "room");
    });

    test("voltar ao início guarda a conversa aberta, que continua recebendo", () => {
        const { store, room, say } = setup();
        room(A, "Sala A", 1);
        say(A, "a1", "ana", "antes");
        store.actions.goHome();
        assert.equal(store.getState().screen, "home");
        assert.equal(store.getState().room, null);
        say(A, "a2", "ana", "no início");
        assert.equal(unread(store, A), 1);
        store.actions.openConversation(A);
        assert.deepEqual(contents(store), ["antes", "no início"]);
    });

    test("sair da sala aberta abre a próxima; sair da última volta ao início", () => {
        const { store, handle, calls, room } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 1);
        handle({ type: "room_left", conversationId: A, payload: { reason: "removed" } });
        assert.deepEqual(calls.left, [["removed", "Sala A"]]);
        assert.equal(store.getState().room?.conversationId, B);
        handle({ type: "room_left", conversationId: B, payload: { reason: "left" } });
        assert.equal(store.getState().room, null);
        assert.equal(store.getState().screen, "home");
        assert.deepEqual(store.getState().conversations, []);
    });

    test("sair de uma sala que não está aberta não mexe na tela", () => {
        const { store, handle, room, say } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 1);
        say(A, "a1", "ana", "fica");
        handle({ type: "room_left", conversationId: B, payload: { reason: "left" } });
        assert.equal(store.getState().room?.conversationId, A);
        assert.deepEqual(contents(store), ["fica"]);
    });
});

describe("conversas privadas", () => {
    test("a conversa aparece na lista com a outra pessoa e os números de autor", () => {
        const { store, calls, room, dmOpened } = setup();
        room(A, "Sala A", 1);
        dmOpened();
        const dm = store.getState().conversations.find((c) => c.conversationId === DM);
        assert.deepEqual(
            { kind: dm?.kind, name: dm?.name, author: dm?.author, peer: dm?.peer },
            {
                kind: "dm",
                name: "Bia",
                author: 1,
                peer: { name: "Bia", username: "bia", online: true, author: 2 },
            },
        );
        assert.deepEqual(calls.dms, [["bia", true]]);
        assert.equal(store.getState().room?.conversationId, A, "chegar não rouba a tela");
    });

    test("alguém começa a conversa: a primeira mensagem (no histórico) conta como não lida", () => {
        const { store, handle, room } = setup();
        room(A, "Sala A", 1);
        handle({
            type: "dm_opened",
            conversationId: DM,
            payload: {
                peer: { name: "Bia", username: "bia", online: true, author: 1 },
                author: 2,
                historyVersion: 0,
                created: true,
            },
        });
        handle({
            type: "message_history",
            conversationId: DM,
            payload: [
                {
                    id: "p1",
                    payload: { username: "bia", userName: "Bia", content: "oi", author: 1 },
                },
            ],
        });
        assert.equal(unread(store, DM), 1);
        // Numa retomada (sem `created`), o histórico já foi visto: não conta.
        handle({
            type: "message_history",
            conversationId: DM,
            payload: [
                {
                    id: "p2",
                    payload: { username: "bia", userName: "Bia", content: "de novo", author: 1 },
                },
            ],
        });
        assert.equal(unread(store, DM), 1);
    });

    test("presença da outra pessoa atualiza a lista e a conversa aberta", () => {
        const { store, handle, dmOpened } = setup();
        dmOpened();
        assert.equal(store.getState().room?.conversationId, DM);
        handle({
            type: "dm_updated",
            conversationId: DM,
            payload: {
                peer: { name: "Bia", username: "bia", online: false, author: 2 },
                author: 1,
            },
        });
        assert.equal(store.getState().room?.peer?.online, false);
        assert.equal(store.getState().conversations[0]?.peer?.online, false);
    });

    test("resumo sem @ da outra pessoa é recusado", () => {
        const { store, handle } = setup();
        handle({ type: "dm_opened", conversationId: DM, payload: { peer: { name: "X" } } });
        assert.equal(store.getState().conversations.length, 0);
    });

    test("encerrada pela outra pessoa: sai da lista e avisa com o motivo", () => {
        const { store, handle, calls, room, dmOpened } = setup();
        room(A, "Sala A", 1);
        dmOpened();
        handle({ type: "dm_closed", conversationId: DM, payload: { reason: "closed" } });
        assert.deepEqual(calls.closed, [["closed", "bia"]]);
        assert.deepEqual(
            store.getState().conversations.map((c) => c.conversationId),
            [A],
        );
    });

    test("busca por @: achou, não achou e recusa vão para quem pediu", () => {
        const { calls, handle } = setup();
        handle({
            type: "user_lookup",
            payload: { found: true, user: { name: "Bia", username: "bia" }, requestId: "q1" },
        });
        handle({ type: "user_lookup", payload: { found: false } });
        handle({ type: "error", payload: { code: "user_unavailable", message: "não" } });
        handle({ type: "error", payload: { code: "lookup_limited", message: "calma" } });
        assert.deepEqual(calls.lookups, [
            ["q1", { name: "Bia", username: "bia" }],
            [null, null],
        ]);
        assert.deepEqual(calls.refused, ["user_unavailable", "lookup_limited"]);
    });
});

describe("menções", () => {
    const mentions = (store, id) =>
        store.getState().conversations.find((c) => c.conversationId === id)?.mentions ?? 0;

    test("menção em outra conversa conta à parte, avisa e some ao abrir", () => {
        const toasts = [];
        const notes = [];
        const store = createStore();
        const handle = createEventHandler({
            store,
            toasts: { show: (text) => toasts.push(text) },
            notifier: { show: (title, body) => notes.push(body) },
            typingTracker: { set: () => {} },
        });
        store.actions.startJoin({ id: "eva", name: "Eva", username: "eva" });
        handle({ type: "session", payload: { username: "eva", name: "Eva", resumeToken: "t" } });
        for (const [id, name] of [
            [A, "Sala A"],
            [B, "Sala B"],
        ]) {
            handle({
                type: "room_joined",
                conversationId: id,
                payload: {
                    code: "abc-defg-hij",
                    name,
                    role: "member",
                    author: 1,
                    historyVersion: 0,
                },
            });
        }
        const say = (id, msgId, content) =>
            handle({
                type: "chat_message",
                id: msgId,
                conversationId: id,
                payload: { username: "bia", userName: "Bia", author: 2, content },
            });
        say(B, "b1", "oi pessoal");
        say(B, "b2", "@eva olha isso");
        say(B, "b3", "`@eva` em código não é menção");
        assert.equal(unread(store, B), 3);
        assert.equal(mentions(store, B), 1);
        assert.deepEqual(toasts, ["Bia mencionou você em Sala B."]);
        assert.deepEqual(notes, ["Nova mensagem", "Mencionaram você", "Nova mensagem"]);
        // Na conversa aberta, a menção não vira aviso (a mensagem já se destaca).
        say(A, "a1", "@eva aqui");
        assert.equal(toasts.length, 1);
        store.actions.openConversation(B);
        assert.equal(unread(store, B), 0);
        assert.equal(mentions(store, B), 0);
    });

    test("aviso de sistema numa conversa de fundo não zera as não lidas", () => {
        const { store, room, say, handle } = setup();
        room(A, "Sala A", 1);
        room(B, "Sala B", 1);
        say(B, "b1", "beto", "na B");
        handle({
            type: "user_joined",
            conversationId: B,
            payload: { userName: "Caio", username: "caio" },
        });
        assert.equal(unread(store, B), 1);
    });
});
