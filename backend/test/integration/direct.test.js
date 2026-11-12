// Conversas privadas com o servidor real (processo filho e clientes `ws`):
// busca por @, abrir, isolamento, bloqueio, encerramento, retomada, limites
// e reinício do servidor.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { connect, join, startServer } from "./helpers.js";

let seq = 0;
/** Conecta e começa a sessão com um @ único, sem entrar em sala. */
const person = async (url, userName) => {
    seq += 1;
    const username = `${userName.toLowerCase()}_${seq}`;
    const { client, session } = await join(url, { userName, username }, undefined, { room: false });
    return { client, me: session, username };
};

/** Abre a conversa privada e devolve `dm_opened` ou o erro. */
const openDm = async (client, payload) => {
    client.send("dm_open", payload);
    return client.take((m) => m.type === "dm_opened" || m.type === "error");
};

/** Barreira: `/ping` volta depois de tudo o que o servidor já tinha a entregar. */
const settle = async (client) => {
    const requestId = `sync-${++seq}`;
    client.send("command", { requestId, text: "/ping", conversationId: undefined });
    await client.take((m) => m.type === "command_result" && m.payload.requestId === requestId);
};

describe("conversas privadas", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("busca pelo @ exato; prefixo, inexistente e desconectado não aparecem", async () => {
        const ana = await person(server.url, "Ana");
        const bia = await person(server.url, "Bia");
        ana.client.send("user_lookup", {
            username: `@${bia.username.toUpperCase()}`,
            requestId: "b1",
        });
        const found = (await ana.client.take("user_lookup")).payload;
        assert.deepEqual(found, {
            found: true,
            user: { id: bia.me.id, name: "Bia", username: bia.username },
            requestId: "b1",
        });
        for (const username of [bia.username.slice(0, 4), "ninguem_aqui"]) {
            ana.client.send("user_lookup", { username });
            assert.deepEqual((await ana.client.take("user_lookup")).payload, { found: false });
        }
        ana.client.send("user_lookup", { username: "a b" });
        assert.equal((await ana.client.take("error")).payload.code, "invalid_user");
        bia.client.ws.terminate();
        await server.waitForLog((e) => e.event === "session_paused" && e.user === bia.me.id);
        ana.client.send("user_lookup", { username: bia.username });
        assert.equal((await ana.client.take("user_lookup")).payload.found, false);
        ana.client.close();
    });

    test("abrir, conversar nos dois sentidos, e ninguém mais recebe nada", async () => {
        const ana = await person(server.url, "Ana");
        const bia = await person(server.url, "Bia");
        const caio = await person(server.url, "Caio");
        const opened = await openDm(ana.client, { username: bia.username });
        assert.equal(opened.type, "dm_opened");
        const id = opened.conversationId;
        assert.match(id, /^d_/);
        assert.equal(opened.payload.peer.id, bia.me.id);
        await settle(bia.client);
        assert.equal(bia.client.count("dm_opened"), 0, "abrir não avisa a outra pessoa");

        ana.client.send("chat_message", {
            conversationId: id,
            content: "oi Bia",
            clientMsgId: "p1",
        });
        const theirs = await bia.client.take("dm_opened");
        assert.equal(theirs.conversationId, id);
        assert.equal(theirs.payload.peer.id, ana.me.id);
        const history = await bia.client.take("message_history");
        assert.equal(history.conversationId, id);
        assert.equal(history.payload[0].payload.content, "oi Bia");

        bia.client.send("chat_message", { conversationId: id, content: "oi Ana" });
        const reply = await ana.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "oi Ana",
        );
        assert.equal(reply.conversationId, id);
        assert.equal(reply.payload.userId, bia.me.id);
        bia.client.send("typing_start", { conversationId: id });
        assert.equal((await ana.client.take("user_typing")).conversationId, id);

        // Caio sabe o id e mesmo assim não lê, não escreve e não encerra.
        caio.client.send("chat_message", {
            conversationId: id,
            content: "entrei?",
            clientMsgId: "x1",
        });
        const refused = await caio.client.take("error");
        assert.equal(refused.payload.code, "conversation_not_found");
        assert.equal(refused.payload.ref, "x1");
        caio.client.send("dm_close", { conversationId: id });
        assert.equal((await caio.client.take("error")).payload.code, "conversation_not_found");
        caio.client.send("typing_start", { conversationId: id });
        await settle(caio.client);
        await settle(ana.client);
        assert.deepEqual(
            caio.client.inbox.filter((m) => m.conversationId === id && m.type !== "error"),
            [],
        );
        assert.equal(
            ana.client.count((m) => m.payload?.content === "entrei?"),
            0,
        );

        ana.client.send("room_list", {});
        const list = (await ana.client.take("room_list")).payload;
        assert.deepEqual(
            list.dms.map((d) => [d.conversationId, d.peer.username]),
            [[id, bia.username]],
        );
        for (const p of [ana, bia, caio]) p.client.close();
    });

    test("encerrar apaga para as duas; abrir de novo começa vazio", async () => {
        const ana = await person(server.url, "Ana");
        const bia = await person(server.url, "Bia");
        const { conversationId } = await openDm(ana.client, { userId: bia.me.id });
        ana.client.send("chat_message", { conversationId, content: "vai sumir" });
        await bia.client.take("message_history");
        bia.client.send("dm_close", { conversationId });
        for (const p of [ana, bia]) {
            const closed = await p.client.take("dm_closed");
            assert.equal(closed.conversationId, conversationId);
            assert.equal(closed.payload.reason, "closed");
        }
        ana.client.send("chat_message", { conversationId, content: "ainda?" });
        assert.equal((await ana.client.take("error")).payload.code, "conversation_not_found");
        const again = await openDm(ana.client, { userId: bia.me.id });
        assert.notEqual(again.conversationId, conversationId);
        await settle(ana.client);
        assert.equal(
            ana.client.count(
                (m) => m.type === "message_history" && m.conversationId === again.conversationId,
            ),
            0,
        );
        ana.client.close();
        bia.client.close();
    });

    test("bloqueio: encerra a conversa e impede mensagens, busca e conversa nova", async () => {
        const ana = await person(server.url, "Ana");
        const bia = await person(server.url, "Bia");
        const { conversationId } = await openDm(ana.client, { username: bia.username });
        ana.client.send("chat_message", { conversationId, content: "insistente" });
        await bia.client.take("message_history");

        bia.client.send("user_block", { userId: ana.me.id, requestId: "bl" });
        const blocked = (await bia.client.take("block_list")).payload;
        assert.deepEqual(blocked, {
            blocked: [{ id: ana.me.id, name: "Ana", username: ana.username }],
            requestId: "bl",
        });
        assert.equal((await ana.client.take("dm_closed")).payload.reason, "closed");

        ana.client.send("chat_message", { conversationId, content: "de novo" });
        assert.equal((await ana.client.take("error")).payload.code, "conversation_not_found");
        for (const payload of [{ username: bia.username }, { userId: bia.me.id }]) {
            assert.equal((await openDm(ana.client, payload)).payload.code, "user_unavailable");
        }
        ana.client.send("user_lookup", { username: bia.username });
        assert.equal((await ana.client.take("user_lookup")).payload.found, false);
        await settle(bia.client);
        assert.equal(
            bia.client.count((m) => m.payload?.content === "de novo"),
            0,
        );

        bia.client.send("user_unblock", { userId: ana.me.id });
        assert.deepEqual((await bia.client.take("block_list")).payload, { blocked: [] });
        assert.equal((await openDm(ana.client, { username: bia.username })).type, "dm_opened");
        ana.client.close();
        bia.client.close();
    });

    test("queda e retomada preservam a conversa; sair de vez a destrói", async () => {
        const ana = await person(server.url, "Ana");
        const bia = await person(server.url, "Bia");
        const { conversationId } = await openDm(ana.client, { username: bia.username });
        ana.client.send("chat_message", { conversationId, content: "primeira" });
        await bia.client.take("message_history");

        bia.client.ws.terminate();
        const offline = await ana.client.take("dm_updated");
        assert.equal(offline.payload.peer.online, false);
        ana.client.send("chat_message", { conversationId, content: "enquanto você caiu" });

        const back = await connect(server.url);
        back.send("user_login", { userName: "Bia", resumeToken: bia.me.resumeToken });
        const session = (await back.take("session")).payload;
        assert.equal(session.id, bia.me.id);
        assert.equal(session.resumed, true);
        const resumed = await back.take("dm_opened");
        assert.equal(resumed.conversationId, conversationId);
        assert.equal(resumed.payload.resumed, true);
        assert.deepEqual(
            (await back.take("message_history")).payload.map((m) => m.payload.content),
            ["primeira", "enquanto você caiu"],
        );
        assert.equal((await ana.client.take("dm_updated")).payload.peer.online, true);

        // Sair de vez: a conversa acaba para quem ficou.
        back.send("user_logout", {});
        const ended = await ana.client.take("dm_closed");
        assert.equal(ended.payload.reason, "ended");

        // Outra pessoa com o mesmo @ não recupera nada.
        const impostor = await connect(server.url);
        impostor.send("user_login", { userName: "Outra", username: bia.username });
        const fresh = (await impostor.take("session")).payload;
        assert.notEqual(fresh.id, bia.me.id);
        impostor.send("chat_message", { conversationId, content: "sou a Bia?" });
        assert.equal((await impostor.take("error")).payload.code, "conversation_not_found");
        const reopened = await openDm(impostor, { username: ana.username });
        assert.notEqual(reopened.conversationId, conversationId);
        await settle(impostor);
        assert.equal(impostor.count("message_history"), 0);
        ana.client.close();
        impostor.close();
    });

    test("buscas demais em pouco tempo são limitadas", async () => {
        const { client } = await person(server.url, "Varre");
        for (let i = 0; i < 25; i += 1) client.send("user_lookup", { username: `alvo${i}` });
        const limited = await client.take(
            (m) => m.type === "error" && m.payload.code === "lookup_limited",
        );
        assert.equal(limited.payload.code, "lookup_limited");
        assert.equal(client.count("user_lookup"), 20);
        client.close();
    });

    test("sem sessão, nada funciona; logs não trazem @, nome nem conteúdo", async () => {
        const lurker = await connect(server.url);
        for (const [type, payload] of [
            ["user_lookup", { username: "alguem" }],
            ["dm_open", { username: "alguem" }],
            ["dm_close", { conversationId: "d_aaaaaaaaaaaaaaaa" }],
            ["user_block", { userId: "x" }],
        ]) {
            lurker.send(type, payload);
            assert.equal((await lurker.take("error")).payload.code, "not_logged_in", type);
        }
        lurker.close();

        const ana = await person(server.url, "NomeSecreto");
        const bia = await person(server.url, "Bia");
        const { conversationId } = await openDm(ana.client, { username: bia.username });
        ana.client.send("chat_message", { conversationId, content: "conteudo-privado-xyz" });
        await bia.client.take("message_history");
        await server.waitForLog((e) => e.event === "dm_opened");
        const all = server.lines.join("\n");
        assert.ok(!all.includes("conteudo-privado-xyz"));
        assert.ok(!all.includes("NomeSecreto"));
        assert.ok(!all.includes(bia.username));
        ana.client.close();
        bia.client.close();
    });
});

