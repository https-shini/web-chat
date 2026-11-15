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
    // Janela de 7 minutos, como no Fluxer (MessageGroupingUtils).
    test("mesma pessoa, em sequência e dentro de 7 min: agrupa", () => {
        assert.equal(continuesGroup(chat(), chat({ timestamp: "2026-11-07T10:06:59Z" })), true);
    });

    test("depois de 7 minutos: novo grupo", () => {
        assert.equal(continuesGroup(chat(), chat({ timestamp: "2026-11-07T10:07:00Z" })), false);
    });

    test("virou o dia: novo grupo, mesmo dentro da janela", () => {
        const late = new Date(2026, 10, 7, 23, 58).toISOString();
        const early = new Date(2026, 10, 8, 0, 1).toISOString();
        assert.equal(continuesGroup(chat({ timestamp: late }), chat({ timestamp: early })), false);
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

describe("separadores de dia", () => {
    const now = new Date(2026, 10, 14, 15, 0);
    test("hoje, ontem e a data", async () => {
        const { dayLabel } = await import("../src/ui/messageList.js");
        assert.equal(dayLabel(new Date(2026, 10, 14, 9, 0).toISOString(), now), "Hoje");
        assert.equal(dayLabel(new Date(2026, 10, 13, 23, 0).toISOString(), now), "Ontem");
        assert.equal(dayLabel(new Date(2026, 10, 2, 8, 0).toISOString(), now), "2 de novembro");
        assert.equal(dayLabel(new Date(2025, 0, 5).toISOString(), now), "5 de janeiro de 2025");
        assert.equal(dayLabel("não é data", now), "");
    });
});
