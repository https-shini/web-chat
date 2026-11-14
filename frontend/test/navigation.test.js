// Organização da lista de conversas: seções, fixadas, ordem, filtro e
// navegação por teclado entre conversas.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    initialNav,
    moveBy,
    moveTo,
    neighbor,
    positionOf,
    reconcile,
    sectionsOf,
    setPinned,
    visualOrder,
} from "../src/state/navigation.js";

/** @param {string} id @param {"room" | "dm"} kind @param {number} [unread] */
const conv = (id, kind = "room", unread = 0) => ({
    conversationId: id,
    kind,
    name: id,
    role: /** @type {"member"} */ ("member"),
    unread,
});

// Na ordem em que chegaram do servidor: r1, d1, r2, d2, r3.
const list = [conv("r1"), conv("d1", "dm"), conv("r2", "room", 2), conv("d2", "dm", 1), conv("r3")];
/** @param {import("../src/state/navigation.js").Section[]} sections */
const ids = (sections) =>
    Object.fromEntries(sections.map((s) => [s.id, s.items.map((e) => e.conversationId)]));

describe("seções", () => {
    test("Salas e Privadas, a conversa mais nova no topo; Fixadas vazia não aparece", () => {
        assert.deepEqual(ids(sectionsOf(initialNav(), list)), {
            rooms: ["r3", "r2", "r1"],
            dms: ["d2", "d1"],
        });
    });

    test("fixar leva para Fixadas e tira da lista de origem; desafixar devolve", () => {
        let nav = reconcile(initialNav(), list);
        nav = setPinned(nav, "r2");
        nav = setPinned(nav, "d1");
        assert.deepEqual(ids(sectionsOf(nav, list)), {
            pinned: ["r2", "d1"],
            rooms: ["r3", "r1"],
            dms: ["d2"],
        });
        nav = setPinned(nav, "r2", false);
        assert.deepEqual(ids(sectionsOf(nav, list)).rooms, ["r3", "r2", "r1"], "volta ao lugar");
    });

    test("lista mista junta salas e privadas, na ordem da pessoa", () => {
        const nav = { ...reconcile(initialNav(), list), mixed: true };
        assert.deepEqual(ids(sectionsOf(nav, list)), { all: ["r3", "d2", "r2", "d1", "r1"] });
    });

    test("não lidas por seção, inclusive recolhida; filtro mantém a aberta", () => {
        const nav = { ...reconcile(initialNav(), list), unreadOnly: true };
        const sections = sectionsOf(nav, list, "r1");
        assert.deepEqual(ids(sections), { rooms: ["r2", "r1"], dms: ["d2"] });
        assert.equal(sections.find((s) => s.id === "rooms")?.unread, 2);
        assert.equal(sections.find((s) => s.id === "rooms")?.total, 3);
    });

    test("conversa que acabou some das fixadas e da ordem; nova entra no topo", () => {
        let nav = setPinned(reconcile(initialNav(), list), "r1");
        const after = [...list.filter((e) => e.conversationId !== "r1"), conv("r4")];
        nav = reconcile(nav, after);
        assert.deepEqual(nav.pinned, []);
        assert.ok(!nav.order.includes("r1"));
        assert.equal(nav.order[0], "r4");
    });
});

describe("reordenar", () => {
    test("mover dentro da seção não mexe nas outras", () => {
        const nav = reconcile(initialNav(), list);
        const result = moveBy(nav, list, "r1", -1);
        assert.ok(result);
        assert.equal(result.position, 2);
        assert.equal(result.total, 3);
        assert.deepEqual(ids(sectionsOf(result.nav, list)), {
            rooms: ["r3", "r1", "r2"],
            dms: ["d2", "d1"],
        });
    });

    test("nas pontas não há para onde mover", () => {
        const nav = reconcile(initialNav(), list);
        assert.equal(moveBy(nav, list, "r3", -1), null);
        assert.equal(moveBy(nav, list, "r1", 1), null);
    });

    test("mover em Fixadas reordena só as fixadas", () => {
        let nav = setPinned(setPinned(reconcile(initialNav(), list), "r1"), "d2");
        const result = moveTo(nav, list, "d2", 0);
        assert.ok(result);
        nav = result.nav;
        assert.deepEqual(nav.pinned, ["d2", "r1"]);
        assert.equal(result.section, "pinned");
    });

    test("posição dentro da seção", () => {
        const nav = reconcile(initialNav(), list);
        assert.deepEqual(positionOf(nav, list, "r2"), { index: 1, total: 3, section: "rooms" });
    });
});

describe("Alt+↑/↓ entre conversas", () => {
    const nav = setPinned(reconcile(initialNav(), list), "r1");
    test("ordem da tela: Fixadas, Salas, Privadas", () => {
        assert.deepEqual(
            visualOrder(nav, list).map((e) => e.conversationId),
            ["r1", "r3", "r2", "d2", "d1"],
        );
    });

    test("anterior e seguinte, com volta", () => {
        assert.equal(neighbor(nav, list, "r3", 1), "r2");
        assert.equal(neighbor(nav, list, "r1", -1), "d1");
        assert.equal(neighbor(nav, list, null, 1), "r1", "sem conversa aberta: a primeira");
    });

    test("só não lidas (Alt+Shift)", () => {
        assert.equal(neighbor(nav, list, "r1", 1, { unreadOnly: true }), "r2");
        assert.equal(neighbor(nav, list, "r2", 1, { unreadOnly: true }), "d2");
        assert.equal(neighbor(nav, list, "d2", 1, { unreadOnly: true }), "r2");
    });

    test("seção recolhida fica de fora (menos a aberta)", () => {
        const collapsed = { ...nav, collapsed: { ...nav.collapsed, dms: true } };
        assert.deepEqual(
            visualOrder(collapsed, list, "d1").map((e) => e.conversationId),
            ["r1", "r3", "r2", "d1"],
        );
    });
});
