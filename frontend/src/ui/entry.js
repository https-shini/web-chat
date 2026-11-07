// @ts-check

import { LIMITS } from "../config.js";
import { strings } from "../i18n/strings.js";
import { must } from "./dom.js";

/**
 * Tela de entrada. Valida o nome e devolve o controle para o compositor da
 * aplicação; não sabe o que acontece depois.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/**
 * Normaliza o nome com a mesma regra do servidor: caracteres de controle
 * viram espaço, extremidades aparadas, no máximo `LIMITS.nameMaxLength`.
 * Assim um nome que o servidor recusaria é recusado aqui, com a mensagem de
 * validação da própria tela, antes de qualquer conexão.
 * @param {string} value
 * @returns {string}
 */
export const normalizeName = (value) =>
    value.replace(CONTROL_CHARS, " ").trim().slice(0, LIMITS.nameMaxLength);

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
        const name = normalizeName(input.value);
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

        /**
         * Volta ao estado inicial do formulário com um erro, quando o
         * servidor recusa a entrada. Chamar depois que a tela estiver visível.
         * @param {string} message
         */
        reset(message) {
            delete submit.dataset.loading;
            submit.textContent = strings.entry.submit;
            showError(message);
        },
    };
};
