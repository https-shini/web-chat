// Camada de entrada do protocolo com um WebSocket falso: limites, envelope,
// encaminhamento ao hub (sessões e salas) e tratamento de erro inesperado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createConnectionHandler } from "../../src/transport/connection.js";

class FakeSocket extends EventEmitter {
    OPEN = 1;
    readyState = 1;
    sent = [];
    terminated = false;
    send(data) {
        this.sent.push(JSON.parse(data));
    }
    terminate() {
        this.terminated = true;
    }
    closed = null;
    close(code, reason) {
        this.closed = { code, reason };
    }
    frame(value) {
        this.emit("message", Buffer.from(JSON.stringify(value)), false);
    }
}

const setup = (hubOverrides = {}) => {
    let time = 0;
    const calls = [];
    const logs = [];
    const hub = {
        login: (ws, payload) => (calls.push(["login", payload]), { ok: true, replaced: null }),
        post: (ws, payload) => (calls.push(["post", payload]), { ok: true }),
        typing: (ws, payload, isTyping) => calls.push(["typing", payload, isTyping]),
        disconnect: () => calls.push(["disconnect"]),
        createRoom: (ws, payload) => (calls.push(["createRoom", payload]), { ok: true }),
        joinRoom: (ws, payload) => (
            calls.push(["joinRoom", payload]),
            { ok: true, already: false }
        ),
        leaveRoom: (ws, payload) => (calls.push(["leaveRoom", payload]), { ok: true }),
        conversationsOf: () => ({ rooms: [], dms: [] }),
        isLoggedIn: () => false,
        userIdOf: () => null,
        ...hubOverrides,
    };
    const handle = createConnectionHandler({
        hub,
        log: (level, event, fields) => logs.push({ level, event, ...fields }),
        messageRate: { capacity: 3, refillPerSecond: 1 },
        signalRate: { capacity: 2, refillPerSecond: 1 },
        now: () => time,
    });
    const ws = new FakeSocket();
    handle(ws);
    return { ws, calls, logs, tick: (ms) => (time += ms) };
};

test("encaminha cada evento ao método certo do hub", () => {
    const { ws, calls } = setup();
    const conversationId = "r_abcdefghijkl";
    ws.frame({ type: "user_login", payload: { userName: "Ana", username: "ana" } });
    ws.frame({ type: "chat_message", payload: { conversationId, content: "oi" } });
    ws.frame({ type: "typing_start", payload: { conversationId } });
    ws.frame({ type: "typing_stop", payload: { conversationId } });
    ws.emit("close");
    assert.deepEqual(calls, [
        ["login", { userName: "Ana", username: "ana" }],
        ["post", { conversationId, content: "oi" }],
        ["typing", { conversationId }, true],
        ["typing", { conversationId }, false],
        ["disconnect"],
    ]);
});

test("pedidos de sala chegam ao hub; room_list responde com as salas e o requestId", () => {
    const summary = { conversationId: "r_abcdefghijkl", code: "abc-defg-hij" };
    const { ws, calls, tick } = setup({ conversationsOf: () => ({ rooms: [summary], dms: [] }) });
    ws.frame({ type: "room_create", payload: { name: "Estudos" } });
    ws.frame({ type: "room_join", payload: { code: "abc-defg-hij" } });
    ws.frame({ type: "room_leave", payload: { conversationId: "r_abcdefghijkl" } });
    tick(1000); // o balde do teste tem 3 fichas
    ws.frame({ type: "room_list", payload: { requestId: "lista-1" } });
    assert.deepEqual(calls, [
        ["createRoom", { name: "Estudos" }],
        ["joinRoom", { code: "abc-defg-hij" }],
        ["leaveRoom", { conversationId: "r_abcdefghijkl" }],
    ]);
    assert.deepEqual(ws.sent, [
        { type: "room_list", payload: { rooms: [summary], dms: [], requestId: "lista-1" } },
    ]);
});

test("recusa de sala vira erro com o requestId e, quando houver, a conversa", () => {
    const { ws } = setup({
        joinRoom: () => ({ ok: false, code: "room_not_found" }),
        leaveRoom: () => ({ ok: false, code: "conversation_not_found" }),
    });
    ws.frame({ type: "room_join", payload: { code: "xxx-xxxx-xxx", requestId: "j1" } });
    ws.frame({
        type: "room_leave",
        payload: { conversationId: "r_naoparticipo1", requestId: "l1" },
    });
    assert.equal(ws.sent[0].payload.code, "room_not_found");
    assert.equal(ws.sent[0].payload.ref, "j1");
    assert.equal(ws.sent[1].payload.code, "conversation_not_found");
    assert.equal(ws.sent[1].conversationId, "r_naoparticipo1");
});

