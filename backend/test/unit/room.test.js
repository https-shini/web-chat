// Sessão e sala, sem rede: conexões são objetos simples e `deliver` grava o
// que cada uma receberia. Desde a Fase 2 da evolução, entrar no chat
// (`login`) e entrar numa sala são passos separados; `enter` do harness faz
// os dois na sala compartilhada.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./harness.js";

describe("sessão", () => {
    test("atribui identidade própria e ignora userId do payload", () => {
        const { member, login, received } = setup();
        const ana = member("ana");
        const result = login(ana, { userId: "escolhido", userName: "Ana" });
        assert.equal(result.ok, true);
        assert.notEqual(result.user.id, "escolhido");
        const [session] = received(ana, "session");
        assert.equal(session.payload.id, result.user.id);
        assert.equal(typeof session.payload.resumeToken, "string");
    });

    test("login não entra em sala nenhuma: só a sessão chega", () => {
        const { member, login, all, hub } = setup();
        const ana = member("ana");
        login(ana, { userName: "Ana" });
        assert.deepEqual(
            all(ana).map((x) => x.type),
            ["session"],
        );
        assert.deepEqual(hub.roomsOf(ana), []);
    });

    test("ordem para quem entra numa sala: resumo, depois histórico, depois lista", () => {
        const { member, enter, post, all } = setup();
        const ana = member("ana");
        enter(ana);
        post(ana, { content: "oi" });
        const bia = member("bia");
        enter(bia);
        assert.deepEqual(
            all(bia).map((x) => x.type),
            ["session", "room_joined", "message_history", "user_list"],
        );
    });

    test("os outros recebem 'entrou' e a lista; quem entra não recebe o próprio 'entrou'", () => {
        const { member, enter, received } = setup();
        const ana = member("ana");
        const bia = member("bia");
        enter(ana);
        enter(bia);
        assert.equal(received(ana, "user_joined").at(-1).payload.userName, "bia");
        assert.equal(received(bia, "user_joined").length, 0);
        assert.deepEqual(
            received(ana, "user_list")
                .at(-1)
                .payload.map((p) => p.name),
            ["ana", "bia"],
        );
    });

    test("segundo login na mesma conexão é recusado sem efeito", () => {
        const { member, enter, login, received } = setup();
        const ana = member("ana");
        const bia = member("bia");
        enter(ana);
        enter(bia);
        const before = received(ana, "user_joined").length;
        assert.deepEqual(login(bia, { userName: "Outra" }), {
            ok: false,
            code: "already_logged_in",
        });
        assert.equal(received(ana, "user_joined").length, before);
    });

    test("nome inválido é recusado e a conexão fica sem sessão", () => {
        const { member, login, hub } = setup();
        const ana = member("ana");
        for (const userName of ["", "   ", "\u0007", undefined]) {
            assert.deepEqual(login(ana, { userName }), { ok: false, code: "invalid_name" });
        }
        assert.deepEqual(login(ana, { userName: 42 }), { ok: false, code: "invalid_name" });
        assert.equal(hub.isLoggedIn(ana), false);
    });
});

describe("retomada de identidade", () => {
    test("token válido devolve o mesmo id, o nome guardado e as mesmas salas", () => {
        const { member, enter, login, hub, received, room } = setup();
        const first = member("1");
        const { user } = enter(first, { userName: "Ana" });
        const token = received(first, "session")[0].payload.resumeToken;
        hub.disconnect(first);

        const second = member("2");
        const result = login(second, { userName: "Outro nome", resumeToken: token });
        assert.equal(result.user.id, user.id);
        assert.equal(result.user.name, "Ana");
        const [joined] = received(second, "room_joined");
        assert.equal(joined.conversationId, room.id);
        assert.equal(joined.payload.resumed, true);
        assert.equal(joined.payload.role, "host", "o papel de anfitrião volta junto");
    });

    test("token é de uso único", () => {
        const { member, enter, login, hub, received } = setup();
        const first = member("1");
        const { user } = enter(first, { userName: "Ana" });
        const token = received(first, "session")[0].payload.resumeToken;
        hub.disconnect(first);
        login(member("2"), { userName: "Ana", resumeToken: token });
        const replay = login(member("3"), { userName: "X", resumeToken: token });
        assert.notEqual(replay.user?.id, user.id);
    });

    test("token expira 2 min após a queda, e a identidade sai das salas", () => {
        const { member, enter, login, hub, received, tick, room } = setup();
        const watcher = member("w");
        enter(watcher);
        const first = member("1");
        const { user } = enter(first, { userName: "Ana" });
        const token = received(first, "session")[0].payload.resumeToken;
        hub.disconnect(first);
        assert.equal(room.memberCount, 2, "na janela, continua participando");
        tick(2 * 60 * 1000 + 1);
        const late = login(member("2"), { userName: "Ana", resumeToken: token });
        assert.notEqual(late.user.id, user.id);
        assert.equal(room.memberCount, 1, "vencido o prazo, a participação acaba");
    });

    test("retomar com a conexão antiga presente substitui a antiga em silêncio", () => {
        const { member, enter, login, hub, received, room } = setup();
        const watcher = member("w");
        enter(watcher);
        const old = member("old");
        enter(old, { userName: "Ana" });
        const token = received(old, "session")[0].payload.resumeToken;
        const joinedBefore = received(watcher, "user_joined").length;

        const fresh = member("new");
        const result = login(fresh, { userName: "Ana", resumeToken: token });
        assert.equal(result.replaced, old);
        assert.equal(hub.isLoggedIn(old), false);
        assert.equal(room.memberCount, 2);
        assert.equal(received(watcher, "user_left").length, 0);
        assert.equal(received(watcher, "user_joined").length, joinedBefore);
        // A conexão antiga fechando depois não derruba a nova.
        hub.disconnect(old);
        assert.equal(room.connectedCount, 2);
    });
});

