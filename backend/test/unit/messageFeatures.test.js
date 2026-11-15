// Recursos de mensagem (decisões F1 a F7): responder, editar, apagar,
// reagir, fixar, descrição da sala e silêncio com prazo. Permissões no
// servidor; nenhum id interno sai nos quadros.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./harness.js";
import { MAX_PINS, MAX_REACTIONS_PER_MESSAGE, REACTION_EMOJIS } from "../../src/room/messageOps.js";

/** Ana cria a sala (anfitriã); Bia e Caio entram. */
const room = () => {
    const ctx = setup();
    const { member, login, hub } = ctx;
    const ana = member("ana");
    const bia = member("bia");
    const caio = member("caio");
    login(ana, { userName: "Ana", username: "ana" });
    login(bia, { userName: "Bia", username: "bia" });
    login(caio, { userName: "Caio", username: "caio" });
    const created = hub.createRoom(ana, { name: "Sala" }).room;
    hub.joinRoom(bia, { code: created.code });
    hub.joinRoom(caio, { code: created.code });
    const say = (m, content, extra = {}) =>
        hub.post(m, { conversationId: created.id, content, ...extra });
    const last = (m, type) => ctx.received(m, type, created.id).at(-1);
    const lastId = (m) => last(m, "chat_message").id;
    const act = (m, action, payload) =>
        hub.conversationAction(m, { conversationId: created.id, ...payload }, action);
    return { ...ctx, ana, bia, caio, created, say, last, lastId, act };
};

describe("responder (F1)", () => {
    test("a resposta leva a cópia de quem escreveu e um trecho da original", () => {
        const { ana, bia, say, last, lastId } = room();
        say(bia, "a original, com um texto bem comprido ".repeat(5));
        const original = lastId(ana);
        say(ana, "respondendo", { replyTo: original });
        const reference = last(bia, "chat_message").payload.reference;
        assert.equal(reference.id, original);
        assert.equal(reference.username, "bia");
        assert.equal(reference.author, 2);
        assert.ok(reference.excerpt.length <= 100);
        assert.ok(!("userId" in reference) && !JSON.stringify(reference).includes("id_"));
    });

    test("id que não é desta conversa é ignorado: vira mensagem comum", () => {
        const { hub, ana, bia, say, last, received } = room();
        const other = hub.createRoom(bia, { name: "Outra" }).room;
        hub.post(bia, { conversationId: other.id, content: "lá" });
        const foreign = received(bia, "chat_message", other.id).at(-1).id;
        assert.equal(say(ana, "oi", { replyTo: foreign }).ok, true);
        assert.equal(last(bia, "chat_message").payload.reference, undefined);
        assert.equal(say(ana, "oi", { replyTo: "não-existe" }).ok, true);
        assert.equal(last(bia, "chat_message").payload.reference, undefined);
    });
});

describe("editar (F2)", () => {
    test("quem escreveu edita; todos recebem; o histórico de quem entra já vem editado", () => {
        const { hub, member, login, ana, bia, created, say, last, lastId, act, received } = room();
        say(bia, "erado");
        const id = lastId(ana);
        assert.deepEqual(act(bia, "edit", { id, content: "errado → certo" }), { ok: true });
        const update = last(ana, "message_updated").payload;
        assert.equal(update.id, id);
        assert.equal(update.content, "errado → certo");
        assert.ok(update.editedAt);
        const dani = member("dani");
        login(dani, { userName: "Dani", username: "dani" });
        hub.joinRoom(dani, { code: created.code });
        const history = received(dani, "message_history", created.id).at(-1).payload;
        const edited = history.find((m) => m.id === id);
        assert.equal(edited.payload.content, "errado → certo");
        assert.ok(edited.payload.editedAt);
    });

    test("outra pessoa (nem a anfitriã) não edita; @ reaproveitado também não", () => {
        const { hub, member, login, ana, bia, created, say, lastId, act } = room();
        say(bia, "minha");
        const id = lastId(ana);
        assert.deepEqual(act(ana, "edit", { id, content: "x" }), {
            ok: false,
            code: "not_allowed",
        });
        hub.logout(bia);
        const impostora = member("bia-nova");
        login(impostora, { userName: "Bia", username: "bia" });
        hub.joinRoom(impostora, { code: created.code });
        assert.deepEqual(act(impostora, "edit", { id, content: "x" }), {
            ok: false,
            code: "not_allowed",
        });
    });

    test("conteúdo vazio ou mensagem inexistente são recusados", () => {
        const { ana, bia, say, lastId, act } = room();
        say(bia, "texto");
        const id = lastId(ana);
        assert.equal(act(bia, "edit", { id, content: "  " }).code, "empty_message");
        assert.equal(act(bia, "edit", { id: "nada", content: "x" }).code, "message_not_found");
    });
});

