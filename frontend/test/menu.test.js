// Modelo do menu (padrão APG): foco, setas, busca por letra e limpeza.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { first, last, move, step, tidy, typeahead } from "../src/ui/primitives/menuModel.js";

/** @type {import("../src/ui/primitives/menuModel.js").MenuItem[]} */
const items = [
    { type: "label", label: "Conversa" },
    { label: "Fixar" },
    { label: "Mover para cima", disabled: true },
    { label: "Mover para baixo" },
    { type: "separator" },
    { label: "Marcar como lida" },
    { label: "Sair da sala", danger: true },
];

describe("menu: foco e setas", () => {
    test("o primeiro e o último focáveis pulam rótulo, separador e desabilitado", () => {
        assert.equal(first(items), 1);
        assert.equal(last(items), 6);
    });

    test("↓ e ↑ andam com volta, sem parar em itens que não recebem foco", () => {
        assert.equal(step(items, 1, 1), 3, "pula o desabilitado");
        assert.equal(step(items, 3, 1), 5, "pula o separador");
        assert.equal(step(items, 6, 1), 1, "volta ao começo");
        assert.equal(step(items, 1, -1), 6, "volta ao fim");
    });

    test("Home/End e PageUp/PageDown; tecla alheia não é do menu", () => {
        assert.equal(move("Home", items, 5), 1);
        assert.equal(move("End", items, 1), 6);
        assert.equal(move("PageUp", items, 5), 1);
        assert.equal(move("ArrowDown", items, -1), 1, "sem foco: ↓ vai ao primeiro");
        assert.equal(move("ArrowUp", items, -1), 6, "sem foco: ↑ vai ao último");
        assert.equal(move("a", items, 1), null);
    });

    test("menu sem item focável", () => {
        assert.equal(first([{ type: "separator" }, { label: "x", disabled: true }]), -1);
        assert.equal(step([], 0, 1), -1);
    });
});

describe("menu: busca pela digitação", () => {
    test("acha pelo prefixo a partir do item atual, com volta e sem acento de caixa", () => {
        assert.equal(typeahead(items, 1, "m"), 3, "o desabilitado não conta");
        assert.equal(typeahead(items, 3, "m"), 5);
        assert.equal(typeahead(items, 5, "m"), 3, "volta ao começo");
        assert.equal(typeahead(items, 1, "SAIR"), 6);
        assert.equal(typeahead(items, 1, "z"), -1);
    });
});

describe("menu: limpeza dos grupos", () => {
    test("separadores no começo, no fim e repetidos somem; rótulo sem itens também", () => {
        const result = tidy([
            { type: "separator" },
            { label: "A" },
            { type: "separator" },
            { type: "separator" },
            { type: "label", label: "Moderação" },
            { type: "separator" },
            { label: "B" },
            { type: "separator" },
        ]);
        assert.deepEqual(
            result.map((item) => item.type ?? item.label),
            ["A", "separator", "B"],
        );
    });
});
