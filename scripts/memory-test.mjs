#!/usr/bin/env node
// Teste prolongado de memória e de ciclo de vida das identidades.
//
// Sobe uma instância PRÓPRIA do backend (127.0.0.1, porta livre,
// METRICS_ENABLED=true; nunca um servidor externo) com a janela de retomada
// REAL (2 min) e alterna ciclos de:
//   - rotatividade: a cada segundo, N pessoas entram na sala compartilhada,
//     mandam mensagens e saem de um de três jeitos — queda sem logout (fica
//     retomável até expirar), logout (liberada na hora) ou queda seguida de
//     RETOMADA com o token (confere o mesmo @ e a sala de volta); pares
//     abrem conversas privadas e caem;
//   - repouso, mais longo que a janela de retomada, para a limpeza agir.
// Um observador fixo conta cada mensagem enviada x recebida (perda).
// Amostras a cada 5 s: identidades, conexões, salas e privadas (/metrics)
// e RSS do processo (/proc). Ao final, critérios objetivos:
//   - depois de cada repouso, identidades = residentes, privadas = 0;
//   - RSS do 2º repouso não passa do 1º além de uma folga (sem crescimento
//     contínuo);
//   - 100% das retomadas com o mesmo @ e a sala de volta;
//   - 0 mensagens perdidas.
//
// Uso: node scripts/memory-test.mjs [--cycles 2] [--churn 90] [--rest 160] [--rate 8] [--json saida.json]
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(path.join(ROOT, "backend", "package.json"));
const WebSocket = require("ws");

const arg = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index > 0 ? process.argv[index + 1] : fallback;
};
const CYCLES = Number(arg("cycles", 2));
const CHURN_S = Number(arg("churn", 90));
const REST_S = Number(arg("rest", 160));
const RATE = Number(arg("rate", 8));
const OUT = arg("json", null);
const ORIGIN = "http://teste-memoria.local";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", () => {
            const { port } = probe.address();
            probe.close(() => resolve(port));
        });
    });

const port = await freePort();
const server = spawn(process.execPath, [path.join(ROOT, "backend", "src", "server.js")], {
    env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: "test",
        ALLOWED_ORIGINS: ORIGIN,
        METRICS_ENABLED: "true",
        METRICS_LOG_INTERVAL_MS: "0",
        // Limites folgados: o teste mede memória, não o limite de taxa.
        MAX_CONNECTIONS: "2000",
    },
    stdio: ["ignore", "ignore", "inherit"],
});
const URL_WS = `ws://127.0.0.1:${port}`;
/** Se o servidor parar no meio, o motivo entra no relatório (código e sinal). */
let serverExit = null;
server.on("exit", (code, signal) => {
    serverExit = { code, signal, atS: Math.round((Date.now() - started0) / 1000) };
    console.log(`SERVIDOR PAROU: código ${code}, sinal ${signal}`);
});
const started0 = Date.now();
for (let i = 0; i < 100; i += 1) {
    const up = await fetch(`http://127.0.0.1:${port}/healthz`).then(
        () => true,
        () => false,
    );
    if (up) break;
    await sleep(100);
}

const rssMb = () => {
    try {
        const status = fs.readFileSync(`/proc/${server.pid}/status`, "utf8");
        return Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0) / 1024;
    } catch {
        return NaN;
    }
};
const gauges = async () => {
    if (serverExit) throw new Error(`o servidor de teste parou: ${JSON.stringify(serverExit)}`);
    const body = await fetch(`http://127.0.0.1:${port}/metrics`).then((r) => r.json());
    return body.gauges ?? body;
};

let seq = 0;
/** Cliente mínimo: login, eventos numa fila, envio. */
const client = (resumeToken) =>
    new Promise((resolve, reject) => {
        const ws = new WebSocket(URL_WS, { headers: { Origin: ORIGIN } });
        const c = { ws, inbox: [], waiters: [], session: null };
        const timer = setTimeout(() => reject(new Error("sessão não chegou")), 10000);
        ws.on("message", (data) => {
            const event = JSON.parse(data.toString());
            c.inbox.push(event);
            if (event.type === "session") {
                c.session = event.payload;
                clearTimeout(timer);
                resolve(c);
            }
            for (const w of [...c.waiters]) w();
        });
        ws.on("error", () => {});
        ws.on("open", () => {
            seq += 1;
            ws.send(
                JSON.stringify({
                    type: "user_login",
                    payload: {
                        userName: `Carga ${seq}`,
                        username: `mem_${seq.toString(36)}`,
                        ...(resumeToken ? { resumeToken } : {}),
                    },
                }),
            );
        });
    });
const send = (c, type, payload) =>
    c.ws.readyState === 1 && c.ws.send(JSON.stringify({ type, payload }));
const take = (c, match, ms = 8000) =>
    new Promise((resolve, reject) => {
        const look = () => {
            const i = c.inbox.findIndex(match);
            if (i >= 0) {
                c.waiters = c.waiters.filter((w) => w !== look);
                clearTimeout(t);
                resolve(c.inbox.splice(i, 1)[0]);
            }
        };
        const t = setTimeout(() => {
            c.waiters = c.waiters.filter((w) => w !== look);
            reject(new Error("tempo esgotado"));
        }, ms);
        c.waiters.push(look);
        look();
    });

// Residentes: anfitrião (mantém a sala) e observador (conta mensagens).
const host = await client();
send(host, "room_create", { name: "Memória" });
const room = await take(host, (e) => e.type === "room_joined");
const code = room.payload.code;
const conversationId = room.conversationId;
const observer = await client();
send(observer, "room_join", { code });
await take(observer, (e) => e.type === "room_joined");
const RESIDENTS = 2;

