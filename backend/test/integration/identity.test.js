// Fase A, de ponta a ponta com o servidor real: username único, saída
// voluntária (user_logout) e allowlist de origem com clientes automatizados e
// reconexão.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, connect, join, barrier } from "./helpers.js";

describe("identidade temporária: nome completo + username", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("sessão, lista e mensagens carregam o username; o id vem do servidor", async () => {
        const { client, session } = await join(server.url, {
            userId: "escolhido",
            userName: "Ana Carolina Souza",
            username: "@AnaCarolina",
        });
        assert.notEqual(session.id, "escolhido");
        assert.equal(session.name, "Ana Carolina Souza");
        assert.equal(session.username, "anacarolina");
        const list = await client.take("user_list");
        assert.ok(list.payload.some((p) => p.username === "anacarolina"));
        client.send("chat_message", { content: "oi" });
        const message = await client.take("chat_message");
        assert.equal(message.payload.username, "anacarolina");
        client.close();
    });

    test("username em uso é recusado com código próprio; a conexão segue e pode tentar outro", async () => {
        const first = await join(server.url, { userName: "Bruno", username: "bruno" });
        const second = await connect(server.url);
        second.send("user_login", { userName: "Bruno Lima", username: "BRUNO" });
        const error = await second.take("error");
        assert.equal(error.payload.code, "username_taken");
        second.send("user_login", { userName: "Bruno Lima", username: "bruno.lima" });
        const session = await second.take("session");
        assert.equal(session.payload.username, "bruno.lima");
        first.client.close();
        second.close();
    });

    test("username ausente, inválido ou reservado é recusado", async () => {
        const client = await connect(server.url);
        for (const username of [undefined, "a b", "admin"]) {
            client.send("user_login", { userName: "Carla", username });
            const error = await client.take("error");
            assert.equal(error.payload.code, "invalid_username", String(username));
        }
        client.close();
    });

    test("queda abrupta: username fica reservado e a retomada devolve id e username", async () => {
        const { client, session } = await join(server.url, { userName: "Davi", username: "davi" });
        client.close();
        await client.waitClose();
        const other = await connect(server.url);
        other.send("user_login", { userName: "Outro Davi", username: "davi" });
        assert.equal((await other.take("error")).payload.code, "username_taken");
        other.close();
        const back = await join(server.url, { userName: "Davi", resumeToken: session.resumeToken });
        assert.equal(back.session.id, session.id);
        assert.equal(back.session.username, "davi");
        back.client.close();
    });
});

describe("sair (user_logout)", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("fecha com 4004, avisa os outros na hora e libera o username", async () => {
        const observer = await join(server.url, { userName: "Observa", username: "observa" });
        const { client } = await join(server.url, { userName: "Eva Souza", username: "eva" });
        await observer.client.take((m) => m.type === "user_list" && m.payload.length === 2);
        client.send("user_logout");
        const closed = await client.waitClose();
        assert.equal(closed.code, 4004);
        const left = await observer.client.take("user_left");
        assert.equal(left.payload.userName, "Eva Souza");
        await observer.client.take((m) => m.type === "user_list" && m.payload.length === 1);
        const reuse = await join(server.url, { userName: "Outra Eva", username: "eva" });
        assert.equal(reuse.session.username, "eva");
        reuse.client.close();
        observer.client.close();
    });

    test("depois de sair, o token de retomada não devolve a identidade", async () => {
        const { client, session } = await join(server.url, {
            userName: "Fábio",
            username: "fabio",
        });
        client.send("user_logout");
        await client.waitClose();
        const again = await connect(server.url);
        // Sem identidade a retomar, é entrada nova — e sem username, recusada.
        again.send("user_login", {
            userName: "Fábio",
            username: undefined,
            resumeToken: session.resumeToken,
        });
        assert.equal((await again.take("error")).payload.code, "invalid_username");
        // Com username, entra — como identidade nova, com o mesmo @ já livre.
        again.send("user_login", { userName: "Fábio", username: "fabio" });
        const fresh = await again.take("session");
        assert.notEqual(fresh.payload.id, session.id);
        assert.equal(fresh.payload.username, "fabio");
        again.close();
    });

    test("nada enviado depois da saída chega à sala", async () => {
        const observer = await join(server.url, { userName: "Vigia", username: "vigia" });
        const { client } = await join(server.url, { userName: "Gil", username: "gil" });
        client.send("user_logout");
        client.send("chat_message", { content: "depois de sair" });
        await client.waitClose();
        // Barreira: qualquer broadcast da mensagem já teria chegado antes dela.
        await barrier(observer.client, observer.client);
        assert.equal(
            observer.client.count(
                (m) => m.type === "chat_message" && m.payload.content === "depois de sair",
            ),
            0,
        );
        observer.client.close();
    });

    test("sair sem ter entrado só fecha a conexão", async () => {
        const client = await connect(server.url);
        client.send("user_logout");
        assert.equal((await client.waitClose()).code, 4004);
    });
});

describe("allowlist de origem: clientes automatizados e reconexão", () => {
    const ALLOWED = "https://chat.example";
    let server;
    before(async () => {
        server = await startServer({ ALLOWED_ORIGINS: ALLOWED });
    });
    after(() => server.stop());

    test("cliente automatizado sem cabeçalho Origin é recusado (403)", async () => {
        await assert.rejects(connect(server.url), { status: 403 });
    });

    test("cliente automatizado que envia a origem permitida entra", async () => {
        const { client, session } = await join(
            server.url,
            { userName: "Robô", username: "robo" },
            { origin: ALLOWED },
        );
        assert.equal(session.username, "robo");
        client.close();
    });

    test("origem parecida, mas diferente, é recusada (sem curinga nem prefixo)", async () => {
        for (const origin of [
            `${ALLOWED}.evil.test`,
            "http://chat.example",
            "https://x.chat.example",
        ]) {
            await assert.rejects(connect(server.url, { origin }), { status: 403 }, origin);
        }
    });

    test("reconexão: retomada pela origem permitida funciona; por outra origem nem conecta", async () => {
        const { client, session } = await join(
            server.url,
            { userName: "Helena", username: "helena" },
            { origin: ALLOWED },
        );
        client.close();
        await client.waitClose();
        await assert.rejects(connect(server.url, { origin: "https://intruso.test" }), {
            status: 403,
        });
        const back = await join(
            server.url,
            { userName: "Helena", resumeToken: session.resumeToken },
            { origin: ALLOWED },
        );
        assert.equal(back.session.id, session.id);
        back.client.close();
    });
});
