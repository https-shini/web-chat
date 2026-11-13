// Cabeçalhos de segurança do site (render.yaml) coerentes com a página.
//
// A CSP existe em dois lugares: no <meta> do index.html (vale em qualquer
// hospedagem) e como cabeçalho HTTP no render.yaml (o único jeito de
// `frame-ancestors` valer). Se o script de tema inline mudar, o hash muda; se
// só um dos dois lugares for atualizado, o cabeçalho passa a bloquear a página
// em produção sem que nenhum teste local perceba. Este teste percebe.

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../../", import.meta.url);
const html = await readFile(new URL("frontend/index.html", root), "utf8");
const blueprint = await readFile(new URL("render.yaml", root), "utf8");

/** Diretivas de uma CSP: nome → lista de fontes. @param {string} policy */
const directives = (policy) =>
    Object.fromEntries(
        policy
            .split(";")
            .map((part) => part.trim().split(/\s+/))
            .filter(([name]) => name)
            .map(([name, ...sources]) => [name, sources]),
    );

/** Cabeçalhos declarados para `path: /*` no site estático. */
const siteHeaders = () => {
    const found = {};
    const pattern =
        /-\s+path:\s*\/\*\s*\n\s*name:\s*([\w-]+)\s*\n\s*value:\s*(?:"([^"]*)"|([^\n]+))/g;
    for (const match of blueprint.matchAll(pattern)) {
        found[match[1]] = (match[2] ?? match[3]).trim();
    }
    return found;
};

const metaPolicy = /http-equiv="Content-Security-Policy"\s*content="([^"]+)"/.exec(html)?.[1];

test("o hash de script da CSP é o do script inline de tema, nos dois lugares", () => {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1];
    assert.ok(inline, "script inline de tema não encontrado");
    const hash = `'sha256-${crypto.createHash("sha256").update(inline).digest("base64")}'`;
    assert.ok(metaPolicy, "CSP do <meta> não encontrada");
    assert.ok(directives(metaPolicy)["script-src"].includes(hash), "hash do <meta> desatualizado");
    const header = siteHeaders()["Content-Security-Policy"];
    assert.ok(header, "CSP ausente no render.yaml");
    assert.ok(directives(header)["script-src"].includes(hash), "hash do render.yaml desatualizado");
});

test("o cabeçalho é a CSP do <meta> mais frame-ancestors, com WebSocket só para o backend", () => {
    const meta = directives(/** @type {string} */ (metaPolicy));
    const header = directives(siteHeaders()["Content-Security-Policy"]);
    for (const [name, sources] of Object.entries(meta)) {
        if (name === "connect-src") continue;
        assert.deepEqual(header[name], sources, `diretiva ${name} diverge`);
    }
    assert.deepEqual(header["frame-ancestors"], ["'none'"]);
    // No cabeçalho, nada de ws:/wss: genéricos: só o backend oficial, por TLS.
    const connect = header["connect-src"];
    assert.ok(connect.includes("'self'"));
    assert.ok(
        connect.every((source) => source === "'self'" || /^wss:\/\/[a-z0-9.-]+$/.test(source)),
        `connect-src aberto demais: ${connect.join(" ")}`,
    );
});

test("os demais cabeçalhos de segurança estão declarados", () => {
    const headers = siteHeaders();
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
        assert.match(headers["Permissions-Policy"], new RegExp(`${feature}=\\(\\)`));
    }
});

test("o backend aceita WebSocket só da origem oficial do frontend (sem curinga)", () => {
    const value = /key:\s*ALLOWED_ORIGINS\s*\n\s*value:\s*([^\n]+)/.exec(blueprint)?.[1]?.trim();
    assert.ok(value, "ALLOWED_ORIGINS sem valor no render.yaml");
    const origins = value.split(",").map((origin) => origin.trim());
    for (const origin of origins) {
        assert.match(
            origin,
            /^https:\/\/[a-z0-9.-]+$/,
            `origem inválida ou com curinga: ${origin}`,
        );
    }
});
