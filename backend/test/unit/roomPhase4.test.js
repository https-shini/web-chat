// Operações de uma sala: publicação única, anti-duplicação, silêncio, nome,
// ausência, limpeza, remoção e janela de retomada — agora por sala.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./harness.js";

/** Instante zero do relógio das salas no harness. */
const BASE = Date.UTC(2026, 10, 7, 10, 0, 0);

const runTimersAfter = (ctx, ms) => {
    ctx.tick(ms);
    ctx.runTimers();
};

describe("publicação", () => {
    test("reenvio com o mesmo clientMsgId não duplica na sala", () => {
        const { member, enter, post, received } = setup();
        const a = member("a");
        const b = member("b");
        enter(a);
        enter(b);
        post(a, { content: "oi", clientMsgId: "c-1" });
        const dup = post(a, { content: "oi", clientMsgId: "c-1" });
        assert.equal(dup.duplicate, true);
        assert.equal(received(b, "chat_message").length, 1, "os outros veem uma vez");
        assert.equal(received(a, "chat_message").length, 2, "quem reenviou recebe a confirmação");
        assert.equal(received(a, "chat_message")[1].id, received(a, "chat_message")[0].id);
    });

    test("o mesmo clientMsgId em outra sala é outra mensagem", () => {
        const { member, enter, post, hub, received, room } = setup();
        const a = member("a");
        enter(a);
        const other = hub.createRoom(a, { name: "Outra" }).room;
        post(a, { content: "na primeira", clientMsgId: "c-1" });
        const second = hub.post(a, {
            conversationId: other.id,
            content: "na segunda",
            clientMsgId: "c-1",
        });
        assert.equal(second.duplicate, undefined);
        assert.equal(received(a, "chat_message", other.id)[0].payload.content, "na segunda");
        assert.equal(received(a, "chat_message", room.id)[0].payload.content, "na primeira");
    });

    test("clientMsgId inválido é ignorado; kind e format do payload também", () => {
        const { member, enter, post, received } = setup();
        const a = member("a");
        enter(a);
        post(a, { content: "x", clientMsgId: "<script>", kind: "announcement", format: "bold" });
        const [message] = received(a, "chat_message");
        assert.equal(message.payload.clientMsgId, undefined);
        assert.equal(message.payload.kind, undefined, "cliente não forja anúncio");
        assert.equal(message.payload.format, undefined);
    });

    test("silenciado não publica, por mensagem nem por comando; com prazo, volta sozinho", () => {
        const ctx = setup();
        const { member, enter, post, hub, room } = ctx;
        const host = member("host");
        const target = member("t");
        enter(host);
        enter(target);
        const hostIdentity = hub.entryOf(host).identity;
        const targetIdentity = hub.entryOf(target).identity;
        room.setMuted(hostIdentity, targetIdentity, BASE + 5 * 60 * 1000);
        assert.deepEqual(post(target, { content: "x" }), { ok: false, code: "muted" });
        assert.deepEqual(room.publish(targetIdentity, { content: "/me x", kind: "action" }), {
            ok: false,
            code: "muted",
        });
        ctx.tick(5 * 60 * 1000);
        assert.equal(post(target, { content: "voltei" }).ok, true);
    });

    test("falar encerra a ausência", () => {
        const { member, enter, post, hub } = setup();
        const a = member("a");
        enter(a);
        hub.setAway(a, "almoço");
        assert.equal(hub.entryOf(a).identity.away, "almoço");
        post(a, { content: "voltei" });
        assert.equal(hub.entryOf(a).identity.away, null);
    });
});

describe("nome", () => {
    test("troca o nome, mantém o id, avisa a sala e respeita o intervalo", () => {
        const ctx = setup();
        const { member, enter, hub, received } = ctx;
        const a = member("a");
        const b = member("b");
        const { user } = enter(a, { userName: "Ana" });
        enter(b);
        assert.deepEqual(hub.rename(a, "  Ana Maria "), {
            ok: true,
            changed: true,
            name: "Ana Maria",
        });
        assert.equal(hub.entryOf(a).identity.id, user.id);
        assert.match(received(b, "notice").at(-1).payload.text, /Ana agora se chama Ana Maria/);
        assert.equal(hub.rename(a, "Outra").code, "cooldown");
        ctx.tick(10_001);
        assert.equal(hub.rename(a, "Outra").ok, true);
        assert.equal(hub.rename(a, "   ").code, "invalid_name");
        assert.equal(hub.rename(a, "\u0007").code, "invalid_name");
    });

    test("a troca de nome aparece em todas as salas da pessoa, e só nelas", () => {
        const { member, enter, hub, received, room } = setup();
        const a = member("a");
        const b = member("b");
        const outsider = member("fora");
        enter(a, { userName: "Ana" });
        enter(b);
        const second = hub.createRoom(a, {}).room;
        hub.login(outsider, { userName: "Fora", username: "fora1" }, "x");
        hub.createRoom(outsider, {});
        hub.rename(a, "Ana Maria");
        assert.equal(received(b, "notice", room.id).length, 1);
        assert.equal(received(a, "notice", second.id).length, 1);
        assert.equal(received(outsider, "notice").length, 0);
    });
});

