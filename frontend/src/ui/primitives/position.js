// @ts-check

import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";

/**
 * Posição de elementos flutuantes (menus, cartões, sugestões) com o
 * `@floating-ui/dom` — a mesma biblioteca que o Fluxer usa por baixo dos
 * menus dele (aqui, o núcleo sem React; licença MIT).
 *
 * O elemento flutuante usa `position: fixed` (classe do componente) e só
 * recebe `left`, `top` e `max-height` pelo CSSOM — nada de estilo inline no
 * HTML, então a CSP não precisa de `unsafe-inline`.
 *
 * Acompanha rolagem e mudança de tamanho sem fechar: abrir o teclado virtual
 * do celular não derruba mais um menu aberto.
 */

/**
 * Âncora num ponto da tela (clique direito, toque longo).
 * @param {number} x
 * @param {number} y
 */
export const pointAnchor = (x, y) => ({
    getBoundingClientRect: () => ({
        x,
        y,
        top: y,
        left: x,
        right: x,
        bottom: y,
        width: 0,
        height: 0,
    }),
});

/**
 * Prende `floating` a `reference` e o mantém no lugar até a limpeza.
 * @param {Element | ReturnType<typeof pointAnchor>} reference
 * @param {HTMLElement} floating
 * @param {{placement?: import("@floating-ui/dom").Placement, gap?: number, minHeight?: number}} [options]
 * @returns {() => void} para de acompanhar
 */
export const anchorTo = (
    reference,
    floating,
    { placement = "bottom-start", gap = 6, minHeight = 120 } = {},
) => {
    const update = () => {
        void computePosition(reference, floating, {
            placement,
            strategy: "fixed",
            middleware: [
                offset(gap),
                flip({ padding: 8 }),
                shift({ padding: 8 }),
                size({
                    padding: 8,
                    apply({ availableHeight }) {
                        floating.style.maxHeight = `${Math.max(minHeight, Math.floor(availableHeight))}px`;
                    },
                }),
            ],
        }).then(({ x, y }) => {
            floating.style.left = `${Math.round(x)}px`;
            floating.style.top = `${Math.round(y)}px`;
        });
    };
    if (reference instanceof Element) return autoUpdate(reference, floating, update);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
};
