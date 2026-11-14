// Campo de mensagem: várias linhas (Shift+Enter), formatação na seleção,
// contador perto do limite, aviso de silêncio e acessibilidade.
export default async ({ open, enter, createRoom, user, ok, axe, RUN }) => {
    const ana = await open();
    await enter(ana, "Ana Souza", user("ana"));
    const hash = await createRoom(ana, "Campo");
    const bia = await open({ hash });
    const biaUser = user("bia");
    await enter(bia, "Bia Lima", biaUser);

    ok(
        await ana.evaluate(() => document.querySelector("#campo-mensagem")?.tagName === "TEXTAREA"),
        "o campo é uma área de texto de várias linhas",
    );
    ok((await axe(ana)).length === 0, "campo de mensagem sem violações sérias");

    // Shift+Enter quebra a linha; Enter envia; a quebra chega aos outros.
    await ana.click("#campo-mensagem");
    await ana.keyboard.type(`linha um ${RUN}`);
    await ana.keyboard.press("Shift+Enter");
    await ana.keyboard.type("linha dois");
    const before = await ana.$eval("#campo-mensagem", (x) => x.getBoundingClientRect().height);
    await ana.keyboard.press("Shift+Enter");
    await ana.keyboard.type("linha três");
    const after = await ana.$eval("#campo-mensagem", (x) => x.getBoundingClientRect().height);
    ok(after > before, "o campo cresce com o texto");
    await ana.keyboard.press("Enter");
    await bia.waitForSelector(`.c-message:has-text("linha um ${RUN}")`);
    const received = await bia.$eval(
        `.c-message:has-text("linha um ${RUN}") .c-message__text`,
        // innerText: o texto como aparece na tela (cada quebra é um <br>).
        (x) => /** @type {HTMLElement} */ (x).innerText.replace(/\s*✓?$/, "").trim(),
    );
    ok(
        received === `linha um ${RUN}\nlinha dois\nlinha três`,
        "a mensagem chega com as quebras de linha",
    );
    ok((await ana.inputValue("#campo-mensagem")) === "", "o campo esvazia depois do envio");
    const reset = await ana.$eval("#campo-mensagem", (x) => x.getBoundingClientRect().height);
    ok(reset <= before, "e volta a uma linha");

    // Ctrl+B envolve a seleção.
    await ana.fill("#campo-mensagem", "diga oi");
    await ana.$eval("#campo-mensagem", (x) => x.setSelectionRange(5, 7));
    await ana.keyboard.press("Control+b");
    ok(
        (await ana.inputValue("#campo-mensagem")) === "diga **oi**",
        "Ctrl+B põe a seleção em negrito",
    );
    await ana.click('[data-composer-format="code"]');
    ok(
        (await ana.inputValue("#campo-mensagem")) === "diga **`oi`**",
        "o botão Código envolve a seleção",
    );
    await ana.fill("#campo-mensagem", "");

    // Contador só perto do limite.
    ok(await ana.isHidden(".c-composer__count"), "sem contador em mensagem curta");
    await ana.fill("#campo-mensagem", "x".repeat(850));
    ok(
        (await ana.textContent(".c-composer__count"))?.trim() === "850 / 1000",
        "contador a partir de 800",
    );
    await ana.fill("#campo-mensagem", "");

    // Botão Comandos com o campo vazio abre as sugestões.
    await ana.click('[data-composer-tool="commands"]');
    await ana.waitForSelector(".c-command-suggestions:not([hidden]) [role='option']");
    ok(true, "o botão Comandos abre as sugestões");
    await ana.keyboard.press("Escape");
    await ana.fill("#campo-mensagem", "");

    // Silenciada: o aviso aparece no campo e some quando o silêncio acaba.
    await ana.fill("#campo-mensagem", `/mute @${biaUser} 1`);
    await ana.keyboard.press("Enter");
    // O comando vale quando o aviso dele chega à sala (outra conexão).
    await bia.waitForSelector('.c-message:has-text("foi silenciado por")');
    await bia.fill("#campo-mensagem", `calada ${RUN}`);
    await bia.keyboard.press("Enter");
    await bia.waitForSelector('.c-composer__notice[data-kind="muted"]:not(:empty)');
    ok(true, "silenciada: o aviso aparece no campo");
    await ana.fill("#campo-mensagem", `/unmute @${biaUser}`);
    await ana.keyboard.press("Enter");
    await bia.waitForSelector('.c-message:has-text("pode voltar a enviar mensagens")');
    await bia.fill("#campo-mensagem", `liberada ${RUN}`);
    await bia.keyboard.press("Enter");
    await ana.waitForSelector(`.c-message:has-text("liberada ${RUN}")`);
    await bia.waitForFunction(
        () => (document.querySelector(".c-composer__notice")?.textContent ?? "").trim() === "",
    );
    ok(true, "liberada: o aviso some com a primeira mensagem aceita");
};
