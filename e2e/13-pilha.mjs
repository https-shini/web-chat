// Celular em pilha de telas (decisão D2): lista → conversa → dados, cada
// uma na tela toda; "Voltar" no cabeçalho e o voltar do navegador/Android
// descem um nível sem sair do chat e sem perder o convite no endereço;
// áreas de toque de 44 px no cabeçalho; 320 a 430 px sem rolagem lateral.
export default async ({ open, enter, createRoom, user, ok, axe }) => {
    for (const width of [320, 375, 430]) {
        const phone = await open({ viewport: { width, height: 760 } });
        await enter(phone, "Dani Rocha", user(`p${width}`));
        const hash = await createRoom(phone, `Pilha ${width}`);
        const visible = (/** @type {string} */ sel) =>
            phone.evaluate((s) => {
                const node = document.querySelector(s);
                return Boolean(node && !node.closest("[hidden]"));
            }, sel);
        const noScroll = () =>
            phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

        ok(await noScroll(), `${width} px: conversa sem rolagem horizontal`);
        const back = '.c-header [data-drawer-open="sidebar"]';
        ok(
            (await phone.getAttribute(back, "aria-label")) === "Voltar para as conversas",
            `${width} px: o botão do cabeçalho é "Voltar para as conversas"`,
        );
        const small = await phone.$$eval(".c-header button", (buttons) =>
            buttons
                .filter((b) => !b.closest("[hidden]") && b.getBoundingClientRect().width > 0)
                .filter((b) => {
                    const r = b.getBoundingClientRect();
                    return r.width < 44 || r.height < 44;
                })
                .map((b) => b.getAttribute("aria-label") ?? ""),
        );
        ok(small.length === 0, `${width} px: botões do cabeçalho com 44 px ${small.join(", ")}`);

        // Voltar do navegador: da conversa para a lista, na tela toda.
        await phone.goBack();
        await phone.waitForSelector(".c-sidebar:not([hidden])");
        const listWidth = await phone.$eval(".c-sidebar", (x) => x.getBoundingClientRect().width);
        ok(Math.abs(listWidth - width) <= 1, `${width} px: a lista ocupa a tela toda`);
        ok(phone.url().endsWith(hash), `${width} px: o endereço continua sendo o convite da sala`);
        if (width === 375) {
            const issues = await axe(phone);
            ok(issues.length === 0, `lista no celular sem violações sérias ${issues.join("; ")}`);
        }

        // Escolher a conversa leva de volta a ela.
        await phone.click(`.c-sidebar >> text=Pilha ${width}`);
        await phone.waitForSelector(".c-sidebar[hidden]", { state: "attached" });
        ok(await visible(".c-composer"), `${width} px: escolher na lista abre a conversa`);

        // Dados da conversa: tela toda; o voltar do navegador fecha.
        await phone.click('.c-header [data-drawer-open="members"]');
        await phone.waitForSelector(".c-members:not([hidden])");
        const infoWidth = await phone.$eval(".c-members", (x) => x.getBoundingClientRect().width);
        ok(Math.abs(infoWidth - width) <= 1, `${width} px: os dados ocupam a tela toda`);
        ok(
            (await phone.getAttribute(".c-members__close", "aria-label")) ===
                "Voltar para a conversa",
            `${width} px: os dados têm "Voltar para a conversa"`,
        );
        ok(await noScroll(), `${width} px: dados sem rolagem horizontal`);
        await phone.goBack();
        await phone.waitForSelector(".c-members[hidden]", { state: "attached" });
        ok(
            !(await visible(".c-sidebar")) && (await visible(".c-composer")),
            `${width} px: voltar nos dados volta para a conversa (não para a lista)`,
        );

        // O "Voltar" da interface e o do navegador andam juntos.
        await phone.click(back);
        await phone.waitForSelector(".c-sidebar:not([hidden])");
        await phone.goForward();
        await phone.waitForSelector(".c-sidebar[hidden]", { state: "attached" });
        ok(true, `${width} px: "Voltar" da interface e avançar do navegador ficam em sincronia`);
        if (width === 320) {
            // O campo cresce (várias linhas): a última mensagem continua à vista,
            // acima do campo, para quem estava lendo o fim.
            for (let i = 1; i <= 12; i += 1) {
                await phone.fill("#campo-mensagem", `linha ${i}`);
                await phone.click(".c-composer__send");
            }
            await phone.waitForSelector('.c-message:has-text("linha 12")');
            await phone.fill("#campo-mensagem", "a\nb\nc\nd\ne");
            await phone.waitForTimeout(300);
            const covered = await phone.evaluate(() => {
                const items = document.querySelectorAll(".c-message");
                const last = items[items.length - 1]?.getBoundingClientRect();
                const field = document.querySelector(".c-composer-area")?.getBoundingClientRect();
                return !last || !field ? true : last.bottom > field.top + 1;
            });
            ok(!covered, "320 px: com o campo crescido, a última mensagem continua à vista");
            await phone.fill("#campo-mensagem", "");
        }
        await phone.close();
    }

    // No computador nada disso se aplica: o voltar do navegador não mexe nos painéis.
    const desk = await open({ viewport: { width: 1280, height: 800 } });
    await enter(desk, "Edu Prado", user("desk"));
    await createRoom(desk, "Mesa");
    ok(
        (await desk.getAttribute('.c-header [data-drawer-open="sidebar"]', "aria-label")) !==
            "Voltar para as conversas",
        "no computador o botão não vira Voltar",
    );
    ok(
        await desk.evaluate(() => history.state === null || !("layer" in (history.state ?? {}))),
        "no computador o histórico não ganha entradas da pilha",
    );
};
