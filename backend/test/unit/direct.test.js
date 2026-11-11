// Conversas privadas (Fase 3 da evolução), sem rede: busca por @, abrir,
// mensagens, isolamento, bloqueio, encerramento, retomada, fim da
// identidade, limites e memória.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createCommandExecutor } from "../../src/commands/executor.js";
import { createDefaultRegistry } from "../../src/commands/index.js";
import { setup } from "./harness.js";

/** Três pessoas conectadas, com @ conhecidos. */
const people = (options) => {
    const ctx = setup(options);
    const { member, login } = ctx;
    const ana = member("ana");
    const bia = member("bia");
    const caio = member("caio");
    login(ana, { userName: "Ana", username: "ana" });
    login(bia, { userName: "Bia", username: "bia" });
    login(caio, { userName: "Caio", username: "caio" });
    const idOf = (m) => ctx.hub.entryOf(m).identity.id;
    return { ...ctx, ana, bia, caio, idOf };
};

/** Ana abre com Bia e manda a primeira mensagem. */
const anaTalksToBia = (options) => {
    const ctx = people(options);
    const opened = ctx.hub.openDm(ctx.ana, { username: "bia" });
    assert.equal(opened.ok, true);
    const dm = opened.conversation;
    ctx.hub.post(ctx.ana, { conversationId: dm.id, content: "oi Bia" });
    return { ...ctx, dm };
};

describe("busca por @", () => {
    test("acha só pelo @ exato e devolve só nome, @ e id", () => {
        const { hub, ana, idOf, bia } = people();
        const found = hub.lookup(ana, { username: "@BIA" });
        assert.equal(found.ok, true);
        assert.equal(found.user.id, idOf(bia));
        for (const query of ["bi", "b", "bia2"]) {
            assert.equal(hub.lookup(ana, { username: query }).user ?? null, null, query);
        }
    });

    test("@ inválido é recusado; sem sessão também", () => {
        const { hub, ana, member } = people();
        for (const username of ["", "a b", 42, undefined, "x"]) {
            assert.equal(hub.lookup(ana, { username }).code, "invalid_user", String(username));
        }
        assert.equal(hub.lookup(member("fora"), { username: "bia" }).code, "not_logged_in");
    });

    test("quem só está na janela de retomada não aparece", () => {
        const { hub, ana, bia } = people();
        hub.disconnect(bia);
        assert.equal(hub.lookup(ana, { username: "bia" }).user, null);
    });

    test("limite de buscas: varrer @ às cegas trava", () => {
        const { hub, ana } = people({
            dmGuard: { lookup: { capacity: 3, refillPerSecond: 0.001 } },
        });
        for (let i = 0; i < 3; i += 1)
            assert.equal(hub.lookup(ana, { username: `x${i}xx` }).ok, true);
        assert.equal(hub.lookup(ana, { username: "bia" }).code, "lookup_limited");
    });

    test("o limite volta com o tempo", () => {
        const ctx = people({ dmGuard: { lookup: { capacity: 1, refillPerSecond: 1 } } });
        ctx.hub.lookup(ctx.ana, { username: "zzz" });
        assert.equal(ctx.hub.lookup(ctx.ana, { username: "bia" }).code, "lookup_limited");
        ctx.tick(1000);
        assert.equal(ctx.hub.lookup(ctx.ana, { username: "bia" }).ok, true);
    });
});

