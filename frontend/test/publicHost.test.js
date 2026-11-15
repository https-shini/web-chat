import { test } from "node:test";
import assert from "node:assert/strict";
import { publicRedirect } from "../src/publicHost.js";

const PUBLIC = "https://webchat.gcruz.dev.br";
const at = (hostname, pathname = "/", search = "", hash = "") => ({
    hostname,
    pathname,
    search,
    hash,
});

test("endereço do Render vai para o domínio próprio com caminho, query e convite", () => {
    assert.equal(
        publicRedirect(at("chat-frontend-g42t.onrender.com", "/", "?a=1", "#/s/ABC123"), PUBLIC),
        "https://webchat.gcruz.dev.br/?a=1#/s/ABC123",
    );
    assert.equal(
        publicRedirect(at("Chat-Frontend-G42T.onrender.com", "/x"), `${PUBLIC}/`),
        "https://webchat.gcruz.dev.br/x",
    );
});

test("sem VITE_PUBLIC_URL, ou com valor inválido, nada muda", () => {
    const old = at("chat-frontend-g42t.onrender.com");
    for (const bad of [undefined, "", "webchat.gcruz.dev.br", "ftp://webchat.gcruz.dev.br", 42]) {
        assert.equal(publicRedirect(old, bad), null, String(bad));
    }
});

test("o próprio domínio, localhost e outros hosts não redirecionam", () => {
    for (const host of ["webchat.gcruz.dev.br", "localhost", "127.0.0.1", "exemplo.com"]) {
        assert.equal(publicRedirect(at(host), PUBLIC), null, host);
    }
});
