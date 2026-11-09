// Identidade temporária (Fase A): nome completo + username único, id gerado
// no servidor, saída voluntária e liberação do username.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RESUME_TTL_MS } from "../../src/room/sessions.js";
import { setup as harness } from "./harness.js";
import { readUsername, RESERVED_USERNAMES } from "../../src/validation.js";
import { ERROR_CODES } from "../../src/errors.js";
import { LIMITS } from "../../src/protocol.js";

/**
 * Login sem username automático (aqui o username é o assunto) e entrada na
 * sala compartilhada; `room` é a sala, `hub` as sessões.
 */
const setup = () => {
    const h = harness();
    let shared = null;
    const member = (label) => ({ label });
    const enter = (m, payload) => {
        const result = h.hub.login(m, payload, `conn-${m.label}`);
        if (!result.ok) return result;
        if (shared === null) shared = h.hub.createRoom(m, {}).room;
        else h.hub.joinRoom(m, { code: shared.code });
        return result;
    };
    const tokenOf = (m) => h.received(m, "session").at(-1).payload.resumeToken;
    return {
        hub: h.hub,
        get room() {
            return shared;
        },
        post: (m, payload) => h.hub.post(m, { conversationId: shared?.id, ...payload }),
        member,
        received: h.received,
        enter,
        tokenOf,
        tick: h.tick,
    };
};

describe("readUsername", () => {
    test("normaliza: tira o @ inicial, apara e põe em minúsculas", () => {
        assert.deepEqual(readUsername("  @AnaCarolina "), { ok: true, username: "anacarolina" });
    });

    test("aceita letras, números, ponto e _", () => {
        for (const value of ["ana", "ana.souza", "ana_82", "a1b", "_ana_"]) {
            assert.equal(readUsername(value).ok, true, value);
        }
    });

    test("recusa tamanho fora de 3 a 20, acento, espaço, hífen e pontos mal colocados", () => {
        const invalid = [
            "ab",
            "a".repeat(LIMITS.usernameMaxLength + 1),
            "ána",
            "ana souza",
            "ana-souza",
            ".ana",
            "ana.",
            "ana..souza",
            "ana!",
        ];
        for (const value of invalid) {
            assert.deepEqual(readUsername(value), {
                ok: false,
                code: ERROR_CODES.INVALID_USERNAME,
            });
        }
    });

    test("recusa usernames reservados, em qualquer caixa e com @", () => {
        for (const value of ["admin", "@Sistema", "TODOS", "everyone"]) {
            assert.equal(readUsername(value).ok, false, value);
        }
        assert.ok(RESERVED_USERNAMES.has("moderador"));
    });

    test("ausente ou vazio é 'não informado'; tipo errado é recusado", () => {
        assert.deepEqual(readUsername(undefined), { ok: true, username: "" });
        assert.deepEqual(readUsername("   "), { ok: true, username: "" });
        assert.deepEqual(readUsername(42), { ok: false, code: ERROR_CODES.INVALID_USERNAME });
    });
});

describe("entrada com username", () => {
    test("id gerado no servidor; nome completo e username chegam na sessão e na lista", () => {
        const { member, enter, received } = setup();
        const ana = member("ana");
        const result = enter(ana, {
            userId: "escolhido-pelo-cliente",
            userName: "Ana Carolina Souza",
            username: "@AnaCarolina",
        });
        assert.equal(result.ok, true);
        const [session] = received(ana, "session");
        assert.equal(session.payload.id, "user-1");
        assert.equal(session.payload.name, "Ana Carolina Souza");
        assert.equal(session.payload.username, "anacarolina");
        const [list] = received(ana, "user_list");
        assert.equal(list.payload[0].username, "anacarolina");
    });

    test("entrada nova sem username é recusada", () => {
        const { member, enter } = setup();
        assert.deepEqual(enter(member("a"), { userName: "Ana" }), {
            ok: false,
            code: ERROR_CODES.INVALID_USERNAME,
        });
    });

    test("username inválido é recusado antes de qualquer outra coisa", () => {
        const { member, enter, received } = setup();
        const ana = member("a");
        assert.equal(enter(ana, { userName: "Ana", username: "a b" }).code, "invalid_username");
        assert.equal(received(ana, "session").length, 0);
    });

    test("username em uso é recusado sem diferenciar maiúsculas; nome repetido é permitido", () => {
        const { member, enter } = setup();
        assert.equal(enter(member("a"), { userName: "Ana", username: "ana" }).ok, true);
        assert.deepEqual(enter(member("b"), { userName: "Ana", username: "@ANA" }), {
            ok: false,
            code: ERROR_CODES.USERNAME_TAKEN,
        });
        assert.equal(enter(member("c"), { userName: "Ana", username: "ana2" }).ok, true);
    });

    test("a mensagem carrega o username de quem escreveu", () => {
        const { member, enter, post, received } = setup();
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        post(ana, { content: "oi" });
        assert.equal(received(ana, "chat_message")[0].payload.username, "ana");
    });
});

