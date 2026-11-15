// Sugestões de "@pessoa" no campo de mensagem (decisão C3).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchPeople, mentionQuery } from "../src/ui/commandSuggestions.js";

const people = [
    { id: "ana", name: "Ana Souza", username: "ana" },
    { id: "bia", name: "Beatriz Lima", username: "bia.lima" },
    { id: "caio", name: "Caio Ávila", username: "caio" },
];

describe("menções no campo", () => {
    test("@ no começo de palavra, antes do cursor", () => {
        assert.deepEqual(mentionQuery("oi @bi", 6), { start: 3, query: "bi" });
        assert.deepEqual(mentionQuery("@", 1), { start: 0, query: "" });
        assert.equal(mentionQuery("email@bi", 8), null, "e-mail não é menção");
        assert.equal(mentionQuery("oi @bi agora", 12), null, "o cursor já saiu do @");
    });

    test("combina por @ ou por palavra do nome, sem acento; você fica de fora", () => {
        assert.deepEqual(
            matchPeople(people, "b", "ana").map((p) => p.username),
            ["bia.lima"],
        );
        assert.deepEqual(
            matchPeople(people, "avi", "ana").map((p) => p.username),
            ["caio"],
            "Ávila combina com avi",
        );
        assert.deepEqual(
            matchPeople(people, "", "ana").map((p) => p.username),
            ["bia.lima", "caio"],
        );
    });
});
