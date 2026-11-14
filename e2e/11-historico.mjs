// Histórico: Markdown sem HTML, menções, separador de dia, "Novas
// mensagens", aviso de novas ao rolar, ações da mensagem (barra, menu e
// teclado), sugestões de @pessoa, dispensar resposta de comando e apagar
// uma mensagem que não foi enviada.
export default async ({ open, enter, createRoom, user, ok, axe, RUN }) => {
    const ana = await open();
    const anaUser = user("ana");
    await enter(ana, "Ana Souza", anaUser);
    const hash = await createRoom(ana, "Histórico");
    const bia = await open({ hash });
    const biaUser = user("bia");
    await enter(bia, "Bia Lima", biaUser);
    /** @param {import("playwright").Page} page @param {string} text */
    const say = async (page, text) => {
        await page.fill("#campo-mensagem", text);
        await page.press("#campo-mensagem", "Enter");
    };

    // Markdown: elementos, nunca HTML.
    await say(bia, `**forte ${RUN}** _leve_ \`código\` https://exemplo.com/a <b>não</b>`);
    const md = `.c-message:has-text("forte ${RUN}")`;
    await ana.waitForSelector(md);
    ok(
        (await ana.textContent(`${md} strong`))?.trim() === `forte ${RUN}`,
        "**negrito** vira strong",
    );
    ok((await ana.textContent(`${md} em`))?.trim() === "leve", "_itálico_ vira em");
    ok((await ana.textContent(`${md} code`))?.trim() === "código", "`código` vira code");
    const rel = await ana.getAttribute(`${md} a`, "rel");
    ok(
        Boolean(rel?.includes("noopener") && rel.includes("noreferrer")),
        "link com noopener e noreferrer",
    );
    ok(
        (await ana.$$(`${md} b`)).length === 0 &&
            Boolean((await ana.textContent(md))?.includes("<b>não</b>")),
        "HTML digitado aparece como texto",
    );
    await say(bia, "```\nlinha 1\n  linha 2\n```");
    await ana.waitForSelector(".c-message__pre");
    ok(
        (await ana.textContent(".c-message__pre code")) === "linha 1\n  linha 2",
        "bloco de código mantém as linhas e a indentação",
    );
    ok(
        await ana.$eval(".c-day-divider", (x) => x.textContent?.trim() === "Hoje"),
        "separador de dia: Hoje",
    );

    // Menção a você: destaque e aviso em texto.
    await say(bia, `@${anaUser} olha isso ${RUN}`);
    const mention = `.c-message:has-text("olha isso ${RUN}")`;
    await ana.waitForSelector(`${mention}.c-message--mention`);
    ok(
        Boolean((await ana.textContent(mention))?.includes("Menciona você.")),
        "menção: aviso para o leitor de tela",
    );
    ok(!(await bia.$(`${mention}.c-message--mention`)), "quem mencionou não vê o destaque");
    const issues = await axe(ana);
    ok(
        issues.length === 0,
        `histórico com Markdown e menção sem violações sérias ${issues.join("; ")}`,
    );

    // Sugestão de @pessoa no campo.
    await ana.click("#campo-mensagem");
    await ana.keyboard.type("oi @bi");
    await ana.waitForSelector(".c-command-suggestions:not([hidden]) [role='option']");
    await ana.keyboard.press("Enter");
    ok(
        (await ana.inputValue("#campo-mensagem")) === `oi @${biaUser} `,
        "@ sugere e completa a pessoa da conversa",
    );
    await ana.fill("#campo-mensagem", "");

    // Barra de ações: Mencionar põe o @ no campo.
    await ana.hover(mention);
    await ana.click(`${mention} .c-message-actions [aria-label="Mencionar"]`);
    ok(
        (await ana.inputValue("#campo-mensagem")).includes(`@${biaUser}`),
        "barra de ações: Mencionar",
    );
    await ana.fill("#campo-mensagem", "");

    // Teclado: ↑ na lista foca a última mensagem; Shift+F10 abre o menu dela.
    await ana.focus(".c-message-list");
    await ana.keyboard.press("ArrowUp");
    ok(
        await ana.evaluate(() => document.activeElement?.classList.contains("c-message") ?? false),
        "↑ na lista foca a última mensagem",
    );
    await ana.keyboard.press("Shift+F10");
    await ana.waitForSelector('.c-menu[role="menu"]');
    const items = await ana.$$eval(".c-menu .c-menu__item", (xs) =>
        xs.map((x) => x.textContent?.trim() ?? ""),
    );
    ok(
        items.includes("Copiar texto") && items.includes("Mencionar"),
        "menu da mensagem pelo teclado",
    );
    await ana.keyboard.press("Escape");

    // "Novas mensagens" ao voltar para uma conversa com não lidas.
    await ana.click("[data-nav-new]");
    await ana.fill("#nova-sala-nome", "Outra");
    await ana.keyboard.press("Enter");
    await ana.waitForFunction(
        () => document.querySelector(".c-header__title")?.textContent?.trim() === "Outra",
    );
    for (let i = 1; i <= 3; i += 1) await say(bia, `nova ${i} ${RUN}`);
    await ana.waitForSelector('.c-conv:has-text("Histórico") .c-conversation-nav__badge');
    await ana.click('.c-conv:has-text("Histórico")');
    await ana.waitForSelector(".c-new-divider");
    ok(
        await ana.$eval(
            ".c-new-divider",
            (x) => x.nextElementSibling?.textContent?.includes("nova 1") ?? false,
        ),
        "a linha 'Novas mensagens' fica antes da primeira não lida",
    );

    // Rolou para cima: as novas não puxam a tela; aparece o aviso; Esc leva ao fim.
    for (let i = 0; i < 12; i += 1) await say(bia, `enchendo ${i} ${RUN}`);
    await ana.waitForSelector(`.c-message:has-text("enchendo 11 ${RUN}")`);
    await ana.$eval(".c-message-list", (x) => {
        x.scrollTop = 0;
    });
    await ana.waitForTimeout(200);
    await say(bia, `durante a rolagem ${RUN}`);
    await ana.waitForSelector(".c-jump-bar:not([hidden])");
    ok(
        await ana.$eval(".c-message-list", (x) => x.scrollTop < 50),
        "a tela não é puxada para baixo",
    );
    await ana.focus("#campo-mensagem");
    await ana.keyboard.press("Escape");
    await ana.waitForSelector(".c-jump-bar", { state: "hidden" });
    ok(
        await ana.$eval(
            ".c-message-list",
            (x) => x.scrollHeight - x.scrollTop - x.clientHeight < 80,
        ),
        "Esc no campo leva às mais recentes",
    );

    // Resposta de comando: "Dispensar".
    await say(ana, "/time");
    await ana.waitForSelector(".c-message--notice .c-message__dismiss");
    await ana.click(".c-message--notice .c-message__dismiss");
    await ana.waitForSelector(".c-message--notice", { state: "detached" });
    ok(true, "resposta de comando pode ser dispensada");

    // Mensagem que não foi enviada: "Apagar" (só na sua tela). O quadro
    // desta mensagem é descartado no próprio navegador (o servidor nunca a
    // recebe): no prazo de confirmação ela vira "não enviada".
    await ana.evaluate((marker) => {
        const original = WebSocket.prototype.send;
        WebSocket.prototype.send = function (data) {
            if (String(data).includes(marker)) return undefined;
            return original.call(this, data);
        };
    }, `não vai ${RUN}`);
    await say(ana, `não vai ${RUN}`);
    await ana.waitForSelector(`.c-message[data-delivery="failed"]:has-text("não vai ${RUN}")`, {
        timeout: 20000,
    });
    await ana.click(`.c-message:has-text("não vai ${RUN}") .c-message__retry:has-text("Apagar")`);
    await ana.waitForSelector(`.c-message:has-text("não vai ${RUN}")`, { state: "detached" });
    ok(true, "mensagem não enviada pode ser apagada da tela");
};
