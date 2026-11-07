"use strict";

// Conexões: login, login repetido (F1-04), reconexão com identidade estável
// (F1-05), entrada/saída, lista de participantes, heartbeat (F1-11) e
// desligamento gracioso (F1-12). Problemas: P07, P10, P11.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, connect, join, barrier } = require("./helpers");

describe("ciclo de vida da conexão", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("login normal: sessão, lista atualizada e aviso para os outros", async () => {
        const first = await join(server.url, { userName: "Primeira" });
        const second = await connect(server.url);
        second.send("user_login", { userName: "Segunda" });

        const session = await second.take("session");
        const joined = await first.client.take("user_joined");
        assert.equal(joined.payload.userName, "Segunda");

        const list = await first.client.take(
            (m) => m.type === "user_list" && m.payload.some((p) => p.id === session.payload.id),
        );
        assert.deepEqual(list.payload.map((p) => p.name).sort(), ["Primeira", "Segunda"]);
        // Quem entra não recebe o próprio "entrou na sala".
        assert.equal(second.count("user_joined"), 0);
        first.client.close();
        second.close();
        await first.client.waitClose();
    });

    test("login repetido na mesma conexão não gera entradas duplicadas", async () => {
        const observer = await join(server.url, { userName: "Observa" });
        const repeat = await join(server.url, { userName: "Repete" });
        await observer.client.take(
            (m) => m.type === "user_joined" && m.payload.userName === "Repete",
        );

        for (let index = 0; index < 5; index += 1) {
            repeat.client.send("user_login", { userName: `Repete${index}` });
        }
        for (let index = 0; index < 5; index += 1) {
            assert.equal((await repeat.client.take("error")).payload.code, "already_logged_in");
        }
        await barrier(repeat.client, observer.client);
        assert.equal(
            observer.client.count((m) => m.type === "user_joined"),
            0,
        );

        // O nome não mudou: as mensagens seguem com o nome original.
        repeat.client.send("chat_message", { content: "ainda sou eu" });
        const seen = await observer.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "ainda sou eu",
        );
        assert.equal(seen.payload.userName, "Repete");
        observer.client.close();
        repeat.client.close();
    });

    test("saída: os outros recebem o aviso e a lista sem a pessoa", async () => {
        const stay = await join(server.url, { userName: "Fica" });
        const leave = await join(server.url, { userName: "Sai" });
        await stay.client.take((m) => m.type === "user_joined" && m.payload.userName === "Sai");

        leave.client.close();
        const left = await stay.client.take(
            (m) => m.type === "user_left" && m.payload.userName === "Sai",
        );
        assert.equal(left.payload.userName, "Sai");
        const list = await stay.client.take(
            (m) => m.type === "user_list" && !m.payload.some((p) => p.id === leave.session.id),
        );
        assert.ok(list.payload.some((p) => p.id === stay.session.id));
        stay.client.close();
    });

    test("reconexão com o token de retomada mantém o mesmo id, sem duplicar a lista", async () => {
        const observer = await join(server.url, { userName: "Vigia" });
        const original = await join(server.url, { userName: "Volta" });
        original.client.close();
        await observer.client.take((m) => m.type === "user_left" && m.payload.userName === "Volta");

        const back = await join(server.url, {
            userName: "Volta",
            resumeToken: original.session.resumeToken,
        });
        assert.equal(back.session.id, original.session.id);
        assert.equal(back.session.name, "Volta");
        assert.notEqual(
            back.session.resumeToken,
            original.session.resumeToken,
            "token rotacionado",
        );

        const list = await observer.client.take(
            (m) => m.type === "user_list" && m.payload.some((p) => p.id === original.session.id),
        );
        assert.equal(list.payload.filter((p) => p.id === original.session.id).length, 1);

        // O token antigo deixou de valer depois da rotação.
        const replay = await join(server.url, {
            userName: "Replay",
            resumeToken: original.session.resumeToken,
        });
        assert.notEqual(replay.session.id, original.session.id);

        observer.client.close();
        back.client.close();
        replay.client.close();
    });

    test("retomar enquanto a conexão antiga ainda existe substitui a antiga", async () => {
        const observer = await join(server.url, { userName: "Olho" });
        const stale = await join(server.url, { userName: "Zumbi" });
        await observer.client.take(
            (m) => m.type === "user_joined" && m.payload.userName === "Zumbi",
        );

        const fresh = await join(server.url, {
            userName: "Zumbi",
            resumeToken: stale.session.resumeToken,
        });
        assert.equal(fresh.session.id, stale.session.id);
        await stale.client.waitClose();

        const list = await observer.client.take(
            (m) =>
                m.type === "user_list" &&
                m.payload.filter((p) => p.id === stale.session.id).length === 1,
        );
        assert.ok(list.payload.some((p) => p.id === observer.session.id));
        // Para os outros a pessoa nunca saiu: nem "saiu" nem um novo "entrou".
        await barrier(fresh.client, observer.client);
        const zumbi = (m) => m.payload?.userName === "Zumbi";
        assert.equal(
            observer.client.count((m) => m.type === "user_left" && zumbi(m)),
            0,
        );
        assert.equal(
            observer.client.count((m) => m.type === "user_joined" && zumbi(m)),
            0,
        );
        observer.client.close();
        fresh.client.close();
    });

    test("quem entra recebe o histórico depois da própria sessão", async () => {
        const writer = await join(server.url, { userName: "Escreve" });
        writer.client.send("chat_message", { content: "para o histórico" });
        await writer.client.take("chat_message");

        const reader = await connect(server.url);
        reader.send("user_login", { userName: "Lê" });
        await reader.take("session");
        const history = await reader.take("message_history");
        assert.ok(history.payload.some((entry) => entry.payload.content === "para o histórico"));
        assert.ok(history.payload.length <= 50);
        writer.client.close();
        reader.close();
    });
});

describe("heartbeat", () => {
    let server;
    before(async () => {
        server = await startServer({ HEARTBEAT_MS: "100" });
    });
    after(() => server.stop());

    test("conexão que não responde ao ping é removida da sala", async () => {
        const observer = await join(server.url, { userName: "Vivo" });
        const ghost = await join(server.url, { userName: "Fantasma" }, { autoPong: false });
        await observer.client.take("user_joined");

        const left = await observer.client.take("user_left", 3000);
        assert.equal(left.payload.userName, "Fantasma");
        const list = await observer.client.take(
            (m) => m.type === "user_list" && !m.payload.some((p) => p.id === ghost.session.id),
        );
        assert.equal(list.payload.length, 1);
        // Quem responde ao ping continua conectado.
        assert.equal(observer.client.closed, null);
        observer.client.close();
    });
});

describe("desligamento gracioso", () => {
    test("SIGTERM fecha os clientes com 1001 e encerra com código 0", async () => {
        const server = await startServer();
        const { client } = await join(server.url, { userName: "Até logo" });
        server.child.kill("SIGTERM");
        const closed = await client.waitClose();
        assert.equal(closed.code, 1001);
        assert.equal(await server.exited, 0);
        await server.waitForLog((entry) => entry.event === "shutdown_complete");
    });
});
