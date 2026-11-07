// Núcleo do sistema de comandos, sem rede.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { nextToken, parseCommand, tokenize } from "../../src/commands/parser.js";
import { validateArgs } from "../../src/commands/validator.js";
import { createCommandRegistry } from "../../src/commands/registry.js";
import { createDefaultRegistry } from "../../src/commands/index.js";
import { createAdminAuth, MAX_FAILURES } from "../../src/commands/adminAuth.js";
import { canModerate, hasPermission, isMuted } from "../../src/room/policy.js";

describe("parser", () => {
    test("identifica comando, nome em minúsculas e resto da linha", () => {
        assert.deepEqual(parseCommand("/Nick  João Silva "), {
            ok: true,
            name: "nick",
            rest: "João Silva",
        });
        assert.deepEqual(parseCommand("/help"), { ok: true, name: "help", rest: "" });
        assert.deepEqual(parseCommand("/announce Reunião\ncomeçando"), {
            ok: true,
            name: "announce",
            rest: "Reunião\ncomeçando",
        });
    });

    test("não é comando: barra no meio, barra sem letra, escape", () => {
        for (const text of ["1/2", "a/b", "/ olá", "//help", "/1abc", "", "texto /help"]) {
            assert.equal(parseCommand(text).ok, false, text);
        }
    });

    test("argumentos respeitam aspas", () => {
        assert.deepEqual(tokenize('"João Silva" 10 x'), ["João Silva", "10", "x"]);
        assert.deepEqual(nextToken('  "a b" resto aqui'), { token: "a b", rest: " resto aqui" });
        assert.equal(nextToken("   "), null);
    });
});

describe("validador de argumentos", () => {
    const roll = [
        { name: "a", type: "int", optional: true, min: -10, max: 10 },
        { name: "b", type: "int", optional: true, min: -10, max: 10 },
    ];

    test("inteiros opcionais, limites e sobra", () => {
        assert.deepEqual(validateArgs(roll, ""), { ok: true, values: {} });
        assert.deepEqual(validateArgs(roll, "1 5"), { ok: true, values: { a: 1, b: 5 } });
        assert.equal(validateArgs(roll, "x").ok, false);
        assert.equal(validateArgs(roll, "11").ok, false);
        assert.equal(validateArgs(roll, "1 2 3").ok, false, "argumentos a mais");
        assert.equal(validateArgs(roll, "1.5").ok, false);
    });

    test("texto preserva espaços e vem depois dos posicionais", () => {
        const params = [
            { name: "alvo", type: "word" },
            { name: "msg", type: "text" },
        ];
        assert.deepEqual(validateArgs(params, '"João Silva"  olá   mundo'), {
            ok: true,
            values: { alvo: "João Silva", msg: "olá   mundo" },
        });
        assert.equal(validateArgs(params, "ana").ok, false, "texto obrigatório");
    });

    test("choice e tamanho máximo", () => {
        assert.deepEqual(
            validateArgs([{ name: "c", type: "choice", choices: ["confirmar"] }], "CONFIRMAR"),
            {
                ok: true,
                values: { c: "confirmar" },
            },
        );
        assert.equal(
            validateArgs([{ name: "c", type: "choice", choices: ["confirmar"] }], "sim").ok,
            false,
        );
        assert.equal(validateArgs([{ name: "t", type: "text", maxLength: 3 }], "abcd").ok, false);
    });
});

describe("registro", () => {
    test("recusa nome duplicado, alias duplicado e definição incompleta", () => {
        const registry = createCommandRegistry();
        const base = { category: "basic", description: "d", syntax: "/x", run: () => null };
        registry.register({ name: "x", aliases: ["y"], ...base });
        assert.throws(() => registry.register({ name: "x", ...base }), /duplicado/);
        assert.throws(() => registry.register({ name: "z", aliases: ["y"], ...base }), /duplicado/);
        assert.throws(
            () =>
                registry.register({ name: "w", category: "basic", description: "d", syntax: "/w" }),
            /run/,
        );
        assert.throws(() => registry.register({ name: "Mai", ...base }), /inválido/);
        assert.throws(
            () => registry.register({ name: "q", ...base, category: "nada" }),
            /Categoria/,
        );
    });

    test("o registro padrão tem 28 comandos, sem colisão, e resolve aliases", () => {
        const registry = createDefaultRegistry();
        assert.equal(registry.list().length, 28);
        assert.equal(registry.resolve("dice")?.name, "roll");
        assert.equal(registry.resolve("whois")?.name, "profile");
        assert.equal(registry.resolve("date")?.name, "time");
        assert.equal(registry.resolve("nada"), null);
    });

    test("catálogo indica permissão por pessoa e nunca expõe o handler", () => {
        const registry = createDefaultRegistry();
        const member = registry.catalogFor({ role: "member" });
        const admin = registry.catalogFor({ role: "admin" });
        const clearall = (list) => list.find((c) => c.name === "clearall");
        assert.equal(clearall(member).allowed, false);
        assert.equal(clearall(admin).allowed, true);
        assert.ok(member.every((c) => !("run" in c) && !("params" in c)));
        assert.equal(member.find((c) => c.name === "clear").scope, "client");
    });
});

describe("autenticação de administrador", () => {
    const KEY = "chave-de-teste-com-tamanho-ok";

    test("sem chave configurada, administração desativada", () => {
        assert.deepEqual(createAdminAuth({ adminKey: null }).attempt({}, KEY), {
            ok: false,
            reason: "disabled",
        });
    });

    test("chave certa concede; errada recusa; bloqueio após tentativas", () => {
        let time = 0;
        const auth = createAdminAuth({ adminKey: KEY, now: () => time });
        const identity = {};
        assert.deepEqual(auth.attempt(identity, KEY), { ok: true });
        const attacker = {};
        for (let i = 0; i < MAX_FAILURES; i += 1)
            assert.equal(auth.attempt(attacker, "errada").reason, "wrong");
        const locked = auth.attempt(attacker, KEY);
        assert.equal(locked.reason, "locked", "nem a chave certa passa durante o bloqueio");
        time += 11 * 60 * 1000;
        assert.deepEqual(auth.attempt(attacker, KEY), { ok: true });
    });

    test("tentativa distribuída: bloqueio global por minuto", () => {
        let time = 0;
        const auth = createAdminAuth({ adminKey: KEY, now: () => time });
        for (let i = 0; i < 20; i += 1) auth.attempt({}, "errada");
        assert.equal(auth.attempt({}, KEY).reason, "locked");
        time += 61_000;
        assert.deepEqual(auth.attempt({}, KEY), { ok: true });
    });
});

describe("política de autorização", () => {
    const admin = { id: "a", role: "admin" };
    const other = { id: "b", role: "admin" };
    const member = { id: "m", role: "member" };

    test("permissões e hierarquia", () => {
        assert.equal(hasPermission(member, "everyone"), true);
        assert.equal(hasPermission(member, "admin"), false);
        assert.equal(hasPermission(admin, "admin"), true);
        assert.deepEqual(canModerate(admin, member), { ok: true });
        assert.equal(canModerate(member, admin).reason, "forbidden");
        assert.equal(canModerate(admin, admin).reason, "self");
        assert.equal(canModerate(admin, other).reason, "protected");
    });

    test("silêncio com prazo expira sozinho", () => {
        assert.equal(isMuted({ mutedUntil: null }, 0), false);
        assert.equal(isMuted({ mutedUntil: 100 }, 50), true);
        assert.equal(isMuted({ mutedUntil: 100 }, 100), false);
        assert.equal(isMuted({ mutedUntil: Infinity }, 1e15), true);
    });
});
