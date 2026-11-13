#!/usr/bin/env node
// Testes de ponta a ponta no navegador, isolados de qualquer ambiente real.
//
// Sobe, em portas livres e só em 127.0.0.1:
//   - um backend PRÓPRIO (NODE_ENV=test), com ALLOWED_ORIGINS igual à
//     origem do site de teste — a restrição de origem vale também aqui;
//   - o build de produção do frontend, servido com a CSP do index.html.
// A chave de administração é gerada a cada execução, fica só em memória e
// nunca é escrita em log nem em arquivo.
//
// Depois roda cada roteiro de e2e/*.mjs e, no fim, confere privacidade:
// nenhum id interno (lido do log do próprio servidor de teste) pode
// aparecer em quadro recebido nem no HTML de nenhuma página.
//
// Uso: node scripts/e2e.mjs [nome-do-roteiro …]
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const only = process.argv.slice(2);

const freePort = () =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", () => {
            const { port } = /** @type {net.AddressInfo} */ (probe.address());
            probe.close(() => resolve(port));
        });
    });

const waitFor = async (check, ms, label) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
        if (await check()) return;
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`tempo esgotado: ${label}`);
};

const sitePort = await freePort();
const backendPort = await freePort();
const proxyPort = await freePort();
const SITE = `http://127.0.0.1:${sitePort}/`;
// O navegador fala com o backend através de um proxy TCP deste processo:
// é ele que derruba conexões de verdade nos testes de queda (a emulação
// "offline" do navegador não fecha WebSockets já abertos).
const SOCKET = `ws://127.0.0.1:${proxyPort}`;
const adminKey = crypto.randomBytes(24).toString("base64url");

// ─── Build do frontend apontando para o backend de teste ──────────────────
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-chat-e2e-"));
const build = spawnSync(
    process.execPath,
    [
        path.join(ROOT, "node_modules", "vite", "bin", "vite.js"),
        "build",
        "--outDir",
        outDir,
        "--emptyOutDir",
        "--logLevel",
        "warn",
    ],
    { cwd: ROOT, env: { ...process.env, VITE_SOCKET_URL: SOCKET }, stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);

// ─── Site estático (só o build; nada fora da pasta) ──────────────────────
const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".css": "text/css",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
};
const site = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", SITE);
    const file = path.normalize(
        path.join(outDir, url.pathname === "/" ? "index.html" : url.pathname),
    );
    if (!file.startsWith(outDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
    }
    res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => site.listen(sitePort, "127.0.0.1", resolve));

// ─── Proxy TCP que simula quedas de rede ──────────────────────────────────
const tunnels = new Set();
let networkUp = true;
const proxy = net.createServer((client) => {
    if (!networkUp) {
        client.destroy();
        return;
    }
    const upstream = net.connect(backendPort, "127.0.0.1");
    const pair = { client, upstream };
    tunnels.add(pair);
    const close = () => {
        client.destroy();
        upstream.destroy();
        tunnels.delete(pair);
    };
    client.on("error", close).on("close", close);
    upstream.on("error", close).on("close", close);
    client.pipe(upstream);
    upstream.pipe(client);
});
await new Promise((resolve) => proxy.listen(proxyPort, "127.0.0.1", resolve));
const network = {
    /** Derruba todas as conexões e recusa novas até `up()`. */
    down: () => {
        networkUp = false;
        for (const pair of [...tunnels]) {
            pair.client.destroy();
            pair.upstream.destroy();
        }
        tunnels.clear();
    },
    up: () => {
        networkUp = true;
    },
};

