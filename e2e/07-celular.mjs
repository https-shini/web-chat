// Celular: gaveta lateral com foco preso e Escape devolvendo o foco; áreas
// de toque mínimas (WCAG 2.5.8: 24×24 px) nos controles da conversa.
export default async ({ open, enter, createRoom, user, ok, axe }) => {
    const phone = await open({ viewport: { width: 375, height: 740 } });
    await enter(phone, "Dani Rocha", user("dani"));
    await createRoom(phone, "Bolso");

    const menu = '.c-header [data-drawer-open="sidebar"]';
    await phone.focus(menu);
    await phone.keyboard.press("Enter");
    await phone.waitForSelector(".c-sidebar:not([hidden])");
    const inDrawer = () =>
        phone.evaluate(
            () => document.querySelector(".c-sidebar")?.contains(document.activeElement) ?? false,
        );
    ok(await inDrawer(), "abrir a gaveta leva o foco para dentro dela");
    let escaped = false;
    for (let i = 0; i < 25; i += 1) {
        await phone.keyboard.press("Tab");
        if (!(await inDrawer())) {
            escaped = true;
            break;
        }
    }
    ok(!escaped, "Tab circula dentro da gaveta (não sai para a página nem para fora do documento)");
    let escapedBack = false;
    for (let i = 0; i < 25; i += 1) {
        await phone.keyboard.press("Shift+Tab");
        if (!(await inDrawer())) escapedBack = true;
    }
    ok(!escapedBack, "Shift+Tab também circula dentro da gaveta");
    ok(
        await phone.evaluate(() => document.querySelector(".c-skip-link")?.inert === true),
        "o link 'Ir para a conversa' fica inerte com a gaveta aberta",
    );
    ok(
        await phone.evaluate(() => document.querySelector(".c-main")?.inert === true),
        "o conteúdo atrás da gaveta fica inerte (leitor de tela não chega lá)",
    );
    ok((await axe(phone)).length === 0, "gaveta aberta sem violações sérias");
    await phone.keyboard.press("Escape");
    await phone.waitForSelector(".c-sidebar[hidden]", { state: "attached" });
    ok(
        await phone.evaluate(
            () =>
                document.activeElement?.matches('.c-header [data-drawer-open="sidebar"]') ?? false,
        ),
        "Escape fecha a gaveta e devolve o foco ao botão de menu",
    );

    // Áreas de toque: botões visíveis da conversa com pelo menos 24×24 px.
    const small = await phone.$$eval("button:not([hidden])", (buttons) =>
        buttons
            .filter((b) => {
                const r = b.getBoundingClientRect();
                const style = getComputedStyle(b);
                return (
                    r.width > 0 &&
                    r.height > 0 &&
                    style.visibility !== "hidden" &&
                    !b.closest("[hidden]")
                );
            })
            .filter((b) => {
                const r = b.getBoundingClientRect();
                return r.width < 24 || r.height < 24;
            })
            .map(
                (b) =>
                    `${b.getAttribute("aria-label") ?? b.textContent?.trim()} (${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)})`,
            ),
    );
    ok(
        small.length === 0,
        `botões com área de toque ≥ 24×24 px${small.length ? ": " + small.join(", ") : ""}`,
    );
    ok(
        await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        "375 px sem rolagem horizontal",
    );
};
