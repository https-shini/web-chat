// Recursos das mensagens (decisões F1 a F7): responder com citação, reagir,
// editar (inclusive com ↑ no campo vazio), apagar a própria e pela moderação,
// fixar e ver no painel, descrição da sala e silêncio com prazo.
export default async ({ open, enter, createRoom, user, ok, axe, RUN }) => {
    const ana = await open({ viewport: { width: 1440, height: 900 } });
    await enter(ana, "Ana Souza", user("ana"));
    const hash = await createRoom(ana, "Recursos");
    const bia = await open({ hash, viewport: { width: 1440, height: 900 } });
    const biaUser = user("bia");
    await enter(bia, "Bia Lima", biaUser);
    /** @param {import("playwright").Page} page @param {string} text */
    const say = async (page, text) => {
        await page.fill("#campo-mensagem", text);
        await page.press("#campo-mensagem", "Enter");
    };
    /** @param {string} text */
    const msg = (text) => `.c-message:has-text("${text}")`;

    await say(bia, `original ${RUN} **forte** ||segredo||`);
    // A resposta cita o texto da original: o seletor exclui quem tem citação.
    const original = `${msg(`original ${RUN}`)}:not(:has(.c-message__reference))`;
    await ana.waitForSelector(original);

    // Reagir pela barra: Bia vê a contagem e soma a dela.
    await ana.hover(original);
    await ana.click(`${original} .c-message-actions [aria-label="Reagir"]`);
    await ana.click('.c-menu__item:has-text("👍")');
    await bia.waitForSelector(`${original} .c-reaction`);
    await bia.click(`${original} .c-reaction`);
    await ana.waitForSelector(`${original} .c-reaction:has-text("2")`);
    ok(
        (await ana.getAttribute(`${original} .c-reaction`, "aria-pressed")) === "true",
        "reação: contagem compartilhada e aria-pressed para quem reagiu",
    );
    await bia.click(`${original} .c-reaction`);
    await ana.waitForSelector(`${original} .c-reaction:has-text("1")`);
    ok(true, "reação: clicar de novo tira a sua");

    // Responder: barra no campo, Esc cancela; depois envia com citação.
    await ana.hover(original);
    await ana.click(`${original} .c-message-actions [aria-label="Responder"]`);
    ok(await ana.isVisible(".c-composer__reply"), "responder abre a barra acima do campo");
    await ana.press("#campo-mensagem", "Escape");
    ok(!(await ana.isVisible(".c-composer__reply")), "Esc cancela a resposta");
    await ana.hover(original);
    await ana.click(`${original} .c-message-actions [aria-label="Responder"]`);
    await say(ana, `resposta ${RUN}`);
    const reply = msg(`resposta ${RUN}`);
    await bia.waitForSelector(`${reply} .c-message__reference`);
    const quoted = (await bia.textContent(`${reply} .c-message__reference`)) ?? "";
    ok(
        quoted.includes(`original ${RUN} forte`) &&
            !quoted.includes("**") &&
            !quoted.includes("segredo"),
        "citação sem marcação e sem revelar o spoiler",
    );
    await bia.click(`${reply} .c-message__reference`);
    await bia.waitForSelector(`${original}.c-message--flash`);
    ok(true, "clicar na citação leva à mensagem original");

    // Editar a última com ↑ no campo vazio.
    await say(ana, `rascunho ${RUN}`);
    await bia.waitForSelector(msg(`rascunho ${RUN}`));
    await ana.press("#campo-mensagem", "ArrowUp");
    await ana.waitForSelector(".c-message__editor-input");
    await ana.fill(".c-message__editor-input", `corrigido ${RUN}`);
    await ana.press(".c-message__editor-input", "Enter");
    await bia.waitForSelector(`${msg(`corrigido ${RUN}`)} .c-message__edited`);
    ok(
        !(await bia.$(msg(`rascunho ${RUN}`))),
        "↑ edita a última mensagem; os outros veem o texto novo e (editada)",
    );

    // Bia não pode editar a de Ana: o menu não oferece.
    await bia.click(msg(`corrigido ${RUN}`), { button: "right" });
    await bia.waitForSelector('.c-menu[role="menu"]');
    const biaLabels = await bia.$$eval(".c-menu .c-menu__item", (xs) =>
        xs.map((x) => x.textContent?.trim() ?? ""),
    );
    ok(
        !biaLabels.some(
            (l) => l.startsWith("Editar") || l.startsWith("Apagar") || l.startsWith("Fixar"),
        ),
        "participante não edita, não apaga e não fixa mensagem alheia",
    );
    await bia.keyboard.press("Escape");

    // Fixar (anfitriã): aparece no painel; clicar leva à mensagem.
    await ana.click(original, { button: "right" });
    await ana.click('.c-menu__item:has-text("Fixar")');
    await bia.waitForSelector('[data-context-block="pins"]:not([hidden]) .c-pin');
    ok(
        ((await bia.textContent(".c-pin__text")) ?? "").includes(`original ${RUN}`),
        "fixada aparece no painel de todos",
    );
    ok(!(await bia.$(".c-pin__remove")), "participante não desafixa");
    await ana.waitForSelector(`${original} .c-message__pinned`);
    const issues = await axe(ana);
    ok(issues.length === 0, `recursos sem violações sérias ${issues.join("; ")}`);

    // Descrição: anfitriã edita; todos veem no topo.
    await ana.click('.c-context__description button:has-text("Adicionar")');
    await ana.fill(".c-context__description-form textarea", `Sobre ${RUN}`);
    await ana.click('.c-context__description-form button:has-text("Salvar")');
    await bia.waitForFunction(
        (text) => document.querySelector("[data-room-topic]")?.textContent?.includes(text),
        `Sobre ${RUN}`,
    );
    ok(
        !(await bia.$('.c-context__description button:has-text("Adicionar")')) &&
            !(await bia.$('.c-context__description button:has-text("Editar")')),
        "descrição: todos veem, só quem modera edita",
    );

    // Apagar a própria (com confirmação).
    await say(bia, `engano ${RUN}`);
    await ana.waitForSelector(msg(`engano ${RUN}`));
    await bia.click(msg(`engano ${RUN}`), { button: "right" });
    await bia.click('.c-menu__item:has-text("Apagar")');
    await bia.click(".c-dialog__confirm");
    await ana.waitForSelector(msg(`engano ${RUN}`), { state: "detached" });
    ok(true, "apagar a própria some para todos");

    // Moderação apaga a de outra pessoa; a fixada sai junto.
    await ana.click(original, { button: "right" });
    await ana.click('.c-menu__item:has-text("Apagar")');
    await ana.click(".c-dialog__confirm");
    await bia.waitForSelector(original, { state: "detached" });
    await bia.waitForSelector('.c-message:has-text("removida pela moderação")');
    await bia.waitForSelector('[data-context-block="pins"][hidden]', { state: "attached" });
    ok(true, "moderação apaga, avisa e tira das fixadas");

    // Silêncio com prazo: o campo diz até quando.
    await ana.focus(`.c-member:has-text("Bia Lima")`);
    await ana.keyboard.press("Shift+F10");
    await ana.click('.c-menu__item:has-text("Silenciar")');
    await ana.waitForSelector(".c-menu--sub");
    await ana.click('.c-menu--sub .c-menu__item:has-text("5 minutos")');
    // O comando vale quando o aviso dele chega à sala (outra conexão).
    await bia.waitForSelector('.c-message:has-text("foi silenciado por")');
    await say(bia, `calada ${RUN}`);
    await bia.waitForSelector('.c-composer__notice[data-kind="muted"]');
    const notice = (await bia.textContent(".c-composer__notice")) ?? "";
    ok(/até as \d{1,2}:\d{2}/.test(notice), `silêncio mostra o prazo: "${notice}"`);
    await bia.waitForTimeout(300);
    ok(!(await ana.$(msg(`calada ${RUN}`))), "mensagem silenciada não chega aos outros");
};
