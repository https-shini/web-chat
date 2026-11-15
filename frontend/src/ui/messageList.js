// @ts-check

import { format, strings } from "../i18n/strings.js";
import { clear, el, must } from "./dom.js";
import { icon } from "./icons.js";
import { patchDelivery, renderMessage } from "./message.js";
import { bindContextMenu } from "./primitives/contextMenu.js";
import { showMenu } from "./primitives/menu.js";

/**
 * @typedef {import("../state/store.js").Message} Message
 * @typedef {import("./primitives/menuModel.js").MenuItem} MenuItem
 */

/**
 * Janela de agrupamento: mensagens seguidas da mesma pessoa, no mesmo dia e
 * a menos de 7 minutos uma da outra viram um grupo (a regra do
 * `MessageGroupingUtils` do Fluxer, reimplementada aqui).
 */
const GROUP_WINDOW_MS = 7 * 60 * 1000;

/** Dia local de um carimbo ISO ("" se ilegível). @param {string} timestamp */
export const dayKey = (timestamp) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

/**
 * Rótulo do separador de dia: "Hoje", "Ontem" ou a data.
 * @param {string} timestamp
 * @param {Date} [now]
 */
export const dayLabel = (timestamp, now = new Date()) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    const today = dayKey(now.toISOString());
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const key = dayKey(timestamp);
    if (key === today) return strings.message.today;
    if (key === dayKey(yesterday.toISOString())) return strings.message.yesterday;
    return date.toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "long",
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
    });
};

/**
 * Continuação de quem acabou de falar? Só conversa comum, mesma pessoa,
 * mesmo dia, em sequência e dentro da janela.
 * @param {Message | undefined} previous
 * @param {Message} message
 * @returns {boolean}
 */
export const continuesGroup = (previous, message) => {
    if (!previous || previous.kind !== "chat" || message.kind !== "chat") return false;
    if (previous.userId !== message.userId) return false;
    // Mesmo @, autores diferentes: eram duas pessoas (o @ foi reaproveitado).
    if (previous.author !== undefined && message.author !== undefined) {
        if (previous.author !== message.author) return false;
    }
    const plain = (/** @type {Message} */ m) => (m.variant ?? "text") === "text";
    if (!plain(previous) || !plain(message)) return false;
    if (dayKey(previous.timestamp) !== dayKey(message.timestamp)) return false;
    const gap = Date.parse(message.timestamp) - Date.parse(previous.timestamp);
    return Number.isFinite(gap) && gap >= 0 && gap < GROUP_WINDOW_MS;
};

/**
 * Lista de mensagens. É `role="log"` com `aria-live="polite"` e
 * `aria-relevant="additions"`, e é a única fonte de anúncio de mensagem no
 * projeto: por isso ela adiciona itens em vez de redesenhar a lista
 * inteira, e atualiza no lugar o que muda (entrega confirmada ou falha).
 *
 * Rolagem (comportamento do Fluxer e do Discord):
 * - no fim, a lista acompanha as novas;
 * - rolou para cima, as novas NÃO puxam a tela: aparece "N mensagens
 *   novas", que leva ao fim (Esc no campo faz o mesmo);
 * - ao abrir uma conversa com não lidas, uma linha "Novas mensagens" marca
 *   onde você parou;
 * - ao voltar a uma conversa, você volta para onde estava (em memória).
 *
 * Teclado: a lista é uma parada de Tab; ↑/↓ andam entre as mensagens, Home
 * e End vão às pontas, Shift+F10 abre o menu da mensagem focada.
 *
 * @param {{
 *   onRetry?: (message: Message) => void,
 *   onFailed?: (message: Message) => void,
 *   onDiscard?: (message: Message) => void,
 *   onDismiss?: (message: Message) => void,
 *   getMe?: () => string | null,
 *   actionsFor?: (message: Message) => {items: MenuItem[], quick: {icon: string, label: string, run: () => void}[]} | null,
 * }} [handlers]
 */