describe("limites por ambiente e reinício", () => {
    test("MAX_DMS_PER_USER é aplicado", async () => {
        const server = await startServer({ MAX_DMS_PER_USER: "1" });
        const ana = await person(server.url, "Ana");
        const bia = await person(server.url, "Bia");
        const caio = await person(server.url, "Caio");
        assert.equal((await openDm(ana.client, { username: bia.username })).type, "dm_opened");
        assert.equal(
            (await openDm(ana.client, { username: caio.username })).payload.code,
            "dm_limit",
        );
        for (const p of [ana, bia, caio]) p.client.close();
        await server.stop();
    });

    test("reinício do servidor: nenhuma conversa privada sobrevive", async () => {
        const first = await startServer();
        const ana = await person(first.url, "Ana");
        const bia = await person(first.url, "Bia");
        const { conversationId } = await openDm(ana.client, { username: bia.username });
        ana.client.send("chat_message", { conversationId, content: "não fica" });
        await bia.client.take("message_history");
        await first.stop();

        const second = await startServer();
        const back = await connect(second.url);
        back.send("user_login", {
            userName: "Ana",
            username: ana.username,
            resumeToken: ana.me.resumeToken,
        });
        const session = (await back.take("session")).payload;
        assert.equal(session.resumed, false);
        back.send("room_list", {});
        assert.deepEqual((await back.take("room_list")).payload, { rooms: [], dms: [] });
        back.send("chat_message", { conversationId, content: "ainda existe?" });
        assert.equal((await back.take("error")).payload.code, "conversation_not_found");
        back.close();
        await second.stop();
    });
});
