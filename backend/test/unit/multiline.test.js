// Quebra de linha nas mensagens (decisão C1): passa por salas e privadas,
// sem abrir brecha para outros caracteres de controle.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./harness.js";

describe("mensagens com várias linhas", () => {
    test("sala: a quebra chega igual para todos, inclusive no histórico", () => {
        const ctx = setup();
        const ana = ctx.member("ana");
        const bia = ctx.member("bia");
        ctx.login(ana, { userName: "Ana", username: "ana" });
        ctx.login(bia, { userName: "Bia", username: "bia" });
        const room = ctx.hub.createRoom(ana, { name: "Sala" }).room;
        ctx.hub.joinRoom(bia, { code: room.code });
        ctx.hub.post(ana, { conversationId: room.id, content: "lista:\r\n- um\n- dois\u0007" });
        const got = ctx.received(bia, "chat_message", room.id).at(-1).payload.content;
        assert.equal(got, "lista:\n- um\n- dois");
        const caio = ctx.member("caio");
        ctx.login(caio, { userName: "Caio", username: "caio" });
        ctx.hub.joinRoom(caio, { code: room.code });
        const history = ctx.received(caio, "message_history", room.id).at(-1).payload;
        assert.equal(history.at(-1).payload.content, "lista:\n- um\n- dois");
    });

    test("privada: a mesma regra", () => {
        const ctx = setup();
        const ana = ctx.member("ana");
        const bia = ctx.member("bia");
        ctx.login(ana, { userName: "Ana", username: "ana" });
        ctx.login(bia, { userName: "Bia", username: "bia" });
        const dm = ctx.hub.openDm(ana, { username: "bia" }).conversation;
        ctx.hub.post(ana, { conversationId: dm.id, content: "oi\n\n\n\ntudo bem?" });
        assert.equal(
            ctx.received(ana, "chat_message", dm.id).at(-1).payload.content,
            "oi\n\ntudo bem?",
        );
    });
});