const counts = {
    sent: 0,
    received: 0,
    resumes: 0,
    resumesOk: 0,
    dms: 0,
    errors: 0,
    logouts: 0,
    drops: 0,
};
const sentIds = new Set();
observer.ws.on("message", (data) => {
    const event = JSON.parse(data.toString());
    if (
        event.type === "chat_message" &&
        event.conversationId === conversationId &&
        sentIds.has(event.payload.clientMsgId)
    ) {
        counts.received += 1;
    }
});

/** Uma pessoa do ciclo de rotatividade. */
const visitor = async (kind) => {
    const c = await client();
    send(c, "room_join", { code });
    await take(c, (e) => e.type === "room_joined");
    let last = "";
    for (let i = 0; i < 2; i += 1) {
        counts.sent += 1;
        last = `m${counts.sent}`;
        sentIds.add(last);
        send(c, "chat_message", { conversationId, content: `memória ${last}`, clientMsgId: last });
    }
    // Só sai depois de o servidor confirmar a PRÓPRIA mensagem.
    const mine = last;
    await take(c, (e) => e.type === "chat_message" && e.payload.clientMsgId === mine).catch(() => {
        counts.errors += 1;
    });
    if (kind === "logout") {
        send(c, "user_logout", {});
        counts.logouts += 1;
        c.ws.close();
        return;
    }
    if (kind === "drop") {
        counts.drops += 1;
        c.ws.terminate();
        return;
    }
    // Queda e retomada com o token.
    const token = c.session.resumeToken;
    const username = c.session.username;
    c.ws.terminate();
    await sleep(3000);
    counts.resumes += 1;
    const back = await client(token);
    const rejoined = await take(
        back,
        (e) => e.type === "room_joined" && e.conversationId === conversationId,
    ).then(
        () => true,
        () => false,
    );
    if (back.session.resumed === true && back.session.username === username && rejoined)
        counts.resumesOk += 1;
    send(back, "user_logout", {});
    back.ws.close();
};

/** Par que abre uma conversa privada e cai sem encerrar. */
const dmPair = async () => {
    const a = await client();
    const b = await client();
    send(a, "dm_open", { username: b.session.username });
    await take(a, (e) => e.type === "dm_opened").then(
        () => (counts.dms += 1),
        () => (counts.errors += 1),
    );
    a.ws.terminate();
    b.ws.terminate();
};

const samples = [];
const started = Date.now();
const sample = async (phase) => {
    const g = await gauges();
    const point = {
        t: Math.round((Date.now() - started) / 1000),
        phase,
        rssMb: Number(rssMb().toFixed(1)),
        identities: g.identities,
        connections: g.connections,
        rooms: g.rooms,
        dms: g.dms,
    };
    samples.push(point);
    console.log(JSON.stringify(point));
};

const pending = new Set();
const track = (promise) => {
    const p = promise.catch(() => (counts.errors += 1)).finally(() => pending.delete(p));
    pending.add(p);
};

const restEnds = [];
for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    const churnUntil = Date.now() + CHURN_S * 1000;
    let tick = 0;
    while (Date.now() < churnUntil) {
        for (let i = 0; i < RATE; i += 1) {
            const kind = i % 5 === 0 ? "resume" : i % 2 === 0 ? "logout" : "drop";
            track(visitor(kind));
        }
        if (tick % 5 === 0) track(dmPair());
        if (tick % 5 === 0) await sample(`rotatividade ${cycle}`);
        tick += 1;
        await sleep(1000);
    }
    await Promise.all([...pending]);
    const restUntil = Date.now() + REST_S * 1000;
    while (Date.now() < restUntil) {
        await sample(`repouso ${cycle}`);
        await sleep(5000);
    }
    await sample(`fim do repouso ${cycle}`);
    restEnds.push(samples.at(-1));
}

// Dá tempo para os últimos quadros chegarem ao observador.
for (let i = 0; i < 50 && counts.received < counts.sent; i += 1) await sleep(100);
const verdict = {
    serverStayedUp: serverExit === null,
    identitiesReleased: restEnds.every((s) => s.identities === RESIDENTS),
    noDmLeft: restEnds.every((s) => s.dms === 0),
    roomsBack: restEnds.every((s) => s.rooms === 1),
    noContinuousGrowth:
        restEnds.length < 2 ||
        restEnds.at(-1).rssMb <= restEnds[0].rssMb + Math.max(8, restEnds[0].rssMb * 0.1),
    resumesAllOk: counts.resumes > 0 && counts.resumesOk === counts.resumes,
    noMessageLoss: counts.sent > 0 && counts.received === counts.sent,
};
const report = {
    method: {
        cycles: CYCLES,
        churnS: CHURN_S,
        restS: REST_S,
        ratePerSecond: RATE,
        resumeTtlS: 120,
        residents: RESIDENTS,
    },
    counts,
    serverExit,
    restEnds,
    peak: samples.reduce(
        (m, s) => ({
            rssMb: Math.max(m.rssMb, s.rssMb),
            identities: Math.max(m.identities, s.identities),
        }),
        { rssMb: 0, identities: 0 },
    ),
    verdict,
    samples,
};
console.log(
    "\nRESULTADO",
    JSON.stringify({ counts, restEnds, peak: report.peak, verdict }, null, 2),
);
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
host.ws.close();
observer.ws.close();
server.kill("SIGTERM");
process.exit(Object.values(verdict).every(Boolean) ? 0 : 1);
