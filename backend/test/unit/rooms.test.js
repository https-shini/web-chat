// Várias salas (Fase 2 da evolução), sem rede: códigos de convite, criação e
// entrada, participação simultânea, isolamento, permissões por sala,
// limites, proteção contra adivinhar códigos e ciclo de vida.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    createRoomDirectory,
    generateRoomCode,
    generateConversationId,
} from "../../src/room/directory.js";
import { createRoom } from "../../src/room/room.js";
import { createJoinGuard } from "../../src/room/joinGuard.js";
import { createCommandExecutor } from "../../src/commands/executor.js";
import { createDefaultRegistry } from "../../src/commands/index.js";
import { readConversationId, readRoomCode, readRoomName } from "../../src/validation.js";
import { setup } from "./harness.js";

/** Duas pessoas, cada uma criando a própria sala, e uma terceira nas duas. */
const twoRooms = (options) => {
    const ctx = setup(options);
    const { member, login, hub } = ctx;
    const ana = member("ana");
    const bia = member("bia");
    const caio = member("caio");
    login(ana);
    login(bia);
    login(caio);
    const a = hub.createRoom(ana, { name: "Sala A" }).room;
    const b = hub.createRoom(bia, { name: "Sala B" }).room;
    hub.joinRoom(caio, { code: a.code });
    hub.joinRoom(caio, { code: b.code });
    return { ...ctx, ana, bia, caio, a, b };
};

