// Configuração de ambiente (F1-02). Problemas: P03, P30.
//
// Para provar de onde o servidor lê o `.env` sem tocar em nenhum arquivo real
// do desenvolvedor, cada teste copia o backend (src/ e package.json) para uma
// árvore temporária com a mesma forma do repositório (<raiz>/backend/...) e
// aponta node_modules para as dependências instaladas por link simbólico —
// imports ESM não consultam NODE_PATH.

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer, connect, join, freePort, BACKEND_DIR } from "./helpers.js";

const roots = [];
after(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Monta <tmp>/backend/{src,package.json,node_modules} e os .env pedidos.
 * @param {{root?: string, legacy?: string}} files conteúdo de <tmp>/.env e <tmp>/backend/.env
 */
const sandbox = ({ root, legacy }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "web-chat-env-"));
    roots.push(dir);
    const backend = path.join(dir, "backend");
    fs.mkdirSync(backend);
    fs.cpSync(path.join(BACKEND_DIR, "src"), path.join(backend, "src"), { recursive: true });
    fs.copyFileSync(path.join(BACKEND_DIR, "package.json"), path.join(backend, "package.json"));
    fs.symlinkSync(
        path.join(BACKEND_DIR, "node_modules"),
        path.join(backend, "node_modules"),
        "dir",
    );
    if (root !== undefined) fs.writeFileSync(path.join(dir, ".env"), root);
    if (legacy !== undefined) fs.writeFileSync(path.join(backend, ".env"), legacy);
    return path.join(backend, "src", "server.js");
};

/** Ambiente sem as variáveis do projeto: só o que vier dos arquivos vale. */
const cleanEnv = (extra = {}) => {
    const env = { ...process.env, NODE_ENV: "test", ...extra };
    for (const key of ["PORT", "ALLOWED_ORIGINS", "HEARTBEAT_MS"]) {
        if (!(key in extra)) delete env[key];
    }
    return env;
};

const startFrom = async (files, extra = {}) => {
    const port = await freePort();
    const script = sandbox({
        root: files.root?.replace("{PORT}", String(port)),
        legacy: files.legacy?.replace("{PORT}", String(port)),
    });
    const server = await startServer(
        {},
        { script, baseEnv: cleanEnv(extra), waitListening: false },
    );
    const listening = await server.waitForLog((entry) => entry.event === "server_listening");
    server.port = listening.port;
    server.url = `ws://127.0.0.1:${listening.port}`;
    return { server, listening, port };
};

describe("carregamento do .env", () => {
    test("o .env da raiz do repositório é lido (PORT e ALLOWED_ORIGINS)", async () => {
        const { server, listening, port } = await startFrom({
            root: "PORT={PORT}\nALLOWED_ORIGINS=https://raiz.example\n",
        });
        assert.equal(listening.port, port);
        assert.deepEqual(listening.allowedOrigins, ["https://raiz.example"]);
        await assert.rejects(connect(server.url, { origin: "https://outra.example" }), {
            status: 403,
        });
        const ok = await connect(server.url, { origin: "https://raiz.example" });
        ok.close();
        await server.stop();
    });

    test("backend/.env continua aceito quando a raiz não define a variável", async () => {
        const { server, listening } = await startFrom({
            legacy: "PORT={PORT}\nALLOWED_ORIGINS=https://legado.example\n",
        });
        assert.deepEqual(listening.allowedOrigins, ["https://legado.example"]);
        await server.stop();
    });

    test("a raiz tem precedência sobre backend/.env", async () => {
        const { server, listening } = await startFrom({
            root: "PORT={PORT}\nALLOWED_ORIGINS=https://raiz.example\n",
            legacy: "ALLOWED_ORIGINS=https://legado.example\n",
        });
        assert.deepEqual(listening.allowedOrigins, ["https://raiz.example"]);
        await server.stop();
    });

    test("variáveis do ambiente do processo têm precedência sobre os arquivos", async () => {
        const { server, listening } = await startFrom(
            { root: "PORT={PORT}\nALLOWED_ORIGINS=https://raiz.example\n" },
            { ALLOWED_ORIGINS: "https://processo.example" },
        );
        assert.deepEqual(listening.allowedOrigins, ["https://processo.example"]);
        await server.stop();
    });
});

