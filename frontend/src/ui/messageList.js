// @ts-check

import { clear, must } from "./dom.js";
import { patchDelivery, renderMessage } from "./message.js";

/**
 * @typedef {import("../state/store.js").Message} Message
 */

/**
 * Lista de mensagens. É `role="log"` com `aria-live="polite"` e
 * `aria-relevant="additions"`, e é a única fonte de anúncio de mensagem no
 * projeto: por isso ela adiciona itens em vez de redesenhar a lista
 * inteira, e atualiza no lugar o que muda (entrega confirmada ou falha).
 *
 * @param {{onRetry?: (message: Message) => void, onFailed?: (message: Message) => void}} [handlers]
 */
export const createMessageList = (handlers = {}) => {
    const root = /** @type {HTMLOListElement} */ (must(".c-message-list"));

    /** key → elemento e última versão pintada. */
    const painted = new Map();

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

            // Conversa substituída ou limpa: única situação em que a lista é
            // reconstruída. Fora dela, há adição e atualização no lugar.
            const known = messages.filter((message) => painted.has(message.key));
            if (known.length < painted.size) {
                clear(root);
                painted.clear();
            }

            let added = false;
            for (const message of messages) {
                const entry = painted.get(message.key);
                if (entry) {
                    if (entry.message !== message) {
                        const becameFailed =
                            message.delivery === "failed" && entry.message.delivery !== "failed";
                        patchDelivery(entry.element, message, handlers);
                        entry.message = message;
                        if (becameFailed) handlers.onFailed?.(message);
                    }
                    continue;
                }
                const element = renderMessage(message, handlers);
                root.appendChild(element);
                painted.set(message.key, { element, message });
                added = true;
            }

            if (added && stick) scrollToEnd();
        },

        scrollToEnd,
    };
};
