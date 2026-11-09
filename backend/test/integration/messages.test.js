// Mensagens: envio válido, vazio, payload inválido, rate limit separado
// (F1-08) e preservação de identificadores (F1-10). Problemas: P02, P05, P09.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, connect, enterSharedRoom, join } from "./helpers.js";

describe("mensagens", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("mensagem válida chega a todos, com id, autor e horário do servidor", async () => {
        const a = await join(server.url, { userName: "Ana" });
        const b = await join(server.url, { userName: "Beto" });

        a.client.send("chat_message", { content: "olá, sala" });
        for (const client of [a.client, b.client]) {
            const message = await client.take(
                (m) => m.type === "chat_message" && m.payload.content === "olá, sala",
            );
            assert.match(message.id, /^[0-9a-f-]{36}$/);
            assert.equal(message.payload.userId, a.session.id);
            assert.equal(message.payload.userName, "Ana");
            assert.ok(!Number.isNaN(Date.parse(message.payload.timestamp)));
        }
        a.client.close();
        b.client.close();
    });

    test("mensagem vazia ou só com espaços é recusada sem broadcast", async () => {
        const user = await join(server.url, { userName: "Caio" });
        for (const content of ["", "    ", "\n\t"]) {
            user.client.send("chat_message", { content });
            const error = await user.client.take("error");
            assert.equal(error.payload.code, "empty_message");
        }
        assert.equal(user.client.count("chat_message"), 0);
        user.client.close();
    });

    test("conteúdo de tipo errado é recusado como mensagem inválida", async () => {
        const user = await join(server.url, { userName: "Dani" });
        for (const content of [42, null, ["a"], { texto: "a" }]) {
            user.client.send("chat_message", { content });
            const error = await user.client.take("error");
            assert.equal(error.payload.code, "invalid_message");
        }
        user.client.close();
    });

    test("payload inválido não derruba a conexão nem o servidor", async () => {
        const user = await join(server.url, { userName: "Eva" });
        const frames = [
            "isto não é json",
            "null",
            "[1,2,3]",
            "42",
            JSON.stringify({ payload: {} }),
            JSON.stringify({ type: 7 }),
            JSON.stringify({ type: "chat_message", payload: "texto" }),
            JSON.stringify({ type: "chat_message", payload: null }),
        ];
        for (const frame of frames) {
            user.client.sendRaw(frame);
            const error = await user.client.take("error");
            assert.equal(error.payload.code, "invalid_message", `quadro: ${frame}`);
        }
        // Envelope válido sem conversa: a conversa é conferida antes do conteúdo.
        user.client.sendRaw(JSON.stringify({ type: "chat_message" }));
        assert.equal((await user.client.take("error")).payload.code, "conversation_not_found");
        user.client.sendRaw(Buffer.from([1, 2, 3]), { binary: true });
        assert.equal((await user.client.take("error")).payload.code, "invalid_message");

        user.client.send("tipo_inexistente", {});
        assert.equal((await user.client.take("error")).payload.code, "unknown_type");

        user.client.send("chat_message", { content: "ainda funciono" });
        await user.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "ainda funciono",
        );
        assert.equal(user.client.closed, null);
        user.client.close();
    });

    test("mensagem enviada após rajada intensa de digitação é entregue", async () => {
        const observer = await join(server.url, { userName: "Obs" });
        const typist = await join(server.url, { userName: "Digitador" });

        for (let index = 0; index < 200; index += 1) typist.client.send("typing_start", {});
        typist.client.send("chat_message", { content: "mensagem importante" });

        const delivered = await observer.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "mensagem importante",
        );
        assert.equal(delivered.payload.userId, typist.session.id);
        assert.equal(
            typist.client.count((m) => m.type === "error"),
            0,
        );
        observer.client.close();
        typist.client.close();
    });

    test("limite de mensagens: excesso é recusado com rate_limited e a conexão continua", async () => {
        const observer = await join(server.url, { userName: "Obs2" });
        const flooder = await join(server.url, { userName: "Flood" });

        for (let index = 0; index < 100; index += 1) {
            flooder.client.send("chat_message", { content: `flood-${index}` });
        }
        const error = await flooder.client.take("error");
        assert.equal(error.payload.code, "rate_limited");
        assert.equal(typeof error.payload.message, "string");

        // Espera a última mensagem aceita chegar ao observador.
        flooder.client.send("typing_start", {});
        await observer.client.take("user_typing");
        const accepted = observer.client.count(
            (m) => m.type === "chat_message" && m.payload.content.startsWith("flood-"),
        );
        // Capacidade 40, menos a ficha gasta pelo login, mais a pouca reposição
        // durante a rajada: a maioria do flood é recusada.
        assert.ok(accepted >= 35 && accepted <= 50, `aceitas: ${accepted}`);
        assert.equal(flooder.client.closed, null, "conexão permanece aberta");

        // Respostas de erro também são limitadas: não amplificam o flood.
        const notices = flooder.client.count((m) => m.type === "error") + 1;
        assert.ok(notices <= 3, `avisos de limite: ${notices}`);
        observer.client.close();
        flooder.client.close();
    });

    test("o id de uma mensagem ao vivo é o mesmo id que aparece no histórico", async () => {
        const sender = await join(server.url, { userName: "Fábio" });
        sender.client.send("chat_message", { content: "mensagem com id estável" });
        const live = await sender.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "mensagem com id estável",
        );

        const newcomer = await connect(server.url);
        newcomer.send("user_login", { userName: "Recém-chegado" });
        await newcomer.take("session");
        await enterSharedRoom(server.url, newcomer);
        const history = await newcomer.take("message_history");
        const fromHistory = history.payload.find(
            (entry) => entry.payload.content === "mensagem com id estável",
        );
        assert.ok(fromHistory);
        assert.equal(fromHistory.id, live.id);
        sender.client.close();
        newcomer.close();
    });

    test("conteúdo é normalizado: controle vira espaço e o tamanho é limitado", async () => {
        const user = await join(server.url, { userName: "Gil" });
        user.client.send("chat_message", { content: "linha1\nlinha2\u0000fim" });
        const normalized = await user.client.take("chat_message");
        assert.equal(normalized.payload.content, "linha1 linha2 fim");

        user.client.send("chat_message", { content: "x".repeat(1500) });
        const truncated = await user.client.take("chat_message");
        assert.equal(truncated.payload.content.length, 1000);
        user.client.close();
    });
});
