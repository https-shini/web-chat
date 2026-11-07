// @ts-check

import { TIMING } from "../config.js";
import { el, must } from "./dom.js";

/**
 * Avisos temporários, numa região `role="status"` (anunciados a leitores de
 * tela sem interromper). Não são a fonte de verdade de nenhum estado — quem
 * diz se a conexão está de pé é o indicador de conexão, que persiste. O toast só chama atenção para a mudança.
 */
export const createToasts = () => {
    const root = /** @type {HTMLElement} */ (must(".c-toasts"));

    return {
        /**
         * @param {string} text
         * @param {"info" | "error"} [kind]
         * @param {{announce?: boolean}} [options]  false: só visual, porque o
         *   mesmo fato já foi anunciado por outro caminho (ex.: a falha de
         *   entrega, anunciada pela lista de mensagens). Um fato, um anúncio.
         */
        show(text, kind = "info", { announce = true } = {}) {
            const toast = el("p", {
                class: kind === "error" ? "c-toast c-toast--error" : "c-toast",
                text,
            });
            if (!announce) toast.setAttribute("aria-hidden", "true");
            root.appendChild(toast);
            setTimeout(() => toast.remove(), TIMING.toastLife);
        },
    };
};
