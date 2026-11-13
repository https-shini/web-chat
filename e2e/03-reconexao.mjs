// Queda de rede e volta: mensagens recebidas durante a queda chegam uma vez
// só, a conversa de fundo conta como não lida, troca de conversa durante a
// queda, envio sem rede e ninguém vê "saiu"/"entrou" por causa da queda.
export default async ({
    open,
    enter,
    createRoom,
    say,
    openConversation,
    user,
    ok,
    RUN,
    network,
}) => {
    const ana = await open();
    await enter(ana, "Ana Souza", user("ana"));
    const hashA = await createRoom(ana, "Alfa");
    const bia = await open({ hash: hashA });
    await enter(bia, "Bia Lima", user("bia"));
    await createRoom(ana, "Beta");
    const hashB = await ana.evaluate(() => location.hash);
    await bia.evaluate((h) => {
        location.hash = h;
    }, hashB);
    await bia.waitForFunction(
        () => document.querySelector(".c-header__title")?.textContent?.trim() === "Beta",
    );
    await openConversation(bia, "Alfa");

    // Queda curta (menos que a janela de 10 s): volta sozinha, sem avisos.
    const notices = () => ana.locator(".c-message--system").count();
    const before = await notices();
    // Texto meio escrito e foco no campo: precisam sobreviver à queda.
    await bia.focus("#campo-mensagem");
    await bia.fill("#campo-mensagem", "meio escrito");
    network.down();
    await bia.waitForSelector('.c-status-pill[data-state="retrying"]', { timeout: 20000 });
    network.up();
    await bia.waitForSelector('.c-connection[data-state="online"]', {
        state: "attached",
        timeout: 15000,
    });
    await ana.waitForSelector('.c-connection[data-state="online"]', {
        state: "attached",
        timeout: 15000,
    });
    await ana.waitForTimeout(500);
    ok(
        (await notices()) === before,
        "queda curta: volta sozinha, sem 'saiu'/'entrou' para os outros",
    );
    ok(
        await bia.evaluate(() => document.activeElement?.id === "campo-mensagem"),
        "depois da reconexão, o foco continua no campo de mensagem",
    );
    ok(
        (await bia.inputValue("#campo-mensagem")) === "meio escrito",
        "e o texto meio escrito continua lá",
    );
    await bia.fill("#campo-mensagem", "");

    // Queda longa: a rede cai para TODOS (proxy): conexões derrubadas de verdade. Ana
    // volta antes; Bia continua fora enquanto Ana fala nas duas salas.
    network.down();
    await bia.waitForSelector('.c-status-pill[data-state="retrying"]', { timeout: 20000 });
    ok(true, "queda detectada: reconectando…");
    await bia.context().setOffline(true);
    network.up();
    await ana.waitForSelector('.c-connection[data-state="online"]', {
        state: "attached",
        timeout: 30000,
    });
    await openConversation(bia, "Beta");
    await openConversation(ana, "Alfa");
    await say(ana, `alfa durante ${RUN}`);
    await openConversation(ana, "Beta");
    await say(ana, `beta durante ${RUN}`);
    await ana.waitForSelector(
        `.c-message[data-delivery="confirmed"]:has-text("beta durante ${RUN}")`,
    );

    // Bia manda sem rede: fica na fila.
    await say(bia, `fila ${RUN}`);
    ok(
        (await bia.getAttribute(`.c-message:has-text("fila ${RUN}")`, "data-delivery")) ===
            "pending",
        "sem rede: enviando…",
    );

    await bia.context().setOffline(false);
    await bia.waitForSelector(`.c-message:has-text("beta durante ${RUN}")`, { timeout: 45000 });
    ok(true, "volta: a conversa aberta recebe o que chegou durante a queda");
    await bia
        .waitForSelector(`.c-message[data-delivery="confirmed"]:has-text("fila ${RUN}")`, {
            timeout: 30000,
        })
        .catch(() => {});
    if (
        (await bia.getAttribute(`.c-message:has-text("fila ${RUN}")`, "data-delivery")) === "failed"
    ) {
        await bia.click(`.c-message:has-text("fila ${RUN}") .c-message__retry`);
        await bia.waitForSelector(`.c-message[data-delivery="confirmed"]:has-text("fila ${RUN}")`, {
            timeout: 30000,
        });
    }
    await ana.waitForSelector(`.c-message:has-text("fila ${RUN}")`, { timeout: 30000 });
    await ana.waitForTimeout(500);
    ok(
        (await ana.locator(`.c-message:has-text("fila ${RUN}")`).count()) === 1,
        "a mensagem da fila chega uma vez só",
    );
    ok(
        (await bia.locator(`.c-message:has-text("fila ${RUN}")`).count()) === 1,
        "e aparece uma vez só para quem enviou",
    );
    const alfa = await bia.$eval(
        '.c-sidebar [data-conversation-id]:has-text("Alfa")',
        (x) => x.getAttribute("aria-label") ?? "",
    );
    ok(alfa.includes("1 não lida"), `conversa de fundo conta o que chegou na queda (${alfa})`);
    await openConversation(bia, "Alfa");
    ok(
        (await bia.locator(`.c-message:has-text("alfa durante ${RUN}")`).count()) === 1,
        "e mostra a mensagem uma vez só",
    );
};
