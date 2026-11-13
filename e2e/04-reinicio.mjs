// Servidor reiniciado: nada sobrevive (por desenho). A pessoa vai ao início
// com o motivo, sem conversa vazia e sem sala criada sozinha.
export default async ({ open, enter, createRoom, say, user, ok, RUN, restartBackend }) => {
    const ana = await open();
    await enter(ana, "Ana Souza", user("ana"));
    await createRoom(ana, "Efêmera");
    await say(ana, `antes ${RUN}`);
    await ana.waitForSelector(`.c-message[data-delivery="confirmed"]:has-text("antes ${RUN}")`);
    await restartBackend();
    await ana.waitForSelector('.c-app[data-screen="home"]', { timeout: 45000 });
    await ana.waitForFunction(
        () => (document.querySelector(".c-home__feedback")?.textContent ?? "").trim().length > 0,
        null,
        { timeout: 30000 },
    );
    ok(true, "depois do reinício: início, com o motivo");
    ok((await ana.evaluate(() => location.hash)) === "", "sem link velho no endereço");
    ok(
        (await ana.locator(".c-sidebar [data-conversation-id]").count()) === 0,
        "nenhuma conversa velha na lista",
    );
    await createRoom(ana, "Nova");
    await say(ana, `depois ${RUN}`);
    await ana.waitForSelector(`.c-message[data-delivery="confirmed"]:has-text("depois ${RUN}")`);
    ok(
        (await ana.locator(`.c-message:has-text("antes ${RUN}")`).count()) === 0,
        "a conversa de antes não volta",
    );
};
