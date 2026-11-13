// Várias salas com o servidor real (processo filho e clientes `ws`):
// isolamento, códigos, limites por ambiente, proteção contra adivinhação e
// reinício do servidor.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { barrier, connect, join, startServer } from "./helpers.js";

/** Conecta e começa a sessão, sem entrar em sala. */
const session = async (url, userName) => {
    const { client, session: me } = await join(url, { userName }, undefined, { room: false });
    return { client, me };
};

/** Cria uma sala e devolve o `room_joined`. */
const createRoom = async (client, name) => {
    client.send("room_create", { name });
    return client.take("room_joined");
};

/** Entra numa sala pelo código e devolve o `room_joined` ou o erro. */
const joinRoom = async (client, code) => {
    client.send("room_join", { code });
    return client.take((m) => m.type === "room_joined" || m.type === "error");
};

describe("várias salas", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("login sozinho não põe ninguém em sala: não há sala pública", async () => {
        const { client } = await session(server.url, "Solitária");
        client.send("room_list", { requestId: "lista" });
        const list = await client.take("room_list");
        assert.deepEqual(list.payload, { rooms: [], dms: [], requestId: "lista" });
        client.send("chat_message", { content: "alguém?" });
        assert.equal((await client.take("error")).payload.code, "conversation_not_found");
        client.close();
    });

    test("número de autor por sala: dado pelo servidor, sem forja e sem ligar salas", async () => {
        const ana = await session(server.url, "Ana");
        const bia = await session(server.url, "Bia");
        const roomA = await createRoom(ana.client, "Autores A");
        const roomB = await createRoom(bia.client, "Autores B");
        assert.equal(roomA.payload.author, 1);
        const joinedA = await joinRoom(bia.client, roomA.payload.code);
        const joinedB = await joinRoom(ana.client, roomB.payload.code);
        assert.equal(joinedA.payload.author, 2, "Bia é a 2ª na sala A");
        assert.equal(joinedB.payload.author, 2, "Ana é a 2ª na sala B: outra contagem");
        bia.client.send("chat_message", {
            conversationId: roomA.conversationId,
            content: "tentando ser a 1",
            author: 1,
            username: ana.me.username,
        });
        const chat = await ana.client.take(
            (m) => m.type === "chat_message" && m.conversationId === roomA.conversationId,
        );
        assert.equal(chat.payload.author, 2);
        assert.equal(chat.payload.username, bia.me.username);
        ana.client.close();
        bia.client.close();
    });

    test("duas salas, uma pessoa nas duas: cada mensagem só na sua sala", async () => {
        const ana = await session(server.url, "Ana");
        const bia = await session(server.url, "Bia");
        const caio = await session(server.url, "Caio");
        const roomA = await createRoom(ana.client, "Sala A");
        const roomB = await createRoom(bia.client, "Sala B");
        assert.notEqual(roomA.payload.code, roomB.payload.code);
        assert.notEqual(roomA.conversationId, roomB.conversationId);
        assert.equal((await joinRoom(caio.client, roomA.payload.code)).type, "room_joined");
        assert.equal((await joinRoom(caio.client, roomB.payload.code)).type, "room_joined");

        ana.client.send("chat_message", {
            conversationId: roomA.conversationId,
            content: "só da A",
        });
        bia.client.send("chat_message", {
            conversationId: roomB.conversationId,
            content: "só da B",
        });
        const fromA = await caio.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "só da A",
        );
        const fromB = await caio.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "só da B",
        );
        assert.equal(fromA.conversationId, roomA.conversationId);
        assert.equal(fromB.conversationId, roomB.conversationId);

        // Barreiras: o que tivesse de vazar já teria chegado.
        ana.client.conversationId = roomA.conversationId;
        bia.client.conversationId = roomB.conversationId;
        await barrier(ana.client, ana.client);
        await barrier(bia.client, bia.client);
        assert.equal(
            ana.client.count((m) => m.type === "chat_message" && m.payload.content === "só da B"),
            0,
        );
        assert.equal(
            bia.client.count((m) => m.type === "chat_message" && m.payload.content === "só da A"),
            0,
        );

        caio.client.send("room_list", {});
        const list = await caio.client.take("room_list");
        assert.deepEqual(
            list.payload.rooms.map((room) => room.name),
            ["Sala A", "Sala B"],
        );
        for (const person of [ana, bia, caio]) person.client.close();
    });

    test("quem não participa não lê nem escreve numa sala, mesmo sabendo o id", async () => {
        const owner = await session(server.url, "Dona");
        const outsider = await session(server.url, "Intrusa");
        const room = await createRoom(owner.client, "Fechada");
        outsider.client.send("chat_message", {
            conversationId: room.conversationId,
            content: "entrei?",
            clientMsgId: "intrusa-1",
        });
        const refused = await outsider.client.take("error");
        assert.equal(refused.payload.code, "conversation_not_found");
        assert.equal(refused.payload.ref, "intrusa-1");
        outsider.client.send("command", {
            conversationId: room.conversationId,
            requestId: "c1",
            text: "/users",
        });
        const result = await outsider.client.take("command_result");
        assert.equal(result.payload.code, "no_conversation");
        owner.client.close();
        outsider.client.close();
    });

    test("código errado: mesma resposta para inexistente; formato inválido tem código próprio", async () => {
        const { client } = await session(server.url, "Erra");
        assert.equal((await joinRoom(client, "zzz-zzzz-zzz")).payload.code, "room_not_found");
        assert.equal(
            (await joinRoom(client, "isso não é código")).payload.code,
            "invalid_room_code",
        );
        client.close();
    });

    test("tentativas erradas demais travam a entrada por código, até com o código certo", async () => {
        const host = await session(server.url, "Anfitriã");
        const room = await createRoom(host.client, "Alvo");
        const { client } = await session(server.url, "Varredura");
        for (let i = 0; i < 10; i += 1) {
            const letters = String.fromCharCode(97 + i).repeat(10);
            await joinRoom(client, letters);
        }
        const locked = await joinRoom(client, room.payload.code);
        assert.equal(locked.payload.code, "room_join_locked");
        await server.waitForLog((entry) => entry.event === "room_join_locked");
        client.close();
        host.client.close();
    });
});

