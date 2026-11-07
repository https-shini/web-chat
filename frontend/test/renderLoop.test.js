// Agendamento da renderização (Fase 3, F3-03).

import { test } from "node:test";
import assert from "node:assert/strict";
import { changed, createRenderLoop } from "../src/state/renderLoop.js";

const setup = () => {
    let state = { a: 1, b: [] };
    const frames = [];
    const renders = [];
    const loop = createRenderLoop({
        getState: () => state,
        render: (next, previous) => renders.push({ next, previous }),
        schedule: (callback) => frames.push(callback),
    });
    const runFrame = () => frames.splice(0).forEach((callback) => callback());
    return { loop, renders, runFrame, set: (next) => (state = next) };
};

test("vários pedidos no mesmo quadro viram uma renderização, com o estado final", () => {
    const { loop, renders, runFrame, set } = setup();
    set({ a: 2, b: [] });
    loop.request();
    set({ a: 3, b: [] });
    loop.request();
    loop.request();
    assert.equal(renders.length, 0, "nada antes do quadro");
    runFrame();
    assert.equal(renders.length, 1);
    assert.equal(renders[0].next.a, 3);
    assert.equal(renders[0].previous, null, "primeira renderização não tem anterior");
});

test("a renderização seguinte recebe o estado anterior; estado igual não redesenha", () => {
    const { loop, renders, runFrame, set } = setup();
    loop.request();
    runFrame();
    const first = renders[0].next;
    loop.request();
    runFrame();
    assert.equal(renders.length, 1, "mesmo estado: nada a fazer");
    set({ a: 9, b: [] });
    loop.request();
    runFrame();
    assert.equal(renders[1].previous, first);
});

test("flush renderiza na hora e cancela o efeito do pedido pendente", () => {
    const { loop, renders, runFrame, set } = setup();
    set({ a: 5, b: [] });
    loop.request();
    loop.flush();
    assert.equal(renders.length, 1);
    runFrame();
    assert.equal(renders.length, 1, "o quadro pendente não repete o trabalho");
});

test("changed compara por referência só as chaves pedidas", () => {
    const list = [];
    const before = { a: 1, list };
    assert.equal(changed({ a: 1, list }, before, ["a", "list"]), false);
    assert.equal(changed({ a: 1, list: [] }, before, ["a"]), false);
    assert.equal(changed({ a: 1, list: [] }, before, ["list"]), true);
    assert.equal(changed({ a: 1, list }, null, ["a"]), true);
});
