// Navegação nova (esquerda): ordem Início/Comandos/conversas/perfil, fixar,
// reordenar pelo teclado, seções recolhíveis com não lidas, filtro, menu da
// conversa, "+", Ctrl K, Alt+setas, páginas Comandos e Perfil, menu "⋯" do
// cabeçalho e a lista como uma única parada de Tab.
export default async ({ open, enter, createRoom, say, user, ok, axe, RUN }) => {
    const ana = await open();
    await enter(ana, "Ana Souza", user("ana"));
    const hashAlfa = await createRoom(ana, "Alfa");
    await createRoom(ana, "Beta");
    await createRoom(ana, "Gama");

    const bia = await open({ hash: hashAlfa });
    await enter(bia, "Bia Lima", user("bia"));

    /** Rótulos visíveis de uma seção, na ordem da tela. */
    const sectionNames = (id) =>
        ana.$$eval(`.c-nav-group__list[data-section="${id}"] .c-conv__name`, (xs) =>
            xs.map((x) => x.textContent?.trim() ?? ""),
        );

    // Ordem da navegação: Início e Comandos antes das conversas; perfil no pé.
    const order = await ana.evaluate(() => {
        const nav = document.querySelector(".c-sidebar");
        const pos = (sel) => nav?.querySelector(sel)?.getBoundingClientRect().top ?? Number.NaN;
        return {
            home: pos("[data-go-home]"),
            commands: pos("[data-go-commands]"),
            list: pos("[data-conversation-tree]"),
            profile: pos(".c-user-panel"),
        };
    });
    ok(
        order.home < order.commands && order.commands < order.list && order.list < order.profile,
        "ordem: Início, Comandos, conversas e o perfil embaixo",
    );
    ok(
        (await sectionNames("rooms")).join(",") === "Gama,Beta,Alfa",
        "conversa nova entra no topo da sua seção",
    );

    // Fixar pelo menu da conversa, só com teclado (Shift+F10).
    await ana.focus('.c-conv:has-text("Beta")');
    await ana.keyboard.press("Shift+F10");
    await ana.waitForSelector('.c-menu[role="menu"]');
    ok(
        await ana.evaluate(() => document.activeElement?.getAttribute("role") === "menuitem"),
        "o menu abre com o foco no primeiro item",
    );
    await ana.keyboard.type("Fix");
    await ana.keyboard.press("Enter");
    await ana.waitForSelector('.c-nav-group__list[data-section="pinned"] .c-conv:has-text("Beta")');
    ok(
        !(await sectionNames("rooms")).includes("Beta"),
        "fixada sai da lista de origem (sem aparecer duas vezes)",
    );
    ok(
        await ana.evaluate(() =>
            (
                document
                    .querySelector('[data-section="pinned"] .c-conv')
                    ?.getAttribute("aria-label") ?? ""
            ).includes("fixada"),
        ),
        "o rótulo acessível diz que está fixada",
    );

    // Reordenar pelo teclado, com a posição anunciada.
    await ana.focus('.c-conv:has-text("Gama")');
    await ana.keyboard.press("Control+Shift+ArrowDown");
    await ana.waitForFunction(() =>
        (document.querySelector("[data-announcer]")?.textContent ?? "").includes("posição 2 de 2"),
    );
    ok((await sectionNames("rooms")).join(",") === "Alfa,Gama", "Ctrl+Shift+↓ move a conversa");

    // Seção recolhida mostra o total de não lidas.
    await ana.focus('[data-section-toggle="rooms"]');
    await ana.keyboard.press("ArrowLeft");
    await ana.waitForSelector('.c-nav-group__list[data-section="rooms"]', { state: "hidden" });
    await say(bia, `oi alfa ${RUN}`);
    await ana.waitForSelector('[data-section-toggle="rooms"] .c-nav-group__badge');
    ok(
        (await ana.textContent('[data-section-toggle="rooms"] .c-nav-group__badge'))?.trim() ===
            "1",
        "seção recolhida mostra 1 não lida",
    );
    await ana.keyboard.press("ArrowRight");
    await ana.waitForSelector('.c-nav-group__list[data-section="rooms"]');

    // Filtro "Não lidas".
    await ana.click('[data-nav-filter="unread"]');
    await ana
        .waitForFunction(
            () => !document.querySelector('.c-sidebar .c-conv[aria-label^="Beta"]'),
            null,
            { timeout: 3000 },
        )
        .catch(() => {});
    const unreadOnly = await ana.$$eval(".c-sidebar .c-conv__name", (xs) =>
        xs.map((x) => x.textContent?.trim()),
    );
    ok(
        unreadOnly.includes("Alfa") && !unreadOnly.includes("Beta"),
        `filtro mostra só as não lidas (e a aberta): ${unreadOnly.join(", ")}`,
    );
    await ana.click('[data-nav-filter="all"]');

    // A lista é uma parada de Tab: entra uma vez, sai na próxima.
    await ana.focus("[data-go-commands]");
    await ana.keyboard.press("Tab");
    await ana.keyboard.press("Tab");
    await ana.keyboard.press("Tab");
    const inTree = await ana.evaluate(
        () =>
            document.querySelector("[data-conversation-tree]")?.contains(document.activeElement) ??
            false,
    );
    await ana.keyboard.press("Tab");
    const leftTree = await ana.evaluate(
        () =>
            !(
                document
                    .querySelector("[data-conversation-tree]")
                    ?.contains(document.activeElement) ?? true
            ),
    );
    ok(inTree && leftTree, "a lista de conversas é uma única parada de Tab");

    // Ctrl K: ir para conversa pelo nome.
    await ana.focus("#campo-mensagem");
    await ana.keyboard.press("Control+k");
    await ana.waitForSelector(".c-quick[open]");
    ok((await axe(ana)).length === 0, "Ir para conversa sem violações sérias");
    await ana.keyboard.type("alf");
    await ana.keyboard.press("Enter");
    await ana.waitForFunction(
        () => document.querySelector(".c-header__title")?.textContent?.trim() === "Alfa",
    );
    ok(true, "Ctrl K abre a conversa escolhida");

    // Alt+↓: próxima conversa na ordem da tela (Fixadas → Salas → Privadas).
    await ana.keyboard.press("Alt+ArrowDown");
    await ana.waitForFunction(
        () => document.querySelector(".c-header__title")?.textContent?.trim() === "Gama",
    );
    ok(true, "Alt+↓ vai para a conversa seguinte");

    // "+": nova sala sem ir ao início.
    await ana.click("[data-nav-new]");
    await ana.fill("#nova-sala-nome", "Delta");
    await ana.keyboard.press("Enter");
    await ana.waitForFunction(
        () => document.querySelector(".c-header__title")?.textContent?.trim() === "Delta",
    );
    ok(true, "o + cria e abre uma sala sem passar pelo início");

    // Menu "⋯" do cabeçalho: limpar a minha tela.
    await say(ana, `para limpar ${RUN}`);
    await ana.waitForSelector(`.c-message:has-text("para limpar ${RUN}")`);
    await ana.click("[data-conversation-menu]");
    await ana.click('.c-menu__item:has-text("Limpar minha tela")');
    await ana.waitForSelector(`.c-message:has-text("para limpar ${RUN}")`, { state: "detached" });
    ok(true, "menu do cabeçalho: limpar minha tela");

    // Página Comandos: catálogo do servidor e "Usar".
    await ana.click("[data-go-commands]");
    await ana.waitForSelector('[data-page="commands"]:not([hidden]) .c-command-card');
    ok(
        (await ana.$$('[data-page="commands"] .c-command-card')).length > 10,
        "página Comandos mostra o catálogo",
    );
    ok((await axe(ana)).length === 0, "página Comandos sem violações sérias");
    await ana.fill("#comandos-busca", "dado");
    await ana.click('.c-command-card:has-text("/roll") button:has-text("Usar")');
    await ana.waitForSelector('.c-app[data-screen="room"]');
    ok((await ana.inputValue("#campo-mensagem")) === "/roll ", "Usar põe o comando no campo");

    // Menu do perfil: ficar ausente (comando real /afk).
    await ana.click("[data-profile-menu]");
    await ana.click('.c-menu__item:has-text("Ausente") >> nth=0');
    await ana.waitForFunction(() =>
        (document.querySelector(".c-user-panel__status")?.textContent ?? "").includes("Ausente"),
    );
    ok(true, "menu do perfil: ausente");

    // Página Perfil.
    await ana.click("[data-go-profile]");
    await ana.waitForSelector('[data-page="profile"]:not([hidden])');
    ok(
        (await ana.getAttribute(
            '[data-page="profile"] [role="switch"] >> nth=0',
            "aria-checked",
        )) === "true",
        "a página Perfil mostra o status ausente",
    );
    ok((await axe(ana)).length === 0, "página Perfil sem violações sérias");

    // Sair de uma sala pelo menu da conversa.
    await ana.click('.c-conv:has-text("Gama")', { button: "right" });
    await ana.click('.c-menu__item:has-text("Sair da sala")');
    await ana.click(".c-dialog__confirm");
    await ana.waitForSelector('.c-sidebar .c-conv:has-text("Gama")', { state: "detached" });
    ok(true, "sair da sala pelo menu da conversa");
};