describe("apagar (F3)", () => {
    test("quem escreveu apaga; some do histórico de todos", () => {
        const { hub, member, login, ana, bia, created, say, last, lastId, act, received } = room();
        say(bia, "apague-me");
        const id = lastId(ana);
        assert.deepEqual(act(bia, "removeMessage", { id }), { ok: true });
        assert.deepEqual(last(ana, "message_deleted").payload, { id, by: "author" });
        const dani = member("dani");
        login(dani, { userName: "Dani", username: "dani" });
        hub.joinRoom(dani, { code: created.code });
        const history = received(dani, "message_history", created.id).at(-1)?.payload ?? [];
        assert.ok(!history.some((m) => m.id === id));
    });

    test("participante não apaga a dos outros; quem modera apaga, como moderação", () => {
        const { ana, bia, caio, say, last, lastId, act, logs } = room();
        say(caio, "do caio");
        const id = lastId(ana);
        assert.deepEqual(act(bia, "removeMessage", { id }), { ok: false, code: "not_allowed" });
        assert.deepEqual(act(ana, "removeMessage", { id }), { ok: true });
        assert.deepEqual(last(bia, "message_deleted").payload, { id, by: "moderation" });
        assert.ok(
            logs.some((l) => l.event === "moderation_action" && l.action === "delete_message"),
        );
    });

    test("privada: cada um apaga só as próprias", () => {
        const ctx = setup();
        const ana = ctx.member("ana");
        const bia = ctx.member("bia");
        ctx.login(ana, { userName: "Ana", username: "ana" });
        ctx.login(bia, { userName: "Bia", username: "bia" });
        const dm = ctx.hub.openDm(ana, { username: "bia" }).conversation;
        ctx.hub.post(ana, { conversationId: dm.id, content: "da ana" });
        const id = ctx.received(ana, "chat_message", dm.id).at(-1).id;
        const act = (m, payload) =>
            ctx.hub.conversationAction(m, { conversationId: dm.id, ...payload }, "removeMessage");
        assert.deepEqual(act(bia, { id }), { ok: false, code: "not_allowed" });
        assert.deepEqual(act(ana, { id }), { ok: true });
    });
});

describe("reações (F4)", () => {
    test("liga e desliga; os autores são @#número, sem id interno", () => {
        const { ana, bia, caio, say, last, lastId, act } = room();
        say(ana, "reaja");
        const id = lastId(bia);
        act(bia, "react", { id, emoji: "👍" });
        act(caio, "react", { id, emoji: "👍" });
        let reactions = last(ana, "message_reactions").payload.reactions;
        assert.deepEqual(reactions, [{ emoji: "👍", count: 2, authors: ["bia#2", "caio#3"] }]);
        act(bia, "react", { id, emoji: "👍" });
        reactions = last(ana, "message_reactions").payload.reactions;
        assert.deepEqual(reactions, [{ emoji: "👍", count: 1, authors: ["caio#3"] }]);
        act(caio, "react", { id, emoji: "👍" });
        assert.deepEqual(last(ana, "message_reactions").payload.reactions, []);
    });

    test("só a lista fixa de emojis; no máximo 8 diferentes", () => {
        const { ana, bia, say, lastId, act } = room();
        say(ana, "reaja");
        const id = lastId(bia);
        assert.equal(act(bia, "react", { id, emoji: "<b>" }).code, "invalid_reaction");
        assert.equal(act(bia, "react", { id, emoji: "😀" }).code, "invalid_reaction");
        for (const emoji of REACTION_EMOJIS.slice(0, MAX_REACTIONS_PER_MESSAGE)) {
            assert.equal(act(bia, "react", { id, emoji }).ok, true);
        }
        const extra = REACTION_EMOJIS[MAX_REACTIONS_PER_MESSAGE];
        assert.equal(act(bia, "react", { id, emoji: extra }).code, "reaction_limit");
    });
});

