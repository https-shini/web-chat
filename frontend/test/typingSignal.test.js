// Throttle do sinal de digitação no cliente (F1-07).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTypingSignal } from "../src/state/typingSignal.js";

const fakeClock = () => {
    let time = 0;
    /** @type {{at: number, callback: () => void, id: number}[]} */
    let timers = [];
    let nextId = 1;
    return {
        now: () => time,
        schedule: (callback, ms) => {
            const id = nextId++;
            timers.push({ at: time + ms, callback, id });
            return id;
        },
        cancel: (id) => {
            timers = timers.filter((timer) => timer.id !== id);
        },
        advance(ms) {
            const target = time + ms;
            for (;;) {
                const due = timers
                    .filter((timer) => timer.at <= target)
                    .sort((a, b) => a.at - b.at)[0];
                if (!due) break;
                time = due.at;
                timers = timers.filter((timer) => timer !== due);
                due.callback();
            }
            time = target;
        },
    };
};

const setup = () => {
    const clock = fakeClock();
    const sent = [];
    const signal = createTypingSignal({
        send: (type) => sent.push({ type, at: clock.now() }),
        interval: 2000,
        idle: 2000,
        now: clock.now,
        schedule: clock.schedule,
        cancel: clock.cancel,
    });
    return { clock, sent, signal };
};

test("100 teclas em 3 s geram no máximo 2 typing_start", () => {
    const { clock, sent, signal } = setup();
    for (let index = 0; index < 100; index += 1) {
        signal.input();
        clock.advance(30);
    }
    const starts = sent.filter((item) => item.type === "typing_start");
    assert.ok(starts.length <= 2, `inícios: ${starts.length}`);
    assert.equal(sent.filter((item) => item.type === "typing_stop").length, 0);
});

test("digitação contínua renova o sinal antes de expirar no receptor (6 s)", () => {
    const { clock, sent, signal } = setup();
    for (let index = 0; index < 200; index += 1) {
        signal.input();
        clock.advance(50);
    }
    const starts = sent.filter((item) => item.type === "typing_start").map((item) => item.at);
    for (let index = 1; index < starts.length; index += 1) {
        assert.ok(starts[index] - starts[index - 1] < 6000);
    }
});

test("silêncio de 2 s envia typing_stop uma vez", () => {
    const { clock, sent, signal } = setup();
    signal.input();
    clock.advance(2500);
    assert.deepEqual(
        sent.map((item) => item.type),
        ["typing_start", "typing_stop"],
    );
    clock.advance(5000);
    assert.equal(sent.length, 2);
});

test("enviar a mensagem encerra a digitação imediatamente", () => {
    const { clock, sent, signal } = setup();
    signal.input();
    signal.stop();
    clock.advance(5000);
    assert.deepEqual(
        sent.map((item) => item.type),
        ["typing_start", "typing_stop"],
    );
});

test("stop sem digitação em curso não envia nada", () => {
    const { sent, signal } = setup();
    signal.stop();
    assert.equal(sent.length, 0);
});