describe("mensagens", () => {
    test("autor vem da sessão, não do payload", () => {
        const { member, enter, post, received } = setup();
        const ana = member("ana");
        const { user } = enter(ana, { userName: "Ana" });
        post(ana, { content: "oi", userId: "outro", userName: "Outro" });
        const [message] = received(ana, "chat_message");
        assert.equal(message.payload.userId, user.id);
        assert.equal(message.payload.userName, "Ana");
        assert.match(message.id, /^msg-/);
    });

    test("sem sessão, não fala e não ouve", () => {
        const { member, enter, post, hub, received, room } = setup();
        const ana = member("ana");
        const lurker = member("lurker");
        enter(ana);
        assert.deepEqual(post(lurker, { content: "oi" }), { ok: false, code: "not_logged_in" });
        post(ana, { content: "privado" });
        hub.typing(ana, { conversationId: room.id }, true);
        hub.typing(lurker, { conversationId: room.id }, true);
        assert.equal(received(lurker, "chat_message").length, 0);
        assert.equal(received(ana, "user_typing").length, 0);
    });

    test("conteúdo vazio e de tipo errado são recusados com códigos distintos", () => {
        const { member, enter, post } = setup();
        const ana = member("ana");
        enter(ana);
        assert.deepEqual(post(ana, { content: "  " }), { ok: false, code: "empty_message" });
        assert.deepEqual(post(ana, { content: 1 }), { ok: false, code: "invalid_message" });
        assert.deepEqual(post(ana, {}), { ok: false, code: "invalid_message" });
    });

    test("histórico respeita historySize e envia historyOnJoin a quem entra", () => {
        const { member, enter, post, received } = setup({ historySize: 5, historyOnJoin: 3 });
        const ana = member("ana");
        enter(ana);
        for (let index = 1; index <= 8; index += 1) post(ana, { content: `m${index}` });
        const bia = member("bia");
        enter(bia);
        const [history] = received(bia, "message_history");
        assert.deepEqual(
            history.payload.map((entry) => entry.payload.content),
            ["m6", "m7", "m8"],
        );
    });

    test("o id no histórico é o mesmo da mensagem ao vivo", () => {
        const { member, enter, post, received } = setup();
        const ana = member("ana");
        enter(ana);
        post(ana, { content: "oi" });
        const live = received(ana, "chat_message")[0];
        const bia = member("bia");
        enter(bia);
        assert.equal(received(bia, "message_history")[0].payload[0].id, live.id);
    });
});

describe("saída da sala e queda da conexão", () => {
    test("sair da sala anuncia, atualiza a lista e avisa só quem saiu", () => {
        const { member, enter, hub, received, room } = setup();
        const ana = member("ana");
        const bia = member("bia");
        enter(ana);
        enter(bia);
        assert.deepEqual(hub.leaveRoom(bia, { conversationId: room.id }), { ok: true });
        assert.equal(received(ana, "user_left").at(-1).payload.userName, "bia");
        assert.deepEqual(
            received(ana, "user_list")
                .at(-1)
                .payload.map((p) => p.name),
            ["ana"],
        );
        assert.equal(received(bia, "room_left").at(-1).payload.reason, "left");
        assert.equal(received(ana, "room_left").length, 0);
        assert.equal(hub.isLoggedIn(bia), true, "sair de uma sala não encerra a sessão");
        assert.deepEqual(hub.leaveRoom(bia, { conversationId: room.id }), {
            ok: false,
            code: "conversation_not_found",
        });
    });

    test("queda: some da lista, o aviso sai (sem janela) e a participação continua", () => {
        const { member, enter, hub, received, room } = setup();
        const ana = member("ana");
        const bia = member("bia");
        enter(ana);
        enter(bia);
        assert.equal(hub.disconnect(bia), true);
        assert.equal(received(ana, "user_left").at(-1).payload.userName, "bia");
        assert.deepEqual(
            received(ana, "user_list")
                .at(-1)
                .payload.map((p) => p.name),
            ["ana"],
        );
        assert.equal(room.memberCount, 2);
        assert.equal(hub.disconnect(bia), false, "duas vezes não tem efeito");
    });

    test("em silêncio (desligamento) a queda não é anunciada", () => {
        const { member, enter, hub, received } = setup();
        const ana = member("ana");
        const bia = member("bia");
        enter(ana);
        enter(bia);
        hub.silence();
        hub.disconnect(bia);
        assert.equal(received(ana, "user_left").length, 0);
    });

    test("logs trazem ids, nunca nome, conteúdo ou código de convite", () => {
        const { member, enter, post, hub, logs, room } = setup();
        const ana = member("ana");
        enter(ana, { userName: "NomeSecreto" });
        post(ana, { content: "conteudo-secreto" });
        const code = room.code;
        hub.disconnect(ana);
        const text = JSON.stringify(logs);
        assert.ok(!text.includes("NomeSecreto"));
        assert.ok(!text.includes("conteudo-secreto"));
        assert.ok(!text.includes(code));
        assert.ok(!text.includes(code.replaceAll("-", "")));
        assert.deepEqual(
            logs.map((entry) => entry.event),
            ["session_started", "room_created", "room_member_joined", "session_paused"],
        );
    });
});
