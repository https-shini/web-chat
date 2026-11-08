// Validação de nome e campos (F1-04). Problema: P06.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, connect, join, barrier } from "./helpers.js";

describe("validação de nome", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    for (const [label, userName] of [
        ["vazio", ""],
        ["só espaços", "     "],
        ["só caracteres de controle", "\u0000\u0007\n"],
        ["ausente", undefined],
    ]) {
        test(`nome ${label} é recusado e ninguém é avisado`, async () => {
            const observer = await join(server.url, { userName: "Porteiro" });
            const client = await connect(server.url);
            client.send("user_login", userName === undefined ? {} : { userName });
            const error = await client.take("error");
            assert.equal(error.payload.code, "invalid_name");
            assert.equal(client.count("session"), 0);

            // Sem login, a conexão continua sem poder falar…
            client.send("chat_message", { content: "oi" });
            assert.equal((await client.take("error")).payload.code, "not_logged_in");
            // …e ninguém viu uma entrada sem nome.
            await barrier(observer.client, observer.client);
            assert.equal(observer.client.count("user_joined"), 0);

            // Recusa recuperável: a mesma conexão pode tentar de novo.
            client.send("user_login", { userName: "Agora sim" });
            assert.equal((await client.take("session")).payload.name, "Agora sim");
            observer.client.close();
            client.close();
        });
    }

    test("nome de tipo errado é recusado", async () => {
        const client = await connect(server.url);
        for (const userName of [123, null, ["a"], { a: 1 }]) {
            client.send("user_login", { userName });
            assert.equal((await client.take("error")).payload.code, "invalid_name");
        }
        client.close();
    });

    test("espaços nas extremidades são removidos", async () => {
        const { client, session } = await join(server.url, { userName: "   Helena   " });
        assert.equal(session.name, "Helena");
        client.close();
    });

    test("nome acima do limite é cortado em 60 caracteres", async () => {
        const { client, session } = await join(server.url, { userName: "N".repeat(75) });
        assert.equal(session.name.length, 60);
        client.close();
    });

    test("caracteres de controle no meio do nome viram espaço", async () => {
        const observer = await join(server.url, { userName: "Leitor" });
        const { client, session } = await join(server.url, {
            userName: "Ana\n[FORJADO]\r\tBot",
        });
        assert.equal(session.name, "Ana [FORJADO]  Bot");
        const joined = await observer.client.take("user_joined");
        // eslint-disable-next-line no-control-regex
        assert.ok(!/[\u0000-\u001f]/.test(joined.payload.userName));
        observer.client.close();
        client.close();
    });

    test("token de retomada de tipo errado é ignorado", async () => {
        const { client, session } = await join(server.url, {
            userName: "Iris",
            resumeToken: { malicioso: true },
        });
        assert.equal(session.name, "Iris");
        client.close();
    });
});
