// Conversa privada pelo @ exato e pelo cartão, isolamento de terceiros,
// encerrar, bloquear e recusa ao reabrir.
export default async ({
    open,
    enter,
    createRoom,
    say,
    openConversation,
    user,
    axe,
    ok,
    RUN,
    framesOf,
}) => {
    const anaUser = user("ana");
    const biaUser = user("bia");
    const ana = await open();
    await enter(ana, "Ana Souza", anaUser);
    const hash = await createRoom(ana, "Sala");
    const bia = await open({ hash });
    await enter(bia, "Bia Lima", biaUser);
    const caio = await open({ hash });
    await enter(caio, "Caio Reis", user("caio"));

    // Pelo cartão da pessoa.
    await ana.click('.c-member:has-text("Bia Lima")');
    await ana.click('.c-member-card__action:has-text("Conversa privada")');
    await ana.waitForSelector('.c-header [data-room-icon][data-icon="at"]');
    ok((await ana.textContent(".c-header__title")).trim() === "Bia Lima", "cartão abre a privada");
    await say(ana, `segredo ${RUN}`);
    await bia.waitForSelector('.c-sidebar [data-conversation-id]:has-text("Ana Souza")');
    await openConversation(bia, "Ana Souza");
    await bia.waitForSelector(`.c-message:has-text("segredo ${RUN}")`);
    await say(bia, `resposta ${RUN}`);
    await ana.waitForSelector(`.c-message:has-text("resposta ${RUN}")`);
    ok(true, "privada nos dois sentidos");
    ok((await axe(ana)).length === 0, "privada sem violações sérias");

    // Pelo início, com o @ exato: reabre a mesma (não duplica).
    await ana.click("[data-go-home]");
    await ana.fill("#inicio-arroba", `@${biaUser.toUpperCase()}`);
    await ana.click('[data-home-form="dm"] button[type=submit]');
    await ana.waitForSelector('.c-header [data-room-icon][data-icon="at"]');
    const dms = await ana.$$eval(
        ".c-sidebar [data-conversation-id]",
        (xs) => xs.filter((x) => (x.getAttribute("aria-label") ?? "").includes("@")).length,
    );
    ok(dms === 1, "@ exato pelo início reabre a mesma conversa");

    // Isolamento.
    await caio.waitForTimeout(300);
    ok(
        !framesOf(caio).some((f) => f.includes("segredo")),
        "terceiro na mesma sala não recebe nenhum quadro da privada",
    );
    // Bloqueio: Bia bloqueia; Ana vê só "encerrou" e não reabre.
    await bia.click('[data-conversation-action="block"]');
    await bia.click(".c-dialog__confirm");
    await ana.waitForSelector('.c-toast:has-text("encerrou a conversa privada")');
    await ana.click("[data-go-home]");
    await ana.fill("#inicio-arroba", biaUser);
    await ana.click('[data-home-form="dm"] button[type=submit]');
    await ana.waitForFunction(() => {
        const text = document.querySelector(".c-home__feedback")?.textContent ?? "";
        return text.length > 0 && !text.includes("instante");
    });
    ok(
        await ana.isVisible('.c-app[data-screen="home"]'),
        "bloqueada: reabrir é recusado, sem revelar o bloqueio",
    );
};
