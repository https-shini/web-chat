// Campo de mensagem: formatação na seleção (botões e Ctrl/⌘ B, I, E).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { wrapSelection } from "../src/ui/composer.js";

describe("formatação na seleção", () => {
    test("envolve o texto selecionado e mantém a seleção nele", () => {
        const result = wrapSelection("diga oi agora", 5, 7, ["**", "**"]);
        assert.deepEqual(result, { value: "diga **oi** agora", start: 7, end: 9 });
    });

    test("sem seleção, insere o par e põe o cursor no meio", () => {
        assert.deepEqual(wrapSelection("abc", 3, 3, ["`", "`"]), {
            value: "abc``",
            start: 4,
            end: 4,
        });
    });

    test("de novo na mesma seleção, tira a marcação (alterna)", () => {
        const on = wrapSelection("oi", 0, 2, ["||", "||"]);
        assert.equal(on.value, "||oi||");
        const off = wrapSelection(on.value, on.start, on.end, ["||", "||"]);
        assert.deepEqual(off, { value: "oi", start: 0, end: 2 });
    });
});
