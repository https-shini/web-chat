// @ts-check

import { must } from "./dom.js";

/**
 * Estado vazio da sala. Tela própria, não improviso: aparece quando a
 * conexão está de pé e ainda não há nenhuma mensagem.
 */
export const createEmpty = () => {
    const root = /** @type {HTMLElement} */ (must(".c-empty"));

    return {
        /**
         * @param {boolean} visible
         */
        render(visible) {
            root.hidden = !visible;
        },
    };
};
