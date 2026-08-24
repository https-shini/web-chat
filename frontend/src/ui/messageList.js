// @ts-check

import { clear, must } from "./dom.js";
import { renderMessage } from "./message.js";

/**
 * @typedef {import("../state/store.js").Message} Message
 */

/**
 * Lista de mensagens. É `role="log"` com `aria-live="polite"` e
 * `aria-relevant="additions"`, e é a única fonte de anúncio de mensagem no
 * projeto: por isso ela adiciona itens em vez de redesenhar a lista inteira,
 * e por isso o anunciador de a11y não repete mensagens.
 */
export const createMessageList = () => {
    const root = /** @type {HTMLOListElement} */ (must(".c-message-list"));

    /** Ids já pintados, para nunca repintar (e nunca reanunciar). */
    const painted = new Set();

    /** Rola só quando o usuário já estava no fim. */
    const isAtBottom = () => root.scrollHeight - root.scrollTop - root.clientHeight < 80;

    const scrollToEnd = () => {
        root.scrollTop = root.scrollHeight;
    };

    return {
        /**
         * @param {Message[]} messages
         */
        render(messages) {
            const stick = isAtBottom();

            // Histórico substituído: única situação em que a lista é
            // reconstruída. Fora dela, só há adição.
            const known = messages.filter((message) => painted.has(message.id));
            if (known.length < painted.size) {
                clear(root);
                painted.clear();
            }

            let added = false;
            for (const message of messages) {
                if (painted.has(message.id)) continue;
                root.appendChild(renderMessage(message));
                painted.add(message.id);
                added = true;
            }

            if (added && stick) scrollToEnd();
        },

        scrollToEnd,
    };
};