describe("limites por ambiente", () => {
    test("MAX_ROOMS_PER_USER e MAX_ROOMS_CREATED_PER_USER são aplicados", async () => {
        const server = await startServer({
            MAX_ROOMS_PER_USER: "3",
            MAX_ROOMS_CREATED_PER_USER: "2",
        });
        const { client } = await session(server.url, "Limitada");
        await createRoom(client, "1");
        await createRoom(client, "2");
        client.send("room_create", { name: "3" });
        assert.equal((await client.take("error")).payload.code, "room_create_limit");

        const other = await session(server.url, "Outra");
        const third = await createRoom(other.client, "da outra");
        const fourth = await createRoom(other.client, "da outra 2");
        assert.equal((await joinRoom(client, third.payload.code)).type, "room_joined");
        assert.equal((await joinRoom(client, fourth.payload.code)).payload.code, "room_join_limit");
        client.close();
        other.client.close();
        await server.stop();
    });

    test("ROOM_EMPTY_TTL_MS=0: a sala acaba quando a última pessoa sai", async () => {
        const server = await startServer({ ROOM_EMPTY_TTL_MS: "0" });
        const { client } = await session(server.url, "Última");
        const room = await createRoom(client, "Breve");
        client.send("room_leave", { conversationId: room.conversationId });
        const left = await client.take("room_left");
        assert.equal(left.payload.reason, "left");
        await server.waitForLog(
            (entry) =>
                entry.event === "room_destroyed" && entry.conversation === room.conversationId,
        );
        assert.equal((await joinRoom(client, room.payload.code)).payload.code, "room_not_found");
        client.close();
        await server.stop();
    });
});

describe("reinício do servidor", () => {
    test("salas, mensagens, códigos e identidades somem com o processo", async () => {
        const first = await startServer();
        const { client, me } = await session(first.url, "Antes");
        const room = await createRoom(client, "Efêmera");
        client.send("chat_message", { conversationId: room.conversationId, content: "não fica" });
        await client.take("chat_message");
        await first.stop();

        const second = await startServer();
        const fresh = await connect(second.url);
        fresh.send("user_login", { userName: "Antes", resumeToken: me.resumeToken });
        const next = (await fresh.take("session")).payload;
        assert.equal(next.resumed, false);
        assert.equal((await joinRoom(fresh, room.payload.code)).payload.code, "room_not_found");
        fresh.close();
        await second.stop();
    });
});
