// Notificações por escolha explícita: nada é pedido sozinho, ligar e
// desligar é da pessoa, permissão negada não é insistida e o conteúdo
// nunca sai para a central de notificações.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createNotifier } from "../src/ui/notify.js";

/** Navegador falso: permissão controlável e registro do que foi exibido. */
const fakeBrowser = (permission = "default", answer = "granted") => {
    const shown = [];
    let requests = 0;
    class FakeNotification {
        static permission = permission;
        static async requestPermission() {
            requests += 1;
            FakeNotification.permission = answer;
            return answer;
        }
        constructor(title, options) {
            shown.push({ title, ...options });
        }
    }
    globalThis.Notification = /** @type {any} */ (FakeNotification);
    globalThis.document = /** @type {any} */ ({ hidden: true });
    return { shown, requests: () => requests, FakeNotification };
};

describe("notificações por escolha explícita", () => {
    beforeEach(() => {
        delete globalThis.Notification;
        delete globalThis.document;
    });
    afterEach(() => {
        delete globalThis.Notification;
        delete globalThis.document;
    });

    test("começa desligada e não pede permissão sozinha", () => {
        const browser = fakeBrowser("default");
        const notifier = createNotifier();
        assert.equal(notifier.state(), "off");
        notifier.show("Sala", "Nova mensagem", "r_1");
        assert.equal(browser.requests(), 0, "nenhum pedido sem a pessoa apertar o botão");
        assert.equal(browser.shown.length, 0);
    });

    test("ativar pede a permissão uma vez; aceita, passa a notificar com a aba oculta", async () => {
        const browser = fakeBrowser("default", "granted");
        const notifier = createNotifier();
        assert.equal(await notifier.enable(), "on");
        assert.equal(browser.requests(), 1);
        notifier.show("Sala", "Nova mensagem", "r_1");
        assert.deepEqual(browser.shown, [{ title: "Sala", body: "Nova mensagem", tag: "r_1" }]);
        globalThis.document = /** @type {any} */ ({ hidden: false });
        notifier.show("Sala", "Nova mensagem", "r_1");
        assert.equal(browser.shown.length, 1, "com a aba à vista, nada");
    });

    test("desativar para de notificar; reativar não pede de novo", async () => {
        const browser = fakeBrowser("default", "granted");
        const notifier = createNotifier();
        await notifier.enable();
        notifier.disable();
        assert.equal(notifier.state(), "off");
        notifier.show("Sala", "Nova mensagem", "r_1");
        assert.equal(browser.shown.length, 0);
        assert.equal(await notifier.enable(), "on");
        assert.equal(browser.requests(), 1, "a permissão já dada não é pedida de novo");
    });

    test("permissão negada: fica desligada e não insiste", async () => {
        const browser = fakeBrowser("default", "denied");
        const notifier = createNotifier();
        assert.equal(await notifier.enable(), "denied");
        assert.equal(await notifier.enable(), "denied");
        assert.equal(browser.requests(), 1, "o navegador já respondeu: nada de pedir de novo");
        notifier.show("Sala", "Nova mensagem", "r_1");
        assert.equal(browser.shown.length, 0);
    });

    test("navegador sem notificações: estado 'unsupported', nada quebra", async () => {
        globalThis.document = /** @type {any} */ ({ hidden: true });
        const notifier = createNotifier();
        assert.equal(notifier.state(), "unsupported");
        assert.equal(await notifier.enable(), "unsupported");
        notifier.show("Sala", "Nova mensagem");
    });
});
