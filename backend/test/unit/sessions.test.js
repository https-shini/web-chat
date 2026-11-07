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

test("o teto de liberadas vale a todo momento, não só na varredura", () => {
    const { store } = setup({ maxReleased: 3 });
    const identities = [];
    for (let index = 0; index < 50; index += 1) {
        const identity = store.create(`P${index}`);
        identities.push({ identity, token: store.attach(identity, `c${index}`) });
        store.release(identity, `c${index}`);
        assert.ok(store.releasedCount <= 3);
        assert.ok(store.size <= 3);
    }
    // As mais antigas saíram; as 3 últimas continuam retomáveis.
    assert.equal(store.claim(identities[0].token), null);
    assert.equal(store.claim(identities.at(-1).token), identities.at(-1).identity);
});

test("retomar tira a identidade da fila de liberadas", () => {
    const { store } = setup({ maxReleased: 10 });
    const identity = store.create("Ana");
    const token = store.attach(identity, "c1");
    store.release(identity, "c1");
    assert.equal(store.releasedCount, 1);
    const claimed = store.claim(token);
    store.attach(claimed, "c2");
    assert.equal(store.releasedCount, 0);
    assert.equal(store.size, 1);
});

test("token expirado também é consumido (não fica guardado)", () => {
    const { store, tick } = setup({ ttlMs: 100 });
    const identity = store.create("Ana");
    const token = store.attach(identity, "c1");
    store.release(identity, "c1");
    tick(101);
    assert.equal(store.claim(token), null);
    assert.equal(store.size, 0);
    assert.equal(store.releasedCount, 0);
});
