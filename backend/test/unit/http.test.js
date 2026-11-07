import { test } from "node:test";
import assert from "node:assert/strict";
import { createHttpHandler } from "../../src/transport/http.js";

const request = (method, url) => {
    const handler = createHttpHandler({
        stats: () => ({ connections: 3, users: 2 }),
        startedAt: 0,
        now: () => 65_000,
    });
    const response = { status: 0, headers: {}, body: "" };
    handler(
        { method, url },
        {
            writeHead(status, headers) {
                response.status = status;
                response.headers = headers;
            },
            end(body) {
                response.body = body ?? "";
            },
        },
    );
    return response;
};

test("GET / continua respondendo 200 ok", () => {
    assert.deepEqual([request("GET", "/").status, request("GET", "/").body], [200, "ok"]);
    assert.equal(request("HEAD", "/?x=1").status, 200);
});

test("GET /healthz devolve estado sem cache", () => {
    const response = request("GET", "/healthz");
    assert.equal(response.status, 200);
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.deepEqual(JSON.parse(response.body), {
        status: "ok",
        uptimeSec: 65,
        connections: 3,
        users: 2,
    });
});

test("caminho desconhecido 404, método não permitido 405", () => {
    assert.equal(request("GET", "/admin").status, 404);
    const post = request("POST", "/");
    assert.equal(post.status, 405);
    assert.equal(post.headers.Allow, "GET, HEAD");
});
