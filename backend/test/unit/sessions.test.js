import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdentityStore } from "../../src/room/sessions.js";

const setup = (options = {}) => {
    let clock = 0;
    const store = createIdentityStore({ now: () => clock, ...options });
    return { store, tick: (ms) => (clock += ms) };
};

test("tokens são aleatórios, longos e diferentes a cada emissão", () => {
    const { store } = setup();
    const identity = store.create("Ana");
    const first = store.attach(identity, "c1");
    const second = store.attach(identity, "c2");
    assert.notEqual(first, second);
    assert.ok(first.length >= 43);
});

test("claim de token desconhecido, nulo ou já usado devolve null", () => {
    const { store } = setup();
    const identity = store.create("Ana");
    const token = store.attach(identity, "c1");
    assert.equal(store.claim(null), null);
    assert.equal(store.claim("nao-existe"), null);
    assert.equal(store.claim(token), identity);
    assert.equal(store.claim(token), null);
});

test("só a conexão que detém a identidade pode liberá-la", () => {
    const { store } = setup();
    const identity = store.create("Ana");
    store.attach(identity, "c1");
    store.release(identity, "intrusa");
    assert.equal(identity.holder, "c1");
    store.release(identity, "c1");
    assert.equal(identity.holder, null);
});

test("sweep remove liberadas expiradas e respeita o teto", () => {
    const { store, tick } = setup({ ttlMs: 1000, maxReleased: 2 });
    const active = store.create("Ativa");
    store.attach(active, "viva");
    for (let index = 0; index < 4; index += 1) {
        const identity = store.create(`L${index}`);
        store.attach(identity, `c${index}`);
        store.release(identity, `c${index}`);
    }
    store.sweep();
    assert.equal(store.size, 3, "1 ativa + 2 liberadas (teto)");
    tick(1001);
    store.sweep();
    assert.equal(store.size, 1, "só a ativa sobrevive à expiração");
});

test("nenhum token em claro fica guardado no armazenamento", () => {
    const tokens = [];
    const { store } = setup();
    const identity = store.create("Ana");
    tokens.push(store.attach(identity, "c1"));
    // O token só existe no retorno; o armazenamento é indexado por hash.
    assert.equal(JSON.stringify(identity).includes(tokens[0]), false);
});