describe("abrir e conversar", () => {
    test("quem abre recebe a conversa; a outra pessoa só fica sabendo na primeira mensagem", () => {
        const { hub, ana, bia, received, idOf } = people();
        const opened = hub.openDm(ana, { username: "bia" });
        assert.equal(opened.created, true);
        const [mine] = received(ana, "dm_opened");
        assert.equal(mine.conversationId, opened.conversation.id);
        assert.match(mine.conversationId, /^d_/);
        assert.deepEqual(mine.payload.peer, {
            id: idOf(bia),
            name: "Bia",
            username: "bia",
            online: true,
        });
        assert.equal(mine.payload.kind, "dm");
        assert.equal(received(bia, "dm_opened").length, 0, "abrir não avisa ninguém");

        hub.post(ana, { conversationId: opened.conversation.id, content: "oi Bia" });
        const [theirs] = received(bia, "dm_opened");
        assert.equal(theirs.payload.peer.username, "ana");
        assert.equal(theirs.payload.created, true);
        assert.equal(received(bia, "message_history")[0].payload[0].payload.content, "oi Bia");
        assert.equal(received(bia, "chat_message").length, 0, "a primeira chega no histórico");

        hub.post(bia, { conversationId: opened.conversation.id, content: "oi Ana" });
        assert.equal(received(ana, "chat_message").at(-1).payload.content, "oi Ana");
        assert.equal(received(bia, "chat_message").at(-1).payload.content, "oi Ana");
    });

    test("abrir pelo id (ex.: do perfil numa sala) também funciona", () => {
        const { hub, ana, bia, idOf } = people();
        assert.equal(hub.openDm(ana, { userId: idOf(bia) }).created, true);
    });

    test("abrir de novo devolve a mesma conversa, dos dois lados", () => {
        const { hub, ana, bia, dm } = anaTalksToBia();
        const again = hub.openDm(ana, { username: "bia" });
        const fromBia = hub.openDm(bia, { username: "ana" });
        assert.equal(again.created, false);
        assert.equal(again.conversation, dm);
        assert.equal(fromBia.conversation, dm);
    });

    test("consigo mesmo, ninguém, @ inválido ou desconectado: recusado", () => {
        const { hub, ana, bia } = people();
        assert.equal(hub.openDm(ana, { username: "ana" }).code, "dm_self");
        assert.equal(hub.openDm(ana, { username: "ninguem" }).code, "user_unavailable");
        assert.equal(hub.openDm(ana, { userId: "nao-existe" }).code, "user_unavailable");
        assert.equal(hub.openDm(ana, { username: "a b" }).code, "invalid_user");
        assert.equal(hub.openDm(ana, { userId: "<script>" }).code, "invalid_user");
        hub.disconnect(bia);
        assert.equal(hub.openDm(ana, { username: "bia" }).code, "user_unavailable");
    });

    test("reenvio com o mesmo clientMsgId não duplica", () => {
        const { hub, ana, bia, dm, received } = anaTalksToBia();
        hub.post(ana, { conversationId: dm.id, content: "uma vez", clientMsgId: "c1" });
        const again = hub.post(ana, {
            conversationId: dm.id,
            content: "uma vez",
            clientMsgId: "c1",
        });
        assert.equal(again.duplicate, true);
        assert.equal(
            received(bia, "chat_message").filter((m) => m.payload.content === "uma vez").length,
            1,
        );
    });

    test("conteúdo vazio e de tipo errado: recusados como numa sala", () => {
        const { hub, ana, dm } = anaTalksToBia();
        assert.equal(hub.post(ana, { conversationId: dm.id, content: "  " }).code, "empty_message");
        assert.equal(hub.post(ana, { conversationId: dm.id, content: 7 }).code, "invalid_message");
    });

    test("digitação chega só à outra pessoa", () => {
        const { hub, ana, bia, caio, dm, received } = anaTalksToBia();
        hub.typing(bia, { conversationId: dm.id }, true);
        assert.equal(received(ana, "user_typing", dm.id).length, 1);
        assert.equal(received(bia, "user_typing").length, 0);
        assert.equal(received(caio, "user_typing").length, 0);
    });
});

