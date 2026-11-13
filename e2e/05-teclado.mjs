// Só teclado: skip link, início, conversa, cartão e diálogo; foco sempre
// visível e devolvido a quem abriu; Escape fecha.
export default async ({ open, user, ok }) => {
    const page = await open();
    const focused = () =>
        page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const style = getComputedStyle(el);
            return {
                tag: el.tagName.toLowerCase(),
                id: el.id,
                cls: el.className?.toString() ?? "",
                label: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? "",
                // Indicador de foco: contorno ou sombra visíveis.
                visible:
                    (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
                    style.boxShadow !== "none",
            };
        });

    await page.keyboard.press("Tab");
    ok((await focused())?.cls.includes("c-skip-link"), "1º Tab: link para pular para a conversa");

    // Entrada só pelo teclado.
    await page.focus("#campo-nome");
    await page.keyboard.type("Teclado Só");
    await page.keyboard.press("Tab");
    await page.keyboard.type(user("tecla"));
    await page.keyboard.press("Enter");
    await page.waitForSelector('.c-app[data-screen="home"]');
    ok(
        (await focused())?.id === "inicio-titulo",
        "início: foco no título (mudança de contexto anunciada)",
    );

    // Do título, Tab percorre o início e chega aos três formulários.
    const reached = new Set();
    for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press("Tab");
        const f = await focused();
        if (!f) continue;
        if (!f.visible) {
            ok(false, `foco sem indicador visível em ${f.tag}#${f.id}.${f.cls}`);
            break;
        }
        if (["inicio-nome-sala", "inicio-codigo", "inicio-arroba"].includes(f.id))
            reached.add(f.id);
        if (reached.size === 3) break;
    }
    ok(
        reached.size === 3,
        `os três caminhos do início são alcançáveis por Tab (${[...reached].join(", ")})`,
    );

    // Cria a sala pelo teclado.
    await page.focus("#inicio-nome-sala");
    await page.keyboard.type("Teclado");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
        () => document.querySelector(".c-header__title")?.textContent?.trim() === "Teclado",
    );
    ok((await focused())?.id === "campo-mensagem", "sala aberta: foco no campo de mensagem");

    // Cartão da pessoa: abre pelo teclado, Escape fecha e devolve o foco.
    await page.focus('.c-member button, .c-member[role="button"], .c-member');
    const opener = await focused();
    await page.keyboard.press("Enter");
    await page.waitForSelector(".c-member-card:not([hidden])");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".c-member-card[hidden]", { state: "attached" });
    const back = await focused();
    ok(
        back !== null && back.label === opener?.label,
        "cartão: Escape fecha e o foco volta para a pessoa",
    );

    // Diálogo de sair da sala: foco preso no diálogo, Escape cancela.
    await page.focus('[data-conversation-action="leave"]');
    await page.keyboard.press("Enter");
    await page.waitForSelector(".c-dialog[open]");
    const inDialog = await page.evaluate(() =>
        document.querySelector(".c-dialog")?.contains(document.activeElement),
    );
    ok(inDialog === true, "diálogo: o foco entra no diálogo");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".c-dialog:not([open])", { state: "attached" });
    ok(
        (await focused())?.label.includes("Sair da sala"),
        "diálogo: Escape cancela e devolve o foco ao botão",
    );
    ok(await page.isVisible('.c-app[data-screen="room"]'), "cancelar não sai da sala");

    // Conversas na barra lateral são botões alcançáveis e nomeados.
    const items = await page.$$eval(".c-sidebar [data-conversation-id]", (xs) =>
        xs.map((x) => ({
            tag: x.tagName.toLowerCase(),
            label: x.getAttribute("aria-label") ?? "",
        })),
    );
    ok(
        items.length === 1 && items[0].tag === "button" && items[0].label.startsWith("Teclado"),
        "itens da lista são botões com nome acessível",
    );
};
