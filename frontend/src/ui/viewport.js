// @ts-check

/**
 * Altura útil da janela com o teclado virtual aberto.
 *
 * Onde o navegador entende `interactive-widget=resizes-content` (meta
 * viewport), a página já encolhe quando o teclado abre e `100dvh` basta.
 * Onde não entende (Safari no iOS), o teclado cobre a página: aqui a altura
 * visível (`visualViewport`) vira `--app-height` na casca, e o campo de
 * mensagem continua acima do teclado. Nenhum painel fecha por isso.
 *
 * @param {HTMLElement} shell
 */
export const trackViewport = (shell) => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const apply = () => {
        frame = 0;
        // Só quando a área visível é menor que a janela (teclado aberto).
        const covered = window.innerHeight - viewport.height > 1;
        if (covered) shell.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
        else shell.style.removeProperty("--app-height");
    };
    const schedule = () => {
        if (!frame) frame = requestAnimationFrame(apply);
    };
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    apply();
};
