// @ts-check

import { TIMING } from "../config.js";
import { el, must } from "./dom.js";

/**
 * Avisos temporários. Não são a fonte de verdade de nenhum estado — quem
 * diz se a conexão está de pé é o indicador de conexão e o fio, que
 * persistem. O toast só chama atenção para a mudança.
 */
export const createToasts = () => {
    const root = /** @type {HTMLElement} */ (must(".c-toasts"));

    return {
        /**
         * @param {string} text
         * @param {"info" | "error"} [kind]
         */
        show(text, kind = "info") {
            const toast = el("p", {
                class: kind === "error" ? "c-toast c-toast--error" : "c-toast",
                text,
            });
            root.appendChild(toast);
            setTimeout(() => toast.remove(), TIMING.toastLife);
        },
    };
};
