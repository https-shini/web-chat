// Operações da sala da Fase 4: publicação única, anti-duplicação, silêncio,
// nome, ausência, limpeza, remoção e janela de retomada.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRoom } from "../../src/room/room.js";
import { createIdentityStore } from "../../src/room/sessions.js";

const setup = ({ leaveGraceMs = 0 } = {}) => {
    let clock = Date.UTC(2026, 10, 7, 10);
    let seq = 0;
    const identities = createIdentityStore({ now: () => clock, newToken: () => `tok-${++seq}` });
    const inbox = new Map();
    const timers = [];
    const room = createRoom({
        identities,
        historySize: 100,
        historyOnJoin: 50,
        log: () => {},
        now: () => new Date(clock),
        newMessageId: () => `m${++seq}`,
        leaveGraceMs,
        leaveScheduler: {
            schedule: (cb, ms) => (timers.push({ cb, at: clock + ms }), timers.length),
            cancel: (handle) => (timers[handle - 1] = null),
        },
        deliver: (member, data) => {
            if (!inbox.has(member)) inbox.set(member, []);
            inbox.get(member).push(JSON.parse(data));
        },
    });
    const got = (member, type) => (inbox.get(member) ?? []).filter((m) => m.type === type);
    const advance = (ms) => {
        clock += ms;
        timers.forEach((t, i) => {
            if (t && t.at <= clock) {
                timers[i] = null;
                t.cb();
            }
        });
    };
    return { room, got, advance, identities };
};

describe("publicação", () => {
    test("reenvio com o mesmo clientMsgId não duplica na sala", () => {
        const { room, got } = setup();
        const a = {};
        const b = {};
        room.join(a, { userName: "A" }, "a");
        room.join(b, { userName: "B" }, "b");
        room.post(a, { content: "oi", clientMsgId: "c-1" });
        const dup = room.post(a, { content: "oi", clientMsgId: "c-1" });
        assert.equal(dup.duplicate, true);
        assert.equal(got(b, "chat_message").length, 1, "os outros veem uma vez");
        assert.equal(
            got(a, "chat_message").length,
            2,
            "quem reenviou recebe a confirmação de novo",
        );
        assert.equal(got(a, "chat_message")[1].id, got(a, "chat_message")[0].id);
    });

    test("clientMsgId inválido é ignorado; kind e format do payload também", () => {
        const { room, got } = setup();
        const a = {};
        room.join(a, { userName: "A" }, "a");
        room.post(a, {
            content: "x",
            clientMsgId: "<script>",
            kind: "announcement",
            format: "bold",
        });
        const [message] = got(a, "chat_message");
        assert.equal(message.payload.clientMsgId, undefined);
        assert.equal(message.payload.kind, undefined, "cliente não forja anúncio");
        assert.equal(message.payload.format, undefined);
    });

    test("silenciado não publica, por mensagem nem por comando; com prazo, volta sozinho", () => {
        const { room, advance } = setup();
        const admin = {};
        const target = {};
        room.join(admin, { userName: "Adm" }, "x");
        room.join(target, { userName: "T" }, "y");
        const t = room.entryOf(target);
        room.setMuted(
            { identity: room.entryOf(admin).identity },
            t,
            Date.UTC(2026, 10, 7, 10, 5), // 5 min depois do relógio do teste
        );
        assert.deepEqual(room.post(target, { content: "x" }), { ok: false, code: "muted" });
        assert.deepEqual(room.publish(target, { content: "/me x", kind: "action" }), {
            ok: false,
            code: "muted",
        });
        advance(5 * 60 * 1000);
        assert.equal(room.post(target, { content: "voltei" }).ok, true);
    });

    test("falar encerra a ausência", () => {
        const { room } = setup();
        const a = {};
        room.join(a, { userName: "A" }, "a");
        room.setAway(a, "almoço");
        assert.equal(room.entryOf(a).identity.away, "almoço");
        room.post(a, { content: "voltei" });
        assert.equal(room.entryOf(a).identity.away, null);
    });
});

