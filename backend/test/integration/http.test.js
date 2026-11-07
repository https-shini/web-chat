// Rotas HTTP da porta do WebSocket (F2-07) com o servidor real.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, join } from "./helpers.js";

describe("rotas HTTP", () => {
    let server;
    let base;
    before(async () => {
        server = await startServer();
        base = `http://127.0.0.1:${server.port}`;
    });
    after(() => server.stop());

    test("GET / continua 200 ok (checagem de saúde já existente)", async () => {
        const response = await fetch(`${base}/`);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "ok");
    });

    test("GET /healthz reflete conexões e pessoas na sala", async () => {
        const empty = await (await fetch(`${base}/healthz`)).json();
        assert.equal(empty.status, "ok");
        assert.equal(empty.users, 0);

        const { client } = await join(server.url, { userName: "Saúde" });
        const busy = await (await fetch(`${base}/healthz`)).json();
        assert.equal(busy.users, 1);
        assert.equal(busy.connections, 1);
        assert.equal(typeof busy.uptimeSec, "number");
        client.close();
    });

    test("caminho desconhecido 404; método não permitido 405", async () => {
        assert.equal((await fetch(`${base}/admin`)).status, 404);
        assert.equal((await fetch(`${base}/`, { method: "POST" })).status, 405);
    });
});
