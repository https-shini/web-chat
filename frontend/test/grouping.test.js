import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { continuesGroup } from "../src/ui/messageList.js";

/** @param {Partial<import("../src/state/store.js").Message>} over */
const chat = (over = {}) => ({
    id: "m",
    key: "m",
    kind: /** @type {const} */ ("chat"),
    userId: "ana",
    userName: "Ana",
    content: "oi",
    timestamp: "2026-11-07T10:00:00Z",
    own: false,
    delivery: /** @type {const} */ ("confirmed"),
    ...over,
});

describe("agrupamento de mensagens", () => {
    test("mesma pessoa, em sequência e dentro de 5 min: agrupa", () => {
        assert.equal(continuesGroup(chat(), chat({ timestamp: "2026-11-07T10:04:59Z" })), true);
    });

    test("depois de 5 minutos: novo grupo", () => {
        assert.equal(continuesGroup(chat(), chat({ timestamp: "2026-11-07T10:05:00Z" })), false);
    });

    test("outra pessoa: novo grupo", () => {
        assert.equal(continuesGroup(chat(), chat({ userId: "beto" })), false);
    });

    test("sistema, aviso ou primeira da lista nunca agrupam", () => {
        assert.equal(continuesGroup(undefined, chat()), false);
        assert.equal(continuesGroup(chat({ kind: "system" }), chat()), false);
        assert.equal(continuesGroup(chat(), chat({ kind: "notice" })), false);
    });

    test("ação e anúncio têm cabeçalho próprio", () => {
        assert.equal(continuesGroup(chat(), chat({ variant: "action" })), false);
        assert.equal(continuesGroup(chat({ variant: "announcement" }), chat()), false);
    });

    test("carimbo ilegível ou fora de ordem não agrupa", () => {
        assert.equal(continuesGroup(chat(), chat({ timestamp: "x" })), false);
        assert.equal(continuesGroup(chat(), chat({ timestamp: "2026-11-07T09:59:00Z" })), false);
    });
});

describe("mesmo @, autores diferentes", () => {
    test("o @ reaproveitado por outra pessoa não emenda na mensagem de quem o usou antes", () => {
        const before = chat({ author: 2 });
        assert.equal(continuesGroup(before, chat({ author: 4, id: "b" })), false);
        assert.equal(continuesGroup(before, chat({ author: 2, id: "b" })), true);
    });

    test("sem número de autor (servidor antigo), vale só o @", () => {
        assert.equal(continuesGroup(chat(), chat({ author: 3, id: "b" })), true);
    });
});
