import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createIdentityStore } from "../../src/room/sessions.js";
import { join, startServer } from "../integration/helpers.js";

test("consulta por username só retorna perfis conectados, sem tokens", () => {
    const store = createIdentityStore();
    const a = store.create("Ana", "ana_dev");
    const b = store.create("Anabela", "anabela");
    const c = store.create("Anônimo", "anonimo");
    store.attach(a, "socket-a");
    store.attach(b, "socket-b");
    store.attach(c, "socket-c");
    store.release(c, "socket-c");
    const result = store.searchOnline("ana", a.id);
    assert.deepEqual(result, [{ id: b.id, name: b.name, username: b.username }]);
    assert.equal(JSON.stringify(result).includes("tokenHash"), false);
    assert.equal(store.findOnline("anonimo"), null);
    store.revoke(b);
    assert.deepEqual(store.searchOnline("ana", a.id), []);
});

describe("busca de usuários pelo WebSocket real", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("consulta parcial devolve apenas perfis online e ignora o próprio usuário", async () => {
        const first = await join(
            server.url,
            { userName: "Alice", username: "alice_test" },
            undefined,
            { room: false },
        );
        const second = await join(
            server.url,
            { userName: "Alex", username: "alex_test" },
            undefined,
            { room: false },
        );
        second.client.send("user_search", { query: "@ALIC", requestId: "q-search" });
        const reply = await second.client.take("user_search_results");
        assert.equal(reply.payload.query, "alic");
        assert.deepEqual(reply.payload.users, [
            { id: first.session.id, name: "Alice", username: "alice_test" },
        ]);
        first.client.close();
        second.client.close();
    });

    test("consultas excessivas recebem rate limiting do servidor", async () => {
        const searcher = await join(
            server.url,
            { userName: "Search", username: "search_test" },
            undefined,
            { room: false },
        );
        for (let i = 0; i < 5; i += 1) {
            searcher.client.send("user_search", { query: "abc" });
            assert.equal((await searcher.client.take("user_search_results")).payload.query, "abc");
        }
        searcher.client.send("user_search", { query: "abc" });
        assert.equal((await searcher.client.take("error")).payload.code, "rate_limited");
        searcher.client.close();
    });
});
