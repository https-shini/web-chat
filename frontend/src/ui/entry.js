// @ts-check

import { LIMITS } from "../config.js";
import { format, strings } from "../i18n/strings.js";
import { must } from "./dom.js";

/**
 * Tela de entrada: nome completo + nome de usuário, e o progresso até o
 * servidor aceitar. Não fala com a rede: devolve o pedido ao compositor da
 * aplicação (main.js) e recebe de volta o estado da conexão.
 *
 * As regras de texto ficam em funções puras exportadas (testadas sem DOM).
 */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/**
 * Normaliza o nome com a mesma regra do servidor: caracteres de controle
 * viram espaço, extremidades aparadas, no máximo `LIMITS.nameMaxLength`.
 * @param {string} value
 * @returns {string}
 */
export const normalizeName = (value) =>
    value.replace(CONTROL_CHARS, " ").trim().slice(0, LIMITS.nameMaxLength);

// Mesmo formato que o servidor aceita (backend/src/validation.js). O servidor
// continua sendo a autoridade: aqui é só para orientar antes de conectar.
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
 * Sugestão de username a partir do nome completo: primeiro e último nome,
 * sem acento, separados por ponto ("Ana Carolina Souza" → "ana.souza").
 * Devolve "" quando não dá para sugerir algo válido.
 * @param {string} name
 * @returns {string}
 */
export const suggestUsername = (name) => {
    const words = name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(/[^a-z0-9]/g, ""))
        .filter(Boolean);
    if (words.length === 0) return "";
    const first = words[0] ?? "";
    const last = words.length > 1 ? (words[words.length - 1] ?? "") : "";
    let candidate = last ? `${first}.${last}` : first;
    if (candidate.length > LIMITS.usernameMaxLength) {
        // Encurta o primeiro nome antes de abrir mão do sobrenome.
        const room = LIMITS.usernameMaxLength - last.length - 1;
        candidate = last && room >= 1 ? `${first.slice(0, room)}.${last}` : first;
        candidate = candidate.slice(0, LIMITS.usernameMaxLength).replace(/\.$/, "");
    }
    return isUsernameFormatValid(candidate) ? candidate : "";
};

/**
 * Orientação ao vivo para o campo de username.
 * @param {string} raw  o que está no campo
 * @param {{suggested?: boolean, touched?: boolean}} [context]
 *   suggested: o valor veio da sugestão; touched: a pessoa já saiu do campo
 * @returns {{state: "neutral" | "valid" | "invalid", message: string}}
 */
export const describeUsername = (raw, { suggested = false, touched = false } = {}) => {
    const username = normalizeUsername(raw);
    if (!username) return { state: "neutral", message: strings.entry.usernameHint };
    if (/[^a-z0-9_.]/.test(username)) {
        return { state: "invalid", message: strings.entry.usernameChars };
    }
    if (/^\.|\.$|\.\./.test(username)) {
        return { state: "invalid", message: strings.entry.usernameDots };
    }
    if (username.length > LIMITS.usernameMaxLength) {
        return { state: "invalid", message: strings.entry.usernameTooLong };
    }
    if (username.length < LIMITS.usernameMinLength) {
        // Curto demais só é erro quando a pessoa terminou de digitar.
        return touched
            ? { state: "invalid", message: strings.entry.usernameTooShort }
            : { state: "neutral", message: strings.entry.usernameHint };
    }
    return {
        state: "valid",
        message: suggested ? strings.entry.usernameSuggested : strings.entry.usernameValid,
    };
};

/** Depois de quanto tempo sem confirmação a espera ganha explicação. */
const SLOW_AFTER_MS = 3000;

/**
 * @param {{
 *   onSubmit: (name: string, username: string) => void,
 *   onCancel: () => void,
 *   onRetry: () => void,
 * }} handlers
 */
