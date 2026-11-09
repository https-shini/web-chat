// Contrato do protocolo: o servidor e o cliente precisam concordar.
//
// O cliente mantém um espelho do contrato em `frontend/src/protocol.js` (não
// pode importar do backend: o frontend roda servido sem build). Este teste é
// o que impede os dois de divergirem em silêncio.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as server from "../../src/protocol.js";
import { ERROR_CODES } from "../../src/errors.js";
import * as client from "../../../frontend/src/protocol.js";

const indexHtml = fs.readFileSync(
    fileURLToPath(new URL("../../../frontend/index.html", import.meta.url)),
    "utf8",
);

test("eventos enviados pelo cliente são exatamente os que o servidor aceita", () => {
    assert.deepEqual(client.CLIENT_EVENTS, server.CLIENT_EVENTS);
});

test("eventos que o cliente trata são exatamente os que o servidor emite", () => {
    assert.deepEqual(client.SERVER_EVENTS, server.SERVER_EVENTS);
});

test("códigos de erro tratados pelo cliente existem no servidor com o mesmo valor", () => {
    for (const [key, value] of Object.entries(client.ERROR_CODES)) {
        assert.equal(ERROR_CODES[key], value, key);
    }
});

test("variedades, formatos, tons e códigos de fechamento coincidem", () => {
    assert.deepEqual(client.MESSAGE_KINDS, server.MESSAGE_KINDS);
    assert.deepEqual(client.MESSAGE_FORMATS, server.MESSAGE_FORMATS);
    assert.deepEqual(client.TONES, server.TONES);
    assert.deepEqual(client.CLOSE_CODES, server.CLOSE_CODES);
    assert.equal(client.LIMITS.commandMaxLength, server.LIMITS.commandMaxLength);
    assert.equal(client.LIMITS.roomNameMaxLength, server.LIMITS.roomNameMaxLength);
    assert.deepEqual(client.ROLES, server.ROLES);
    assert.deepEqual(client.ROOM_LEFT_REASONS, server.ROOM_LEFT_REASONS);
});

test("limites de nome, username e mensagem são os mesmos nos dois lados e no HTML", () => {
    assert.equal(client.LIMITS.nameMaxLength, server.LIMITS.nameMaxLength);
    assert.equal(client.LIMITS.messageMaxLength, server.LIMITS.messageMaxLength);
    const maxlength = (id) =>
        Number(new RegExp(`id="${id}"[\\s\\S]*?maxlength="(\\d+)"`).exec(indexHtml)?.[1]);
    assert.equal(maxlength("campo-nome"), server.LIMITS.nameMaxLength);
    assert.equal(maxlength("campo-mensagem"), server.LIMITS.messageMaxLength);
    // Username: mesmos limites nos dois lados; o campo aceita um caractere a
    // mais para o "@" opcional, que cliente e servidor removem.
    assert.equal(client.LIMITS.usernameMinLength, server.LIMITS.usernameMinLength);
    assert.equal(client.LIMITS.usernameMaxLength, server.LIMITS.usernameMaxLength);
    assert.equal(maxlength("campo-username"), server.LIMITS.usernameMaxLength + 1);
});
