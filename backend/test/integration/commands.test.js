// Sistema de comandos e recursos da Fase 4 com o servidor real.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, connect, join, barrier } from "./helpers.js";

const ADMIN_KEY = "chave-de-integracao-0123456789";
let seq = 0;

/** Envia um comando e devolve o command_result correspondente. */
const run = async (client, text) => {
    const requestId = `req-${++seq}`;
    client.send("command", { requestId, text });
    return (
        await client.take((m) => m.type === "command_result" && m.payload.requestId === requestId)
    ).payload;
};

const becomeAdmin = async (client) => {
    const result = await run(client, `/admin ${ADMIN_KEY}`);
    assert.equal(result.tone, "admin", JSON.stringify(result));
};

describe("comandos", () => {
    let server;
    before(async () => {
        server = await startServer({ ADMIN_KEY });
    });
    after(() => server.stop());

    test("o catálogo chega depois da sessão, com permissões da pessoa", async () => {
        const { client } = await join(server.url, { userName: "Cat" });
        const catalog = (await client.take("command_catalog")).payload.commands;
        assert.equal(catalog.length, 28);
        assert.equal(catalog.find((c) => c.name === "clearall").allowed, false);
        assert.equal(catalog.find((c) => c.name === "clear").scope, "client");
        client.close();
    });

    test("(1) /clear de usuário comum: comando local, nada muda no servidor", async () => {
        const a = await join(server.url, { userName: "Comum" });
        const b = await join(server.url, { userName: "Outro" });
        a.client.send("chat_message", { content: "fica no servidor" });
        await b.client.take("chat_message");
        const result = await run(a.client, "/clear");
        assert.equal(result.code, "client_command");
        // Ninguém recebeu chat_cleared e o histórico continua lá.
        await barrier(a.client, b.client);
        assert.equal(b.client.count("chat_cleared"), 0);
        const late = await connect(server.url);
        late.send("user_login", { userName: "Depois" });
        const history = await late.take("message_history");
        assert.ok(history.payload.some((m) => m.payload.content === "fica no servidor"));
        a.client.close();
        b.client.close();
        late.close();
    });

    test("(2) usuário comum tentando /clearall é recusado", async () => {
        const { client } = await join(server.url, { userName: "SemPoder" });
        const result = await run(client, "/clearall confirmar");
        assert.equal(result.code, "forbidden");
        assert.equal(client.count("chat_cleared"), 0);
        client.close();
    });

    test("(3)(4) administrador limpa a sala com confirmação; os dois veem o efeito", async () => {
        const admin = await join(server.url, { userName: "Moderadora" });
        const user = await join(server.url, { userName: "Participante" });
        user.client.send("chat_message", { content: "vai sumir" });
        await admin.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "vai sumir",
        );
        await becomeAdmin(admin.client);

        const ask = await run(admin.client, "/clearall");
        assert.equal(ask.code, "confirmation_required");
        assert.equal(user.client.count("chat_cleared"), 0, "sem confirmação, nada acontece");

        admin.client.send("command", { requestId: "limpar", text: "/clearall confirmar" });
        for (const client of [admin.client, user.client]) {
            const cleared = await client.take("chat_cleared");
            assert.equal(cleared.payload.byName, "Moderadora");
            assert.equal(typeof cleared.payload.historyVersion, "number");
        }
        const late = await connect(server.url);
        late.send("user_login", { userName: "Chegou" });
        const session = await late.take("session");
        assert.ok(session.payload.historyVersion >= 1);
        await barrier(admin.client, late);
        assert.equal(
            late.count("message_history"),
            0,
            "quem chega depois não vê o que foi apagado",
        );
        await server.waitForLog((e) => e.event === "admin_action" && e.action === "clear_history");
        admin.client.close();
        user.client.close();
        late.close();
    });

    test("(6) texto começando com / enviado como mensagem comum não executa comando", async () => {
        const a = await join(server.url, { userName: "Texto" });
        await becomeAdmin(a.client);
        a.client.send("chat_message", { content: "/clearall confirmar" });
        const echo = await a.client.take("chat_message");
        assert.equal(echo.payload.content, "/clearall confirmar");
        assert.equal(a.client.count("chat_cleared"), 0);
        a.client.close();
    });

    test("(7) comando inexistente responde erro claro com sugestão", async () => {
        const { client } = await join(server.url, { userName: "Curioso" });
        const result = await run(client, "/rolll 20");
        assert.equal(result.code, "unknown_command");
        assert.match(result.text, /\/help/);
        assert.ok(result.lines?.[0]?.includes("/roll"));
        client.close();
    });

    test("(8) manipular permissão pelo cliente não funciona", async () => {
        const admin = await join(server.url, { userName: "AdmReal" });
        await becomeAdmin(admin.client);
        // Login pedindo papel e id de administrador: ignorados.
        const forged = await join(server.url, {
            userName: "Falso",
            role: "admin",
            isAdmin: true,
            userId: admin.session.id,
        });
        assert.equal(forged.session.role, "member");
        assert.notEqual(forged.session.id, admin.session.id);
        // Comando com papel e id no payload: ignorados.
        forged.client.send("command", {
            requestId: "forjado",
            text: "/kick AdmReal",
            role: "admin",
            isAdmin: true,
            userId: admin.session.id,
        });
        const result = await forged.client.take((m) => m.type === "command_result");
        assert.equal(result.payload.code, "forbidden");
        assert.equal(admin.client.closed, null);
        admin.client.close();
        forged.client.close();
    });

    test("/admin: chave errada recusa, chave nunca vai para o log, catálogo é reenviado", async () => {
        const { client } = await join(server.url, { userName: "Candidato" });
        await client.take("command_catalog");
        assert.equal((await run(client, "/admin chave-errada-123456789")).code, "admin_wrong_key");
        await becomeAdmin(client);
        const catalog = await client.take("command_catalog");
        assert.equal(catalog.payload.commands.find((c) => c.name === "kick").allowed, true);
        const logs = server.lines.join("\n");
        assert.ok(!logs.includes(ADMIN_KEY));
        assert.ok(!logs.includes("chave-errada-123456789"));
        client.close();
    });

    test("/announce, /me, /roll, /flip e formatação chegam a todos com kind/format", async () => {
        const admin = await join(server.url, { userName: "Anunciante" });
        const reader = await join(server.url, { userName: "Leitor" });
        await becomeAdmin(admin.client);
        admin.client.send("command", {
            requestId: "a1",
            text: "/announce Reunião começando agora!",
        });
        admin.client.send("command", { requestId: "a2", text: "/me está estudando" });
        admin.client.send("command", { requestId: "a3", text: "/roll 1 100" });
        admin.client.send("command", { requestId: "a4", text: "/flip" });
        admin.client.send("command", { requestId: "a5", text: "/spoiler o fim" });
        admin.client.send("command", { requestId: "a6", text: "/shrug sei lá" });
        const got = [];
        for (let i = 0; i < 6; i += 1) got.push((await reader.client.take("chat_message")).payload);
        assert.deepEqual(
            got.map((p) => [p.kind ?? "text", p.format ?? null]),
            [
                ["announcement", null],
                ["action", null],
                ["roll", null],
                ["roll", null],
                ["text", "spoiler"],
                ["text", null],
            ],
        );
        const roll = Number(/: (\d+)$/.exec(got[2].content)?.[1]);
        assert.ok(roll >= 1 && roll <= 100);
        assert.match(got[3].content, /cara|coroa/);
        assert.equal(got[5].content, "sei lá ¯\\_(ツ)_/¯");
        const bad = await run(admin.client, "/roll 5 1");
        assert.equal(bad.code, "invalid_arguments");
        admin.client.close();
        reader.client.close();
    });

    test("/nick e /afk mudam nome e presença sem mudar o id", async () => {
        const a = await join(server.url, { userName: "Antes" });
        const b = await join(server.url, { userName: "Vê" });
        assert.equal((await run(a.client, "/nick Depois Silva")).tone, "success");
        const notice = await b.client.take(
            (m) => m.type === "notice" && m.payload.text.includes("Depois Silva"),
        );
        assert.ok(notice);
        await run(a.client, "/afk almoçando");
        const list = await b.client.take(
            (m) =>
                m.type === "user_list" &&
                m.payload.some((p) => p.id === a.session.id && p.status === "away"),
        );
        const me = list.payload.find((p) => p.id === a.session.id);
        assert.equal(me.name, "Depois Silva");
        assert.equal(me.statusText, "almoçando");
        a.client.close();
        b.client.close();
    });

    test("/users, /profile, /id, /ping, /rules, /version e /about respondem só a quem pediu", async () => {
        const a = await join(server.url, { userName: "Pergunta" });
        const b = await join(server.url, { userName: "Silencioso" });
        assert.ok(
            (await run(a.client, "/users")).lines.some((line) => line.startsWith("Silencioso")),
        );
        assert.ok((await run(a.client, "/profile Silencioso")).lines[0].includes(b.session.id));
        assert.ok((await run(a.client, "/id")).text.includes(a.session.id));
        assert.equal((await run(a.client, "/ping")).text, "pong");
        assert.ok((await run(a.client, "/rules")).lines.length >= 3);
        assert.match((await run(a.client, "/version")).text, /1\.0\.0/);
        assert.equal((await run(a.client, "/about")).tone, "info");
        await barrier(a.client, b.client);
        assert.equal(b.client.count("command_result"), 0);
        a.client.close();
        b.client.close();
    });
});

