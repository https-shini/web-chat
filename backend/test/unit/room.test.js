// Regras da sala, sem rede: membros são objetos simples e `deliver` grava o
// que cada um receberia.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRoom } from "../../src/room/room.js";
import { createIdentityStore } from "../../src/room/sessions.js";
import { withUsername } from "../identity.js";

const setup = ({ historySize = 1000, historyOnJoin = 50 } = {}) => {
    let clock = 0;
    let nextId = 0;
    const identities = createIdentityStore({
        now: () => clock,
        newId: () => `user-${++nextId}`,
        newToken: () => `token-${++nextId}`,
    });
    /** @type {Map<object, any[]>} */
    const inbox = new Map();
    const logs = [];
    const room = createRoom({
        identities,
        historySize,
        historyOnJoin,
        log: (level, event, fields) => logs.push({ level, event, ...fields }),
        deliver: (member, data) => {
            if (!inbox.has(member)) inbox.set(member, []);
            inbox.get(member).push(JSON.parse(data));
        },
        now: () => new Date(Date.UTC(2026, 10, 7, 10, 0, clock / 1000)),
        newMessageId: () => `msg-${++nextId}`,
    });
    const member = (name) => ({ name });
    const received = (m, type) => (inbox.get(m) ?? []).filter((x) => x.type === type);
    const enter = (m, payload) => room.join(m, withUsername(payload), `conn-${m.name}`);
    return { room, identities, inbox, logs, member, received, enter, tick: (ms) => (clock += ms) };
};

describe("entrada", () => {
    test("atribui identidade própria e ignora userId do payload", () => {
        const { member, enter, received } = setup();
        const ana = member("ana");
        const result = enter(ana, { userId: "escolhido", userName: "Ana" });
        assert.equal(result.ok, true);
        assert.notEqual(result.user.id, "escolhido");
        const [session] = received(ana, "session");
        assert.equal(session.payload.id, result.user.id);
        assert.equal(typeof session.payload.resumeToken, "string");
    });

    test("ordem para quem entra: sessão, depois histórico, depois lista", () => {
        const { member, enter, inbox, room } = setup();
        const ana = member("ana");
        enter(ana, { userName: "Ana" });
        room.post(ana, { content: "oi" });
        const bia = member("bia");
        enter(bia, { userName: "Bia" });
        assert.deepEqual(
            inbox.get(bia).map((x) => x.type),
            ["session", "message_history", "user_list"],
        );
    });

    test("os outros recebem 'entrou' e a lista; quem entra não recebe o próprio 'entrou'", () => {
        const { member, enter, received } = setup();
        const ana = member("ana");
        const bia = member("bia");
        enter(ana, { userName: "Ana" });
        enter(bia, { userName: "Bia" });
        assert.equal(received(ana, "user_joined").at(-1).payload.userName, "Bia");
        assert.equal(received(bia, "user_joined").length, 0);
        assert.deepEqual(
            received(ana, "user_list")
                .at(-1)
                .payload.map((p) => p.name),
            ["Ana", "Bia"],
        );
    });

    test("segundo login na mesma conexão é recusado sem efeito", () => {
        const { member, enter, received } = setup();
        const ana = member("ana");
        const bia = member("bia");
        enter(ana, { userName: "Ana" });
        enter(bia, { userName: "Bia" });
        const before = received(ana, "user_joined").length;
        assert.deepEqual(enter(bia, { userName: "Outra" }), {
            ok: false,
            code: "already_logged_in",
        });
        assert.equal(received(ana, "user_joined").length, before);
    });

    test("nome inválido é recusado e a conexão não entra", () => {
        const { member, enter, room } = setup();
        const ana = member("ana");
        for (const userName of ["", "   ", "\u0007", undefined]) {
            assert.deepEqual(enter(ana, { userName }), { ok: false, code: "invalid_name" });
        }
        assert.deepEqual(enter(ana, { userName: 42 }), { ok: false, code: "invalid_name" });
        assert.equal(room.isMember(ana), false);
    });
});

describe("retomada de identidade", () => {
    test("token válido devolve o mesmo id e o nome guardado", () => {
        const { member, enter, room, received } = setup();
        const first = member("1");
        const { user } = enter(first, { userName: "Ana" });
        const token = received(first, "session")[0].payload.resumeToken;
        room.leave(first);

        const second = member("2");
        const result = enter(second, { userName: "Outro nome", resumeToken: token });
        assert.equal(result.user.id, user.id);
        assert.equal(result.user.name, "Ana");
    });

    test("token é de uso único", () => {
        const { member, enter, room, received } = setup();
        const first = member("1");
        const { user } = enter(first, { userName: "Ana" });
        const token = received(first, "session")[0].payload.resumeToken;
        room.leave(first);
        enter(member("2"), { userName: "Ana", resumeToken: token });
        const replay = enter(member("3"), { userName: "X", resumeToken: token });
        assert.notEqual(replay.user.id, user.id);
    });

    test("token expira 10 min após a saída", () => {
        const { member, enter, room, received, tick } = setup();
        const first = member("1");
        const { user } = enter(first, { userName: "Ana" });
        const token = received(first, "session")[0].payload.resumeToken;
        room.leave(first);
        tick(10 * 60 * 1000 + 1);
        const late = enter(member("2"), { userName: "Ana", resumeToken: token });
        assert.notEqual(late.user.id, user.id);
    });

    test("retomar com a conexão antiga presente substitui a antiga em silêncio", () => {
        const { member, enter, room, received } = setup();
        const watcher = member("w");
        enter(watcher, { userName: "Vigia" });
        const old = member("old");
        enter(old, { userName: "Ana" });
        const token = received(old, "session")[0].payload.resumeToken;
        const joinedBefore = received(watcher, "user_joined").length;

        const fresh = member("new");
        const result = enter(fresh, { userName: "Ana", resumeToken: token });
        assert.equal(result.replaced, old);
        assert.equal(room.isMember(old), false);
        assert.equal(room.memberCount, 2);
        assert.equal(received(watcher, "user_left").length, 0);
        assert.equal(received(watcher, "user_joined").length, joinedBefore);
    });
});

