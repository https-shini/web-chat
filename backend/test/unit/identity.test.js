// Identidade temporária (Fase A): nome completo + username único, id gerado
// no servidor, saída voluntária e liberação do username.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRoom } from "../../src/room/room.js";
import { createIdentityStore, RESUME_TTL_MS } from "../../src/room/sessions.js";
import { readUsername, RESERVED_USERNAMES } from "../../src/validation.js";
import { ERROR_CODES } from "../../src/errors.js";
import { LIMITS } from "../../src/protocol.js";

const setup = () => {
    let clock = 0;
    let nextId = 0;
    const identities = createIdentityStore({
        now: () => clock,
        newId: () => `user-${++nextId}`,
        newToken: () => `token-${++nextId}`,
    });
    /** @type {Map<object, any[]>} */
    const inbox = new Map();
    const room = createRoom({
        identities,
        historySize: 100,
        historyOnJoin: 50,
        log: () => {},
        deliver: (member, data) => {
            if (!inbox.has(member)) inbox.set(member, []);
            inbox.get(member).push(JSON.parse(data));
        },
        now: () => new Date(Date.UTC(2026, 10, 7, 10, 0, 0) + clock),
        newMessageId: () => `msg-${++nextId}`,
    });
    const member = (label) => ({ label });
    const received = (m, type) => (inbox.get(m) ?? []).filter((x) => x.type === type);
    const enter = (m, payload) => room.join(m, payload, `conn-${m.label}`);
    const tokenOf = (m) => received(m, "session").at(-1).payload.resumeToken;
    return {
        room,
        identities,
        member,
        received,
        enter,
        tokenOf,
        tick: (ms) => (clock += ms),
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
        const { member, enter, room, received } = setup();
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        room.post(ana, { content: "oi" });
        assert.equal(received(ana, "chat_message")[0].payload.username, "ana");
    });
});

describe("reconexão e reserva do username", () => {
    test("retomada mantém id e username, mesmo com outro username no payload", () => {
        const { member, enter, tokenOf, room, received } = setup();
        const first = member("a1");
        enter(first, { userName: "Ana", username: "ana" });
        const token = tokenOf(first);
        room.leave(first);
        const again = member("a2");
        const result = enter(again, { userName: "Ana", username: "outro", resumeToken: token });
        assert.equal(result.ok, true);
        assert.equal(result.user.id, "user-1");
        assert.equal(received(again, "session")[0].payload.username, "ana");
    });

    test("queda abrupta: username reservado durante a janela de retomada", () => {
        const { member, enter, room, tick } = setup();
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        room.leave(ana); // conexão caiu, sem logout
        tick(RESUME_TTL_MS - 1);
        assert.equal(
            enter(member("b"), { userName: "Bia", username: "ana" }).code,
            "username_taken",
        );
    });

    test("depois do prazo de retomada o username fica livre e o token deixa de valer", () => {
        const { member, enter, tokenOf, room, tick } = setup();
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        const token = tokenOf(ana);
        room.leave(ana);
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
        const { member, enter, room, received } = setup();
        const ana = member("a");
        const bia = member("b");
        enter(ana, { userName: "Ana", username: "ana" });
        enter(bia, { userName: "Bia", username: "bia" });
        assert.equal(room.logout(ana), true);
        assert.equal(room.isMember(ana), false);
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
        const { member, enter, room, tokenOf } = setup();
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        const token = tokenOf(ana);
        room.logout(ana);
        const back = enter(member("a2"), { userName: "Ana", username: "ana", resumeToken: token });
        assert.equal(back.ok, true);
        assert.notEqual(back.user.id, "user-1");
    });

    test("depois de sair, a conexão não publica mais", () => {
        const { member, enter, room } = setup();
        const ana = member("a");
        enter(ana, { userName: "Ana", username: "ana" });
        room.logout(ana);
        assert.deepEqual(room.post(ana, { content: "ainda aqui?" }), {
            ok: false,
            code: ERROR_CODES.NOT_LOGGED_IN,
        });
    });

    test("sair sem estar na sala não tem efeito", () => {
        const { member, room } = setup();
        assert.equal(room.logout(member("ninguem")), false);
    });
});

describe("localizar pessoas por @username", () => {
    test("@username resolve o homônimo; nome sozinho continua ambíguo", () => {
        const { member, enter, room } = setup();
        enter(member("a"), { userName: "Ana", username: "ana.souza" });
        enter(member("b"), { userName: "Ana", username: "ana.lima" });
        assert.equal(room.findMembers("Ana").length, 2);
        const found = room.findMembers("@ana.lima");
        assert.equal(found.length, 1);
        assert.equal(found[0].identity.username, "ana.lima");
        assert.equal(room.findMembers("ana.souza").length, 1);
        assert.equal(room.findMembers("@ninguem").length, 0);
    });
});
