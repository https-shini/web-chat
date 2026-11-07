// @ts-check

import { clear, must } from "./dom.js";
import { patchDelivery, renderMessage } from "./message.js";

/**
 * @typedef {import("../state/store.js").Message} Message
 */

/** Mensagens da mesma pessoa dentro desta janela viram um grupo. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Continuação de quem acabou de falar? Só conversa comum, mesma pessoa,
 * em sequência e dentro da janela.
 * @param {Message | undefined} previous
 * @param {Message} message
 * @returns {boolean}
 */
export const continuesGroup = (previous, message) => {
    if (!previous || previous.kind !== "chat" || message.kind !== "chat") return false;
    if (previous.userId !== message.userId) return false;
    const plain = (/** @type {Message} */ m) => (m.variant ?? "text") === "text";
    if (!plain(previous) || !plain(message)) return false;
    const gap = Date.parse(message.timestamp) - Date.parse(previous.timestamp);
    return Number.isFinite(gap) && gap >= 0 && gap < GROUP_WINDOW_MS;
};

/**
 * Lista de mensagens. É `role="log"` com `aria-live="polite"` e
 * `aria-relevant="additions"`, e é a única fonte de anúncio de mensagem no
 * projeto: por isso ela adiciona itens em vez de redesenhar a lista
 * inteira, e atualiza no lugar o que muda (entrega confirmada ou falha).
 *
 * @param {{onRetry?: (message: Message) => void, onFailed?: (message: Message) => void}} [handlers]
 */
export const createMessageList = (handlers = {}) => {
    // A região `role="log"` é o contêiner rolável; os itens moram numa
    // lista de verdade dentro dela (role="log" não é permitido em <ol>).
    const root = /** @type {HTMLElement} */ (must(".c-message-list"));
    const items = /** @type {HTMLOListElement} */ (must(".c-message-list__items", root));

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
                clear(items);
                painted.clear();
            }

            let added = false;
            for (const [index, message] of messages.entries()) {
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
                const element = renderMessage(message, handlers, {
                    compact: continuesGroup(messages[index - 1], message),
                });
                items.appendChild(element);
                painted.set(message.key, { element, message });
                added = true;
            }

            if (added && stick) scrollToEnd();
        },

        scrollToEnd,
    };
};
