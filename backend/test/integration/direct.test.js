import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { join, startServer } from "./helpers.js";

describe("mensagens diretas temporárias", () => {
    let server;
    before(async () => {
        server = await startServer();
    });
    after(() => server.stop());

    test("criar DM, compartilhar sem duplicar, conversar, excluir e isolar", async () => {
        const alice = await join(
            server.url,
            { userName: "Alice", username: "alice_direct" },
            undefined,
            { room: false },
        );
        const bob = await join(
            server.url,
            { userName: "Bob", username: "bob_direct" },
            undefined,
            { room: false },
        );
        const outsider = await join(
            server.url,
            { userName: "Charlie", username: "charlie_direct" },
            undefined,
            { room: false },
        );
        alice.client.send("dm_open", { username: "@bob_direct" });
        const a = await alice.client.take("room_joined");
        const b = await bob.client.take("room_joined");
        assert.equal(a.conversationId, b.conversationId);
        assert.equal(a.payload.kind, "dm");
        assert.equal(a.payload.code, "");
        alice.client.send("dm_open", { username: "bob_direct" });
        const again = await alice.client.take("room_joined");
        assert.equal(again.conversationId, a.conversationId);

        outsider.client.send("chat_message", {
            conversationId: a.conversationId,
            content: "Acesso indevido",
        });
        assert.equal((await outsider.client.take("error")).payload.code, "conversation_not_found");

        alice.client.send("chat_message", {
            conversationId: a.conversationId,
            content: "Olá Bob",
            clientMsgId: "unique-direct-message",
        });
        const delivered = await bob.client.take((frame) =>
            frame.type === "chat_message" && frame.payload.content === "Olá Bob",
        );
        assert.equal(delivered.conversationId, a.conversationId);
        assert.equal(delivered.payload.userId, alice.session.id);

        alice.client.send("room_leave", { conversationId: a.conversationId });
        const leftAlice = await alice.client.take("room_left");
        const leftBob = await bob.client.take("room_left");
        assert.equal(leftAlice.payload.reason, "closed");
        assert.equal(leftBob.payload.reason, "closed");

        bob.client.send("dm_open", { username: "alice_direct" });
        const reopened = await bob.client.take("room_joined");
        assert.notEqual(reopened.conversationId, a.conversationId);
        const history = bob.client.count((frame) =>
            frame.conversationId === reopened.conversationId &&
            frame.type === "chat_message" &&
            frame.payload.content === "Olá Bob",
        );
        assert.equal(history, 0);
        alice.client.close();
        bob.client.close();
        outsider.client.close();
    });
});