describe("moderação", () => {
    let server;
    before(async () => {
        server = await startServer({ ADMIN_KEY });
    });
    after(() => server.stop());

    test("/mute impede mensagens (com ref do envio recusado); /unmute libera", async () => {
        const admin = await join(server.url, { userName: "Mod" });
        const target = await join(server.url, { userName: "Barulho" });
        await becomeAdmin(admin.client);
        admin.client.send("command", { requestId: "m", text: "/mute Barulho 5" });
        await target.client.take(
            (m) => m.type === "notice" && m.payload.text.includes("silenciado"),
        );
        target.client.send("chat_message", { content: "posso?", clientMsgId: "tentativa-1" });
        const error = await target.client.take("error");
        assert.equal(error.payload.code, "muted");
        assert.equal(error.payload.ref, "tentativa-1");
        assert.equal((await run(target.client, "/me grita")).code, "muted");
        admin.client.send("command", { requestId: "u", text: "/unmute Barulho" });
        await target.client.take(
            (m) => m.type === "notice" && m.payload.text.includes("pode voltar"),
        );
        target.client.send("chat_message", { content: "voltei" });
        await admin.client.take((m) => m.type === "chat_message" && m.payload.content === "voltei");
        admin.client.close();
        target.client.close();
    });

    test("/kick: fecha com 4003, avisa a sala e o token deixa de valer", async () => {
        const admin = await join(server.url, { userName: "Juiz" });
        const target = await join(server.url, { userName: "Expulso" });
        const witness = await join(server.url, { userName: "Testemunha" });
        await becomeAdmin(admin.client);
        admin.client.send("command", { requestId: "k", text: "/kick Expulso" });
        assert.equal((await target.client.waitClose()).code, 4003);
        const left = await witness.client.take(
            (m) => m.type === "user_left" && m.payload.userName === "Expulso",
        );
        assert.equal(left.payload.reason, "removed");
        await witness.client.take(
            (m) => m.type === "notice" && m.payload.text.includes("removido"),
        );
        const back = await join(server.url, {
            userName: "Expulso",
            resumeToken: target.session.resumeToken,
        });
        assert.notEqual(back.session.id, target.session.id);
        for (const c of [admin, witness, back]) c.client.close();
    });

    test("hierarquia: não modera a si mesmo nem outro administrador; alvo ambíguo pede id", async () => {
        const a = await join(server.url, { userName: "Adm1" });
        const b = await join(server.url, { userName: "Adm2" });
        const x1 = await join(server.url, { userName: "Repetido" });
        const x2 = await join(server.url, { userName: "Repetido" });
        await becomeAdmin(a.client);
        await becomeAdmin(b.client);
        assert.equal((await run(a.client, "/kick Adm1")).code, "cannot_moderate");
        assert.equal((await run(a.client, "/kick Adm2")).code, "cannot_moderate");
        assert.equal((await run(a.client, "/mute Repetido")).code, "ambiguous_target");
        assert.equal((await run(a.client, "/mute Ninguem")).code, "not_found");
        const viaId = await run(a.client, `/mute ${x2.session.id.slice(0, 8)} 1`);
        assert.equal(viaId.code, undefined);
        for (const c of [a, b, x1, x2]) c.client.close();
    });
});

