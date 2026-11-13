// Entrada, início, criar sala, convite, mensagens nos dois sentidos,
// não lidas, título da aba, rascunhos e acessibilidade (axe).
export default async ({ open, enter, createRoom, say, openConversation, user, axe, ok, RUN }) => {
    const ana = await open();
    await enter(ana, "Ana Souza", user("ana"));
    ok(await ana.isVisible('.c-app[data-screen="home"]'), "sem convite, entrar leva ao início");
    ok((await axe(ana)).length === 0, "início sem violações sérias de acessibilidade");

    const hashA = await createRoom(ana, "Alfa");
    ok(/^#\/s\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(hashA), "sala criada; o endereço é o convite");

    const bia = await open({ hash: hashA });
    await enter(bia, "Bia Lima", user("bia"));
    ok(await bia.isVisible('.c-app[data-screen="room"]'), "convite leva direto à sala");

    await say(bia, `oi ${RUN}`);
    await ana.waitForSelector(`.c-message:has-text("oi ${RUN}")`);
    await say(ana, `olá ${RUN}`);
    await bia.waitForSelector(`.c-message:has-text("olá ${RUN}")`);
    await ana.waitForSelector(
        `.c-message[data-delivery="confirmed"]:has-text("olá ${RUN}") .c-message__sent`,
    );
    ok(true, "mensagens nos dois sentidos; a sua fica 'enviada' (✓)");
    ok((await axe(ana)).length === 0, "sala com mensagens sem violações sérias");

    // Duas salas: não lidas e título.
    const base = (await ana.title()).replace(/^\(\d+\+?\) /, "");
    await createRoom(ana, "Beta");
    await say(bia, `na Alfa ${RUN}`);
    await ana.waitForFunction(() => document.title.startsWith("(1) "));
    ok(
        (
            await ana.$$eval(".c-sidebar [data-conversation-id]", (xs) =>
                xs.map((x) => x.getAttribute("aria-label") ?? ""),
            )
        ).some((l) => l.startsWith("Alfa") && l.includes("1 não lida")),
        "não lida na sala de fundo, no rótulo acessível e no título",
    );
    await openConversation(ana, "Alfa");
    await ana.waitForFunction((b) => document.title === b, base);
    ok(true, "abrir zera a contagem");

    // Rascunhos não se misturam.
    await ana.fill("#campo-mensagem", "rascunho Alfa");
    await openConversation(ana, "Beta");
    ok((await ana.inputValue("#campo-mensagem")) === "", "outra conversa começa vazia");
    await ana.fill("#campo-mensagem", "rascunho Beta");
    await openConversation(ana, "Alfa");
    ok(
        (await ana.inputValue("#campo-mensagem")) === "rascunho Alfa",
        "cada conversa guarda o seu rascunho",
    );
    await ana.fill("#campo-mensagem", "");

    // Celular: sem rolagem horizontal; gaveta com as conversas.
    const phone = await open({ hash: hashA, viewport: { width: 320, height: 640 } });
    await enter(phone, "Caio Reis", user("caio"));
    ok(
        await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        "320 px sem rolagem horizontal",
    );
    ok((await axe(phone)).length === 0, "celular (320 px) sem violações sérias");
};
