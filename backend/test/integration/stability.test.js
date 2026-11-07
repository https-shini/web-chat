// Fase 3: heartbeat tolerante, prazo de login, cliente lento, agrupamento da
// lista, métricas e limpeza de recursos — com o servidor real.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { startServer, connect, join } from "./helpers.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const metricsOf = async (server) => (await fetch(`http://127.0.0.1:${server.port}/metrics`)).json();

describe("heartbeat tolerante", () => {
    test("perder pings isolados não derruba; ficar mudo derruba após o limite", async () => {
        const server = await startServer({ HEARTBEAT_MS: "150", HEARTBEAT_MAX_MISSED: "3" });
        const observer = await join(server.url, { userName: "Vivo" });

        // Lento: não responde ping sozinho, mas responde um a cada três.
        const slow = await join(server.url, { userName: "Lento" }, { autoPong: false });
        let pings = 0;
        slow.client.ws.on("ping", () => {
            pings += 1;
            if (pings % 3 === 0) slow.client.ws.pong();
        });
        // Mudo: nunca responde nem envia nada.
        await join(server.url, { userName: "Mudo" }, { autoPong: false });
        // Ativo sem pong: envia quadros (digitação) — atividade também conta.
        const chatty = await join(server.url, { userName: "Falante" }, { autoPong: false });
        const keepTalking = setInterval(() => chatty.client.send("typing_start", {}), 100);

        const left = await observer.client.take(
            (m) => m.type === "user_left" && m.payload.userName === "Mudo",
            3000,
        );
        assert.ok(left);
        await sleep(900); // ~6 intervalos: tempo de sobra para derrubar quem fosse cair
        clearInterval(keepTalking);

        assert.equal(slow.client.closed, null, "lento continua conectado");
        assert.equal(chatty.client.closed, null, "quem envia quadros continua conectado");
        assert.equal(observer.client.closed, null);
        assert.equal(
            observer.client.count((m) => m.type === "user_left"),
            0,
            "só o mudo saiu",
        );
        await server.stop();
    });
});

describe("prazo de login", () => {
    test("conexão anônima é fechada com 4001; quem entra fica", async () => {
        const server = await startServer({ LOGIN_TIMEOUT_MS: "300" });
        const anonymous = await connect(server.url);
        const member = await join(server.url, { userName: "Entrou" });
        const closed = await anonymous.waitClose(2000);
        assert.equal(closed.code, 4001);
        await sleep(400);
        assert.equal(member.client.closed, null);
        await server.stop();
    });

    test("nome recusado não reinicia o prazo: quem insiste sem entrar é fechado", async () => {
        const server = await startServer({ LOGIN_TIMEOUT_MS: "300" });
        const client = await connect(server.url);
        const insist = setInterval(() => client.send("user_login", { userName: "   " }), 50);
        const closed = await client.waitClose(2000);
        clearInterval(insist);
        assert.equal(closed.code, 4001);
        await server.stop();
    });
});

describe("cliente lento (fila de envio)", () => {
    test("quem para de ler é desconectado; os outros seguem recebendo", async () => {
        const server = await startServer({
            MAX_BUFFERED_BYTES: "65536",
            RATE_MESSAGES_CAPACITY: "100000",
            RATE_MESSAGES_PER_SEC: "100000",
            METRICS_ENABLED: "true",
        });
        const reader = await join(server.url, { userName: "Lê" });
        const stalled = await join(server.url, { userName: "Parado" });
        stalled.client.ws._socket.pause();
        const talker = await join(server.url, { userName: "Fala" });

        // Os primeiros megabytes cabem nos buffers do kernel (loopback); só
        // depois a fila do `ws` cresce. Envia até a desconexão, com teto.
        const big = "x".repeat(990);
        const stalledLeft = () =>
            reader.client.inbox.some(
                (m) => m.type === "user_left" && m.payload.userName === "Parado",
            );
        for (let round = 0; round < 100 && !stalledLeft(); round += 1) {
            for (let index = 0; index < 300; index += 1) {
                talker.client.send("chat_message", { content: big });
            }
            await sleep(30);
        }
        const left = await reader.client.take(
            (m) => m.type === "user_left" && m.payload.userName === "Parado",
            10000,
        );
        assert.ok(left);
        talker.client.send("chat_message", { content: "ainda entrego" });
        await reader.client.take(
            (m) => m.type === "chat_message" && m.payload.content === "ainda entrego",
        );
        const metrics = await metricsOf(server);
        assert.ok(metrics.counters.slowConsumerDisconnects >= 1);
        await server.waitForLog((entry) => entry.event === "slow_consumer");
        await server.stop();
    });
});

