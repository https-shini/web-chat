// Notificações só por escolha explícita: nada é pedido sozinho, ligar e
// desligar pelo botão, permissão negada sem insistência, aba oculta, e o
// conteúdo nunca sai para a central de notificações.

/** Notification falsa, controlada pelo teste (permissão e registro). */
const fakeNotification = (answer) => {
    const log = { requests: 0, shown: [] };
    window.__notify = log;
    class FakeNotification {
        static permission = "default";
        static async requestPermission() {
            log.requests += 1;
            FakeNotification.permission = window.__answer ?? "granted";
            return FakeNotification.permission;
        }
        constructor(title, options) {
            log.shown.push({ title, ...options });
        }
    }
    window.__answer = answer;
    window.Notification = FakeNotification;
};

const hideTab = (page, hidden) =>
    page.evaluate((h) => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => (h ? "hidden" : "visible"),
        });
        document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);

export default async ({ open, enter, createRoom, say, user, ok, RUN }) => {
    const ana = await open({ init: fakeNotification });
    await enter(ana, "Ana Souza", user("ana"));
    const hash = await createRoom(ana, "Avisos");
    const bia = await open({ hash });
    await enter(bia, "Bia Lima", user("bia"));
    const button = '[data-action="toggle-notifications"]';

    ok(await ana.isVisible(button), "botão de notificações no painel 'você'");
    ok((await ana.getAttribute(button, "aria-pressed")) === "false", "começa desligado");
    await say(ana, `primeira ${RUN}`);
    await ana.waitForSelector(`.c-message[data-delivery="confirmed"]:has-text("primeira ${RUN}")`);
    ok(
        (await ana.evaluate(() => window.__notify.requests)) === 0,
        "enviar mensagem não pede permissão (nada automático)",
    );

    // Desligada: aba oculta não notifica.
    await hideTab(ana, true);
    await say(bia, `desligada ${RUN}`);
    await ana.waitForSelector(`.c-message:has-text("desligada ${RUN}")`, { state: "attached" });
    ok(
        (await ana.evaluate(() => window.__notify.shown.length)) === 0,
        "desligada: nenhuma notificação",
    );
    await hideTab(ana, false);

    // Ligar pelo botão: pede a permissão uma vez.
    await ana.click(button);
    await ana.waitForFunction(
        (b) => document.querySelector(b)?.getAttribute("aria-pressed") === "true",
        button,
    );
    ok(
        (await ana.evaluate(() => window.__notify.requests)) === 1,
        "ativar pede a permissão uma vez, no clique",
    );
    ok(
        (await ana.getAttribute(button, "aria-label")) === "Desativar notificações",
        "o rótulo diz a próxima ação",
    );

    // Aba à vista: sem notificação. Aba oculta: uma, sem conteúdo.
    await say(bia, `visível ${RUN}`);
    await ana.waitForSelector(`.c-message:has-text("visível ${RUN}")`);
    ok(
        (await ana.evaluate(() => window.__notify.shown.length)) === 0,
        "aba à vista: a conversa já é o aviso",
    );
    await hideTab(ana, true);
    await say(bia, `segredo ${RUN}`);
    await ana.waitForFunction(() => window.__notify.shown.length === 1);
    const shown = await ana.evaluate(() => window.__notify.shown);
    ok(
        shown[0].title === "Avisos" && shown[0].body === "Nova mensagem",
        "notificação: só onde e 'Nova mensagem'",
    );
    ok(
        !JSON.stringify(shown).includes("segredo") && !JSON.stringify(shown).includes("Bia"),
        "sem o texto nem quem escreveu",
    );
    ok(typeof shown[0].tag === "string" && shown[0].tag.startsWith("r_"), "uma por conversa (tag)");
    await say(ana, `minha ${RUN}`);
    await ana.waitForTimeout(400);
    ok(
        (await ana.evaluate(() => window.__notify.shown.length)) === 1,
        "a própria mensagem não notifica",
    );
    await hideTab(ana, false);

    // Desligar: para de notificar.
    await ana.click(button);
    await ana.waitForFunction(
        (b) => document.querySelector(b)?.getAttribute("aria-pressed") === "false",
        button,
    );
    await hideTab(ana, true);
    await say(bia, `depois de desligar ${RUN}`);
    await ana.waitForSelector(`.c-message:has-text("depois de desligar ${RUN}")`, {
        state: "attached",
    });
    ok(
        (await ana.evaluate(() => window.__notify.shown.length)) === 1,
        "desligar respeita a escolha",
    );
    await hideTab(ana, false);

    // Permissão negada: avisa uma vez como liberar, não insiste.
    const caio = await open({ hash, init: fakeNotification });
    await caio.evaluate(() => {
        window.__answer = "denied";
    });
    await enter(caio, "Caio Reis", user("caio"));
    await caio.click(button);
    await caio.waitForSelector('.c-toast:has-text("bloqueando as notificações")');
    ok(
        (await caio.getAttribute(button, "aria-pressed")) === "false",
        "negada: continua desligada, com a explicação",
    );
    await caio.click(button);
    await caio.waitForTimeout(300);
    ok((await caio.evaluate(() => window.__notify.requests)) === 1, "negada: não pede de novo");
};
