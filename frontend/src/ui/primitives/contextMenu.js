// @ts-check

import { showMenu } from "./menu.js";

/**
 * Liga o menu de contexto a uma área: clique direito, Shift+F10, a tecla de
 * menu do teclado e o toque longo (celular) abrem o MESMO menu que o botão
 * "⋯" de cada item — como no Fluxer, um menu por entidade.
 *
 * `resolve` recebe o elemento-alvo e diz qual menu abrir (ou `null`, e o
 * menu do navegador continua valendo, por exemplo dentro de um campo).
 *
 * @param {HTMLElement} container
 * @param {{
 *   selector: string,
 *   resolve: (target: HTMLElement) => {items: import("./menuModel.js").MenuItem[], label: string} | null,
 * }} options
 */
export const bindContextMenu = (container, { selector, resolve }) => {
    /** @param {HTMLElement} target @param {{x: number, y: number} | null} point */
    const open = (target, point) => {
        const menu = resolve(target);
        if (!menu || menu.items.length === 0) return false;
        showMenu({
            ...menu,
            point,
            anchor: point ? null : target,
            placement: "bottom-start",
            returnFocus: target,
        });
        return true;
    };

    container.addEventListener("contextmenu", (event) => {
        const target = /** @type {Element | null} */ (event.target);
        // Seleção de texto e campos mantêm o menu do navegador (copiar, colar).
        if (target?.closest("input, textarea, [contenteditable='true'], a[href]")) return;
        if (window.getSelection()?.toString()) return;
        const host = target?.closest(selector);
        if (!(host instanceof HTMLElement) || !container.contains(host)) return;
        if (open(host, { x: event.clientX, y: event.clientY })) event.preventDefault();
    });

    container.addEventListener("keydown", (event) => {
        const isMenuKey = event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
        if (!isMenuKey) return;
        const target = /** @type {Element | null} */ (event.target);
        const host = target?.closest(selector);
        if (!(host instanceof HTMLElement)) return;
        if (open(host, null)) event.preventDefault();
    });

    // Toque longo: 500 ms parado (até 8 px). O clique que vem depois é
    // engolido, para não abrir a conversa ou a pessoa por baixo do menu.
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    let startX = 0;
    let startY = 0;
    let fired = false;
    const cancel = () => {
        if (timer) clearTimeout(timer);
        timer = null;
    };
    container.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "touch") return;
        const target = /** @type {Element | null} */ (event.target);
        if (target?.closest("input, textarea, [contenteditable='true']")) return;
        const host = target?.closest(selector);
        if (!(host instanceof HTMLElement)) return;
        fired = false;
        startX = event.clientX;
        startY = event.clientY;
        cancel();
        timer = setTimeout(() => {
            timer = null;
            fired = open(host, { x: startX, y: startY });
            if (fired) navigator.vibrate?.(10);
        }, 500);
    });
    container.addEventListener("pointermove", (event) => {
        if (timer && Math.hypot(event.clientX - startX, event.clientY - startY) > 8) cancel();
    });
    container.addEventListener("pointerup", cancel);
    container.addEventListener("pointercancel", cancel);
    container.addEventListener(
        "click",
        (event) => {
            if (!fired) return;
            fired = false;
            event.preventDefault();
            event.stopPropagation();
        },
        true,
    );
};