export const createMessageList = (handlers = {}) => {
    // A região `role="log"` é o contêiner rolável; os itens moram numa
    // lista de verdade dentro dela (role="log" não é permitido em <ol>).
    const root = /** @type {HTMLElement} */ (must(".c-message-list"));
    const items = /** @type {HTMLOListElement} */ (must(".c-message-list__items", root));
    const jump = /** @type {HTMLButtonElement} */ (must(".c-jump-bar"));
    const getMe = handlers.getMe ?? (() => null);

    /** key → elemento e última versão pintada. */
    /** @type {Map<string, {element: HTMLElement, message: Message}>} */
    const painted = new Map();
    /** Separadores de dia na tela: dia → elemento. */
    /** @type {Map<string, HTMLElement>} */
    const dividers = new Map();
    /** Linha "Novas mensagens" (antes desta chave). */
    let newMarkerKey = /** @type {string | null} */ (null);
    /** Mensagens novas que chegaram com a lista rolada para cima. */
    let unseen = 0;

    /** No fim (ou quase)? */
    const isAtBottom = () => root.scrollHeight - root.scrollTop - root.clientHeight < 80;

    const paintJump = () => {
        jump.hidden = unseen === 0;
        const label =
            unseen === 1
                ? strings.message.jumpNewOne
                : format(strings.message.jumpNew, { n: unseen });
        jump.replaceChildren(
            icon("arrow-down"),
            el("span", { text: label }),
            el("kbd", {
                class: "c-jump-bar__kbd",
                text: strings.message.jumpHint,
                attrs: { "aria-hidden": "true" },
            }),
        );
        jump.setAttribute("aria-label", `${label}. ${strings.message.jumpLatest}`);
    };

    const scrollToEnd = () => {
        root.scrollTop = root.scrollHeight;
        unseen = 0;
        paintJump();
    };

    root.addEventListener(
        "scroll",
        () => {
            if (unseen && isAtBottom()) {
                unseen = 0;
                paintJump();
            }
        },
        { passive: true },
    );
    jump.addEventListener("click", () => {
        scrollToEnd();
    });

    /**
     * Quem saiu da conversa (chaves de autor). Mensagens dessas pessoas
     * ganham a marca "saiu".
     * @type {Set<string>}
     */
    let departed = new Set();

    /** @param {HTMLElement} element */
    const markDeparted = (element) => {
        const key = element.dataset.authorKey;
        if (!key) return;
        const gone = departed.has(key);
        element.classList.toggle("c-message--departed", gone);
        const mark = element.querySelector(".c-badge--departed");
        if (mark instanceof HTMLElement) mark.hidden = !gone;
    };

    /** @param {string} timestamp */
    const divider = (timestamp) => {
        // O <li> continua item de lista (o ARIA não deixa trocar o papel de
        // filho de <ol>); o texto do dia é lido normalmente.
        const node = el("li", { class: "c-day-divider" });
        node.appendChild(el("span", { class: "c-day-divider__label", text: dayLabel(timestamp) }));
        return node;
    };

    const newMarker = () => {
        const node = el("li", { class: "c-new-divider" });
        node.dataset.newMarker = "";
        node.appendChild(
            el("span", { class: "c-new-divider__label", text: strings.message.newMessages }),
        );
        return node;
    };

    /** Separador de dia que ficou sem mensagens depois dele (as antigas saíram). */
    const pruneDividers = () => {
        for (const [day, node] of dividers) {
            let next = node.nextElementSibling;
            while (next && next.classList.contains("c-new-divider")) next = next.nextElementSibling;
            if (!next || next.classList.contains("c-day-divider")) {
                node.remove();
                dividers.delete(day);
            }
        }
    };

    // ─── Barra de ações (uma só, levada até a mensagem sob o ponteiro) ──
    const toolbar = el("div", {
        class: "c-message-actions",
        attrs: { role: "toolbar", "aria-label": strings.message.more },
    });
    /** Mensagem dona da barra agora. @type {HTMLElement | null} */
    let toolbarOwner = null;

    /** @param {HTMLElement} element */
    const messageOf = (element) => {
        for (const entry of painted.values()) if (entry.element === element) return entry.message;
        return null;
    };

    /** @param {HTMLElement | null} element */
    const attachToolbar = (element) => {
        if (element === toolbarOwner) return;
        toolbarOwner = element;
        if (!element || !handlers.actionsFor) {
            toolbar.remove();
            return;
        }
        const message = messageOf(element);
        const actions = message ? handlers.actionsFor(message) : null;
        if (!actions) {
            toolbar.remove();
            return;
        }
        toolbar.replaceChildren();
        for (const action of actions.quick) {
            const button = el("button", {
                class: "c-icon-button c-icon-button--sm",
                attrs: {
                    type: "button",
                    tabindex: "-1",
                    "aria-label": action.label,
                    "data-tooltip": action.label,
                },
            });
            button.appendChild(icon(action.icon));
            button.addEventListener("click", action.run);
            toolbar.appendChild(button);
        }
        const more = el("button", {
            class: "c-icon-button c-icon-button--sm",
            attrs: {
                type: "button",
                tabindex: "-1",
                "aria-haspopup": "menu",
                "aria-expanded": "false",
                "aria-label": strings.message.more,
                "data-tooltip": strings.message.more,
            },
        });
        more.appendChild(icon("dots"));
        more.addEventListener("click", () => {
            const latest = messageOf(element);
            const menu = latest ? handlers.actionsFor?.(latest) : null;
            if (!menu || !latest) return;
            showMenu({
                label: format(strings.message.actionsFor, { name: latest.userName }),
                anchor: more,
                placement: "bottom-end",
                returnFocus: element,
                items: menu.items,
            });
        });
        toolbar.appendChild(more);
        element.appendChild(toolbar);
    };

    items.addEventListener("pointerover", (event) => {
        if (/** @type {PointerEvent} */ (event).pointerType === "touch") return;
        const target = /** @type {Element} */ (event.target).closest(
            '.c-message[data-kind="chat"]',
        );
        if (target instanceof HTMLElement) attachToolbar(target);
    });
    root.addEventListener("pointerleave", () => {
        if (!toolbar.contains(document.activeElement)) attachToolbar(null);
    });

    bindContextMenu(items, {
        selector: '.c-message[data-kind="chat"]',
        resolve: (target) => {
            const message = messageOf(target);
            const menu = message ? handlers.actionsFor?.(message) : null;
            return menu && message
                ? {
                      label: format(strings.message.actionsFor, { name: message.userName }),
                      items: menu.items,
                  }
                : null;
        },
    });

    // ─── Teclado: a lista como uma parada de Tab ────────────────────────
    root.tabIndex = 0;
    const focusables = () =>
        /** @type {HTMLElement[]} */ ([...items.querySelectorAll('.c-message[data-kind="chat"]')]);
    root.addEventListener("keydown", (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const list = focusables();
        if (list.length === 0) return;
        const active = document.activeElement;
        const at = active instanceof HTMLElement ? list.indexOf(active) : -1;
        /** @param {HTMLElement | undefined} next */
        const go = (next) => {
            if (!next) return;
            event.preventDefault();
            next.focus();
            attachToolbar(next);
        };
        if (event.key === "ArrowUp") go(at === -1 ? list.at(-1) : list[Math.max(0, at - 1)]);
        else if (event.key === "ArrowDown")
            go(at === -1 ? list.at(-1) : list[Math.min(list.length - 1, at + 1)]);
        else if (event.key === "Home" && at !== -1) go(list[0]);
        else if (event.key === "End" && at !== -1) go(list.at(-1));
    });

    return {
        /**
         * @param {Message[]} messages
         */
        render(messages) {
            const stick = isAtBottom();

            // Saíram só as mais antigas (limite por conversa): remove esses
            // itens um a um, sem redesenhar o resto nem reanunciar nada.
            const keys = new Set(messages.map((message) => message.key));
            const gone = [...painted.keys()].filter((key) => !keys.has(key));
            const firstKept = messages.find((message) => painted.has(message.key));
            const onlyOldest =
                gone.length > 0 &&
                firstKept !== undefined &&
                [...painted.keys()].indexOf(firstKept.key) === gone.length;
            if (onlyOldest) {
                for (const key of gone) {
                    painted.get(key)?.element.remove();
                    painted.delete(key);
                }
                pruneDividers();
            } else if (gone.length > 0) {
                // Conversa substituída ou limpa: única situação em que a
                // lista é reconstruída. Fora dela, adição e atualização no lugar.
                clear(items);
                painted.clear();
                dividers.clear();
                toolbarOwner = null;
                unseen = 0;
                paintJump();
            }

            let added = 0;
            let ownAdded = false;
            const me = getMe();
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
                const previous = messages[index - 1];
                const day = dayKey(message.timestamp);
                if (
                    day &&
                    !dividers.has(day) &&
                    (!previous || dayKey(previous.timestamp) !== day)
                ) {
                    const node = divider(message.timestamp);
                    dividers.set(day, node);
                    items.appendChild(node);
                }
                if (newMarkerKey === message.key) items.appendChild(newMarker());
                const element = renderMessage(message, handlers, {
                    // A linha "Novas mensagens" começa um grupo novo.
                    compact: newMarkerKey !== message.key && continuesGroup(previous, message),
                    me,
                });
                markDeparted(element);
                items.appendChild(element);
                painted.set(message.key, { element, message });
                if (message.kind === "chat" && !message.own) added += 1;
                else if (message.own && message.kind === "chat") ownAdded = true;
            }

            // A sua própria mensagem sempre leva ao fim; as dos outros só
            // quando você já estava lá (senão, contam no "N novas").
            if (stick || ownAdded) {
                root.scrollTop = root.scrollHeight;
                unseen = 0;
            } else if (added) {
                unseen += added;
            }
            paintJump();
        },

        /**
         * Atualiza a marca "saiu" sem redesenhar (mudar o item faria a
         * região `role="log"` anunciá-lo de novo).
         * @param {Set<string>} keys
         */
        setDeparted(keys) {
            departed = keys;
            for (const element of items.querySelectorAll("[data-author-key]")) {
                if (element instanceof HTMLElement) markDeparted(element);
            }
        },

        /**
         * Onde começam as não lidas ao abrir uma conversa (a linha "Novas
         * mensagens" entra antes desta mensagem no próximo desenho).
         * @param {string | null} key
         */
        setNewMarker(key) {
            newMarkerKey = key;
            for (const node of items.querySelectorAll("[data-new-marker]")) node.remove();
            if (!key) return;
            const target = painted.get(key)?.element;
            if (target) items.insertBefore(newMarker(), target);
        },

        /** Põe a linha "Novas mensagens" na tela (se houver). */
        revealNewMarker() {
            const marker = items.querySelector("[data-new-marker]");
            if (marker instanceof HTMLElement) marker.scrollIntoView({ block: "center" });
        },

        /** Posição de leitura (para voltar a ela depois). */
        position: () => ({ top: root.scrollTop, atBottom: isAtBottom() }),

        /** @param {{top: number, atBottom: boolean}} position */
        restore(position) {
            if (position.atBottom) scrollToEnd();
            else root.scrollTop = position.top;
        },

        /** Há mensagens novas fora da vista? */
        hasUnseen: () => unseen > 0,

        scrollToEnd,
    };
};
