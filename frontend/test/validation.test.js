import { test } from "node:test";
import assert from "node:assert/strict";
import { isSocketUrl } from "../src/socketUrl.js";
import { normalizeName } from "../src/ui/entry.js";

test("isSocketUrl aceita só ws:// e wss://", () => {
    for (const ok of ["ws://localhost:8080", "wss://chat.exemplo.com", "wss://x.com/socket"]) {
        assert.equal(isSocketUrl(ok), true, ok);
    }
    for (const bad of [
        "",
        "localhost:8080",
        "http://x.com",
        "https://x.com",
        " wss://x.com",
        "wss://",
        42,
        undefined,
    ]) {
        assert.equal(isSocketUrl(bad), false, String(bad));
    }
});

test("normalizeName segue a mesma regra do servidor", () => {
    assert.equal(normalizeName("   Ana   "), "Ana");
    assert.equal(normalizeName("\u0000\u0007\n"), "");
    assert.equal(normalizeName("Ana\n[FORJADO]\r\tBot"), "Ana [FORJADO]  Bot");
    assert.equal(normalizeName("N".repeat(75)).length, 60);
});
