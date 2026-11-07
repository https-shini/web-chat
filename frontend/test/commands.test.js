// Comandos no cliente: encaminhamento, autocomplete e comandos locais.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { routeInput } from "../src/commands/input.js";
import { completion, suggest } from "../src/commands/autocomplete.js";
import { helpReply, timeReply } from "../src/commands/local.js";

/** Catálogo no formato que o servidor envia (recorte). */
const command = (name, extra = {}) => ({
    name,
    aliases: [],
    category: "basic",
    categoryLabel: "Básicos",
    description: `descrição de ${name}`,
    syntax: `/${name}`,
    examples: [`/${name}`],
    permission: "everyone",
    scope: "server",
    allowed: true,
    ...extra,
});
const catalog = [
    command("help", { scope: "client", aliases: ["ajuda"] }),
    command("clear", { scope: "client" }),
    command("me", { category: "profile", categoryLabel: "Perfil", syntax: "/me <ação>" }),
    command("roll", { aliases: ["dice"], syntax: "/roll [máximo]" }),
    command("clearall", {
        category: "admin",
        categoryLabel: "Administração",
        permission: "admin",
        allowed: false,
    }),
    command("mute", {
        category: "admin",
        categoryLabel: "Administração",
        permission: "admin",
        allowed: false,
    }),
];

describe("encaminhamento do que foi digitado", () => {
    test("mensagem comum contendo / não é comando", () => {
        for (const text of [
            "1/2 de pizza",
            "a/b",
            "/ olá",
            "veja http://x.com/a",
            "  texto /help no meio",
        ]) {
            assert.equal(routeInput(text, catalog).type, "message", text);
        }
    });

    test("// escapa: envia o texto começando com uma barra", () => {
        assert.deepEqual(routeInput("//help não é comando", catalog), {
            type: "message",
            content: "/help não é comando",
        });
    });

    test("comando local roda no navegador, com argumentos", () => {
        const route = routeInput("/help roll", catalog);
        assert.equal(route.type, "client");
        assert.equal(route.type === "client" && route.command.name, "help");
        assert.equal(route.type === "client" && route.args, "roll");
        assert.equal(routeInput("/AJUDA", catalog).type, "client", "alias e maiúsculas");
    });

    test("comando do servidor (ou desconhecido) vai como texto bruto", () => {
        assert.deepEqual(routeInput("/roll 1 100", catalog), {
            type: "server",
            name: "roll",
            text: "/roll 1 100",
        });
        assert.deepEqual(routeInput("/dice", catalog), {
            type: "server",
            name: "roll",
            text: "/dice",
        });
        assert.deepEqual(routeInput("/inexistente x", catalog), {
            type: "server",
            name: "inexistente",
            text: "/inexistente x",
        });
    });

    test("tentar manipular permissão pelo cliente não muda nada: o servidor decide", () => {
        // O cliente não tem como "liberar" /clearall: o texto vai ao servidor.
        const forged = catalog.map((entry) => ({ ...entry, allowed: true }));
        assert.equal(routeInput("/clearall confirmar", forged).type, "server");
    });
});

describe("autocomplete", () => {
    test("/cl sugere /clear e /clearall", () => {
        const result = suggest("/cl", 3, catalog);
        assert.equal(result?.mode, "names");
        assert.deepEqual(
            result?.mode === "names" && result.items.map((item) => item.command.name),
            ["clear", "clearall"],
        );
    });

    test("/ lista todos, liberados primeiro", () => {
        const result = suggest("/", 1, catalog);
        const names = result?.mode === "names" ? result.items.map((item) => item.command.name) : [];
        assert.equal(names.length, catalog.length);
        assert.deepEqual(names.slice(-2), ["clearall", "mute"], "restritos por último");
    });

    test("alias também encontra o comando", () => {
        const result = suggest("/di", 3, catalog);
        assert.equal(result?.mode === "names" && result.items[0]?.matched, "dice");
    });

    test("depois do nome, mostra a sintaxe sem listar opções", () => {
        const result = suggest("/roll ", 6, catalog);
        assert.equal(result?.mode, "syntax");
        assert.equal(result?.mode === "syntax" && result.command.syntax, "/roll [máximo]");
    });

    test("mensagem comum, // e catálogo vazio não abrem nada", () => {
        assert.equal(suggest("olá", 3, catalog), null);
        assert.equal(suggest("//x", 3, catalog), null);
        assert.equal(suggest("/", 1, []), null);
        assert.equal(suggest("/zzz", 4, catalog), null);
    });

    test("completar deixa o nome e um espaço para os argumentos", () => {
        assert.equal(completion(catalog[3]), "/roll ");
    });
});

describe("comandos locais", () => {
    test("/help lista por categoria e marca os restritos", () => {
        const reply = helpReply(catalog, "");
        assert.ok(
            reply.lines?.some((line) => line.startsWith("Básicos:") && line.includes("/roll")),
        );
        assert.ok(reply.lines?.some((line) => line.includes("/clearall 🔒")));
    });

    test("/help comando explica uso, aliases, exemplos e permissão", () => {
        const reply = helpReply(catalog, "clearall");
        assert.equal(reply.title, "/clearall");
        assert.ok(reply.lines?.includes("Restrito a administradores."));
        assert.equal(helpReply(catalog, "/dice").title, "/roll", "aceita / e alias");
        assert.equal(helpReply(catalog, "nada").tone, "error");
    });

    test("/time usa o relógio do dispositivo", () => {
        const reply = timeReply(new Date("2026-11-07T15:30:00"));
        assert.match(reply.text, /2026/);
        assert.equal(reply.tone, "result");
    });
});