describe("agrupamento da lista de pessoas", () => {
    test("30 entradas simultâneas: poucas listas, estado final correto", async () => {
        const server = await startServer({ METRICS_ENABLED: "true" });
        const observer = await join(server.url, { userName: "Observa" });
        const crowd = await Promise.all(
            Array.from({ length: 30 }, (_, i) => join(server.url, { userName: `p${i}` })),
        );
        const final = await observer.client.take(
            (m) => m.type === "user_list" && m.payload.length === 31,
            3000,
        );
        assert.equal(new Set(final.payload.map((p) => p.id)).size, 31);
        const metrics = await metricsOf(server);
        assert.ok(
            metrics.counters.userListBroadcasts < 31,
            `listas enviadas: ${metrics.counters.userListBroadcasts} (sem agrupamento seriam 31)`,
        );
        for (const { client } of crowd) client.close();
        observer.client.close();
        await server.stop();
    });
});

describe("métricas e limpeza de recursos", () => {
    test("/metrics desligado por padrão", async () => {
        const server = await startServer();
        assert.equal((await fetch(`http://127.0.0.1:${server.port}/metrics`)).status, 404);
        await server.stop();
    });

    test("contadores refletem a atividade; nada de nomes ou conteúdo", async () => {
        const server = await startServer({ METRICS_ENABLED: "true" });
        const a = await join(server.url, { userName: "NomeSecreto" });
        a.client.send("chat_message", { content: "conteudo-secreto" });
        a.client.send("chat_message", { content: "   " });
        a.client.sendRaw("{");
        await a.client.take("chat_message");
        await a.client.take("error");
        await a.client.take("error");
        const text = await (await fetch(`http://127.0.0.1:${server.port}/metrics`)).text();
        assert.ok(!text.includes("NomeSecreto") && !text.includes("conteudo-secreto"));
        const metrics = JSON.parse(text);
        assert.equal(metrics.counters.connectionsOpened, 1);
        assert.equal(metrics.counters.messagesAccepted, 1);
        assert.equal(metrics.counters.requestsRejected.empty_message, 1);
        assert.equal(metrics.counters.invalidFrames.invalid_json, 1);
        assert.equal(metrics.counters.framesReceived.user_login, 1);
        assert.equal(metrics.gauges.users, 1);
        assert.ok(metrics.processing.frames >= 4);
        a.client.close();
        await server.stop();
    });

    test("após 200 ciclos de entrar e sair, não sobra conexão nem membro", async () => {
        const server = await startServer({ METRICS_ENABLED: "true" });
        for (let batch = 0; batch < 10; batch += 1) {
            const people = await Promise.all(
                Array.from({ length: 20 }, (_, i) =>
                    join(server.url, { userName: `c${batch}-${i}` }),
                ),
            );
            for (const { client } of people) client.close();
            await Promise.all(people.map(({ client }) => client.waitClose()));
        }
        await sleep(200);
        const metrics = await metricsOf(server);
        assert.equal(metrics.gauges.connections, 0);
        assert.equal(metrics.gauges.users, 0);
        assert.equal(metrics.counters.connectionsOpened, 200);
        assert.equal(metrics.counters.connectionsClosed, 200);
        // Identidades liberadas ficam retomáveis por 10 min (por design), com teto.
        assert.ok(metrics.gauges.identities <= 2000);
        await server.stop();
    });

    test("log periódico de métricas, sem dados pessoais", async () => {
        const server = await startServer({ METRICS_LOG_INTERVAL_MS: "1000" });
        const { client } = await join(server.url, { userName: "NomeNoLog" });
        const entry = await server.waitForLog((item) => item.event === "metrics", 3000);
        assert.equal(entry.gauges.users, 1);
        assert.ok(!JSON.stringify(entry).includes("NomeNoLog"));
        client.close();
        await server.stop();
    });

    test("/readyz pronto; desligamento registra métricas finais e cancela tudo", async () => {
        const server = await startServer();
        const ready = await fetch(`http://127.0.0.1:${server.port}/readyz`);
        assert.equal(ready.status, 200);
        assert.deepEqual(await ready.json(), { status: "ready" });
        // keep-alive aberto não pode segurar o desligamento
        await fetch(`http://127.0.0.1:${server.port}/healthz`, { keepalive: true });
        const { client } = await join(server.url, { userName: "Fica" });
        const startedAt = Date.now();
        server.child.kill("SIGTERM");
        assert.equal((await client.waitClose()).code, 1001);
        assert.equal(await server.exited, 0);
        assert.ok(Date.now() - startedAt < 2000, "encerra sem esperar o tempo-limite");
        assert.ok(server.entries().some((entry) => entry.event === "metrics"));
        assert.ok(!server.entries().some((entry) => entry.event === "shutdown_forced"));
    });
});