describe("nome", () => {
    test("troca o nome, mantém o id, avisa a sala e respeita o intervalo", () => {
        const { room, got, advance } = setup();
        const a = {};
        const b = {};
        const { user } = room.join(a, { userName: "Ana" }, "a");
        room.join(b, { userName: "Bia" }, "b");
        assert.deepEqual(room.rename(a, "  Ana Maria "), {
            ok: true,
            changed: true,
            name: "Ana Maria",
        });
        assert.equal(room.entryOf(a).identity.id, user.id);
        assert.match(got(b, "notice").at(-1).payload.text, /Ana agora se chama Ana Maria/);
        assert.equal(room.rename(a, "Outra").code, "cooldown");
        advance(10_001);
        assert.equal(room.rename(a, "Outra").ok, true);
        assert.equal(room.rename(a, "   ").code, "invalid_name");
        assert.equal(room.rename(a, "\u0007").code, "invalid_name");
    });
});

describe("limpeza da sala", () => {
    test("apaga o histórico, muda a versão e avisa todos; quem entra depois não vê nada", () => {
        const { room, got } = setup();
        const a = {};
        room.join(a, { userName: "A" }, "a");
        room.post(a, { content: "antiga" });
        room.clearHistory(a);
        assert.equal(room.historyVersion, 1);
        assert.equal(got(a, "chat_cleared")[0].payload.historyVersion, 1);
        const late = {};
        room.join(late, { userName: "L" }, "l");
        assert.equal(got(late, "message_history").length, 0);
        assert.equal(got(late, "session")[0].payload.historyVersion, 1);
    });
});

describe("remoção", () => {
    test("sai na hora, avisa, e o token deixa de valer", () => {
        const { room, got } = setup({ leaveGraceMs: 10_000 });
        const adm = {};
        const t = {};
        room.join(adm, { userName: "Adm" }, "x");
        room.join(t, { userName: "T" }, "y");
        const token = got(t, "session")[0].payload.resumeToken;
        room.remove(
            { identity: room.entryOf(adm).identity },
            { member: t, identity: room.entryOf(t).identity },
        );
        assert.equal(room.isMember(t), false);
        assert.equal(
            got(adm, "user_left").at(-1).payload.reason,
            "removed",
            "sem janela de retomada",
        );
        const back = {};
        const result = room.join(back, { userName: "T", resumeToken: token }, "z");
        assert.notEqual(
            result.user.id,
            got(t, "session")[0].payload.id,
            "volta como identidade nova",
        );
    });
});

describe("janela de retomada (F4-01)", () => {
    test("queda e volta dentro da janela: nenhum aviso de saída ou entrada", () => {
        const { room, got, advance } = setup({ leaveGraceMs: 10_000 });
        const watcher = {};
        const a = {};
        room.join(watcher, { userName: "W" }, "w");
        room.join(a, { userName: "A" }, "a");
        const joinedBefore = got(watcher, "user_joined").length;
        const token = got(a, "session")[0].payload.resumeToken;
        room.leave(a);
        advance(3_000);
        const back = {};
        room.join(back, { userName: "A", resumeToken: token }, "a2");
        advance(20_000);
        assert.equal(got(watcher, "user_left").length, 0);
        assert.equal(got(watcher, "user_joined").length, joinedBefore);
    });

    test("fora da janela, o aviso de saída sai uma vez", () => {
        const { room, got, advance } = setup({ leaveGraceMs: 10_000 });
        const watcher = {};
        const a = {};
        room.join(watcher, { userName: "W" }, "w");
        room.join(a, { userName: "A" }, "a");
        room.leave(a);
        assert.equal(got(watcher, "user_left").length, 0, "ainda na janela");
        advance(10_001);
        assert.equal(got(watcher, "user_left").length, 1);
        assert.equal(got(watcher, "user_left")[0].payload.userName, "A");
    });

    test("desligamento cancela avisos pendentes", () => {
        const { room, got, advance } = setup({ leaveGraceMs: 10_000 });
        const watcher = {};
        const a = {};
        room.join(watcher, { userName: "W" }, "w");
        room.join(a, { userName: "A" }, "a");
        room.leave(a);
        room.silence();
        advance(20_000);
        assert.equal(got(watcher, "user_left").length, 0);
    });
});