describe("validação da configuração", () => {
    test("origens são normalizadas (barra final, espaços, maiúsculas no host)", async () => {
        const server = await startServer({
            ALLOWED_ORIGINS: " https://Ok.Example/ , http://localhost:5173 ",
        });
        const listening = await server.waitForLog((entry) => entry.event === "server_listening");
        assert.deepEqual(listening.allowedOrigins, ["https://ok.example", "http://localhost:5173"]);
        const { client } = await join(
            server.url,
            { userName: "x" },
            { origin: "https://ok.example" },
        );
        client.close();
        await server.stop();
    });

    for (const [label, value] of [
        ["sem esquema", "meuchat.com"],
        ["com caminho", "https://meuchat.com/app"],
        ["esquema não http", "ftp://meuchat.com"],
        ["curinga", "*"],
    ]) {
        test(`ALLOWED_ORIGINS inválida (${label}) impede a inicialização com erro claro`, async () => {
            const server = await startServer({ ALLOWED_ORIGINS: value }, { waitListening: false });
            assert.equal(await server.exited, 1);
            const entry = server.entries().find((item) => item.event === "config_invalid");
            assert.ok(entry, server.lines.join("\n"));
            assert.equal(entry.variable, "ALLOWED_ORIGINS");
            assert.match(entry.message, /origem/i);
        });
    }

    for (const value of ["abc", "-1", "70000", "80.5"]) {
        test(`PORT inválida (${value}) impede a inicialização`, async () => {
            const server = await startServer({ PORT: value }, { waitListening: false });
            assert.equal(await server.exited, 1);
            const entry = server.entries().find((item) => item.event === "config_invalid");
            assert.equal(entry?.variable, "PORT");
        });
    }

    test("sem ALLOWED_ORIGINS o servidor sobe e avisa que aceita qualquer origem", async () => {
        const server = await startServer({ ALLOWED_ORIGINS: "", NODE_ENV: "production" });
        const warning = await server.waitForLog(
            (entry) => entry.event === "allowed_origins_disabled",
        );
        assert.equal(warning.level, "warn");
        const listening = await server.waitForLog((entry) => entry.event === "server_listening");
        assert.deepEqual(listening.allowedOrigins, []);
        const client = await connect(server.url, { origin: "https://qualquer.example" });
        client.close();
        await server.stop();
    });

    test("responde 200 a requisição HTTP comum (checagem de saúde preservada)", async () => {
        const server = await startServer();
        const response = await fetch(`http://127.0.0.1:${server.port}/`);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "ok");
        await server.stop();
    });
});

describe("parâmetros operacionais por ambiente (F2-06)", () => {
    test("RATE_MESSAGES_CAPACITY é aplicada de ponta a ponta", async () => {
        const server = await startServer({
            RATE_MESSAGES_CAPACITY: "3",
            RATE_MESSAGES_PER_SEC: "1",
        });
        const { client } = await join(server.url, { userName: "Limitado" });
        // O login gastou 1 ficha: restam 2 mensagens antes do aviso.
        for (let index = 0; index < 4; index += 1) {
            client.send("chat_message", { content: `m${index}` });
        }
        const error = await client.take("error");
        assert.equal(error.payload.code, "rate_limited");
        assert.equal(client.count("chat_message"), 2);
        client.close();
        await server.stop();
    });

    test("HISTORY_ON_JOIN limita o histórico entregue a quem entra", async () => {
        const server = await startServer({ HISTORY_ON_JOIN: "2" });
        const writer = await join(server.url, { userName: "Escreve" });
        for (const content of ["a", "b", "c"]) writer.client.send("chat_message", { content });
        await writer.client.take((m) => m.type === "chat_message" && m.payload.content === "c");
        const reader = await join(server.url, { userName: "Lê" });
        const history = await reader.client.take("message_history");
        assert.deepEqual(
            history.payload.map((entry) => entry.payload.content),
            ["b", "c"],
        );
        writer.client.close();
        reader.client.close();
        await server.stop();
    });

    for (const [variable, value] of [
        ["MAX_CONNECTIONS", "0"],
        ["MAX_PAYLOAD_BYTES", "100"],
        ["HISTORY_ON_JOIN", "5000"],
    ]) {
        test(`${variable}=${value} impede a inicialização`, async () => {
            const server = await startServer({ [variable]: value }, { waitListening: false });
            assert.equal(await server.exited, 1);
            const entry = server.entries().find((item) => item.event === "config_invalid");
            assert.equal(entry?.variable, variable);
        });
    }
});

describe("falha de infraestrutura", () => {
    test("porta ocupada: log listen_failed de uma linha, sem stack, saída 1", async () => {
        const first = await startServer();
        const second = await startServer({ PORT: String(first.port) }, { waitListening: false });
        assert.equal(await second.exited, 1);
        const entry = second.entries().find((item) => item.event === "listen_failed");
        assert.equal(entry?.code, "EADDRINUSE");
        assert.ok(!second.lines.join("\n").includes("    at "), second.lines.join("\n"));
        await first.stop();
    });
});
