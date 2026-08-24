// @ts-check

import { format, strings } from "../i18n/strings.js";
import { must } from "./dom.js";

/**
 * Falha definitiva de conexão: o teto de tentativas estourou. O histórico
 * continua legível acima; esta tela diz o que aconteceu e oferece o caminho
 * manual de volta, alcançável por teclado.
 */

/**
 * @param {{onRetry: () => void}} handlers
 */
export const createFailure = ({ onRetry }) => {
    const root = /** @type {HTMLElement} */ (must(".c-failure"));
    const body = /** @type {HTMLElement} */ (must(".c-failure__body"));
    const retry = /** @type {HTMLButtonElement} */ (must(".c-failure__retry"));

    retry.addEventListener("click", onRetry);

    return {
        /**
         * @param {boolean} visible
         * @param {number} attempts
         */
        render(visible, attempts) {
            const wasHidden = root.hidden;
            root.hidden = !visible;
            body.textContent = format(strings.conn.lostBody, { n: attempts });
            // Ao aparecer, o caminho de volta recebe o foco: o usuário não
            // precisa caçar o botão que resolve o problema que acabou de ler.
            if (visible && wasHidden) retry.focus();
        },
    };
};