describe("códigos de convite", () => {
    test("formato abc-defg-hij, só letras minúsculas, sorteio diferente a cada vez", () => {
        const seen = new Set();
        for (let i = 0; i < 200; i += 1) {
            const code = generateRoomCode();
            assert.match(code, /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
            seen.add(code);
        }
        assert.equal(seen.size, 200);
    });

    test("leitura tolera maiúsculas, espaços, sem hífens e o link inteiro", () => {
        for (const raw of [
            "abc-defg-hij",
            "ABC-DEFG-HIJ",
            "abcdefghij",
            "  abc defg hij ",
            "https://chat/#/s/abc-defg-hij",
        ]) {
            assert.deepEqual(readRoomCode(raw), { ok: true, code: "abc-defg-hij" }, raw);
        }
    });

    test("leitura recusa formato errado, tipo errado e entrada enorme", () => {
        for (const raw of [
            "abc-defg-hi",
            "abcdefghijk",
            "abc-defg-h1j",
            "ábc-defg-hij",
            "",
            7,
            null,
        ]) {
            assert.equal(readRoomCode(raw).ok, false, String(raw));
        }
        assert.equal(readRoomCode("a".repeat(500)).ok, false);
    });

    test("conversationId é opaco e não tem relação com o código", () => {
        const id = generateConversationId();
        assert.match(id, /^r_[A-Za-z0-9_-]{16}$/);
        assert.equal(readConversationId(id), id);
        for (const raw of ["abc-defg-hij", "r_curto", "r_" + "x".repeat(80), 5, "<script>"]) {
            assert.equal(readConversationId(raw), null, String(raw));
        }
    });

    test("código repetido no sorteio é trocado: nunca duas salas com o mesmo código", () => {
        const sequence = ["aaa-aaaa-aaa", "aaa-aaaa-aaa", "aaa-aaaa-aaa", "bbb-bbbb-bbb"];
        let next = 0;
        const directory = createRoomDirectory({
            log: () => {},
            newCode: () => sequence[next++],
            makeRoom: ({ id, code, name }) =>
                createRoom({
                    id,
                    code,
                    name,
                    log: () => {},
                    deliver: () => {},
                    historySize: 5,
                    historyOnJoin: 5,
                }),
        });
        const identity = (id) => ({
            id,
            name: id,
            username: id,
            holder: null,
            role: "member",
            away: null,
            rooms: new Set(),
            recent: new Map(),
        });
        const first = directory.create(/** @type {any} */ (identity("u1")), "A");
        const second = directory.create(/** @type {any} */ (identity("u2")), "B");
        assert.equal(first.ok && first.room.code, "aaa-aaaa-aaa");
        assert.equal(second.ok && second.room.code, "bbb-bbbb-bbb");
    });

    test("nome de sala: opcional, até 40 caracteres, controle vira espaço", () => {
        assert.deepEqual(readRoomName(undefined), { ok: true, name: "" });
        assert.deepEqual(readRoomName("  Estudos\u0007 "), { ok: true, name: "Estudos" });
        assert.equal(readRoomName("x".repeat(41)).ok, false);
        assert.equal(readRoomName(42).ok, false);
    });
});

describe("criação e entrada", () => {
    test("quem cria é anfitrião e recebe o resumo com o código", () => {
        const { member, login, hub, received, capabilityChanges } = setup();
        const ana = member("ana");
        const { user } = login(ana, { userName: "Ana", username: "ana" });
        const result = hub.createRoom(ana, { name: "Estudos" });
        assert.equal(result.ok, true);
        const [joined] = received(ana, "room_joined");
        assert.equal(joined.conversationId, result.room.id);
        assert.equal(joined.payload.code, result.room.code);
        assert.equal(joined.payload.name, "Estudos");
        assert.equal(joined.payload.role, "host");
        assert.equal(joined.payload.hostUsername, "ana");
        assert.equal("hostId" in joined.payload, false);
        assert.equal(joined.payload.created, true);
        assert.deepEqual(capabilityChanges, [user.id], "o catálogo de comandos é reenviado");
    });

    test("sem nome, a sala ganha um nome a partir de quem criou", () => {
        const { member, login, hub } = setup();
        const ana = member("ana");
        login(ana, { userName: "Ana" });
        assert.equal(hub.createRoom(ana, {}).room.name, "Sala de Ana");
    });

    test("entrar pelo código: participante comum, histórico e aviso para os outros", () => {
        const { member, login, hub, received } = setup();
        const ana = member("ana");
        const bia = member("bia");
        login(ana);
        login(bia, { userName: "Bia" });
        const room = hub.createRoom(ana, {}).room;
        hub.post(ana, { conversationId: room.id, content: "antes de Bia" });
        const result = hub.joinRoom(bia, { code: room.code.toUpperCase() });
        assert.equal(result.ok, true);
        assert.equal(received(bia, "room_joined")[0].payload.role, "member");
        assert.equal(
            received(bia, "message_history")[0].payload[0].payload.content,
            "antes de Bia",
        );
        assert.equal(received(ana, "user_joined").at(-1).payload.userName, "Bia");
    });

    test("entrar de novo na mesma sala não duplica nada", () => {
        const { member, login, hub, received } = setup();
        const ana = member("ana");
        const bia = member("bia");
        login(ana);
        login(bia);
        const room = hub.createRoom(ana, {}).room;
        hub.joinRoom(bia, { code: room.code });
        const result = hub.joinRoom(bia, { code: room.code });
        assert.deepEqual([result.ok, result.already], [true, true]);
        assert.equal(received(ana, "user_joined").length, 1);
        assert.equal(room.memberCount, 2);
    });

    test("sem sessão, nada de sala", () => {
        const { member, hub } = setup();
        const x = member("x");
        assert.deepEqual(hub.createRoom(x, {}), { ok: false, code: "not_logged_in" });
        assert.deepEqual(hub.joinRoom(x, { code: "abc-defg-hij" }), {
            ok: false,
            code: "not_logged_in",
        });
        assert.equal(hub.roomsOf(x), null);
    });

    test("não existe sala pública: uma identidade nova não está em sala nenhuma", () => {
        const { member, login, hub, directory } = setup();
        const ana = member("ana");
        login(ana);
        assert.deepEqual(hub.roomsOf(ana), []);
        assert.equal(directory.size, 0);
    });
});

describe("participação simultânea e isolamento", () => {
    test("uma identidade participa de várias salas e lista todas", () => {
        const { hub, caio } = twoRooms();
        assert.deepEqual(
            hub.roomsOf(caio).map((room) => room.name),
            ["Sala A", "Sala B"],
        );
    });

    test("mensagem de uma sala nunca chega a quem só está na outra", () => {
        const { hub, ana, bia, caio, a, b, received } = twoRooms();
        hub.post(ana, { conversationId: a.id, content: "só na A" });
        hub.post(bia, { conversationId: b.id, content: "só na B" });
        assert.deepEqual(
            received(ana, "chat_message").map((m) => m.payload.content),
            ["só na A"],
        );
        assert.deepEqual(
            received(bia, "chat_message").map((m) => m.payload.content),
            ["só na B"],
        );
        // Quem está nas duas recebe cada uma com a conversa certa.
        assert.deepEqual(
            received(caio, "chat_message").map((m) => [m.conversationId, m.payload.content]),
            [
                [a.id, "só na A"],
                [b.id, "só na B"],
            ],
        );
    });

    test("todo quadro de sala leva o conversationId; nada de uma sala vaza para outra", () => {
        const { hub, ana, bia, caio, a, b, all } = twoRooms();
        hub.post(caio, { conversationId: a.id, content: "oi A" });
        hub.typing(caio, { conversationId: b.id }, true);
        hub.setAway(caio, "almoço");
        const roomScoped = new Set([
            "room_joined",
            "message_history",
            "user_list",
            "user_joined",
            "user_left",
            "user_typing",
            "chat_message",
            "notice",
            "chat_cleared",
        ]);
        for (const [who, own] of [
            [ana, a.id],
            [bia, b.id],
        ]) {
            for (const frame of all(who)) {
                if (!roomScoped.has(frame.type)) continue;
                assert.equal(
                    frame.conversationId,
                    own,
                    `${frame.type} fora da sala de ${who.name}`,
                );
            }
        }
    });

    test("histórico é por sala: entrar numa não traz o da outra", () => {
        const { member, login, hub, ana, a, b, received } = twoRooms();
        hub.post(ana, { conversationId: a.id, content: "segredo da A" });
        const dani = member("dani");
        login(dani);
        hub.joinRoom(dani, { code: b.code });
        const texts = received(dani, "message_history").flatMap((h) =>
            h.payload.map((m) => m.payload.content),
        );
        assert.ok(!texts.includes("segredo da A"));
    });

    test("digitação e presença ficam na sala", () => {
        const { hub, ana, bia, caio, a, received } = twoRooms();
        hub.typing(ana, { conversationId: a.id }, true);
        assert.equal(received(caio, "user_typing", a.id).length, 1);
        assert.equal(received(bia, "user_typing").length, 0);
    });

    test("quem não participa não fala, não digita e não sai de uma sala alheia", () => {
        const { hub, bia, a, received, ana } = twoRooms();
        const refused = { ok: false, code: "conversation_not_found" };
        assert.deepEqual(hub.post(bia, { conversationId: a.id, content: "invadindo" }), refused);
        assert.deepEqual(hub.leaveRoom(bia, { conversationId: a.id }), refused);
        hub.typing(bia, { conversationId: a.id }, true);
        assert.equal(received(ana, "chat_message").length, 0);
        assert.equal(received(ana, "user_typing").length, 0);
    });

    test("conversa inexistente e alheia têm a mesma resposta; id malformado também", () => {
        const { hub, bia, a } = twoRooms();
        const refused = { ok: false, code: "conversation_not_found" };
        for (const conversationId of [a.id, "r_naoexiste0000", "abc-defg-hij", 42, undefined]) {
            assert.deepEqual(hub.post(bia, { conversationId, content: "x" }), refused);
        }
    });

    test("trocar de nome e ficar ausente valem em todas as salas da pessoa", () => {
        const { hub, ana, bia, caio, a, b, received } = twoRooms();
        hub.setAway(caio, "almoço");
        const listIn = (who, room) => received(who, "user_list", room.id).at(-1)?.payload ?? [];
        assert.equal(listIn(ana, a).find((p) => p.name === "caio")?.status, "away");
        assert.equal(listIn(bia, b).find((p) => p.name === "caio")?.status, "away");
        // Falar numa sala encerra a ausência nas duas.
        hub.post(caio, { conversationId: a.id, content: "voltei" });
        assert.equal(listIn(bia, b).find((p) => p.name === "caio")?.status, "online");
    });
});

describe("moderação por sala", () => {
    const executorFor = (ctx) => {
        const results = [];
        const executor = createCommandExecutor({
            registry: createDefaultRegistry(),
            hub: ctx.hub,
            log: () => {},
            services: {
                deliver: (member, data) => {
                    const message = JSON.parse(data);
                    if (message.type === "command_result") results.push(message.payload);
                },
                adminAuth: { attempt: () => ({ ok: false, reason: "disabled" }) },
                version: "teste",
                startedAt: 0,
            },
        });
        const run = (member, text, conversationId) => {
            executor.execute(member, { requestId: "r", text, conversationId });
            return results.at(-1);
        };
        return { run };
    };

    test("anfitrião modera a própria sala, e só ela", () => {
        const ctx = twoRooms();
        const { run } = executorFor(ctx);
        const { ana, caio, a, b, hub } = ctx;
        // Ana é anfitriã da A: silencia Caio lá.
        assert.equal(run(ana, "/mute caio", a.id).tone, "success");
        assert.deepEqual(hub.post(caio, { conversationId: a.id, content: "x" }), {
            ok: false,
            code: "muted",
        });
        // Na B, Caio continua falando normalmente.
        assert.equal(hub.post(caio, { conversationId: b.id, content: "na B posso" }).ok, true);
        // Ana não modera a B (nem participa dela).
        assert.equal(run(ana, "/mute caio", b.id).code, "no_conversation");
    });

    test("participante comum não modera; anfitrião não modera administrador", () => {
        const ctx = twoRooms();
        const { run } = executorFor(ctx);
        const { ana, caio, a, hub } = ctx;
        assert.equal(run(caio, "/kick ana", a.id).code, "forbidden");
        assert.equal(run(caio, "/clearall confirmar", a.id).code, "forbidden");
        hub.entryOf(caio).identity.role = "admin";
        assert.equal(run(ana, "/mute caio", a.id).code, "cannot_moderate");
    });

    test("remover de uma sala não tira das outras nem encerra a sessão", () => {
        const ctx = twoRooms();
        const { run } = executorFor(ctx);
        const { ana, caio, a, b, hub, received } = ctx;
        assert.equal(run(ana, "/kick caio", a.id).tone, "success");
        assert.equal(received(caio, "room_left", a.id)[0].payload.reason, "removed");
        assert.equal(hub.isLoggedIn(caio), true);
        assert.equal(hub.post(caio, { conversationId: b.id, content: "sigo na B" }).ok, true);
        assert.equal(hub.joinRoom(caio, { code: a.code }).code, "removed_from_room");
    });

    test("limpar o histórico de uma sala não toca na outra", () => {
        const ctx = twoRooms();
        const { run } = executorFor(ctx);
        const { ana, caio, a, b, hub } = ctx;
        hub.post(caio, { conversationId: a.id, content: "na A" });
        hub.post(caio, { conversationId: b.id, content: "na B" });
        run(ana, "/clearall confirmar", a.id);
        assert.equal(a.historyLength, 0);
        assert.equal(b.historyLength, 1);
    });

    test("comando de sala sem conversa é recusado; comando geral funciona sem", () => {
        const ctx = twoRooms();
        const { run } = executorFor(ctx);
        assert.equal(run(ctx.caio, "/me acena").code, "no_conversation");
        assert.equal(run(ctx.caio, "/ping").text, "pong");
        assert.equal(run(ctx.caio, "/rooms").lines.length, 2);
        assert.equal(run(ctx.caio, "/invite", ctx.a.id).data.code, ctx.a.code);
    });

    test("anfitrião que sai de vez passa o papel para quem está há mais tempo", () => {
        const ctx = twoRooms();
        const { member, login, hub, ana, caio, a, received } = ctx;
        const dani = member("dani");
        login(dani);
        hub.joinRoom(dani, { code: a.code });
        hub.leaveRoom(ana, { conversationId: a.id });
        assert.equal(a.membershipOf(hub.entryOf(caio).identity).role, "host");
        assert.equal(a.hostId, hub.entryOf(caio).identity.id);
        assert.match(received(dani, "notice", a.id).at(-1).payload.text, /caio agora é anfitrião/);
        assert.equal(received(caio, "room_updated", a.id).at(-1).payload.role, "host");
        assert.equal(received(dani, "room_updated", a.id).at(-1).payload.role, "member");
    });

    test("queda do anfitrião não passa o papel: ele volta anfitrião", () => {
        const ctx = twoRooms();
        const { member, login, hub, ana, a, received } = ctx;
        const token = received(ana, "session")[0].payload.resumeToken;
        hub.disconnect(ana);
        assert.equal(a.hostId, "user-1");
        login(member("ana2"), { resumeToken: token });
        assert.equal(a.hostId, "user-1");
    });
});

describe("limites", () => {
    test("participar de no máximo N salas (configurável)", () => {
        const { member, login, hub } = setup({ limits: { maxRoomsPerIdentity: 2 } });
        const p = member("p");
        login(p);
        const rooms = [0, 1, 2].map((i) => {
            const host = member(`host${i}`);
            login(host);
            return hub.createRoom(host, {}).room;
        });
        assert.equal(hub.joinRoom(p, { code: rooms[0].code }).ok, true);
        assert.equal(hub.joinRoom(p, { code: rooms[1].code }).ok, true);
        assert.deepEqual(hub.joinRoom(p, { code: rooms[2].code }), {
            ok: false,
            code: "room_join_limit",
        });
        assert.deepEqual(hub.createRoom(p, {}), { ok: false, code: "room_join_limit" });
    });

    test("criar no máximo N salas ativas; uma que acaba libera a vaga", () => {
        const ctx = setup({ limits: { maxCreatedPerIdentity: 2, emptyTtlMs: 1000 } });
        const { member, login, hub } = ctx;
        const p = member("p");
        login(p);
        const first = hub.createRoom(p, {}).room;
        hub.createRoom(p, {});
        assert.deepEqual(hub.createRoom(p, {}), { ok: false, code: "room_create_limit" });
        hub.leaveRoom(p, { conversationId: first.id });
        assert.deepEqual(hub.createRoom(p, {}), { ok: false, code: "room_create_limit" });
        ctx.tick(1001);
        ctx.runTimers();
        assert.equal(hub.createRoom(p, {}).ok, true, "a sala vazia acabou e liberou a vaga");
    });

    test("teto de salas no servidor inteiro", () => {
        const { member, login, hub } = setup({ limits: { maxRooms: 2 } });
        const people = ["a", "b", "c"].map((name) => member(name));
        people.forEach((p) => login(p));
        assert.equal(hub.createRoom(people[0], {}).ok, true);
        assert.equal(hub.createRoom(people[1], {}).ok, true);
        assert.deepEqual(hub.createRoom(people[2], {}), { ok: false, code: "rooms_full" });
    });
});

describe("proteção contra adivinhar códigos", () => {
    test("erros seguidos travam a pessoa, inclusive com o código certo", () => {
        const { member, login, hub } = setup({
            joinGuard: { perIdentity: { capacity: 3, refillPerSecond: 0.001 } },
        });
        const host = member("host");
        const guesser = member("g");
        login(host);
        login(guesser);
        const room = hub.createRoom(host, {}).room;
        for (const code of ["zzz-zzzz-zzz", "yyy-yyyy-yyy", "nao-e-codigo"]) {
            assert.ok(
                ["room_not_found", "invalid_room_code"].includes(
                    hub.joinRoom(guesser, { code }).code,
                ),
            );
        }
        assert.deepEqual(hub.joinRoom(guesser, { code: room.code }), {
            ok: false,
            code: "room_join_locked",
        });
    });

    test("o bloqueio passa com o tempo", () => {
        const ctx = setup({ joinGuard: { perIdentity: { capacity: 1, refillPerSecond: 1 } } });
        const { member, login, hub } = ctx;
        const host = member("host");
        const guesser = member("g");
        login(host);
        login(guesser);
        const room = hub.createRoom(host, {}).room;
        hub.joinRoom(guesser, { code: "zzz-zzzz-zzz" });
        assert.equal(hub.joinRoom(guesser, { code: room.code }).code, "room_join_locked");
        ctx.tick(1000);
        assert.equal(hub.joinRoom(guesser, { code: room.code }).ok, true);
    });

    test("acertar não gasta tentativa", () => {
        const { member, login, hub } = setup({
            joinGuard: { perIdentity: { capacity: 1, refillPerSecond: 0.001 } },
        });
        const host = member("host");
        const p = member("p");
        login(host);
        login(p);
        const room = hub.createRoom(host, {}).room;
        for (let i = 0; i < 5; i += 1) assert.equal(hub.joinRoom(p, { code: room.code }).ok, true);
    });

    test("trocar de identidade não zera a contagem do servidor inteiro", () => {
        let now = 0;
        const guard = createJoinGuard({
            perIdentity: { capacity: 100, refillPerSecond: 0 },
            global: { capacity: 5, refillPerSecond: 0.001 },
            now: () => now,
        });
        for (let i = 0; i < 5; i += 1) guard.fail({});
        assert.equal(guard.allows({}), false, "identidade nova, mesmo assim travada");
        now += 10_000_000;
        assert.equal(guard.allows({}), true);
    });
});

describe("ciclo de vida", () => {
    test("sala vazia espera a tolerância e acaba junto com o histórico", () => {
        const ctx = setup({ limits: { emptyTtlMs: 60_000 } });
        const { member, login, hub, directory } = ctx;
        const ana = member("ana");
        login(ana);
        const room = hub.createRoom(ana, {}).room;
        hub.post(ana, { conversationId: room.id, content: "vai sumir" });
        hub.leaveRoom(ana, { conversationId: room.id });
        assert.equal(directory.size, 1, "ainda na tolerância");
        ctx.tick(60_000);
        ctx.runTimers();
        assert.equal(directory.size, 0);
        assert.equal(room.historyLength, 0, "histórico descartado");
        assert.equal(hub.joinRoom(ana, { code: room.code }).code, "room_not_found");
    });

    test("entrar durante a tolerância mantém a sala viva, com o histórico", () => {
        const ctx = setup({ limits: { emptyTtlMs: 60_000 } });
        const { member, login, hub, directory, received } = ctx;
        const ana = member("ana");
        const bia = member("bia");
        login(ana);
        login(bia);
        const room = hub.createRoom(ana, {}).room;
        hub.post(ana, { conversationId: room.id, content: "fica" });
        hub.leaveRoom(ana, { conversationId: room.id });
        ctx.tick(30_000);
        hub.joinRoom(bia, { code: room.code });
        ctx.tick(60_000);
        ctx.runTimers();
        assert.equal(directory.size, 1);
        assert.equal(received(bia, "message_history")[0].payload[0].payload.content, "fica");
        assert.equal(room.hostId, null, "quem cria e sai não deixa anfitrião numa sala vazia");
    });

    test("queda: continua na sala durante a retomada; voltar traz todas as salas", () => {
        const { member, login, hub, caio, a, b, received } = twoRooms();
        const token = received(caio, "session")[0].payload.resumeToken;
        hub.disconnect(caio);
        assert.equal(a.memberCount, 2);
        assert.equal(b.memberCount, 2);
        const back = member("caio2");
        login(back, { resumeToken: token });
        assert.equal(received(back, "session")[0].payload.resumed, true);
        assert.deepEqual(
            received(back, "room_joined").map((m) => [m.conversationId, m.payload.resumed]),
            [
                [a.id, true],
                [b.id, true],
            ],
        );
    });

    test("sem retomar a tempo: a identidade sai de todas as salas", () => {
        const ctx = twoRooms();
        const { hub, caio, a, b, received, ana, identities } = ctx;
        hub.disconnect(caio);
        ctx.tick(2 * 60 * 1000 + 1);
        identities.sweep();
        assert.equal(a.memberCount, 1);
        assert.equal(b.memberCount, 1);
        assert.equal(received(ana, "user_list", a.id).at(-1).payload.length, 1);
    });

    test("sair da sessão: sai de todas as salas na hora e não volta pelo token", () => {
        const { member, login, hub, caio, a, b, received } = twoRooms();
        const token = received(caio, "session")[0].payload.resumeToken;
        assert.equal(hub.logout(caio), true);
        assert.equal(a.memberCount, 1);
        assert.equal(b.memberCount, 1);
        const back = member("caio2");
        const result = login(back, { resumeToken: token });
        assert.notEqual(result.user.id, "user-3", "token encerrado: identidade nova");
        assert.equal(received(back, "session")[0].payload.resumed, false);
        assert.deepEqual(hub.roomsOf(back), []);
    });

    test("a última pessoa saindo da sessão encerra a sala depois da tolerância", () => {
        const ctx = setup({ limits: { emptyTtlMs: 5_000 } });
        const { member, login, hub, directory } = ctx;
        const ana = member("ana");
        login(ana);
        hub.createRoom(ana, {});
        hub.createRoom(ana, {});
        hub.logout(ana);
        ctx.tick(5_000);
        ctx.runTimers();
        assert.equal(directory.size, 0);
    });

    test("desligamento: todas as salas somem, sem timer pendente", () => {
        const ctx = twoRooms({ leaveGraceMs: 10_000, coalesce: true });
        const { hub, directory, timers, listTimers, caio } = ctx;
        hub.disconnect(caio);
        hub.silence();
        hub.closeAll();
        assert.equal(directory.size, 0);
        assert.equal(timers.pending.size, 0);
        listTimers.run({ all: true });
        assert.equal(ctx.received(ctx.ana, "user_left").length, 0);
    });
});

describe("id interno: só no servidor, e só administradores o veem", () => {
    const run = (ctx, member, text, conversationId) => {
        const results = [];
        const executor = createCommandExecutor({
            registry: createDefaultRegistry(),
            hub: ctx.hub,
            log: () => {},
            services: {
                deliver: (_m, data) => {
                    const message = JSON.parse(data);
                    if (message.type === "command_result") results.push(message.payload);
                },
                adminAuth: { attempt: () => ({ ok: false, reason: "disabled" }) },
                version: "teste",
                startedAt: 0,
            },
        });
        executor.execute(member, { requestId: "r", text, conversationId });
        return results.at(-1);
    };

    test("nenhum quadro de sala carrega o id de ninguém", () => {
        const ctx = twoRooms();
        const { hub, ana, bia, caio, a, all } = ctx;
        hub.post(caio, { conversationId: a.id, content: "oi" });
        hub.typing(caio, { conversationId: a.id }, true);
        hub.setAway(caio, "volto já");
        hub.rename(caio, "Caio Reis");
        hub.leaveRoom(caio, { conversationId: a.id });
        hub.disconnect(bia);
        const ids = [ana, caio].map((m) => hub.entryOf(m).identity.id);
        const wire = JSON.stringify([...all(ana), ...all(bia), ...all(caio)]);
        for (const id of ids) assert.ok(!wire.includes(id), `id ${id} vazou num quadro`);
        assert.ok(!/"(userId|hostId|id)":"user-/.test(wire));
    });

    test("/users, /profile e /id: sem id para participante e anfitrião; com id para administrador", () => {
        const ctx = twoRooms();
        const { hub, ana, caio, a } = ctx;
        const caioId = hub.entryOf(caio).identity.id;
        // Ana é anfitriã (não administradora): não vê ids.
        const asHost = [run(ctx, ana, "/users", a.id), run(ctx, ana, "/profile caio", a.id)];
        assert.ok(!JSON.stringify(asHost).includes(caioId));
        assert.equal(run(ctx, ana, "/id", a.id).code, "forbidden");
        assert.equal(run(ctx, ana, `/mute ${caioId}`, a.id).code, "not_found", "nem modera por id");

        hub.entryOf(ana).identity.role = "admin";
        assert.ok(JSON.stringify(run(ctx, ana, "/users", a.id)).includes(caioId.slice(0, 8)));
        assert.ok(run(ctx, ana, "/profile caio", a.id).lines.some((l) => l.includes(caioId)));
        assert.ok(run(ctx, ana, "/id", a.id).text.includes(hub.entryOf(ana).identity.id));
    });
});