describe("isolamento", () => {
    test("ninguém além das duas lê, escreve ou digita — sabendo o id ou não", () => {
        const { hub, ana, bia, caio, dm, all } = anaTalksToBia();
        const refused = { ok: false, code: "conversation_not_found" };
        assert.deepEqual(hub.post(caio, { conversationId: dm.id, content: "entrei?" }), refused);
        assert.deepEqual(hub.closeDm(caio, { conversationId: dm.id }), refused);
        hub.typing(caio, { conversationId: dm.id }, true);
        assert.deepEqual(
            all(caio).map((m) => m.type),
            ["session"],
            "Caio não recebeu nada",
        );
        for (const who of [ana, bia]) {
            assert.equal(all(who).filter((m) => m.payload?.content === "entrei?").length, 0);
        }
    });

    test("todo quadro da conversa leva o id dela", () => {
        const { hub, ana, bia, dm, all } = anaTalksToBia();
        hub.post(bia, { conversationId: dm.id, content: "resposta" });
        hub.typing(ana, { conversationId: dm.id }, true);
        for (const who of [ana, bia]) {
            for (const frame of all(who)) {
                if (["session"].includes(frame.type)) continue;
                assert.equal(frame.conversationId, dm.id, frame.type);
            }
        }
    });

    test("mensagem privada não vaza para as salas, nem a de sala para a conversa privada", () => {
        const ctx = anaTalksToBia();
        const { hub, ana, bia, caio, dm, received } = ctx;
        const room = hub.createRoom(ana, {}).room;
        hub.joinRoom(caio, { code: room.code });
        hub.post(ana, { conversationId: room.id, content: "na sala" });
        hub.post(ana, { conversationId: dm.id, content: "só para Bia" });
        assert.equal(
            received(caio, "chat_message")
                .map((m) => m.payload.content)
                .join(),
            "na sala",
        );
        assert.ok(!received(bia, "chat_message").some((m) => m.payload.content === "na sala"));
    });

    test("comandos de sala não rodam numa conversa privada", () => {
        const { hub, ana, dm } = anaTalksToBia();
        const results = [];
        const executor = createCommandExecutor({
            registry: createDefaultRegistry(),
            hub,
            log: () => {},
            services: {
                deliver: (_m, data) => results.push(JSON.parse(data).payload),
                adminAuth: { attempt: () => ({ ok: false, reason: "disabled" }) },
                version: "t",
                startedAt: 0,
            },
        });
        executor.execute(ana, { requestId: "r", text: "/kick bia", conversationId: dm.id });
        assert.equal(results.at(-1).code, "no_conversation");
    });
});

describe("encerrar", () => {
    test("some para as duas, com o histórico; abrir de novo começa do zero", () => {
        const { hub, ana, bia, dm, received, directs } = anaTalksToBia();
        assert.deepEqual(hub.closeDm(bia, { conversationId: dm.id }), { ok: true });
        assert.equal(received(ana, "dm_closed", dm.id)[0].payload.reason, "closed");
        assert.equal(received(bia, "dm_closed", dm.id)[0].payload.reason, "closed");
        assert.equal(dm.historyLength, 0);
        assert.equal(directs.size, 0);
        assert.equal(
            hub.post(ana, { conversationId: dm.id, content: "x" }).code,
            "conversation_not_found",
        );

        const reopened = hub.openDm(ana, { username: "bia" });
        assert.notEqual(reopened.conversation.id, dm.id);
        assert.equal(received(ana, "message_history", reopened.conversation.id).length, 0);
    });

    test("quem nunca soube da conversa não é avisado do fim", () => {
        const { hub, ana, bia, received } = people();
        const { conversation } = hub.openDm(ana, { username: "bia" });
        hub.closeDm(ana, { conversationId: conversation.id });
        assert.equal(received(bia, "dm_closed").length, 0);
    });
});

