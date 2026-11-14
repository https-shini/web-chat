// Markdown das mensagens: subconjunto, casos de borda e entradas hostis.
// O interpretador é puro (sem DOM) e de custo linear.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mentionsOf, parseInline, parseMarkdown, plainInline } from "../src/markdown/parse.js";

/** Árvore compacta para comparar: [tipo, conteúdo]. */
const compact = (nodes) =>
    nodes.map((n) =>
        n.type === "text"
            ? n.text
            : n.type === "br"
              ? "\n"
              : n.type === "code"
                ? ["code", n.text]
                : n.type === "link"
                  ? ["link", n.href]
                  : n.type === "mention"
                    ? ["@", n.username]
                    : [n.type, compact(n.children)],
    );

describe("em linha", () => {
    const cases = [
        ["**negrito**", [["strong", ["negrito"]]]],
        ["*itálico*", [["em", ["itálico"]]]],
        ["_itálico_", [["em", ["itálico"]]]],
        ["~~riscado~~", [["del", ["riscado"]]]],
        ["||spoiler||", [["spoiler", ["spoiler"]]]],
        ["`a * b`", [["code", "a * b"]]],
        [
            "**negrito com *itálico* dentro**",
            [["strong", ["negrito com ", ["em", ["itálico"]], " dentro"]]],
        ],
        ["a **b** c", ["a ", ["strong", ["b"]], " c"]],
        ["2 * 3 * 4", ["2 * 3 * 4"]],
        ["nome_de_variavel_aqui", ["nome_de_variavel_aqui"]],
        ["**sem fim", ["**sem fim"]],
        ["****", ["****"]],
        ["\\*literal\\*", ["*literal*"]],
        ["`sem fim", ["`sem fim"]],
        ["linha1\nlinha2", ["linha1", "\n", "linha2"]],
        ["**x** e **y**", [["strong", ["x"]], " e ", ["strong", ["y"]]]],
    ];
    for (const [input, expected] of cases) {
        test(JSON.stringify(input), () => assert.deepEqual(compact(parseInline(input)), expected));
    }
});

describe("links", () => {
    test("http e https viram link; pontuação do fim fica de fora", () => {
        assert.deepEqual(compact(parseInline("veja https://exemplo.com/a?b=1.")), [
            "veja ",
            ["link", "https://exemplo.com/a?b=1"],
            ".",
        ]);
        assert.deepEqual(compact(parseInline("(http://x.org)")), [
            "(",
            ["link", "http://x.org"],
            ")",
        ]);
    });

    test("outros esquemas não viram link (javascript:, data:, ftp:)", () => {
        for (const input of [
            "javascript:alert(1)",
            "data:text/html,oi",
            "ftp://x.org",
            "httpx://a",
        ]) {
            assert.ok(
                parseInline(input).every((n) => n.type !== "link"),
                `${input} não pode virar link`,
            );
        }
    });

    test("link no meio de palavra não é reconhecido", () => {
        assert.ok(parseInline("xhttps://a.com").every((n) => n.type !== "link"));
    });
});

describe("menções", () => {
    test("@username no formato do servidor", () => {
        assert.deepEqual(compact(parseInline("oi @ana.souza, tudo bem?")), [
            "oi ",
            ["@", "ana.souza"],
            ", tudo bem?",
        ]);
        assert.deepEqual(compact(parseInline("fala com @bia.")), ["fala com ", ["@", "bia"], "."]);
    });

    test("e-mail e @ curto demais não são menção", () => {
        assert.ok(parseInline("a@b.com").every((n) => n.type !== "mention"));
        assert.ok(parseInline("@ab").every((n) => n.type !== "mention"));
    });

    test("menções de uma mensagem (fora de código)", () => {
        assert.deepEqual(mentionsOf(parseMarkdown("@ana e `@bia`\n```\n@caio\n```")), ["ana"]);
    });
});

describe("blocos", () => {
    test("bloco de código: o texto vai cru, com as quebras", () => {
        const blocks = parseMarkdown("antes\n```js\nconst a = **b**;\n  if (x) {}\n```\ndepois");
        assert.equal(blocks.length, 3);
        assert.deepEqual(blocks[1], {
            type: "codeblock",
            lang: "js",
            text: "const a = **b**;\n  if (x) {}",
        });
    });

    test("bloco de uma linha e bloco sem fim", () => {
        assert.deepEqual(parseMarkdown("```x = 1```"), [
            { type: "codeblock", lang: "", text: "x = 1" },
        ]);
        const open = parseMarkdown("```\nsem fim");
        assert.equal(open[0]?.type, "paragraph", "sem a cerca de fechamento, vira texto");
    });

    test("citação de várias linhas", () => {
        const blocks = parseMarkdown("> um\n> **dois**\nfora");
        assert.equal(blocks[0]?.type, "quote");
        assert.deepEqual(compact(/** @type {any} */ (blocks[0]).children), [
            "um",
            "\n",
            ["strong", ["dois"]],
        ]);
        assert.equal(blocks[1]?.type, "paragraph");
    });
});

describe("entradas hostis", () => {
    test("tags e entidades ficam como texto (nada vira elemento)", () => {
        const text = '<img src=x onerror="alert(1)"> &lt;b&gt; <script>x</script>';
        assert.deepEqual(compact(parseInline(text)), [text]);
    });

    test("aninhamento profundo é limitado e não estoura a pilha", () => {
        const deep = "**".repeat(400) + "x" + "**".repeat(400);
        assert.doesNotThrow(() => parseInline(deep));
        const nested = "*_".repeat(300) + "x" + "_*".repeat(300);
        assert.doesNotThrow(() => parseInline(nested));
    });

    test("1000 marcadores sem par: termina rápido", () => {
        const start = performance.now();
        parseMarkdown(`${"*".repeat(500)}${"_".repeat(250)}${"~".repeat(250)}`);
        parseMarkdown("`".repeat(1000));
        parseMarkdown("> ".repeat(500));
        parseMarkdown("```\n".repeat(250));
        assert.ok(performance.now() - start < 200, "sem explosão de tempo");
    });

    test("o texto puro devolve o que foi escrito, sem a marcação", () => {
        assert.equal(plainInline(parseInline("**oi** _você_ @ana `x`")), "oi você @ana x");
    });
});