describe("reconexão e reserva do username", () => {
    test("retomada mantém id e username, mesmo com outro username no payload", () => {
        const ctx = setup();
        const { member, enter, tokenOf, received } = ctx;
        const first = member("a1");
        enter(first, { userName: "Ana", username: "ana" });
        const token = tokenOf(first);
        ctx.hub.disconnect(first);
        const again = member("a2");
        const result = enter(again, { userName: "Ana", username: "outro", resumeToken: token });
        assert.equal(result.ok, true);
        assert.equal(result.user.id, "user-1");
        assert.equal(received(again, "session")[0].payload.username, "ana");
    });

    test("queda abrupta: username reservado durante a janela de retomada", () => {
        const ctx = setup();
        const { member, enter, tick } = ctx;
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        ctx.hub.disconnect(ana); // conexão caiu, sem logout
        tick(RESUME_TTL_MS - 1);
        assert.equal(
            enter(member("b"), { userName: "Bia", username: "ana" }).code,
            "username_taken",
        );
    });

    test("depois do prazo de retomada o username fica livre e o token deixa de valer", () => {
        const ctx = setup();
        const { member, enter, tokenOf, tick } = ctx;
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        const token = tokenOf(ana);
        ctx.hub.disconnect(ana);
        tick(RESUME_TTL_MS + 1);
        assert.equal(enter(member("b"), { userName: "Bia", username: "ana" }).ok, true);
        // O token antigo não reativa a identidade, e o username agora é de outra pessoa.
        const late = enter(member("a2"), { userName: "Ana", username: "ana", resumeToken: token });
        assert.deepEqual(late, { ok: false, code: ERROR_CODES.USERNAME_TAKEN });
    });

    test("prazo de retomada é de 2 minutos", () => {
        assert.equal(RESUME_TTL_MS, 2 * 60 * 1000);
    });
});

describe("sair (logout)", () => {
    test("sai na hora, avisa os outros e libera o username", () => {
        const ctx = setup();
        const { member, enter, received } = ctx;
        const ana = member("a");
        const bia = member("b");
        enter(ana, { userName: "Ana", username: "ana" });
        enter(bia, { userName: "Bia", username: "bia" });
        assert.equal(ctx.hub.logout(ana), true);
        assert.equal(ctx.hub.isLoggedIn(ana), false);
        assert.equal(received(bia, "user_left").at(-1).payload.userName, "Ana");
        assert.deepEqual(
            received(bia, "user_list")
                .at(-1)
                .payload.map((p) => p.username),
            ["bia"],
        );
        assert.equal(enter(member("c"), { userName: "Carla", username: "ana" }).ok, true);
    });

    test("depois de sair, o token não retoma a identidade", () => {
        const ctx = setup();
        const { member, enter, tokenOf } = ctx;
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        const token = tokenOf(ana);
        ctx.hub.logout(ana);
        const back = enter(member("a2"), { userName: "Ana", username: "ana", resumeToken: token });
        assert.equal(back.ok, true);
        assert.notEqual(back.user.id, "user-1");
    });

    test("depois de sair, a conexão não publica mais", () => {
        const ctx = setup();
        const { member, enter } = ctx;
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        ctx.hub.logout(ana);
        assert.deepEqual(ctx.post(ana, { content: "ainda aqui?" }), {
            ok: false,
            code: ERROR_CODES.NOT_LOGGED_IN,
        });
    });

    test("sair sem estar na sala não tem efeito", () => {
        const ctx = setup();
        const { member } = ctx;
        assert.equal(ctx.hub.logout(member("ninguem")), false);
    });
});

describe("localizar pessoas por @username", () => {
    test("@username resolve o homônimo; nome sozinho continua ambíguo", () => {
        const ctx = setup();
        const { member, enter } = ctx;
        enter(member("a"), { userName: "Ana", username: "ana.souza" });
        enter(member("b"), { userName: "Ana", username: "ana.lima" });
        assert.equal(ctx.room.findMembers("Ana").length, 2);
        const found = ctx.room.findMembers("@ana.lima");
        assert.equal(found.length, 1);
        assert.equal(found[0].identity.username, "ana.lima");
        assert.equal(ctx.room.findMembers("ana.souza").length, 1);
        assert.equal(ctx.room.findMembers("@ninguem").length, 0);
    });
});
