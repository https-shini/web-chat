// Quem está digitando: expiração automática quando o sinal de parada se perde.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTypingTracker } from "../src/state/typing.js";

let now;
let intervals;
let originals;
beforeEach(() => {
    now = 0;
    intervals = [];
    originals = {
        now: Date.now,
        setInterval: globalThis.setInterval,
        clearInterval: globalThis.clearInterval,
    };
    Date.now = () => now;
    globalThis.setInterval = /** @type {any} */ (
        (callback) => {
            const handle = { callback, active: true };
            intervals.push(handle);
            return handle;
        }
    );
    globalThis.clearInterval = /** @type {any} */ (
        (handle) => {
            if (handle) handle.active = false;
        }
    );
});
afterEach(() => {
    Date.now = originals.now;
    globalThis.setInterval = originals.setInterval;
    globalThis.clearInterval = originals.clearInterval;
});

const advance = (ms) => {
    now += ms;
    for (const handle of intervals) if (handle.active) handle.callback();
};

test("entra e sai da lista pelos sinais", () => {
    const seen = [];
    const tracker = createTypingTracker((people) => seen.push(people.map((p) => p.name)));
    tracker.set("a", "Ana", true);
    tracker.set("b", "Bia", true);
    tracker.set("a", "Ana", false);
    assert.deepEqual(seen, [["Ana"], ["Ana", "Bia"], ["Bia"]]);
});

test("sem novo sinal por 6 s a pessoa sai sozinha e o varredor para", () => {
    const seen = [];
    const tracker = createTypingTracker((people) => seen.push(people.length));
    tracker.set("a", "Ana", true);
    advance(5000);
    assert.deepEqual(seen, [1]);
    advance(1500);
    assert.deepEqual(seen, [1, 0]);
    assert.equal(intervals.filter((handle) => handle.active).length, 0);
});

test("parar quem não estava digitando, remover e limpar não publicam à toa", () => {
    const seen = [];
    const tracker = createTypingTracker((people) => seen.push(people.length));
    tracker.set("x", "X", false);
    tracker.set("", "Sem id", true);
    tracker.remove("ninguem");
    tracker.clear();
    assert.deepEqual(seen, []);
    tracker.set("a", "Ana", true);
    tracker.remove("a");
    tracker.set("b", "Bia", true);
    tracker.clear();
    assert.deepEqual(seen, [1, 0, 1, 0]);
});