describe("bloqueio", () => {
    test("bloquear encerra a conversa; a outra pessoa só vê 'encerrada'", () => {
        const { hub, ana, bia, dm, received, idOf } = anaTalksToBia();
        const result = hub.block(bia, { userId: idOf(ana) });
        assert.deepEqual(result.blocked, [{ id: idOf(ana), name: "Ana", username: "ana" }]);
        assert.equal(received(ana, "dm_closed", dm.id)[0].payload.reason, "closed");
        assert.equal(dm.closed, true);
    });

    test("bloqueada não abre conversa, não acha pela busca e não manda nada", () => {
        const { hub, ana, bia, idOf, dm } = anaTalksToBia();
        hub.block(bia, { userId: idOf(ana) });
        assert.equal(
            hub.post(ana, { conversationId: dm.id, content: "ainda?" }).code,
            "conversation_not_found",
        );
        assert.equal(hub.openDm(ana, { username: "bia" }).code, "user_unavailable");
        assert.equal(hub.openDm(ana, { userId: idOf(bia) }).code, "user_unavailable");
        assert.equal(hub.lookup(ana, { username: "bia" }).user, null);
        // Mesmo código de quem não existe: o bloqueio não é revelado.
        assert.equal(hub.openDm(ana, { username: "ninguem" }).code, "user_unavailable");
    });

    test("quem bloqueou também não abre, até desbloquear", () => {
        const { hub, bia, ana, idOf } = people();
        hub.block(bia, { userId: idOf(ana) });
        assert.equal(hub.openDm(bia, { username: "ana" }).code, "user_unavailable");
        assert.deepEqual(hub.unblock(bia, { userId: idOf(ana) }).blocked, []);
        assert.equal(hub.openDm(ana, { username: "bia" }).ok, true);
    });

    test("bloqueio vale só para conversas privadas: na sala, a conversa segue", () => {
        const { hub, ana, bia, idOf, received } = people();
        const room = hub.createRoom(ana, {}).room;
        hub.joinRoom(bia, { code: room.code });
        hub.block(bia, { userId: idOf(ana) });
        hub.post(ana, { conversationId: room.id, content: "na sala" });
        assert.equal(received(bia, "chat_message", room.id).at(-1).payload.content, "na sala");
    });

    test("a si mesmo, id inválido, desconhecido e limite", () => {
        const { hub, ana, bia, caio, idOf } = people({ dmGuard: { maxBlocked: 1 } });
        assert.equal(hub.block(ana, { userId: idOf(ana) }).code, "invalid_user");
        assert.equal(hub.block(ana, { userId: "<x>" }).code, "invalid_user");
        assert.equal(hub.block(ana, { userId: "ninguem" }).code, "user_unavailable");
        assert.equal(hub.block(ana, { userId: idOf(bia) }).ok, true);
        assert.equal(hub.block(ana, { userId: idOf(bia) }).ok, true, "repetir não conta");
        assert.equal(hub.block(ana, { userId: idOf(caio) }).code, "block_limit");
    });

    test("o bloqueio acaba com a sessão de quem bloqueou", () => {
        const { hub, member, login, ana, bia, idOf, received } = people();
        const token = received(bia, "session")[0].payload.resumeToken;
        hub.block(bia, { userId: idOf(ana) });
        hub.logout(bia);
        const fresh = member("bia2");
        login(fresh, { userName: "Bia", username: "bia", resumeToken: token });
        assert.equal(hub.entryOf(fresh).identity.blocked.size, 0);
        assert.equal(hub.openDm(ana, { username: "bia" }).ok, true);
    });
});

