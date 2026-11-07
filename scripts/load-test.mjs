#!/usr/bin/env node
// Teste de carga e estabilidade do servidor de tempo real.
//
// Sobe uma instância PRÓPRIA do backend numa porta livre (nunca aponta para
// um servidor externo) e executa cenários com clientes WebSocket reais no
// mesmo processo. Mede latência de entrega (ponta a ponta), volume recebido,
// erros, e CPU/memória do processo do servidor lidos de /proc (Linux) — por
// fora, sem depender de instrumentação do próprio servidor.
//
// Uso:
//   node scripts/load-test.mjs                 todos os cenários
//   node scripts/load-test.mjs B D             só os cenários escolhidos
//   node scripts/load-test.mjs --json out.json grava o resultado
//
// Os clientes rodam num único processo Node: em cargas altas, parte da
// latência medida é do próprio gerador de carga. Os números servem para
// comparar versões na MESMA máquina, não como capacidade absoluta.

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(path.join(ROOT, "backend", "package.json"));
const WebSocket = require("ws");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => performance.now();

// ─── Servidor sob teste ───────────────────────────────────────────────────

const freePort = () =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });

const CLOCK_TICKS = 100; // sysconf(_SC_CLK_TCK) em Linux x86_64

/** CPU (s) e RSS (MB) do processo, lidos de /proc. */
const processStats = (pid) => {
    try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        const cpuSeconds = (Number(fields[11]) + Number(fields[12])) / CLOCK_TICKS;
        const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
        const rssKb = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0);
        return { cpuSeconds, rssMb: rssKb / 1024 };
    } catch {
        return { cpuSeconds: NaN, rssMb: NaN };
    }
};

const startServer = async (env = {}) => {
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(ROOT, "backend", "src", "server.js")], {
        env: { ...process.env, PORT: String(port), ALLOWED_ORIGINS: "", NODE_ENV: "test", ...env },
        stdio: ["ignore", "pipe", "pipe"],
    });
    const logLines = [];
    for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => logLines.push(...chunk.split("\n").filter(Boolean)));
    }
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const ok = await new Promise((resolve) => {
            const socket = net.connect(port, "127.0.0.1");
            socket.once("connect", () => {
                socket.destroy();
                resolve(true);
            });
            socket.once("error", () => resolve(false));
        });
        if (ok) break;
        await sleep(30);
    }
    return {
        port,
        url: `ws://127.0.0.1:${port}`,
        pid: child.pid,
        logLines,
        stats: () => processStats(child.pid),
        async stop() {
            child.kill("SIGTERM");
            await new Promise((resolve) => child.once("exit", resolve));
        },
    };
};

// ─── Clientes ─────────────────────────────────────────────────────────────

/** Estatísticas agregadas de todos os clientes de um cenário. */
const createCollector = () => ({
    latencies: [],
    bytes: 0,
    frames: 0,
    errors: {},
    closes: {},
});

/**
 * Cliente que entra na sala e registra latência das mensagens recebidas
 * (o conteúdo carrega o instante de envio: mesmo processo, mesmo relógio).
 */
const createClient = (url, name, collector, { autoPong = true, resumeToken } = {}) =>
    new Promise((resolve) => {
        const ws = new WebSocket(url, { autoPong });
        const client = {
            ws,
            name,
            id: null,
            token: null,
            listSize: 0,
            open: false,
            sessionAt: null,
        };
        const login = { userName: name, ...(resumeToken ? { resumeToken } : {}) };
        let settled = false;
        const done = () => {
            if (!settled) {
                settled = true;
                resolve(client);
            }
        };
        ws.on("open", () => {
            client.open = true;
            ws.send(JSON.stringify({ type: "user_login", payload: login }));
        });
        ws.on("message", (data) => {
            collector.bytes += data.length;
            collector.frames += 1;
            const message = JSON.parse(data.toString());
            if (message.type === "session") {
                client.id = message.payload.id;
                client.token = message.payload.resumeToken;
                client.sessionAt = now();
                done();
            } else if (message.type === "user_list") {
                client.listSize = message.payload.length;
            } else if (message.type === "chat_message") {
                const sent = Number(/^t=([\d.]+)/.exec(message.payload.content)?.[1]);
                if (Number.isFinite(sent)) collector.latencies.push(now() - sent);
            } else if (message.type === "error") {
                const code = message.payload.code;
                collector.errors[code] = (collector.errors[code] ?? 0) + 1;
            }
        });
        ws.on("close", (code) => {
            client.open = false;
            collector.closes[code] = (collector.closes[code] ?? 0) + 1;
            done();
        });
        ws.on("error", () => done());
    });