describe("administração desativada", () => {
    test("sem ADMIN_KEY, /admin informa que está desativada", async () => {
        const server = await startServer({ ADMIN_KEY: "" });
        const { client } = await join(server.url, { userName: "X" });
        assert.equal((await run(client, "/admin qualquer-coisa-123456")).code, "admin_disabled");
        assert.equal((await run(client, "/kick X")).code, "forbidden");
        client.close();
        await server.stop();
    });
});

describe("entrega e reconexão", () => {
    test("mensagem reenviada com o mesmo clientMsgId não duplica", async () => {
        const server = await startServer();
        const a = await join(server.url, { userName: "Reenvia" });
        const b = await join(server.url, { userName: "Recebe" });
        a.client.send("chat_message", { content: "uma vez", clientMsgId: "fixo-1" });
        const first = await a.client.take("chat_message");
        assert.equal(first.payload.clientMsgId, "fixo-1");
        a.client.send("chat_message", { content: "uma vez", clientMsgId: "fixo-1" });
        const again = await a.client.take("chat_message");
        assert.equal(again.id, first.id);
        await barrier(a.client, b.client);
        assert.equal(
            b.client.count((m) => m.type === "chat_message" && m.payload.content === "uma vez"),
            1,
        );
        a.client.close();
        b.client.close();
        await server.stop();
    });

    test("queda e volta dentro da janela: nenhum 'saiu'/'entrou' para os outros", async () => {
        const server = await startServer({ LEAVE_GRACE_MS: "1500" });
        const watcher = await join(server.url, { userName: "Vigia" });
        const flaky = await join(server.url, { userName: "Instável" });
        await watcher.client.take(
            (m) => m.type === "user_joined" && m.payload.userName === "Instável",
        );
        flaky.client.ws.terminate();
        await new Promise((resolve) => setTimeout(resolve, 300));
        const back = await join(server.url, {
            userName: "Instável",
            resumeToken: flaky.session.resumeToken,
        });
        assert.equal(back.session.id, flaky.session.id);
        await new Promise((resolve) => setTimeout(resolve, 1800));
        await barrier(back.client, watcher.client);
        assert.equal(watcher.client.count("user_left"), 0);
        assert.equal(watcher.client.count("user_joined"), 0);
        back.client.close();
        const left = await watcher.client.take("user_left", 4000);
        assert.equal(
            left.payload.userName,
            "Instável",
            "saída definitiva é anunciada após a janela",
        );
        watcher.client.close();
        await server.stop();
    });
});
