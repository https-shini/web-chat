// Peças de segurança isoladas: validação, rate limit, envelope, erros, logger.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, readContent, readName, readResumeToken } from "../../src/validation.js";
import { createRateLimiter } from "../../src/rateLimiter.js";
import { errorCodeForEnvelope, isSignal, parseEnvelope } from "../../src/protocol.js";
import { describeError, ERROR_CODES, logLevelFor } from "../../src/errors.js";
import { createLogger } from "../../src/logger.js";

describe("validação", () => {
    test("normalizeText troca controle por espaço, apara e corta", () => {
        assert.equal(normalizeText("  a\nb\u0000c  ", 10), "a b c");
        assert.equal(normalizeText("x".repeat(50), 30).length, 30);
        assert.equal(normalizeText(42, 30), "");
    });

    test("readName distingue tipo errado de nome vazio", () => {
        assert.deepEqual(readName(7), { ok: false, code: "invalid_name" });
        assert.deepEqual(readName(undefined), { ok: true, name: "" });
        assert.deepEqual(readName("  Ana  "), { ok: true, name: "Ana" });
    });

    test("readContent", () => {
        assert.deepEqual(readContent(null), { ok: false, code: "invalid_message" });
        assert.deepEqual(readContent(" \t "), { ok: false, code: "empty_message" });
        assert.equal(readContent("y".repeat(2000)).content.length, 1000);
    });

    test("mensagem aceita quebra de linha; os outros controles continuam fora", () => {
        assert.equal(readContent("linha 1\nlinha 2").content, "linha 1\nlinha 2");
        assert.equal(readContent("a\r\nb\rc").content, "a\nb\nc", "CRLF e CR viram LF");
        assert.equal(
            readContent("x\u0000y\u001bz\u007f").content,
            "x y z",
            "outros controles viram espaço",
        );
        assert.equal(
            readContent("\tcódigo").content,
            "código",
            "tabulação vira espaço (e a ponta é aparada)",
        );
        assert.equal(readContent("a\n\tb").content, "a\n  b", "indentação no meio é mantida");
        assert.equal(
            readContent("fim   \nnovo").content,
            "fim\nnovo",
            "espaço no fim da linha some",
        );
    });

    test("linhas vazias seguidas viram uma; pontas aparadas", () => {
        assert.equal(readContent("\n\n a \n\n\n\nb\n\n").content, "a\n\nb");
        assert.deepEqual(readContent("\n \n\t\n"), { ok: false, code: "empty_message" });
    });

    test("no máximo 20 linhas, sem perder o texto que passa", () => {
        const lines = Array.from({ length: 30 }, (_, i) => `l${i + 1}`);
        const content = readContent(lines.join("\n")).content;
        const out = content.split("\n");
        assert.equal(out.length, 20);
        assert.equal(out[19], lines.slice(19).join(" "), "a 20ª junta o resto");
    });

    test("nome e @ continuam sem quebra de linha", () => {
        assert.equal(readName("Ana\nSouza").name, "Ana Souza");
        assert.equal(normalizeText("a\nb", 10), "a b");
    });

    test("readResumeToken aceita só string de tamanho razoável", () => {
        assert.equal(readResumeToken("abc"), "abc");
        for (const bad of ["", "z".repeat(101), 5, null, {}])
            assert.equal(readResumeToken(bad), null);
    });
});

describe("rate limiter", () => {
    test("esgota na capacidade e repõe com o tempo", () => {
        let time = 0;
        const take = createRateLimiter({ capacity: 3, refillPerSecond: 2, now: () => time });
        assert.deepEqual([take(), take(), take(), take()], [true, true, true, false]);
        time += 500; // repõe 1 ficha
        assert.deepEqual([take(), take()], [true, false]);
        time += 10_000; // nunca passa da capacidade
        assert.deepEqual([take(), take(), take(), take()], [true, true, true, false]);
    });
});

describe("envelope", () => {
    const frame = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value));

    test("quadros malformados viram motivo, nunca exceção", () => {
        const cases = [
            [frame("{"), "invalid_json"],
            [frame("null"), "not_an_object"],
            [frame("[1]"), "not_an_object"],
            [frame({ payload: {} }), "missing_type"],
            [frame({ type: "x" }), "unknown_type"],
            [frame({ type: "chat_message", payload: "t" }), "invalid_payload"],
        ];
        for (const [data, reason] of cases) {
            assert.equal(parseEnvelope(data, false).reason, reason);
        }
        assert.equal(parseEnvelope(frame({ type: "chat_message" }), true).reason, "binary_frame");
    });

    test("payload ausente vira objeto vazio", () => {
        assert.deepEqual(parseEnvelope(frame({ type: "typing_start" }), false), {
            ok: true,
            type: "typing_start",
            payload: {},
        });
    });

    test("prévia de tipo desconhecido é curta", () => {
        const result = parseEnvelope(frame({ type: "a".repeat(500) }), false);
        assert.equal(result.type.length, 40);
    });

    test("só typing_* são sinais; código de erro por motivo", () => {
        assert.equal(isSignal("typing_start"), true);
        assert.equal(isSignal("chat_message"), false);
        assert.equal(errorCodeForEnvelope("unknown_type"), "unknown_type");
        assert.equal(errorCodeForEnvelope("invalid_json"), "invalid_message");
    });
});

describe("erros", () => {
    test("todo código tem categoria e mensagem; só interno vira log de erro", () => {
        for (const code of Object.values(ERROR_CODES)) {
            const { category, message } = describeError(code);
            assert.ok(category && message, code);
        }
        assert.equal(logLevelFor("internal_error"), "error");
        assert.equal(logLevelFor("invalid_name"), "warn");
        assert.throws(() => describeError("inventado"));
    });
});

describe("logger", () => {
    const capture = () => {
        const lines = [];
        const log = createLogger({
            out: (line) => lines.push(line),
            err: (line) => lines.push(line),
            now: () => new Date("2026-11-07T00:00:00Z"),
        });
        return { lines, log };
    };

    test("valor com quebra de linha não forja linha nova", () => {
        const { lines, log } = capture();
        log("warn", "x", { type: 'a\n{"event":"falso"}\r\nb' });
        assert.equal(lines.length, 1);
        assert.equal(lines[0].split("\n").length, 1);
        assert.equal(JSON.parse(lines[0]).event, "x");
    });

    test("campos sensíveis são omitidos mesmo se passados por engano", () => {
        const { lines, log } = capture();
        log("info", "y", { content: "segredo", resumeToken: "tok", userName: "Ana", user: "id-1" });
        const entry = JSON.parse(lines[0]);
        assert.equal(entry.content, "[omitido]");
        assert.equal(entry.resumeToken, "[omitido]");
        assert.equal(entry.userName, "[omitido]");
        assert.equal(entry.user, "id-1");
    });
});
