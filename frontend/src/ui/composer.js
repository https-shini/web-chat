// @ts-check

import { LIMITS } from "../config.js";
import { strings } from "../i18n/strings.js";
import { must } from "./dom.js";

/**
 * Composer. O campo continua editável quando a conexão cai: o envio vai
 * para a fila do transporte, e o aviso ao lado diz isso em texto em vez de
 * descartar a mensagem em silêncio.
 */

/**
 * @param {{
 *   onSend: (content: string) => void,
 *   onTyping: () => void,
 *   onInput?: (text: string, cursor: number) => void,
 *   onKeyDown?: (event: KeyboardEvent) => boolean,
 * }} handlers
 */
export const createComposer = ({
    onSend,
    onTyping,
    onInput = () => {},
    onKeyDown = () => false,
}) => {
    const footer = /** @type {HTMLElement} */ (must(".c-composer-area"));
    const form = /** @type {HTMLFormElement} */ (must(".c-composer"));
    const input = /** @type {HTMLInputElement} */ (must("#campo-mensagem"));
    const notice = /** @type {HTMLElement} */ (must(".c-composer__notice"));
    const send = /** @type {HTMLButtonElement} */ (must(".c-composer__send"));

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const content = input.value.trim().slice(0, LIMITS.messageMaxLength);
        if (!content) return;
        input.value = "";
        onInput("", 0);
        onSend(content);
    });

    const reportInput = () => onInput(input.value, input.selectionStart ?? input.value.length);

    input.addEventListener("input", () => {
        // Comando não é digitação de mensagem: não avisa "digitando…".
        if (!input.value.startsWith("/")) onTyping();
        reportInput();
    });
    // O cursor também muda por clique e setas: a sugestão acompanha.
    input.addEventListener("click", reportInput);
    input.addEventListener("keyup", (event) => {
        if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowRight" ||
            event.key === "Home" ||
            event.key === "End"
        ) {
            reportInput();
        }
    });
    // O autocomplete pode tomar a tecla (setas, Enter, Tab, Escape).
    input.addEventListener("keydown", (event) => {
        if (onKeyDown(event)) event.preventDefault();
    });

    return {
        /**
         * @param {boolean} visible
         */
        setVisible(visible) {
            footer.hidden = !visible;
        },

        focus() {
            input.focus();
        },

        /** O texto no campo agora (rascunho da conversa aberta). */
        getValue: () => input.value,

        /**
         * Troca o texto sem mover o foco nem abrir sugestões — usado ao
         * trocar de conversa (cada uma tem o seu rascunho).
         * @param {string} text
         */
        restore(text) {
            input.value = text;
            onInput("", 0);
        },

        /**
         * Substitui o texto do campo (autocomplete) e põe o cursor no fim.
         * @param {string} text
         */
        setValue(text) {
            input.value = text;
            input.setSelectionRange(text.length, text.length);
            input.focus();
            reportInput();
        },

        /** O campo, para o autocomplete apontar atributos ARIA. */
        input,

        /**
         * @param {import("../state/store.js").LinkState} link
         * @param {number} queued
         */
        render(link, queued) {
            const blocked = link === "offline";
            form.dataset.state = blocked ? "blocked" : queued > 0 ? "queued" : "ready";

            input.disabled = blocked;
            send.disabled = blocked;

            notice.textContent = queued > 0 && !blocked ? strings.conn.queued : "";
        },
    };
};
