import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, DEFAULTS, loadConfig } from "../../src/config.js";

test("sem variáveis, os padrões reproduzem o comportamento anterior", () => {
    const config = loadConfig({});
    assert.deepEqual(config, {
        port: 8080,
        allowedOrigins: [],
        heartbeatMs: 30000,
        maxConnections: 500,
        maxPayloadBytes: 16384,
        messageRate: { capacity: 40, refillPerSecond: 8 },
        signalRate: { capacity: 40, refillPerSecond: 8 },
        historySize: 1000,
        historyOnJoin: 50,
        production: false,
    });
    assert.equal(DEFAULTS.port, 8080);
});

test("variáveis válidas são aplicadas", () => {
    const config = loadConfig({
        MAX_CONNECTIONS: "100",
        RATE_MESSAGES_CAPACITY: "10",
        RATE_SIGNALS_PER_SEC: "2",
        HISTORY_SIZE: "200",
        HISTORY_ON_JOIN: "20",
        NODE_ENV: "production",
    });
    assert.equal(config.maxConnections, 100);
    assert.equal(config.messageRate.capacity, 10);
    assert.equal(config.signalRate.refillPerSecond, 2);
    assert.equal(config.historyOnJoin, 20);
    assert.equal(config.production, true);
});

for (const [variable, value] of [
    ["MAX_CONNECTIONS", "0"],
    ["MAX_PAYLOAD_BYTES", "1024"],
    ["RATE_MESSAGES_PER_SEC", "abc"],
    ["HISTORY_SIZE", "-5"],
    ["HEARTBEAT_MS", "10"],
    ["PORT", "99999"],
]) {
    test(`${variable}=${value} é recusada com a variável identificada`, () => {
        assert.throws(
            () => loadConfig({ [variable]: value }),
            (error) => error instanceof ConfigError && error.variable === variable,
        );
    });
}

test("HISTORY_ON_JOIN maior que HISTORY_SIZE é recusada", () => {
    assert.throws(
        () => loadConfig({ HISTORY_SIZE: "10", HISTORY_ON_JOIN: "20" }),
        (error) => error.variable === "HISTORY_ON_JOIN",
    );
});
