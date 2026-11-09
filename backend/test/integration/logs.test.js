// Logs: injeção de linhas (F1-03), erros de parsing sem stack trace e
// ausência de dados sensíveis. Problemas: P04, P05.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, connect, join } from "./helpers.js";

describe("logs do servidor", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("toda linha de log é um objeto JSON com nível e evento", async () => {
        const { client } = await join(server.url, { userName: "Logado" });
        client.close();
        await server.waitForLog((entry) => entry.event === "session_paused");
        for (const line of server.lines) {
            const entry = JSON.parse(line);
            assert.equal(typeof entry.ts, "string");
            assert.ok(["info", "warn", "error"].includes(entry.level), line);
            assert.equal(typeof entry.event, "string");
        }
    });

    test("tentativa de log injection pelo campo type não forja linhas", async () => {
        const client = await connect(server.url);
        const forged = 'x\n[FORJADO] admin logou\r\n{"level":"info","event":"falso"}';
        client.send(forged, {});
        await client.take("error");
        await server.waitForLog((entry) => entry.event === "invalid_message");

        for (const line of server.lines) {
            assert.doesNotThrow(() => JSON.parse(line), `linha não estruturada: ${line}`);
            assert.ok(!line.startsWith("[FORJADO]"));
        }
        assert.equal(server.entries().filter((entry) => entry.event === "falso").length, 0);
        client.close();
    });

    test("erro de parsing é registrado em uma linha, sem stack trace", async () => {
        const client = await connect(server.url);
        const before = server.lines.length;
        client.sendRaw("{ json quebrado");
        client.sendRaw("null");
        client.send("chat_message");
        for (let index = 0; index < 3; index += 1) await client.take("error");
        await server.waitForLog(
            (entry) => entry.event === "invalid_message" && entry.reason === "not_an_object",
        );
        const produced = server.lines.slice(before).join("\n");
        assert.ok(!/TypeError|SyntaxError|\n\s+at /.test(produced), produced);
        const reasons = server
            .entries()
            .filter((entry) => entry.event === "invalid_message")
            .map((entry) => entry.reason);
        assert.ok(reasons.includes("invalid_json"));
        assert.ok(reasons.includes("not_an_object"));
        assert.ok(server.entries().every((entry) => entry.level !== "error"));
        client.close();
    });

    test("conteúdo de mensagens, nomes e tokens de sessão não vão para o log", async () => {
        const { client, session, room } = await join(server.url, { userName: "NomeSecreto" });
        client.send("chat_message", { content: "conteudo-privado-123" });
        await client.take("chat_message");
        client.close();
        await server.waitForLog(
            (entry) => entry.event === "session_paused" && entry.user === session.id,
        );

        const all = server.lines.join("\n");
        assert.ok(!all.includes("conteudo-privado-123"));
        assert.ok(!all.includes("NomeSecreto"));
        assert.ok(!all.includes(session.resumeToken));
        // O código de convite é o segredo da sala: nunca vai para o log.
        assert.ok(!all.includes(room.code));
        assert.ok(!all.includes(room.code.replaceAll("-", "")));
    });

    test("erros legítimos continuam registrados com contexto útil", async () => {
        const client = await connect(server.url);
        client.send("tipo_desconhecido", {});
        await client.take("error");
        const entry = await server.waitForLog(
            (item) =>
                item.event === "invalid_message" &&
                item.reason === "unknown_type" &&
                item.type === "tipo_desconhecido",
        );
        assert.equal(entry.level, "warn");
        assert.equal(entry.type, "tipo_desconhecido");
        assert.equal(typeof entry.connection, "string");
        client.close();
    });
});
