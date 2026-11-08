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

// Mesmo formato que o servidor aceita (backend/src/validation.js). O servidor
// continua sendo a autoridade: aqui é só para avisar antes de conectar.
const USERNAME_PATTERN = /^(?!.*\.\.)[a-z0-9_](?:[a-z0-9_.]*[a-z0-9_])?$/;

/**
 * Normaliza o username como o servidor: sem @ inicial, aparado, minúsculo.
 * @param {string} value
 * @returns {string}
 */
export const normalizeUsername = (value) => value.trim().replace(/^@/, "").toLowerCase();

/**
 * Formato válido? (Reservados como "admin" só o servidor conhece.)
 * @param {string} username já normalizado
 * @returns {boolean}
 */
export const isUsernameFormatValid = (username) =>
    username.length >= LIMITS.usernameMinLength &&
    username.length <= LIMITS.usernameMaxLength &&
    USERNAME_PATTERN.test(username);

/**
 * @param {{onSubmit: (name: string, username: string) => void}} handlers
 */
export const createEntry = ({ onSubmit }) => {
    const section = /** @type {HTMLElement} */ (must(".c-entry"));
    const form = /** @type {HTMLFormElement} */ (must(".c-entry__form"));
    const nameInput = /** @type {HTMLInputElement} */ (must("#campo-nome"));
    const nameError = /** @type {HTMLElement} */ (must("#campo-nome-erro"));
    const userInput = /** @type {HTMLInputElement} */ (must("#campo-username"));
    const userError = /** @type {HTMLElement} */ (must("#campo-username-erro"));
    const submit = /** @type {HTMLButtonElement} */ (must('button[type="submit"]', form));

    const fields = {
        name: { input: nameInput, error: nameError },
        username: { input: userInput, error: userError },
    };

    /**
     * @param {"name" | "username"} field
     * @param {string} message
     */
    const showError = (field, message) => {
        const { input, error } = fields[field];
        error.textContent = message;
        input.setAttribute("aria-invalid", "true");
        input.focus();
    };

    /** @param {"name" | "username"} field */
    const clearError = (field) => {
        const { input, error } = fields[field];
        error.textContent = "";
        input.removeAttribute("aria-invalid");
    };

    const idle = () => {
        delete submit.dataset.loading;
        submit.textContent = strings.entry.submit;
    };

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = normalizeName(nameInput.value);
        const username = normalizeUsername(userInput.value);
        clearError("name");
        clearError("username");
        // O primeiro campo com problema recebe o foco.
        if (!name) return showError("name", strings.entry.nameRequired);
        if (!username) return showError("username", strings.entry.usernameRequired);
        if (!isUsernameFormatValid(username)) {
            return showError("username", strings.entry.usernameInvalid);
        }
        submit.dataset.loading = "true";
        submit.textContent = strings.entry.submitting;
        onSubmit(name, username);
    });

    nameInput.addEventListener("input", () => clearError("name"));
    userInput.addEventListener("input", () => clearError("username"));

    return {
        /**
         * @param {boolean} visible
         */
        setVisible(visible) {
            section.hidden = !visible;
        },

        focus() {
            nameInput.focus();
        },

        /**
         * Volta ao estado inicial do formulário com um erro, quando o
         * servidor recusa a entrada. Chamar depois que a tela estiver visível.
         * @param {string} message
         * @param {"name" | "username"} [field]
         */
        reset(message, field = "name") {
            idle();
            showError(field, message);
        },

        /**
         * Formulário limpo, para uma entrada nova depois de sair: nada da
         * participação anterior fica nos campos.
         */
        clear() {
            idle();
            form.reset();
            clearError("name");
            clearError("username");
        },
    };
};
