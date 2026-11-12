// Segurança: identidade emitida pelo servidor (F1-05), acesso sem login e
// allowlist de origem (F1-02). Problemas de origem: P01, P07, P30.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, connect, join, barrier, enterSharedRoom } from "./helpers.js";

describe("identidade atribuída pelo servidor", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("o servidor ignora o userId enviado; o id interno fica só nele", async () => {
        const { client, session } = await join(server.url, {
            userId: "id-escolhido-pelo-cliente",
            userName: "Ana",
        });
        assert.equal("id" in session, false, "a sessão não traz id");
        const started = await server.waitForLog(
            (entry) => entry.event === "session_started" && /^[0-9a-f-]{36}$/.test(entry.user),
        );
        assert.notEqual(started.user, "id-escolhido-pelo-cliente");
        assert.ok(!JSON.stringify(client.inbox).includes(started.user));
        assert.equal(session.name, "Ana");
        assert.equal(typeof session.resumeToken, "string");
        assert.ok(session.resumeToken.length >= 32);
        client.close();
    });

    test("tentativa de personificação: dizer que é outra pessoa não funciona", async () => {
        const victim = await join(server.url, { userName: "Vítima" });
        const attacker = await join(server.url, {
            userId: victim.session.username,
            userName: "Vítima",
        });

        assert.notEqual(attacker.session.username, victim.session.username);
        // O @ é a identidade visível: enquanto a vítima existe, ninguém o pega.
        const thief = await connect(server.url);
        thief.send("user_login", { userName: "Vítima", username: victim.session.username });
        assert.equal((await thief.take("error")).payload.code, "username_taken");
        thief.close();

        attacker.client.send("chat_message", { content: "sou eu, a vítima" });
        const seen = await victim.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "sou eu, a vítima",
        );
        // O cliente marca como "Você" pelo @ da mensagem: aqui é o do atacante.
        assert.equal(seen.payload.username, attacker.session.username);
        assert.notEqual(seen.payload.username, victim.session.username);

        const list = await victim.client.take(
            (m) => m.type === "user_list" && m.payload.length >= 2,
        );
        const handles = list.payload.map((person) => person.username);
        assert.equal(new Set(handles).size, handles.length, "lista sem @ duplicado");
        assert.ok(list.payload.every((person) => !("id" in person)));

        victim.client.close();
        attacker.client.close();
    });

    test("tentativa de alterar a identidade com um segundo login é recusada", async () => {
        const observer = await join(server.url, { userName: "Observador" });
        const user = await join(server.url, { userName: "Bruno" });

        user.client.send("user_login", { userId: observer.session.username, userName: "Admin" });
        const error = await user.client.take("error");
        assert.equal(error.payload.code, "already_logged_in");

        user.client.send("chat_message", { content: "depois da tentativa" });
        const seen = await observer.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "depois da tentativa",
        );
        assert.equal(seen.payload.username, user.session.username);
        assert.equal(seen.payload.userName, "Bruno");

        observer.client.close();
        user.client.close();
    });

    test("token de retomada forjado não concede a identidade de ninguém", async () => {
        const victim = await join(server.url, { userName: "Carla" });
        const attacker = await join(server.url, {
            userName: "Intruso",
            resumeToken: "a".repeat(43),
        });
        assert.notEqual(attacker.session.username, victim.session.username);
        assert.equal(attacker.session.name, "Intruso");
        victim.client.close();
        attacker.client.close();
    });

    test("a identidade é a mesma em todas as mensagens da conexão", async () => {
        const observer = await join(server.url, { userName: "Obs" });
        const user = await join(server.url, { userName: "Duda" });
        for (const content of ["um", "dois", "três"]) {
            user.client.send("chat_message", { content, userId: "outro-id", userName: "Outro" });
        }
        for (const content of ["um", "dois", "três"]) {
            const seen = await observer.client.take(
                (m) => m.type === "chat_message" && m.payload.content === content,
            );
            assert.equal(seen.payload.username, user.session.username);
            assert.equal(seen.payload.userName, "Duda");
        }
        observer.client.close();
        user.client.close();
    });

    test("sem login, a conexão não recebe nada do que acontece na sala", async () => {
        const lurker = await connect(server.url);
        const member = await join(server.url, { userName: "Membro" });
        const other = await join(server.url, { userName: "Outro" });

        member.client.send("typing_start", {});
        await other.client.take("user_typing");
        member.client.send("chat_message", { content: "conversa privada da sala" });
        await other.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "conversa privada da sala",
        );
        member.client.close();
        await other.client.take((m) => m.type === "user_left" && m.payload.userName === "Membro");

        // Tudo já foi entregue a quem está na sala; o espectador não recebeu nada.
        assert.deepEqual(lurker.inbox, []);

        // Ao entrar, passa a receber normalmente — inclusive o histórico.
        lurker.send("user_login", { userName: "Agora entrei" });
        await lurker.take("session");
        // Só a sessão ainda não dá acesso a nada: é preciso o código da sala.
        await enterSharedRoom(server.url, lurker);
        const history = await lurker.take("message_history");
        assert.ok(
            history.payload.some((entry) => entry.payload.content === "conversa privada da sala"),
        );
        lurker.close();
        other.client.close();
    });

    test("sem login, não é possível falar na sala", async () => {
        const observer = await join(server.url, { userName: "Sentinela" });
        const anonymous = await connect(server.url);

        anonymous.send("chat_message", { content: "entrei sem login" });
        const error = await anonymous.take("error");
        assert.equal(error.payload.code, "not_logged_in");

        anonymous.send("typing_start", {});
        await barrier(observer.client, observer.client);
        assert.equal(observer.client.count("user_typing"), 0);
        assert.equal(
            observer.client.count(
                (m) => m.type === "chat_message" && m.payload.content === "entrei sem login",
            ),
            0,
        );
        observer.client.close();
        anonymous.close();
    });
});

describe("allowlist de origem", () => {
    let server;
    before(async () => {
        server = await startServer({ ALLOWED_ORIGINS: "https://ok.example" });
    });
    after(() => server.stop());

    test("origem não listada é recusada com 403 no handshake", async () => {
        await assert.rejects(connect(server.url, { origin: "https://malicioso.example" }), {
            status: 403,
        });
    });

    test("conexão sem Origin é recusada", async () => {
        await assert.rejects(connect(server.url), { status: 403 });
    });

    test("origem listada conecta e entra normalmente", async () => {
        const { client, session } = await join(
            server.url,
            { userName: "Permitido" },
            { origin: "https://ok.example" },
        );
        assert.equal(session.name, "Permitido");
        client.close();
    });
});