describe("fixar (F5)", () => {
    test("na sala, só quem modera; quem entra recebe as fixadas", () => {
        const { hub, member, login, ana, bia, created, say, last, lastId, act, received } = room();
        say(bia, "importante");
        const id = lastId(ana);
        assert.deepEqual(act(bia, "pin", { id, pinned: true }), { ok: false, code: "not_allowed" });
        assert.deepEqual(act(ana, "pin", { id, pinned: true }), { ok: true });
        const pins = last(bia, "pins_updated").payload.pins;
        assert.equal(pins.length, 1);
        assert.equal(pins[0].id, id);
        assert.equal(pins[0].username, "bia");
        const dani = member("dani");
        login(dani, { userName: "Dani", username: "dani" });
        hub.joinRoom(dani, { code: created.code });
        assert.equal(received(dani, "pins_updated", created.id).at(-1).payload.pins.length, 1);
    });

    test("apagar a mensagem a tira das fixadas; limpar o histórico também", () => {
        const { hub, member, login, ana, bia, created, say, last, lastId, act, received } = room();
        say(bia, "fixe");
        const id = lastId(ana);
        act(ana, "pin", { id, pinned: true });
        act(bia, "removeMessage", { id });
        assert.deepEqual(last(ana, "pins_updated").payload.pins, []);
        say(bia, "fixe de novo");
        act(ana, "pin", { id: lastId(ana), pinned: true });
        const found = hub.resolveConversation(ana, created.id);
        assert.ok(found.ok);
        found.conversation.clearHistory(found.identity);
        const dani = member("dani");
        login(dani, { userName: "Dani", username: "dani" });
        hub.joinRoom(dani, { code: created.code });
        assert.equal(
            received(dani, "pins_updated", created.id).length,
            0,
            "nada fixado depois de limpar",
        );
    });

    test("limite de fixadas", () => {
        const { ana, bia, say, lastId, act } = room();
        for (let i = 0; i < MAX_PINS; i += 1) {
            say(bia, `m${i}`);
            assert.equal(act(ana, "pin", { id: lastId(ana), pinned: true }).ok, true);
        }
        say(bia, "mais uma");
        assert.equal(act(ana, "pin", { id: lastId(ana), pinned: true }).code, "pin_limit");
    });
});

describe("descrição da sala (F6)", () => {
    test("quem modera define; todos recebem no resumo; participante não pode", () => {
        const { ana, bia, last, act } = room();
        assert.deepEqual(act(bia, "describe", { description: "x" }), {
            ok: false,
            code: "not_allowed",
        });
        assert.deepEqual(act(ana, "describe", { description: "  Revisão do TCC  " }), { ok: true });
        assert.equal(last(bia, "room_updated").payload.description, "Revisão do TCC");
        assert.equal(
            act(ana, "describe", { description: "x".repeat(201) }).code,
            "invalid_description",
        );
        assert.deepEqual(act(ana, "describe", { description: "" }), { ok: true });
        assert.equal(last(bia, "room_updated").payload.description, undefined);
    });
});

describe("silêncio com prazo (F7)", () => {
    test("a recusa traz até quando; editar e reagir também ficam bloqueados", () => {
        const { hub, ana, bia, created, say, lastId, act } = room();
        say(bia, "antes");
        const id = lastId(ana);
        const found = hub.resolveConversation(ana, created.id);
        const target = hub.resolveConversation(bia, created.id);
        assert.ok(found.ok && target.ok);
        // O relógio das salas no harness começa em 07/11/2026 10:00 UTC.
        const base = Date.UTC(2026, 10, 7, 10, 0, 0);
        found.conversation.setMuted(found.identity, target.identity, base + 10 * 60 * 1000);
        const until = new Date(base + 10 * 60 * 1000).toISOString();
        assert.deepEqual(say(bia, "agora não"), { ok: false, code: "muted", until });
        assert.deepEqual(act(bia, "edit", { id, content: "mudei" }), {
            ok: false,
            code: "muted",
            until,
        });
        assert.deepEqual(act(bia, "react", { id, emoji: "👍" }), {
            ok: false,
            code: "muted",
            until,
        });
        // Silêncio "até liberar" não tem prazo.
        found.conversation.setMuted(found.identity, target.identity, Infinity);
        assert.deepEqual(say(bia, "x"), { ok: false, code: "muted" });
    });
});
