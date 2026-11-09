// Tela de entrada reestruturada: sugestão de username, orientação ao vivo e
// entrada na sala só depois que o servidor aceita.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { describeUsername, suggestUsername } from "../src/ui/entry.js";
import { createEventHandler } from "../src/state/events.js";
import { createStore } from "../src/state/store.js";
import { strings } from "../src/i18n/strings.js";

describe("sugestão de username a partir do nome", () => {
    test("primeiro e último nome, sem acento, separados por ponto", () => {
        assert.equal(suggestUsername("Ana Carolina Souza"), "ana.souza");
        assert.equal(suggestUsername("  João   Conceição "), "joao.conceicao");
    });

    test("nome único vira o próprio username; símbolos somem", () => {
        // "ze" tem menos de 3 caracteres: melhor não sugerir do que sugerir inválido.
        assert.equal(suggestUsername("Zé"), "");
        assert.equal(suggestUsername("Beatriz"), "beatriz");
        assert.equal(suggestUsername("Ana-Lú O'Neil"), "analu.oneil");
    });

    test("nunca passa de 20 caracteres e mantém o sobrenome quando cabe", () => {
        const suggestion = suggestUsername("Maximiliano Bartholomeu Vasconcellos");
        assert.ok(suggestion.length <= 20, suggestion);
        assert.ok(suggestion.endsWith(".vasconcellos"), suggestion);
    });

    test("sem letras ou números, não sugere nada", () => {
        assert.equal(suggestUsername("   "), "");
        assert.equal(suggestUsername("!!!"), "");
    });
});

describe("orientação ao vivo do username", () => {
    test("vazio: dica neutra", () => {
        assert.deepEqual(describeUsername(""), {
            state: "neutral",
            message: strings.entry.usernameHint,
        });
    });

    test("caractere fora do formato é apontado na hora", () => {
        assert.equal(describeUsername("ana souza").message, strings.entry.usernameChars);
        assert.equal(describeUsername("ána").state, "invalid");
    });

    test("pontos mal colocados", () => {
        assert.equal(describeUsername(".ana").message, strings.entry.usernameDots);
        assert.equal(describeUsername("ana..souza").message, strings.entry.usernameDots);
    });

    test("curto demais só vira erro depois que a pessoa sai do campo", () => {
        assert.equal(describeUsername("an").state, "neutral");
        assert.equal(
            describeUsername("an", { touched: true }).message,
            strings.entry.usernameTooShort,
        );
    });

    test("válido: diz se foi sugerido e lembra que a disponibilidade é conferida ao entrar", () => {
        assert.equal(
            describeUsername("ana.souza", { suggested: true }).message,
            strings.entry.usernameSuggested,
        );
        assert.equal(describeUsername("@Ana_82").message, strings.entry.usernameValid);
        assert.equal(describeUsername("ana_82").state, "valid");
    });
});

describe("entrar só depois que o servidor aceita", () => {
    const setup = () => {
        const store = createStore();
        const handle = createEventHandler({
            store,
            toasts: { show: () => {} },
            notifier: { show: () => {} },
            typingTracker: { set: () => {} },
            onSession: () => {},
            onLoginRejected: () => {},
        });
        return { store, handle };
    };

    test("o pedido de entrada mantém a tela de entrada, esperando", () => {
        const { store } = setup();
        store.actions.startJoin({ id: "provisorio", name: "Ana", username: "ana" });
        assert.equal(store.getState().screen, "entry");
        assert.equal(store.getState().joining, true);
    });

    test("a sessão chega à Home e a sala só abre após escolha explícita", () => {
        const { store, handle } = setup();
        store.actions.startJoin({ id: "provisorio", name: "Ana", username: "ana" });
        handle({
            type: "session",
            payload: { id: "srv-1", name: "Ana", username: "ana", resumeToken: "t" },
        });
        assert.equal(store.getState().screen, "home", "identificação concluída");
        assert.equal(store.getState().joining, false);
        handle({
            type: "room_joined",
            conversationId: "r_sala00000001",
            payload: { code: "abc-defg-hij", name: "Sala de Ana", role: "host", historyVersion: 0 },
        });
        assert.equal(store.getState().screen, "home");
        assert.equal(store.actions.openConversation("r_sala00000001"), true);
        assert.equal(store.getState().screen, "room");
        assert.deepEqual(store.getState().room, {
            conversationId: "r_sala00000001",
            code: "abc-defg-hij",
            name: "Sala de Ana",
            role: "host",
        });
    });

    test("recusa não troca de tela: a pessoa nunca 'entra e volta'", () => {
        const { store, handle } = setup();
        store.actions.startJoin({ id: "provisorio", name: "Ana", username: "ana" });
        handle({ type: "error", payload: { code: "username_taken", message: "x" } });
        assert.equal(store.getState().screen, "entry");
    });

    test("sessão de uma reconexão, já na sala, não muda nada", () => {
        const { store, handle } = setup();
        store.actions.enterRoom({ id: "srv-1", name: "Ana", username: "ana" });
        handle({
            type: "session",
            payload: { id: "srv-1", name: "Ana", username: "ana", resumeToken: "t2" },
        });
        assert.equal(store.getState().screen, "room");
    });
});