describe("queda, retomada e fim da identidade", () => {
    test("queda: a outra pessoa vê offline; a conversa continua e guarda o que chegar", () => {
        const { hub, ana, bia, dm, received } = anaTalksToBia();
        hub.disconnect(bia);
        assert.equal(received(ana, "dm_updated", dm.id).at(-1).payload.peer.online, false);
        assert.equal(
            hub.post(ana, { conversationId: dm.id, content: "enquanto você caiu" }).ok,
            true,
        );
        assert.equal(
            hub.openDm(ana, { username: "bia" }).ok,
            false,
            "busca por @ só acha conectado",
        );
        assert.equal(hub.openDm(ana, { userId: dm.peerOf(hub.entryOf(ana).identity).id }).ok, true);
    });

    test("retomada: a conversa volta com o histórico, e a outra pessoa vê online", () => {
        const { hub, ana, bia, dm, received, member, login } = anaTalksToBia();
        const token = received(bia, "session")[0].payload.resumeToken;
        hub.disconnect(bia);
        hub.post(ana, { conversationId: dm.id, content: "enquanto você caiu" });
        const back = member("bia2");
        login(back, { resumeToken: token });
        const [resumed] = received(back, "dm_opened", dm.id);
        assert.equal(resumed.payload.resumed, true);
        assert.deepEqual(
            received(back, "message_history", dm.id)[0].payload.map((m) => m.payload.content),
            ["oi Bia", "enquanto você caiu"],
        );
        assert.equal(received(ana, "dm_updated", dm.id).at(-1).payload.peer.online, true);
    });

    test("sem voltar a tempo: a conversa acaba e a outra pessoa é avisada", () => {
        const ctx = anaTalksToBia();
        const { hub, ana, bia, dm, received, identities, directs } = ctx;
        hub.disconnect(bia);
        ctx.tick(2 * 60 * 1000 + 1);
        identities.sweep();
        assert.equal(received(ana, "dm_closed", dm.id)[0].payload.reason, "ended");
        assert.equal(dm.historyLength, 0);
        assert.equal(directs.size, 0);
        assert.equal(hub.entryOf(ana).identity.dms.size, 0);
    });

    test("sair da sessão encerra as conversas privadas na hora", () => {
        const { hub, ana, bia, dm, received } = anaTalksToBia();
        hub.logout(bia);
        assert.equal(received(ana, "dm_closed", dm.id)[0].payload.reason, "ended");
        assert.equal(dm.closed, true);
    });

    test("identidade nova com o mesmo @ não recupera a conversa anterior", () => {
        const { hub, bia, dm, member, login, received } = anaTalksToBia();
        hub.logout(bia);
        const impostor = member("outra");
        login(impostor, { userName: "Outra", username: "bia" });
        const opened = hub.openDm(impostor, { username: "ana" });
        assert.notEqual(opened.conversation.id, dm.id);
        assert.equal(received(impostor, "message_history").length, 0);
        assert.equal(
            hub.post(impostor, { conversationId: dm.id, content: "x" }).code,
            "conversation_not_found",
        );
    });

    test("trocar de nome atualiza o resumo do outro lado", () => {
        const { hub, ana, bia, dm, received } = anaTalksToBia();
        hub.rename(bia, "Beatriz");
        assert.equal(received(ana, "dm_updated", dm.id).at(-1).payload.peer.name, "Beatriz");
    });

    test("room_list traz as conversas privadas", () => {
        const { hub, ana, dm } = anaTalksToBia();
        const { dms } = hub.conversationsOf(ana);
        assert.deepEqual(
            dms.map((d) => [d.conversationId, d.peer.username]),
            [[dm.id, "bia"]],
        );
    });
});

describe("limites e memória", () => {
    test("conversas por pessoa: quem abre recebe dm_limit; quem está cheio, 'indisponível'", () => {
        const { hub, ana, bia, caio } = people({ dmLimits: { maxPerIdentity: 1 } });
        assert.equal(hub.openDm(ana, { username: "bia" }).ok, true);
        assert.equal(hub.openDm(ana, { username: "caio" }).code, "dm_limit");
        assert.equal(hub.openDm(caio, { username: "bia" }).code, "user_unavailable");
        assert.equal(hub.openDm(bia, { username: "ana" }).ok, true, "a existente continua");
    });

    test("teto no servidor inteiro", () => {
        const { hub, ana, caio } = people({ dmLimits: { maxTotal: 1 } });
        hub.openDm(ana, { username: "bia" });
        assert.equal(hub.openDm(caio, { username: "ana" }).code, "dms_full");
    });

    test("conversas novas demais em pouco tempo travam; reabrir não conta", () => {
        const { hub, ana } = people({
            dmGuard: { newConversation: { capacity: 1, refillPerSecond: 0.001 } },
        });
        assert.equal(hub.openDm(ana, { username: "bia" }).ok, true);
        assert.equal(hub.openDm(ana, { username: "caio" }).code, "dm_open_limited");
        assert.equal(hub.openDm(ana, { username: "bia" }).ok, true);
    });

    test("desligamento: nenhuma conversa privada sobra", () => {
        const { hub, directs, ana } = anaTalksToBia();
        hub.closeAll();
        assert.equal(directs.size, 0);
        assert.equal(hub.entryOf(ana).identity.dms.size, 0);
    });

    test("logs: ids e conversa, nunca nome, @ ou conteúdo", () => {
        const { logs, hub, bia, idOf, ana } = anaTalksToBia();
        hub.lookup(ana, { username: "caio" });
        hub.block(bia, { userId: idOf(ana) });
        const text = JSON.stringify(logs.filter((l) => /dm|block/.test(l.event)));
        assert.ok(text.includes("dm_opened"));
        for (const secret of ["oi Bia", '"Ana"', '"Bia"', '"bia"', '"caio"']) {
            assert.ok(!text.includes(secret), secret);
        }
    });
});
