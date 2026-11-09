// Salas no cliente (Fase 2 da evolução): link de convite, isolamento por
// conversa, recusas de sala e saída.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { inviteHash, normalizeRoomCode, readInviteHash } from "../src/state/invite.js";
import { createEventHandler } from "../src/state/events.js";
import { createStore } from "../src/state/store.js";

describe("código e link de convite", () => {
    test("aceita o código como alguém digitaria ou colaria", () => {
        for (const raw of [
            "abc-defg-hij",
            "ABC-DEFG-HIJ",
            "abcdefghij",
            " abc defg hij ",
            "https://chat.exemplo/#/s/abc-defg-hij",
        ]) {
            assert.equal(normalizeRoomCode(raw), "abc-defg-hij", raw);
        }
    });

    test("recusa o que não tem 10 letras", () => {
        for (const raw of [
            "abc-defg-hi",
            "abc-defg-hijk",
            "abc-defg-hi1",
            "ábc-defg-hij",
            "",
            42,
        ]) {
            assert.equal(normalizeRoomCode(raw), null, String(raw));
        }
    });

    test("o convite vai no fragmento da página, que nunca chega a um servidor", () => {
        assert.equal(inviteHash("abc-defg-hij"), "#/s/abc-defg-hij");
        assert.equal(readInviteHash("#/s/abc-defg-hij"), "abc-defg-hij");
        assert.equal(readInviteHash("#/s/ABCDEFGHIJ"), "abc-defg-hij");
        assert.equal(readInviteHash(""), null);
        assert.equal(readInviteHash("#conteudo"), null);
        assert.equal(readInviteHash("#/s/abc-defg-hij/extra"), null);
    });
});

describe("eventos de sala", () => {
    const ROOM = "r_sala00000001";
    const OTHER = "r_outra0000002";

    const setup = () => {
        const store = createStore();
        const calls = { joined: [], left: [], refused: [], sessions: [] };
        const handle = createEventHandler({
            store,
            toasts: { show: () => {} },
            notifier: { show: () => {} },
            typingTracker: { set: () => {} },
            onSession: (token, resumed) => calls.sessions.push({ token, resumed }),
            onRoomJoined: (room) => calls.joined.push(room),
            onRoomLeft: (reason) => calls.left.push(reason),
            onRoomRefused: (code, message) => calls.refused.push({ code, message }),
        });
        handle({ type: "session", payload: { id: "eu", name: "Eu", resumeToken: "t" } });
        handle({
            type: "room_joined",
            conversationId: ROOM,
            payload: { code: "abc-defg-hij", name: "Sala", role: "member", historyVersion: 0 },
        });
        return { store, handle, calls };
    };

    test("a sessão diz se foi retomada (as salas voltam sozinhas) ou é nova", () => {
        const { handle, calls } = setup();
        handle({
            type: "session",
            payload: { id: "eu", name: "Eu", resumeToken: "t2", resumed: true },
        });
        assert.deepEqual(calls.sessions, [
            { token: "t", resumed: false },
            { token: "t2", resumed: true },
        ]);
    });

    test("o que é de outra conversa não aparece na sala aberta", () => {
        const { store, handle } = setup();
        handle({
            type: "chat_message",
            id: "fora",
            conversationId: OTHER,
            payload: { userId: "x", userName: "X", content: "de outra sala" },
        });
        handle({
            type: "user_list",
            conversationId: OTHER,
            payload: [{ id: "x", name: "X", username: "x", status: "online" }],
        });
        handle({
            type: "chat_message",
            id: "dentro",
            conversationId: ROOM,
            payload: { userId: "y", userName: "Y", content: "desta sala" },
        });
        assert.deepEqual(
            store.getState().messages.map((m) => m.content),
            ["desta sala"],
        );
        assert.deepEqual(store.getState().people, []);
    });

    test("anfitrião aparece com o papel na lista; resumo atualizado muda o seu papel", () => {
        const { store, handle } = setup();
        handle({
            type: "user_list",
            conversationId: ROOM,
            payload: [{ id: "eu", name: "Eu", username: "eu", status: "online", role: "host" }],
        });
        assert.equal(store.getState().people[0]?.role, "host");
        handle({
            type: "room_updated",
            conversationId: ROOM,
            payload: { code: "abc-defg-hij", name: "Sala", role: "host", historyVersion: 0 },
        });
        assert.equal(store.getState().room?.role, "host");
    });

    test("sair da sala ou ser removido é avisado com o motivo", () => {
        const { handle, calls } = setup();
        handle({ type: "room_left", conversationId: OTHER, payload: { reason: "removed" } });
        assert.deepEqual(calls.left, [], "outra conversa: ignorado");
        handle({ type: "room_left", conversationId: ROOM, payload: { reason: "removed" } });
        assert.deepEqual(calls.left, ["removed"]);
    });

    test("recusas de sala vão para quem decide o que fazer, não para o login", () => {
        const { handle, calls } = setup();
        handle({ type: "error", payload: { code: "room_not_found", message: "não achei" } });
        handle({ type: "error", payload: { code: "room_join_locked", message: "calma" } });
        assert.deepEqual(
            calls.refused.map((r) => r.code),
            ["room_not_found", "room_join_locked"],
        );
    });

    test("identidade nova: a sala anterior é esquecida junto com a conversa", () => {
        const { store, handle } = setup();
        handle({
            type: "chat_message",
            id: "m1",
            conversationId: ROOM,
            payload: { userId: "x", userName: "X", content: "antes" },
        });
        store.actions.forgetRoom();
        assert.equal(store.getState().room, null);
        assert.equal(store.getState().messages.length, 0);
    });
});
