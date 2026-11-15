// Decisões do PR 12: densidade compacta (perfil, guardada como o tema) e
// avisos de menção (selo "@" na lista, aviso na tela, título da aba).
export default async ({ open, enter, createRoom, user, ok, axe, RUN }) => {
    const ana = await open({ viewport: { width: 1440, height: 900 } });
    const anaUser = user("ana");
    await enter(ana, "Ana Souza", anaUser);
    const hashA = await createRoom(ana, `Menções ${RUN}`);
    const hashB = await createRoom(ana, `Outra ${RUN}`);
    ok(Boolean(hashA && hashB), "duas salas abertas");

    // ─── Menção numa conversa que não está aberta ───────────────────────
    const bia = await open({ hash: hashA, viewport: { width: 1280, height: 800 } });
    await enter(bia, "Bia Lima", user("bia"));
    await bia.fill("#campo-mensagem", `oi sem menção ${RUN}`);
    await bia.press("#campo-mensagem", "Enter");
    await bia.fill("#campo-mensagem", `@${anaUser} pode revisar? ${RUN}`);
    await bia.press("#campo-mensagem", "Enter");

    const item = `.c-sidebar .c-conversation-nav__item:has-text("Menções ${RUN}")`;
    await ana.waitForSelector(`${item} .c-conversation-nav__badge--mention`);
    ok(
        (await ana.textContent(`${item} .c-conversation-nav__badge`))?.trim() === "@1",
        "selo da conversa mostra @1",
    );
    const label = (await ana.getAttribute(item, "aria-label")) ?? "";
    ok(
        label.includes("2 não lidas") && label.includes("1 menção a você"),
        `rótulo lido: não lidas e menção (${label})`,
    );
    await ana.waitForSelector('.c-toast:has-text("Bia Lima mencionou você em")');
    ok(true, "aviso na tela: quem mencionou e onde");
    ok(/\(2 · @1\)/.test(await ana.title()), `título da aba com a menção: ${await ana.title()}`);
    const issues = await axe(ana);
    ok(issues.length === 0, `lista com selo de menção sem violações sérias ${issues.join("; ")}`);

    await ana.click(item);
    await ana.waitForSelector(`.c-message--mention:has-text("pode revisar? ${RUN}")`);
    ok(
        !(await ana.$(`${item} .c-conversation-nav__badge`)) && !/@/.test(await ana.title()),
        "abrir a conversa limpa o selo e o título",
    );

    // ─── Densidade ──────────────────────────────────────────────────────
    const target = `.c-message:has-text("oi sem menção ${RUN}")`;
    const gap = () =>
        ana.$eval(target, (node) => ({
            gap: parseFloat(getComputedStyle(node).marginTop),
            font: parseFloat(
                getComputedStyle(/** @type {Element} */ (node.querySelector(".c-message__text")))
                    .fontSize,
            ),
        }));
    const before = await gap();
    await ana.click("[data-go-profile]:visible");
    await ana.waitForSelector('[data-page="profile"]:not([hidden])');
    const compact = '[data-density="compact"][role="radio"]';
    ok(
        (await ana.getAttribute('[data-density="default"][role="radio"]', "aria-checked")) ===
            "true",
        "densidade começa na padrão",
    );
    await ana.click(compact);
    ok(
        (await ana.getAttribute(compact, "aria-checked")) === "true" &&
            (await ana.evaluate(() => document.documentElement.dataset.density)) === "compact",
        "escolher Compacta marca a opção e aplica na página",
    );
    await ana.keyboard.press("ArrowLeft");
    ok(
        (await ana.evaluate(() => document.documentElement.dataset.density)) === undefined,
        "setas trocam a densidade (grupo de opções)",
    );
    await ana.keyboard.press("ArrowRight");
    const profileIssues = await axe(ana);
    ok(profileIssues.length === 0, `perfil sem violações sérias ${profileIssues.join("; ")}`);

    await ana.click(item);
    await ana.waitForSelector(".c-message");
    const after = await gap();
    ok(after.gap < before.gap, `compacta aproxima as mensagens (${before.gap}px → ${after.gap}px)`);
    ok(
        after.font === before.font,
        `o tamanho do texto não muda (${before.font}px → ${after.font}px)`,
    );
    const smallTargets = await ana.$$eval(".c-sidebar button", (buttons) =>
        buttons
            .filter((b) => !b.closest("[hidden]") && b.getBoundingClientRect().width > 0)
            .filter((b) => b.getBoundingClientRect().height < 24)
            .map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim()),
    );
    ok(smallTargets.length === 0, `compacta mantém áreas de toque ≥ 24 px ${smallTargets}`);
    const roomIssues = await axe(ana);
    ok(roomIssues.length === 0, `conversa compacta sem violações sérias ${roomIssues.join("; ")}`);

    // A escolha volta na próxima visita (preferência visual, como o tema).
    // Outra aba do mesmo navegador (mesmo armazenamento).
    const again = await ana.context().newPage();
    await again.goto(ana.url().split("#")[0], { waitUntil: "networkidle" });
    ok(
        (await again.evaluate(() => document.documentElement.dataset.density)) === "compact",
        "a densidade escolhida vale na próxima visita",
    );
    ok(
        (await again.evaluate(() => Object.keys(localStorage).sort().join(","))) ===
            "web-chat:density,web-chat:theme" ||
            (await again.evaluate(() => Object.keys(localStorage).join(","))) ===
                "web-chat:density",
        "o navegador guarda só tema e densidade",
    );
};
