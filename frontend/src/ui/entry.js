// @ts-check

import { LIMITS } from "../config.js";
import { strings } from "../i18n/strings.js";
import { must } from "./dom.js";

/**
 * Tela de entrada. Valida o nome e devolve o controle para o compositor da
 * aplicação; não sabe o que acontece depois.
 */

/**
 * @param {{onSubmit: (name: string) => void}} handlers
 */
export const createEntry = ({ onSubmit }) => {
    const section = /** @type {HTMLElement} */ (must(".c-entry"));
    const form = /** @type {HTMLFormElement} */ (must(".c-entry__form"));
    const input = /** @type {HTMLInputElement} */ (must("#campo-nome"));
    const error = /** @type {HTMLElement} */ (must("#campo-nome-erro"));
    const submit = /** @type {HTMLButtonElement} */ (must('button[type="submit"]', form));

    /**
     * @param {string} message
     */
    const showError = (message) => {
        error.textContent = message;
        input.setAttribute("aria-invalid", "true");
        input.focus();
    };

    const clearError = () => {
        error.textContent = "";
        input.removeAttribute("aria-invalid");
    };

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = input.value.trim().slice(0, LIMITS.nameMaxLength);
        if (!name) {
            showError(strings.entry.nameRequired);
            return;
        }
        clearError();
        submit.dataset.loading = "true";
        submit.textContent = strings.entry.submitting;
        onSubmit(name);
    });

    input.addEventListener("input", clearError);

    return {
        /**
         * @param {boolean} visible
         */
        setVisible(visible) {
            section.hidden = !visible;
        },

        focus() {
            input.focus();
        },
    };
};
