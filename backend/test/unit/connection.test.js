// Camada de entrada do protocolo com um WebSocket falso: limites, envelope,
// encaminhamento à sala e tratamento de erro inesperado.

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

const setup = (roomOverrides = {}) => {
    let time = 0;
    const calls = [];
    const logs = [];
    const room = {
        join: (ws, payload) => (calls.push(["join", payload]), { ok: true, replaced: null }),
        post: (ws, payload) => (calls.push(["post", payload]), { ok: true }),
        typing: (ws, isTyping) => calls.push(["typing", isTyping]),
        leave: () => calls.push(["leave"]),
        isMember: () => false,
        userIdOf: () => null,
        ...roomOverrides,
    };
    const handle = createConnectionHandler({
        room,
        log: (level, event, fields) => logs.push({ level, event, ...fields }),
        messageRate: { capacity: 3, refillPerSecond: 1 },
        signalRate: { capacity: 2, refillPerSecond: 1 },
        now: () => time,
    });
    const ws = new FakeSocket();
    handle(ws);
    return { ws, calls, logs, tick: (ms) => (time += ms) };
};

test("encaminha cada evento ao método certo da sala", () => {
    const { ws, calls } = setup();
    ws.frame({ type: "user_login", payload: { userName: "Ana", username: "ana" } });
    ws.frame({ type: "chat_message", payload: { content: "oi" } });
    ws.frame({ type: "typing_start" });
    ws.frame({ type: "typing_stop" });
    ws.emit("close");
    assert.deepEqual(calls, [
        ["join", { userName: "Ana", username: "ana" }],
        ["post", { content: "oi" }],
        ["typing", true],
        ["typing", false],
        ["leave"],
    ]);
});

test("user_logout: encerra a identidade na sala e fecha a conexão com 4004", () => {
    const { ws, calls } = setup({ logout: () => (calls.push(["logout"]), true) });
    ws.frame({ type: "user_logout" });
    assert.deepEqual(calls, [["logout"]]);
    assert.deepEqual(ws.closed, { code: 4004, reason: "Você saiu da sala" });
});

test("user_logout fora da sala também fecha a conexão (sem efeito na sala)", () => {
    const { ws } = setup({ logout: () => false });
    ws.frame({ type: "user_logout" });
    assert.equal(ws.closed?.code, 4004);
});

test("recusa da sala vira erro com código e log com contexto", () => {
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
    const { ws } = setup({ join: () => ({ ok: true, replaced: old }) });
    ws.frame({ type: "user_login", payload: { userName: "Ana", username: "ana" } });
    assert.equal(old.terminated, true);
});

test("falha em uma conexão não afeta outra", () => {
    let fail = true;
    const room = {
        join: () => ({ ok: true, replaced: null }),
        post: () => {
            if (fail) throw new Error("x");
            return { ok: true };
        },
        typing() {},
        leave() {},
        isMember: () => false,
        userIdOf: () => null,
    };
    const handle = createConnectionHandler({
        room,
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
