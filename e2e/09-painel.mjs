// Painel de contexto (direita): mesmo esqueleto em sala e privada,
// integrantes com filtro e menu (moderação conforme o papel), ações, e a
// folha sobre a conversa em telas médias.
export default async ({ open, enter, createRoom, user, ok, axe, RUN }) => {
    const ana = await open();
    await enter(ana, "Ana Souza", user("ana"));
    const hash = await createRoom(ana, "Painel");
    const bia = await open({ hash });
    await enter(bia, "Bia Lima", user("bia"));
    const caio = await open({ hash });
    await enter(caio, "Caio Reis", user("caio"));
    await ana.waitForSelector('.c-member:has-text("Caio Reis")');

    ok(
        (await ana.textContent("#pessoas-titulo"))?.trim() === "Dados da sala",
        "sala: o painel é 'Dados da sala'",
    );
    ok(
        (await ana.textContent(".c-context__sub"))?.includes("3 pessoas"),
        "informações: tipo e número de pessoas",
    );
    ok(
        await ana.isVisible('[data-context-action="clear-room"]'),
        "anfitrião vê 'Apagar para todos'",
    );
    ok(
        !(await bia.isVisible('[data-context-action="clear-room"]')),
        "participante não vê 'Apagar para todos'",
    );
    ok((await axe(ana)).length === 0, "painel da sala sem violações sérias");

    // Filtro de integrantes (só no navegador).
    await ana.fill("#filtro-integrantes", "cai");
    await ana.waitForFunction(
        () => document.querySelectorAll(".c-people__list .c-member").length === 1,
    );
    ok(true, "o filtro mostra só quem combina");
    await ana.fill("#filtro-integrantes", "");

    // Menu do integrante pelo teclado: moderação para o anfitrião.
    await ana.focus('.c-member:has-text("Caio Reis")');
    await ana.keyboard.press("Shift+F10");
    await ana.waitForSelector('.c-menu[role="menu"]');
    const labels = await ana.$$eval(".c-menu .c-menu__item", (xs) =>
        xs.map((x) => x.textContent?.trim() ?? ""),
    );
    ok(
        labels.some((l) => l.startsWith("Silenciar")) &&
            labels.some((l) => l.startsWith("Remover")),
        "menu do integrante traz a moderação para o anfitrião",
    );
    // Espera a animação de entrada terminar: o axe mede o contraste da cor
    // computada, e no meio do esmaecimento ela ainda não é a final.
    await ana.waitForTimeout(400);
    const menuIssues = await axe(ana);
    ok(menuIssues.length === 0, `menu do integrante sem violações sérias ${menuIssues.join("; ")}`);
    // Silenciar ▸ 5 minutos: comando real; Caio é recusado ao escrever.
    await ana.click('.c-menu__item:has-text("Silenciar")');
    await ana.waitForSelector(".c-menu--sub");
    await ana.click('.c-menu--sub .c-menu__item:has-text("5 minutos")');
    await caio.fill("#campo-mensagem", `silenciado ${RUN}`);
    await caio.press("#campo-mensagem", "Enter");
    await caio.waitForSelector('.c-toast:has-text("silenciad")');
    ok(true, "silenciar por 5 minutos vale no servidor");

    // Participante não vê moderação no menu.
    await bia.focus('.c-member:has-text("Caio Reis")');
    await bia.keyboard.press("Shift+F10");
    await bia.waitForSelector('.c-menu[role="menu"]');
    const biaLabels = await bia.$$eval(".c-menu .c-menu__item", (xs) =>
        xs.map((x) => x.textContent?.trim() ?? ""),
    );
    ok(!biaLabels.some((l) => l.startsWith("Silenciar")), "participante não vê moderação");
    await bia.keyboard.press("Escape");

    // Privada pelo atalho do integrante: o painel vira "Dados do contato".
    const row = ana.locator(".c-member-row", { hasText: "Bia Lima" });
    await row.hover();
    await row.locator("[data-person-direct]").click();
    await ana.waitForSelector('.c-header [data-room-icon][data-icon="at"]');
    await ana.waitForFunction(
        () => document.querySelector("#pessoas-titulo")?.textContent?.trim() === "Dados do contato",
    );
    ok(await ana.isVisible('[data-conversation-action="block"]'), "privada: o painel tem Bloquear");
    ok(
        !(await ana.isVisible('[data-context-block="members"]')),
        "privada: sem lista de integrantes",
    );
    // Espera a animação de entrada (conversa e painel): o axe mede a cor
    // computada, e no meio do esmaecimento ela ainda não é a final.
    await ana.waitForTimeout(400);
    const dmIssues = await axe(ana);
    ok(dmIssues.length === 0, `painel da privada sem violações sérias ${dmIssues.join("; ")}`);

    // Telas médias: o painel é folha sobre a conversa, com Escape.
    await ana.setViewportSize({ width: 1100, height: 800 });
    await ana.waitForSelector(".c-members", { state: "hidden" });
    await ana.click(".c-header__members");
    await ana.waitForSelector(".c-members:not([hidden])");
    ok(
        await ana.evaluate(
            () => document.querySelector(".c-members")?.contains(document.activeElement) ?? false,
        ),
        "folha: o foco entra no painel",
    );
    await ana.keyboard.press("Escape");
    await ana.waitForSelector(".c-members", { state: "hidden" });
    ok(
        await ana.evaluate(
            () => document.activeElement?.classList.contains("c-header__members") ?? false,
        ),
        "folha: Escape fecha e devolve o foco",
    );
};