describe("limpeza da sala", () => {
    test("apaga o histórico, muda a versão e avisa todos; quem entra depois não vê nada", () => {
        const { member, enter, post, hub, received, room } = setup();
        const a = member("a");
        enter(a);
        post(a, { content: "antiga" });
        room.clearHistory(hub.entryOf(a).identity);
        assert.equal(room.historyVersion, 1);
        assert.equal(received(a, "chat_cleared")[0].payload.historyVersion, 1);
        const late = member("l");
        enter(late);
        assert.equal(received(late, "message_history").length, 0);
        assert.equal(received(late, "room_joined")[0].payload.historyVersion, 1);
    });
});

describe("remoção por moderação", () => {
    test("sai da sala na hora e não volta a ela; a sessão e as outras salas continuam", () => {
        const { member, enter, hub, received, room } = setup({ leaveGraceMs: 10_000 });
        const host = member("host");
        const t = member("t");
        enter(host);
        enter(t);
        const elsewhere = hub.createRoom(t, {}).room;
        room.kick(hub.entryOf(host).identity, hub.entryOf(t).identity);

        assert.equal(room.has(hub.entryOf(t).identity), false);
        assert.equal(received(host, "user_left").at(-1).payload.reason, "removed");
        assert.equal(received(t, "room_left", room.id)[0].payload.reason, "removed");
        assert.equal(hub.isLoggedIn(t), true, "continua conectada");
        assert.ok(hub.resolve(t, elsewhere.id).ok, "e na outra sala");
        assert.deepEqual(hub.joinRoom(t, { code: room.code }), {
            ok: false,
            code: "removed_from_room",
        });
    });
});

describe("janela de retomada (F4-01)", () => {
    test("queda e volta dentro da janela: nenhum aviso de saída ou entrada", () => {
        const ctx = setup({ leaveGraceMs: 10_000 });
        const { member, enter, login, hub, received } = ctx;
        const watcher = member("w");
        const a = member("a");
        enter(watcher);
        enter(a);
        const joinedBefore = received(watcher, "user_joined").length;
        const token = received(a, "session")[0].payload.resumeToken;
        hub.disconnect(a);
        runTimersAfter(ctx, 3_000);
        login(member("a2"), { userName: "A", resumeToken: token });
        runTimersAfter(ctx, 20_000);
        assert.equal(received(watcher, "user_left").length, 0);
        assert.equal(received(watcher, "user_joined").length, joinedBefore);
    });

    test("fora da janela, o aviso de saída sai uma vez", () => {
        const ctx = setup({ leaveGraceMs: 10_000 });
        const { member, enter, hub, received } = ctx;
        const watcher = member("w");
        const a = member("a");
        enter(watcher);
        enter(a, { userName: "A" });
        hub.disconnect(a);
        assert.equal(received(watcher, "user_left").length, 0, "ainda na janela");
        runTimersAfter(ctx, 10_001);
        assert.equal(received(watcher, "user_left").length, 1);
        assert.equal(received(watcher, "user_left")[0].payload.userName, "A");
    });

    test("volta depois do aviso: os outros veem 'entrou' de novo", () => {
        const ctx = setup({ leaveGraceMs: 10_000 });
        const { member, enter, login, hub, received } = ctx;
        const watcher = member("w");
        const a = member("a");
        enter(watcher);
        enter(a);
        const token = received(a, "session")[0].payload.resumeToken;
        const joinedBefore = received(watcher, "user_joined").length;
        hub.disconnect(a);
        runTimersAfter(ctx, 30_000);
        login(member("a2"), { userName: "A", resumeToken: token });
        assert.equal(received(watcher, "user_joined").length, joinedBefore + 1);
    });

    test("desligamento cancela avisos pendentes", () => {
        const ctx = setup({ leaveGraceMs: 10_000 });
        const { member, enter, hub, received } = ctx;
        const watcher = member("w");
        const a = member("a");
        enter(watcher);
        enter(a);
        hub.disconnect(a);
        hub.silence();
        runTimersAfter(ctx, 20_000);
        assert.equal(received(watcher, "user_left").length, 0);
    });
});
