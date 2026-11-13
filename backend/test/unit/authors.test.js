// Número de autor por conversa (Fase 4): dado pelo servidor, fixo para a vida
// da conversa, sem ligação com o id interno nem com outras conversas.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./harness.js";

/** Ana cria uma sala; Bia e Caio entram nessa ordem. */
const room = () => {
    const ctx = setup();
    const { member, login, hub } = ctx;
    const ana = member("ana");
    const bia = member("bia");
    const caio = member("caio");
    login(ana, { userName: "Ana", username: "ana" });
    login(bia, { userName: "Bia", username: "bia" });
    login(caio, { userName: "Caio", username: "caio" });
    const created = hub.createRoom(ana, { name: "Sala" }).room;
    hub.joinRoom(bia, { code: created.code });
    hub.joinRoom(caio, { code: created.code });
    const say = (m, content, extra = {}) =>
        hub.post(m, { conversationId: created.id, content, ...extra });
    const messages = (m) =>
        ctx.received(m, "chat_message", created.id).map((x) => ({
            username: x.payload.username,
            author: x.payload.author,
            content: x.payload.content,
        }));
    return { ...ctx, ana, bia, caio, created, say, messages };
};

describe("número de autor em salas", () => {
    test("cada participante ganha um número na ordem de entrada", () => {
        const { ana, bia, caio, say, messages, received, created, flushLists } = room();
        say(ana, "a");
        say(bia, "b");
        say(caio, "c");
        assert.deepEqual(
            messages(ana).map((m) => [m.username, m.author]),
            [
                ["ana", 1],
                ["bia", 2],
                ["caio", 3],
            ],
        );
        flushLists();
        const list = received(caio, "user_list", created.id).at(-1).payload;
        assert.deepEqual(list.map((p) => [p.username, p.author]).sort(), [
            ["ana", 1],
            ["bia", 2],
            ["caio", 3],
        ]);
        const joined = received(ana, "user_joined", created.id).map((x) => [
            x.payload.username,
            x.payload.author,
        ]);
        assert.deepEqual(joined, [
            ["bia", 2],
            ["caio", 3],
        ]);
    });

    test("o resumo da sala diz o SEU número", () => {
        const { hub, bia, created } = room();
        assert.equal(created.summaryFor(hub.entryOf(bia).identity).author, 2);
    });

    test("sair e voltar mantém o número; o histórico guarda a autoria de quem saiu", () => {
        const { hub, bia, caio, say, created, received } = room();
        say(bia, "antes de sair");
        hub.leaveRoom(bia, { conversationId: created.id });
        const left = received(caio, "user_left", created.id).at(-1).payload;
        assert.deepEqual([left.username, left.author], ["bia", 2]);
        hub.joinRoom(bia, { code: created.code });
        const history = received(bia, "message_history", created.id).at(-1).payload;
        assert.equal(history.at(-1).payload.author, 2, "mensagem antiga segue com o autor 2");
        say(bia, "voltei");
        assert.equal(received(caio, "chat_message", created.id).at(-1).payload.author, 2);
    });

    test("@ reaproveitado por outra identidade recebe outro número", () => {
        const { hub, member, login, bia, caio, say, created, received } = room();
        say(bia, "sou a Bia original");
        hub.logout(bia);
        const impostora = member("bia-nova");
        login(impostora, { userName: "Bia", username: "bia" });
        hub.joinRoom(impostora, { code: created.code });
        say(impostora, "também sou bia");
        const chats = received(caio, "chat_message", created.id).map((x) => [
            x.payload.username,
            x.payload.author,
        ]);
        assert.deepEqual(chats, [
            ["bia", 2],
            ["bia", 4],
        ]);
    });

    test("o cliente não escolhe o número: o que mandar é ignorado", () => {
        const { ana, bia, say, messages } = room();
        say(bia, "forjado", { author: 1, user: { author: 1 }, username: "ana" });
        assert.deepEqual(messages(ana).at(-1), {
            username: "bia",
            author: 2,
            content: "forjado",
        });
    });

    test("números de conversas diferentes não se relacionam", () => {
        const { hub, ana, bia, caio, created } = room();
        const other = hub.createRoom(caio, { name: "Outra" }).room;
        hub.joinRoom(bia, { code: other.code });
        hub.joinRoom(ana, { code: other.code });
        const authorIn = (r, m) => r.summaryFor(hub.entryOf(m).identity).author;
        assert.deepEqual(
            [ana, bia, caio].map((m) => authorIn(created, m)),
            [1, 2, 3],
        );
        assert.deepEqual(
            [ana, bia, caio].map((m) => authorIn(other, m)),
            [3, 2, 1],
            "cada sala conta do zero, na sua ordem",
        );
        // O número não carrega nada do id interno.
        for (const m of [ana, bia, caio]) {
            const { id } = hub.entryOf(m).identity;
            assert.ok(!String(authorIn(other, m)).includes(id));
        }
    });

    test("quem nunca entrou não tem número", () => {
        const { hub, member, login, created } = room();
        const fora = member("fora");
        login(fora, { userName: "Fora", username: "fora" });
        assert.equal(created.summaryFor(hub.entryOf(fora).identity).author, null);
    });
});

describe("número de autor em conversas privadas", () => {
    test("quem abre é 1, a outra pessoa é 2, nas mensagens e no resumo", () => {
        const ctx = setup();
        const ana = ctx.member("ana");
        const bia = ctx.member("bia");
        ctx.login(ana, { userName: "Ana", username: "ana" });
        ctx.login(bia, { userName: "Bia", username: "bia" });
        const dm = ctx.hub.openDm(ana, { username: "bia" }).conversation;
        ctx.hub.post(ana, { conversationId: dm.id, content: "oi" });
        ctx.hub.post(bia, { conversationId: dm.id, content: "oi!", author: 1 });
        const chats = ctx
            .received(ana, "chat_message", dm.id)
            .map((x) => [x.payload.username, x.payload.author]);
        assert.deepEqual(chats, [
            ["ana", 1],
            ["bia", 2],
        ]);
        const opened = ctx.received(bia, "dm_opened", dm.id).at(-1).payload;
        assert.equal(opened.author, 2);
        assert.equal(opened.peer.author, 1);
    });
});
