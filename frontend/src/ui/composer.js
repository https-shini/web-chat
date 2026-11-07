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
 * @param {{onSend: (content: string) => void, onTyping: () => void}} handlers
 */
export const createComposer = ({ onSend, onTyping }) => {
    const footer = /** @type {HTMLElement} */ (must(".c-app__footer"));
    const form = /** @type {HTMLFormElement} */ (must(".c-composer"));
    const input = /** @type {HTMLInputElement} */ (must("#campo-mensagem"));
    const notice = /** @type {HTMLElement} */ (must(".c-composer__notice"));
    const send = /** @type {HTMLButtonElement} */ (must(".c-composer__send"));

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const content = input.value.trim().slice(0, LIMITS.messageMaxLength);
        if (!content) return;
        input.value = "";
        onSend(content);
    });

    input.addEventListener("input", onTyping);

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

        /**
         * Devolve ao campo um texto que o servidor recusou, sem apagar o que
         * a pessoa já tiver começado a escrever depois.
         * @param {string} text
         */
        restoreDraft(text) {
            if (input.disabled || input.value !== "" || text === "") return;
            input.value = text;
        },

        /**
         * @param {import("../state/store.js").LinkState} link
         * @param {number} queued
         */
        render(link, queued) {
            const blocked = link === "offline";
            form.dataset.state = blocked ? "blocked" : queued > 0 ? "queued" : "ready";

            input.disabled = blocked;
            send.disabled = blocked;
            send.textContent = strings.room.send;

            notice.textContent = queued > 0 && !blocked ? strings.conn.queued : "";
        },
    };
};