// ─── Backend de teste ─────────────────────────────────────────────────────
const serverLog = [];
let backend;
const startBackend = async () => {
    backend = spawn(process.execPath, [path.join(ROOT, "backend", "src", "server.js")], {
        env: {
            ...process.env,
            PORT: String(backendPort),
            NODE_ENV: "test",
            ALLOWED_ORIGINS: SITE.slice(0, -1),
            ADMIN_KEY: adminKey,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";
    backend.stdout.on("data", (chunk) => {
        buffer += chunk;
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + 1);
            try {
                serverLog.push(JSON.parse(line));
            } catch {
                // linha que não é JSON: ignorada
            }
        }
    });
    await waitFor(
        () => serverLog.some((e) => e.event === "server_listening" && e.port === backendPort),
        15000,
        "backend de teste",
    );
};
const stopBackend = async () => {
    if (!backend || backend.exitCode !== null) return;
    const exited = new Promise((r) => backend.once("exit", r));
    backend.kill("SIGTERM");
    await exited;
};
await startBackend();

// ─── Navegador, com registro de tudo o que chega por WebSocket ────────────
const browser = await chromium.launch();
/** Todas as páginas abertas, para a checagem de privacidade no fim. */
const pages = [];
const RUN = Date.now().toString(36).slice(-4);
let counter = 0;

const ctx = {
    SITE,
    network,
    RUN,
    adminKey,
    serverLog,
    restartBackend: async () => {
        await stopBackend();
        await startBackend();
    },
    /** Quadros recebidos por WebSocket numa página. */
    framesOf: (page) => pages.find((record) => record.page === page)?.frames ?? [],
    /** Usuário único por execução. @param {string} base */
    user: (base) => `${base}${RUN}${++counter}`,
    /** @param {{hash?: string, viewport?: {width: number, height: number}}} [options] */
    open: async ({ hash = "", viewport = { width: 1280, height: 800 } } = {}) => {
        const context = await browser.newContext({ viewport, bypassCSP: false });
        const page = await context.newPage();
        const record = { page, frames: [], errors: [] };
        page.on("websocket", (ws) =>
            ws.on("framereceived", (f) => record.frames.push(String(f.payload))),
        );
        page.on("pageerror", (e) => record.errors.push(e.message));
        page.on("console", (m) => m.type() === "error" && record.errors.push(m.text()));
        pages.push(record);
        await page.goto(SITE + hash, { waitUntil: "networkidle" });
        return page;
    },
    /** Entra com nome e @ e espera a tela seguinte (início ou sala). */
    enter: async (page, name, username) => {
        await page.fill("#campo-nome", name);
        await page.fill("#campo-username", username);
        await page.click(".c-entry__submit");
        await page.waitForSelector('.c-app[data-screen="home"], .c-app[data-screen="room"]');
    },
    createRoom: async (page, name) => {
        if (!(await page.isVisible('.c-app[data-screen="home"]')))
            await page.click("[data-go-home]");
        await page.fill("#inicio-nome-sala", name);
        await page.click('[data-home-form="create"] button[type=submit]');
        await page.waitForFunction(
            (n) => document.querySelector(".c-header__title")?.textContent?.trim() === n,
            name,
        );
        return page.evaluate(() => location.hash);
    },
    say: async (page, text) => {
        await page.fill("#campo-mensagem", text);
        await page.press("#campo-mensagem", "Enter");
    },
    openConversation: async (page, label) => {
        await page.click(`.c-sidebar [data-conversation-id]:has-text("${label}")`);
        await page.waitForFunction(
            (n) => document.querySelector(".c-header__title")?.textContent?.trim() === n,
            label,
        );
    },
    /** axe-core, regras WCAG 2.x A/AA; devolve as violações sérias ou críticas. */
    axe: async (page) => {
        const source = fs.readFileSync(
            path.join(ROOT, "node_modules", "axe-core", "axe.min.js"),
            "utf8",
        );
        // A CSP da página bloqueia script inline (como deve). O código do axe
        // entra como expressão avaliada pelo protocolo de depuração, que não
        // passa pela CSP — o teste roda com a CSP real ligada.
        await page.evaluate(source);
        const result = await page.evaluate(() =>
            window.axe.run(document, {
                runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
                // Sem baixar folhas de outra origem por fetch: a CSP da página
                // (corretamente) bloquearia, e o erro seria do axe, não do app.
                preload: false,
            }),
        );
        return result.violations
            .filter((v) => v.impact === "serious" || v.impact === "critical")
            .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    },
};

// ─── Roteiros ─────────────────────────────────────────────────────────────
const files = fs
    .readdirSync(path.join(ROOT, "e2e"))
    .filter((f) => f.endsWith(".mjs"))
    .filter((f) => only.length === 0 || only.some((name) => f.includes(name)))
    .sort();
let passed = 0;
const failures = [];
for (const file of files) {
    const { default: run } = await import(path.join(ROOT, "e2e", file));
    const checks = [];
    const ok = (condition, label) => {
        checks.push(label);
        if (condition) passed += 1;
        else failures.push(`${file}: ${label}`);
        console.log(`${condition ? "PASS" : "FAIL"} ${file}: ${label}`);
    };
    try {
        await run({ ...ctx, ok });
    } catch (error) {
        failures.push(`${file}: exceção — ${error.message.split("\n")[0]}`);
        console.log(`FAIL ${file}: exceção — ${error.message.split("\n")[0]}`);
    }
}

// ─── Privacidade: nenhum id interno chegou ao navegador ───────────────────
const ids = [...new Set(serverLog.filter((e) => e.event === "session_started").map((e) => e.user))];
const leaks = [];
for (const record of pages) {
    const html = await record.page.content().catch(() => "");
    for (const id of ids) {
        if (record.frames.some((frame) => frame.includes(id)) || html.includes(id)) leaks.push(id);
    }
}
const privacyOk = ids.length > 0 && leaks.length === 0;
console.log(
    `${privacyOk ? "PASS" : "FAIL"} privacidade: ${ids.length} ids internos do servidor, ${leaks.length} encontrados no navegador`,
);
if (privacyOk) passed += 1;
else failures.push("privacidade: id interno no navegador");
const keyLeak = pages.some((r) => r.frames.some((f) => f.includes(adminKey)));
console.log(`${keyLeak ? "FAIL" : "PASS"} a chave de administração não volta em nenhum quadro`);
if (keyLeak) failures.push("chave de administração ecoada");
else passed += 1;

const pageErrors = pages
    .flatMap((r) => r.errors)
    .filter((e) => !/WebSocket|ERR_CONNECTION|ERR_INTERNET/.test(e));
console.log(
    `${pageErrors.length === 0 ? "PASS" : "FAIL"} sem erros de página${pageErrors.length ? ": " + pageErrors.slice(0, 3).join(" | ") : ""}`,
);
if (pageErrors.length) failures.push("erros de página");
else passed += 1;

await browser.close();
await stopBackend();
site.close();
proxy.close();
fs.rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} PASS, ${failures.length} FAIL`);
if (failures.length) console.log(failures.map((f) => `  - ${f}`).join("\n"));
process.exit(failures.length ? 1 : 0);