const sendChat = (client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(
            JSON.stringify({
                type: "chat_message",
                payload: { content: `t=${now()} ${client.name}` },
            }),
        );
    }
};

const sendTyping = (client, type = "typing_start") => {
    if (client.ws.readyState === WebSocket.OPEN)
        client.ws.send(JSON.stringify({ type, payload: {} }));
};

const percentile = (values, p) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return Number(
        sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))].toFixed(2),
    );
};

const summarize = (collector) => ({
    deliveries: collector.latencies.length,
    latencyMs: {
        p50: percentile(collector.latencies, 50),
        p95: percentile(collector.latencies, 95),
        p99: percentile(collector.latencies, 99),
        max: collector.latencies.length
            ? Number(Math.max(...collector.latencies).toFixed(2))
            : null,
    },
    receivedMB: Number((collector.bytes / 1024 / 1024).toFixed(2)),
    frames: collector.frames,
    errors: collector.errors,
    closes: collector.closes,
});

const waitUntil = async (predicate, timeoutMs, stepMs = 10) => {
    const start = now();
    while (!predicate()) {
        if (now() - start > timeoutMs) return null;
        await sleep(stepMs);
    }
    return now() - start;
};

const closeAll = async (clients) => {
    for (const client of clients) client.ws.terminate();
    await sleep(100);
};

const measured = async (server, run) => {
    const before = server.stats();
    const started = now();
    const result = await run();
    const after = server.stats();
    return {
        ...result,
        durationS: Number(((now() - started) / 1000).toFixed(2)),
        serverCpuS: Number((after.cpuSeconds - before.cpuSeconds).toFixed(2)),
        serverRssMb: {
            before: Number(before.rssMb.toFixed(1)),
            after: Number(after.rssMb.toFixed(1)),
        },
    };
};

// ─── Cenários ─────────────────────────────────────────────────────────────

