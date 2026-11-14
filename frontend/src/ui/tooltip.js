// @ts-check

import { must } from "./dom.js";

/**
 * Dicas dos botões de ícone (`[data-tooltip]`). Aparecem no hover e no
 * foco por teclado; somem ao sair, ao rolar e com Escape (1.4.13).
 *
 * São só visuais (`aria-hidden`): o nome acessível do botão já está no
 * `aria-label`, e repeti-lo seria ruído para leitor de tela.
 */
export const createTooltips = () => {
    const tip = /** @type {HTMLElement} */ (must(".c-tooltip"));
    tip.setAttribute("aria-hidden", "true");
    tip.removeAttribute("role");

    /** @type {HTMLElement | null} */
    let owner = null;

    const hide = () => {
        tip.hidden = true;
        owner = null;
    };

    /** @param {HTMLElement} target */
    const show = (target) => {
        const text = target.dataset.tooltip;
        if (!text) return;
        owner = target;
        tip.textContent = text;
        tip.hidden = false;
        const box = target.getBoundingClientRect();
        const size = tip.getBoundingClientRect();
        const gap = 8;
        let top = box.top - size.height - gap;
        if (top < gap) top = box.bottom + gap;
        const left = Math.min(
            Math.max(gap, box.left + box.width / 2 - size.width / 2),
            window.innerWidth - size.width - gap,
        );
        tip.style.top = `${Math.round(top)}px`;
        tip.style.left = `${Math.round(left)}px`;
    };

    /** @param {EventTarget | null} target */
    const host = (target) =>
        target instanceof Element
            ? /** @type {HTMLElement | null} */ (target.closest("[data-tooltip]"))
            : null;

    const canHover = window.matchMedia("(hover: hover)");

    document.addEventListener("pointerover", (event) => {
        if (event.pointerType !== "mouse" || !canHover.matches) return;
        const target = host(event.target);
        if (target && target !== owner) show(target);
    });
    document.addEventListener("pointerout", (event) => {
        const target = host(event.target);
        if (
            target &&
            target === owner &&
            !target.contains(/** @type {Node} */ (event.relatedTarget))
        )
            hide();
    });
    document.addEventListener("focusin", (event) => {
        const target = host(event.target);
        if (target && target.matches(":focus-visible")) show(target);
        else hide();
    });
    document.addEventListener("focusout", hide);
    document.addEventListener("click", hide);
    document.addEventListener("scroll", hide, true);
    // Captura: com a dica aberta, o primeiro Escape só a dispensa (1.4.13),
    // sem mover o foco. Exceção: dentro de uma gaveta aberta (modal), o
    // Escape é da gaveta — ela fecha e a dica some junto, como num diálogo.
    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape" && !tip.hidden) {
                hide();
                if (document.querySelector("[data-scrim]:not([hidden])")) return;
                event.preventDefault();
            }
        },
        true,
    );

    return { hide };
};