describe("mensagens", () => {
    test("autor vem da conexão, não do payload", () => {
        const { member, enter, room, received } = setup();
        const ana = member("ana");
        const { user } = enter(ana, { userName: "Ana" });
        room.post(ana, { content: "oi", userId: "outro", userName: "Outro" });
        const [message] = received(ana, "chat_message");
        assert.equal(message.payload.userId, user.id);
        assert.equal(message.payload.userName, "Ana");
        assert.match(message.id, /^msg-/);
    });

    test("sem entrar, não fala e não ouve", () => {
        const { member, enter, room, received } = setup();
        const ana = member("ana");
        const lurker = member("lurker");
        enter(ana, { userName: "Ana" });
        assert.deepEqual(room.post(lurker, { content: "oi" }), {
            ok: false,
            code: "not_logged_in",
        });
        room.post(ana, { content: "privado" });
        room.typing(ana, true);
        room.typing(lurker, true);
        assert.equal(received(lurker, "chat_message").length, 0);
        assert.equal(received(ana, "user_typing").length, 0);
    });

    test("conteúdo vazio e de tipo errado são recusados com códigos distintos", () => {
        const { member, enter, room } = setup();
        const ana = member("ana");
        enter(ana, { userName: "Ana" });
        assert.deepEqual(room.post(ana, { content: "  " }), { ok: false, code: "empty_message" });
        assert.deepEqual(room.post(ana, { content: 1 }), { ok: false, code: "invalid_message" });
        assert.deepEqual(room.post(ana, {}), { ok: false, code: "invalid_message" });
    });

    test("histórico respeita historySize e envia historyOnJoin a quem entra", () => {
        const { member, enter, room, received } = setup({ historySize: 5, historyOnJoin: 3 });
        const ana = member("ana");
        enter(ana, { userName: "Ana" });
        for (let index = 1; index <= 8; index += 1) room.post(ana, { content: `m${index}` });
        const bia = member("bia");
        enter(bia, { userName: "Bia" });
        const [history] = received(bia, "message_history");
        assert.deepEqual(
            history.payload.map((entry) => entry.payload.content),
            ["m6", "m7", "m8"],
        );
    });

    test("o id no histórico é o mesmo da mensagem ao vivo", () => {
        const { member, enter, room, received } = setup();
        const ana = member("ana");
        enter(ana, { userName: "Ana" });
        room.post(ana, { content: "oi" });
        const live = received(ana, "chat_message")[0];
        const bia = member("bia");
        enter(bia, { userName: "Bia" });
        assert.equal(received(bia, "message_history")[0].payload[0].id, live.id);
    });
});

describe("saída", () => {
    test("anuncia, atualiza a lista e libera a identidade", () => {
        const { member, enter, room, received } = setup();
        const ana = member("ana");
        const bia = member("bia");
        enter(ana, { userName: "Ana" });
        enter(bia, { userName: "Bia" });
        assert.equal(room.leave(bia), true);
        assert.equal(received(ana, "user_left").at(-1).payload.userName, "Bia");
        assert.deepEqual(
            received(ana, "user_list")
                .at(-1)
                .payload.map((p) => p.name),
            ["Ana"],
        );
        assert.equal(room.leave(bia), false, "sair duas vezes não tem efeito");
    });

    test("em silêncio (desligamento) a saída não é anunciada", () => {
        const { member, enter, room, received } = setup();
        const ana = member("ana");
        const bia = member("bia");
        enter(ana, { userName: "Ana" });
        enter(bia, { userName: "Bia" });
        room.silence();
        room.leave(bia);
        assert.equal(received(ana, "user_left").length, 0);
    });

    test("logs da sala trazem ids, nunca nome ou conteúdo", () => {
        const { member, enter, room, logs } = setup();
        const ana = member("ana");
        enter(ana, { userName: "NomeSecreto" });
        room.post(ana, { content: "conteudo-secreto" });
        room.leave(ana);
        const text = JSON.stringify(logs);
        assert.ok(!text.includes("NomeSecreto"));
        assert.ok(!text.includes("conteudo-secreto"));
        assert.deepEqual(
            logs.map((entry) => entry.event),
            ["user_joined", "user_left"],
        );
    });
});