test("user_logout: encerra a identidade e fecha a conexão com 4004", () => {
    const { ws, calls } = setup({ logout: () => (calls.push(["logout"]), true) });
    ws.frame({ type: "user_logout" });
    assert.deepEqual(calls, [["logout"]]);
    assert.deepEqual(ws.closed, { code: 4004, reason: "Você saiu" });
});

test("user_logout sem sessão também fecha a conexão (sem efeito)", () => {
    const { ws } = setup({ logout: () => false });
    ws.frame({ type: "user_logout" });
    assert.equal(ws.closed?.code, 4004);
});

test("recusa do hub vira erro com código e log com contexto", () => {
    const { ws, logs } = setup({ post: () => ({ ok: false, code: "not_logged_in" }) });
    ws.frame({ type: "chat_message", payload: { content: "oi" } });
    assert.deepEqual(ws.sent, [
        { type: "error", payload: { code: "not_logged_in", message: "Usuário não autenticado" } },
    ]);
    const entry = logs.find((item) => item.event === "request_rejected");
    assert.equal(entry.level, "warn");
    assert.equal(entry.operation, "chat_message");
    assert.equal(entry.category, "authorization");
});

test("sinais e mensagens têm baldes separados", () => {
    const { ws, calls } = setup();
    for (let index = 0; index < 10; index += 1) ws.frame({ type: "typing_start" });
    ws.frame({ type: "chat_message", payload: { content: "passa" } });
    assert.equal(calls.filter(([name]) => name === "typing").length, 2, "sinais limitados");
    assert.equal(calls.filter(([name]) => name === "post").length, 1, "mensagem não afetada");
    assert.equal(ws.sent.length, 0, "sinal excedente não gera resposta");
});

test("mensagem excedente recebe rate_limited, no máximo 1 aviso por segundo", () => {
    const { ws, calls, tick } = setup();
    for (let index = 0; index < 10; index += 1) {
        ws.frame({ type: "chat_message", payload: { content: `m${index}` } });
    }
    assert.equal(calls.length, 3);
    assert.deepEqual(
        ws.sent.map((message) => message.payload.code),
        ["rate_limited"],
    );
    tick(1000);
    ws.frame({ type: "chat_message", payload: { content: "x" } }); // repôs 1 ficha
    ws.frame({ type: "chat_message", payload: { content: "y" } }); // recusada, novo aviso
    assert.equal(ws.sent.filter((m) => m.payload.code === "rate_limited").length, 2);
});

test("quadro inválido: log de uma linha com motivo, resposta com código", () => {
    const { ws, logs } = setup();
    ws.emit("message", Buffer.from("{"), false);
    ws.frame({ type: "tipo_inventado" });
    assert.deepEqual(
        ws.sent.map((message) => message.payload.code),
        ["invalid_message", "unknown_type"],
    );
    assert.deepEqual(
        logs.filter((item) => item.event === "invalid_message").map((item) => item.reason),
        ["invalid_json", "unknown_type"],
    );
});

test("defeito do servidor: cliente recebe só internal_error; log tem stack", () => {
    const { ws, logs } = setup({
        post: () => {
            throw new Error("bug interno com detalhe sensível");
        },
    });
    ws.frame({ type: "chat_message", payload: { content: "oi" } });
    assert.deepEqual(ws.sent, [
        { type: "error", payload: { code: "internal_error", message: "Erro interno do servidor" } },
    ]);
    assert.ok(!JSON.stringify(ws.sent).includes("sensível"));
    const entry = logs.find((item) => item.event === "handler_failed");
    assert.equal(entry.level, "error");
    assert.match(entry.stack, /bug interno/);
});

test("retomada que substitui conexão antiga encerra a antiga", () => {
    const old = new FakeSocket();
    const { ws } = setup({ login: () => ({ ok: true, replaced: old }) });
    ws.frame({ type: "user_login", payload: { userName: "Ana", username: "ana" } });
    assert.equal(old.terminated, true);
});

test("falha em uma conexão não afeta outra", () => {
    let fail = true;
    const hub = {
        login: () => ({ ok: true, replaced: null }),
        post: () => {
            if (fail) throw new Error("x");
            return { ok: true };
        },
        typing() {},
        disconnect() {},
        isLoggedIn: () => false,
        userIdOf: () => null,
    };
    const handle = createConnectionHandler({
        hub: /** @type {any} */ (hub),
        log: () => {},
        messageRate: { capacity: 5, refillPerSecond: 1 },
        signalRate: { capacity: 5, refillPerSecond: 1 },
    });
    const a = new FakeSocket();
    const b = new FakeSocket();
    handle(a);
    handle(b);
    a.frame({ type: "chat_message", payload: { content: "quebra" } });
    fail = false;
    b.frame({ type: "chat_message", payload: { content: "segue" } });
    assert.equal(a.sent[0].payload.code, "internal_error");
    assert.equal(b.sent.length, 0);
});