const scenarios = {
    /** A — uso normal: 5 pessoas conversando, digitando, entrando e saindo. */
    async A() {
        const server = await startServer();
        const collector = createCollector();
        try {
            return await measured(server, async () => {
                const clients = await Promise.all(
                    Array.from({ length: 5 }, (_, i) =>
                        createClient(server.url, `a${i}`, collector),
                    ),
                );
                for (let round = 0; round < 20; round += 1) {
                    for (const client of clients) {
                        sendTyping(client);
                        sendChat(client);
                    }
                    if (round % 5 === 4) {
                        // entrada e saída de um visitante
                        const visitor = await createClient(server.url, `v${round}`, collector);
                        await sleep(50);
                        visitor.ws.close();
                    }
                    await sleep(250);
                }
                await sleep(300);
                await closeAll(clients);
                return { users: 5, ...summarize(collector) };
            });
        } finally {
            await server.stop();
        }
    },

    /**
     * B — uso simultâneo: N pessoas entram ao mesmo tempo (tempestade de
     * entradas, como após um reinício) e conversam.
     */
    async B({ users = 200 } = {}) {
        const server = await startServer();
        const collector = createCollector();
        try {
            return await measured(server, async () => {
                const joinStart = now();
                const clients = await Promise.all(
                    Array.from({ length: users }, (_, i) =>
                        createClient(server.url, `b${i}`, collector),
                    ),
                );
                const settleMs = await waitUntil(
                    () => clients.every((c) => c.listSize === users),
                    60000,
                );
                const joinPhase = {
                    joinStormMs:
                        settleMs === null ? "timeout" : Number((now() - joinStart).toFixed(0)),
                    joinBytesMB: Number((collector.bytes / 1024 / 1024).toFixed(2)),
                    joinFrames: collector.frames,
                };
                const chatCollector = createCollector();
                for (const client of clients) {
                    client.ws.removeAllListeners("message");
                    client.ws.on("message", (data) => {
                        chatCollector.bytes += data.length;
                        chatCollector.frames += 1;
                        const message = JSON.parse(data.toString());
                        const sent = Number(
                            /^t=([\d.]+)/.exec(message.payload?.content ?? "")?.[1],
                        );
                        if (message.type === "chat_message" && Number.isFinite(sent)) {
                            chatCollector.latencies.push(now() - sent);
                        }
                        if (message.type === "error") {
                            chatCollector.errors[message.payload.code] =
                                (chatCollector.errors[message.payload.code] ?? 0) + 1;
                        }
                    });
                }
                // 10 rodadas: 10 % das pessoas falam a cada 200 ms.
                for (let round = 0; round < 10; round += 1) {
                    for (let i = round % 10; i < users; i += 10) sendChat(clients[i]);
                    await sleep(200);
                }
                await sleep(500);
                await closeAll(clients);
                return { users, ...joinPhase, chat: summarize(chatCollector) };
            });
        } finally {
            await server.stop();
        }
    },

    /**
     * C — estabilidade prolongada: 30 pessoas conversando por 30 s enquanto
     * 1500 visitantes entram e saem. A memória precisa voltar a um patamar.
     */
    async C() {
        const server = await startServer();
        const collector = createCollector();
        try {
            return await measured(server, async () => {
                const residents = await Promise.all(
                    Array.from({ length: 30 }, (_, i) =>
                        createClient(server.url, `c${i}`, collector),
                    ),
                );
                const rssSamples = [];
                const end = now() + 30000;
                let cycles = 0;
                while (now() < end) {
                    const batch = await Promise.all(
                        Array.from({ length: 10 }, (_, i) =>
                            createClient(server.url, `visit${cycles}-${i}`, collector),
                        ),
                    );
                    for (const visitor of batch) visitor.ws.close();
                    cycles += 10;
                    for (const resident of residents.slice(0, 3)) {
                        sendTyping(resident);
                        sendChat(resident);
                    }
                    if (cycles % 300 === 0)
                        rssSamples.push(Number(server.stats().rssMb.toFixed(1)));
                    await sleep(150);
                }
                await sleep(500);
                await closeAll(residents);
                return {
                    residents: 30,
                    visitorCycles: cycles,
                    rssSamplesMb: rssSamples,
                    ...summarize(collector),
                };
            });
        } finally {
            await server.stop();
        }
    },

    /**
     * D — oscilação de rede: quedas abruptas e reconexão com token, e
     * clientes que param de responder (sem fechar o TCP). Mede quanto tempo
     * a lista leva para ficar correta. Heartbeat curto para caber no teste.
     */
    async D() {
        const heartbeatMs = 1000;
        const server = await startServer({ HEARTBEAT_MS: String(heartbeatMs) });
        const collector = createCollector();
        try {
            return await measured(server, async () => {
                const observer = await createClient(server.url, "observador", collector);
                const clients = await Promise.all(
                    Array.from({ length: 40 }, (_, i) =>
                        createClient(server.url, `d${i}`, collector),
                    ),
                );
                await waitUntil(() => observer.listSize === 41, 5000);

                // 1) 20 quedas abruptas (terminate = TCP fechado sem handshake).
                const dropped = clients.slice(0, 20);
                for (const client of dropped) client.ws.terminate();
                const dropDetectMs = await waitUntil(() => observer.listSize === 21, 10000);

                // 2) reconexão dos 20 com o token de retomada.
                const reconnectStart = now();
                const back = await Promise.all(
                    dropped.map((old) =>
                        createClient(server.url, old.name, collector, { resumeToken: old.token }),
                    ),
                );
                const reconnectWait = await waitUntil(() => observer.listSize === 41, 10000);
                // Tempo total: das novas conexões até a lista correta no observador.
                const reconnectMs = reconnectWait === null ? null : now() - reconnectStart;
                const sameIds = back.filter((client, i) => client.id === dropped[i].id).length;

                // 3) 10 clientes "pendurados": param de responder ao ping sem fechar.
                const hung = await Promise.all(
                    Array.from({ length: 10 }, (_, i) =>
                        createClient(server.url, `pendurado${i}`, collector, { autoPong: false }),
                    ),
                );
                await waitUntil(() => observer.listSize === 51, 5000);

                const hungDetectMs = await waitUntil(
                    () => observer.listSize === 41,
                    20 * heartbeatMs,
                );

                // 4) os saudáveis continuam conectados durante todo o teste.
                const healthyAlive = [...clients.slice(20), ...back].filter((c) => c.open).length;
                await closeAll([observer, ...clients, ...back, ...hung]);
                return {
                    heartbeatMs,
                    dropDetectMs:
                        dropDetectMs === null ? "timeout" : Number(dropDetectMs.toFixed(0)),
                    reconnectMs: reconnectMs === null ? "timeout" : Number(reconnectMs.toFixed(0)),
                    hungDetectMs:
                        hungDetectMs === null ? "timeout" : Number(hungDetectMs.toFixed(0)),
                    healthyStillConnected: `${healthyAlive}/40`,
                    identitiesResumed: `${sameIds}/20`,
                    ...summarize(collector),
                };
            });
        } finally {
            await server.stop();
        }
    },

    /**
     * E — sobrecarga controlada: conexões sobem em degraus até passar do
     * teto (MAX_CONNECTIONS reduzido para caber no teste) e a taxa de
     * mensagens sobe em degraus. Registra latência por degrau e recusas.
     */
    async E() {
        const maxConnections = 300;
        const server = await startServer({ MAX_CONNECTIONS: String(maxConnections) });
        const collector = createCollector();
        try {
            return await measured(server, async () => {
                const clients = [];
                const steps = [];
                for (const target of [100, 200, 300, 350]) {
                    const created = await Promise.all(
                        Array.from({ length: target - clients.length }, (_, i) =>
                            createClient(server.url, `e${clients.length + i}`, collector),
                        ),
                    );
                    clients.push(...created);
                    const open = clients.filter((c) => c.open).length;
                    const stepCollector = createCollector();
                    const speakers = clients.filter((c) => c.open).slice(0, 20);
                    for (const client of clients.filter((c) => c.open)) {
                        client.ws.removeAllListeners("message");
                        client.ws.on("message", (data) => {
                            stepCollector.bytes += data.length;
                            const message = JSON.parse(data.toString());
                            const sent = Number(
                                /^t=([\d.]+)/.exec(message.payload?.content ?? "")?.[1],
                            );
                            if (message.type === "chat_message" && Number.isFinite(sent)) {
                                stepCollector.latencies.push(now() - sent);
                            }
                        });
                    }
                    for (let round = 0; round < 5; round += 1) {
                        for (const speaker of speakers) sendChat(speaker);
                        await sleep(200);
                    }
                    await sleep(300);
                    const summary = summarize(stepCollector);
                    steps.push({
                        attempted: target,
                        open,
                        rejected1013: collector.closes[1013] ?? 0,
                        msgsPerSec: speakers.length * 5,
                        latencyMs: summary.latencyMs,
                        rssMb: Number(server.stats().rssMb.toFixed(1)),
                    });
                }
                await closeAll(clients);
                return { maxConnections, steps };
            });
        } finally {
            await server.stop();
        }
    },
};

// ─── Execução ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonIndex = args.indexOf("--json");
const jsonPath = jsonIndex === -1 ? null : args[jsonIndex + 1];
const selected = args.filter(
    (arg, index) => /^[A-E]$/.test(arg) && (jsonIndex === -1 || index !== jsonIndex + 1),
);
const toRun = selected.length > 0 ? selected : Object.keys(scenarios);

const results = { machine: { cpus: os.cpus().length, node: process.version }, scenarios: {} };
for (const name of toRun) {
    process.stdout.write(`cenário ${name}… `);
    const result = await scenarios[name]();
    results.scenarios[name] = result;
    console.log("ok");
    console.log(JSON.stringify(result, null, 2));
}
if (jsonPath) fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