export const createEntry = ({ onSubmit, onCancel, onRetry }) => {
    const section = /** @type {HTMLElement} */ (must(".c-entry"));
    const form = /** @type {HTMLFormElement} */ (must(".c-entry__form"));
    const nameInput = /** @type {HTMLInputElement} */ (must("#campo-nome"));
    const nameError = /** @type {HTMLElement} */ (must("#campo-nome-erro"));
    const userInput = /** @type {HTMLInputElement} */ (must("#campo-username"));
    const userHint = /** @type {HTMLElement} */ (must("#campo-username-ajuda"));
    const userError = /** @type {HTMLElement} */ (must("#campo-username-erro"));
    const submit = /** @type {HTMLButtonElement} */ (must(".c-entry__submit", form));
    const submitLabel = /** @type {HTMLElement} */ (must(".c-entry__submit-label", submit));
    const spinner = /** @type {HTMLElement} */ (must(".c-spinner", submit));
    const status = /** @type {HTMLElement} */ (must(".c-entry__status", form));
    const statusTitle = /** @type {HTMLElement} */ (must(".c-entry__status-title", status));
    const statusBody = /** @type {HTMLElement} */ (must(".c-entry__status-body", status));
    const retry = /** @type {HTMLButtonElement} */ (must(".c-entry__retry", status));
    const cancel = /** @type {HTMLButtonElement} */ (must(".c-entry__cancel", status));

    /** A pessoa escreveu o username (a sugestão não o sobrescreve mais). */
    let userEdited = false;
    let userTouched = false;
    let joining = false;
    let startedAt = 0;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let slowTimer = null;
    /** Último estado do enlace recebido, para o aviso de lentidão. */
    let lastProgress = { link: "idle", attempt: 0 };

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
        // Com erro do envio, a orientação ao vivo sai de cena: a mesma
        // informação não aparece (nem é lida) duas vezes.
        if (field === "username") userHint.hidden = true;
        input.focus();
    };

    /** @param {"name" | "username"} field */
    const clearError = (field) => {
        const { input, error } = fields[field];
        error.textContent = "";
        input.removeAttribute("aria-invalid");
        if (field === "username") userHint.hidden = false;
    };

    const paintHint = () => {
        const { state, message } = describeUsername(userInput.value, {
            suggested: !userEdited,
            touched: userTouched,
        });
        userHint.dataset.state = state;
        userHint.textContent = message;
    };

    const hideStatus = () => {
        status.hidden = true;
        delete status.dataset.tone;
        retry.hidden = true;
    };

    const stopSlowTimer = () => {
        if (slowTimer !== null) clearTimeout(slowTimer);
        slowTimer = null;
    };

    /** Botão no estado normal (sem carregamento). */
    const idle = () => {
        joining = false;
        stopSlowTimer();
        delete submit.dataset.loading;
        submit.removeAttribute("aria-disabled");
        spinner.hidden = true;
        submitLabel.textContent = strings.entry.submit;
    };

    /**
     * Mostra o painel de progresso.
     * @param {{title: string, body?: string, tone?: "wait" | "error", canRetry?: boolean}} content
     */
    const showStatus = ({ title, body = "", tone = "wait", canRetry = false }) => {
        statusTitle.textContent = title;
        statusBody.textContent = body;
        status.dataset.tone = tone;
        retry.hidden = !canRetry;
        status.hidden = false;
    };

    /** Pinta o progresso a partir do estado do enlace enquanto espera. */
    const paintProgress = () => {
        if (!joining) return;
        const { link, attempt } = lastProgress;
        if (link === "offline") {
            idle();
            joining = true; // ainda há um pedido de entrada em aberto
            showStatus({
                title: strings.entry.failedTitle,
                body: strings.entry.failedBody,
                tone: "error",
                canRetry: true,
            });
            return;
        }
        if (link === "retrying" && attempt > 0) {
            showStatus({
                title: format(strings.conn.retryingNth, { n: attempt }),
                body: strings.entry.slowBody,
            });
            return;
        }
        if (Date.now() - startedAt >= SLOW_AFTER_MS) {
            showStatus({ title: strings.entry.slowTitle, body: strings.entry.slowBody });
        }
    };

    const startLoading = () => {
        joining = true;
        startedAt = Date.now();
        lastProgress = { link: "connecting", attempt: 0 };
        submit.dataset.loading = "true";
        // aria-disabled, não disabled: o foco continua no botão.
        submit.setAttribute("aria-disabled", "true");
        spinner.hidden = false;
        submitLabel.textContent = strings.entry.submitting;
        hideStatus();
        stopSlowTimer();
        slowTimer = setTimeout(paintProgress, SLOW_AFTER_MS);
    };

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (joining) return; // pedido em andamento: um clique a mais não envia de novo
        const name = normalizeName(nameInput.value);
        const username = normalizeUsername(userInput.value);
        clearError("name");
        clearError("username");
        // O primeiro campo com problema recebe o foco.
        if (!name) return showError("name", strings.entry.nameRequired);
        if (!username) return showError("username", strings.entry.usernameRequired);
        if (!isUsernameFormatValid(username)) {
            userTouched = true;
            paintHint();
            return showError("username", describeUsername(username, { touched: true }).message);
        }
        startLoading();
        onSubmit(name, username);
    });

    nameInput.addEventListener("input", () => {
        clearError("name");
        // Enquanto a pessoa não escreveu o próprio @, ele acompanha o nome.
        if (!userEdited) {
            userInput.value = suggestUsername(nameInput.value);
            clearError("username");
            paintHint();
        }
    });

    userInput.addEventListener("input", () => {
        clearError("username");
        // Minúsculas na hora (o servidor faria o mesmo), mantendo o cursor.
        const { selectionStart, selectionEnd, value } = userInput;
        const lower = value.toLowerCase();
        if (lower !== value) {
            userInput.value = lower;
            userInput.setSelectionRange(selectionStart, selectionEnd);
        }
        // Campo esvaziado devolve a sugestão automática.
        userEdited = userInput.value.trim() !== "";
        if (!userEdited) userTouched = false;
        paintHint();
    });

    userInput.addEventListener("blur", () => {
        if (userInput.value.trim()) userTouched = true;
        paintHint();
    });

    cancel.addEventListener("click", () => {
        idle();
        hideStatus();
        onCancel();
        nameInput.focus();
    });

    retry.addEventListener("click", () => {
        startLoading();
        onRetry();
    });

    paintHint();

    return {
        /** @param {boolean} visible */
        setVisible(visible) {
            section.hidden = !visible;
        },

        focus() {
            nameInput.focus();
        },

        /**
         * Estado da conexão enquanto o pedido de entrada espera o servidor.
         * @param {boolean} waiting
         * @param {import("../state/store.js").LinkState} link
         * @param {number} attempt
         */
        setProgress(waiting, link, attempt) {
            if (!waiting) {
                if (joining) {
                    idle();
                    hideStatus();
                }
                return;
            }
            lastProgress = { link, attempt };
            paintProgress();
        },

        /**
         * Recusa do servidor: volta ao formulário, com o erro no campo certo.
         * @param {string} message
         * @param {"name" | "username"} [field]
         */
        reset(message, field = "name") {
            idle();
            hideStatus();
            if (field === "username") userEdited = true;
            showError(field, message);
        },

        /** Formulário limpo, para uma entrada nova depois de sair. */
        clear() {
            idle();
            hideStatus();
            form.reset();
            userEdited = false;
            userTouched = false;
            clearError("name");
            clearError("username");
            paintHint();
        },
    };
};
