// @ts-check

import { format, strings } from "../i18n/strings.js";
import { el } from "./dom.js";
import { icon } from "./icons.js";

/**
 * Lista das conversas (salas e privadas), na barra lateral e no início.
 *
 * Cada item é um botão: abrir a conversa é a única ação. O nome vem de
 * outra pessoa e entra só como texto. O rótulo acessível diz o tipo, as não
 * lidas e, numa privada, se a outra pessoa está conectada; o número visível
 * de não lidas é decorativo (o rótulo já o diz).
 *
 * Os ids das conversas são do servidor e não identificam pessoas; ficam só
 * no `data-` do botão, para o clique saber qual abrir.
 *
 * @param {{container: HTMLElement, onOpen: (conversationId: string) => void}} options
 */
export const createConversationNav = ({ container, onOpen }) => {
    container.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const button = target?.closest("button[data-conversation-id]");
        if (button instanceof HTMLButtonElement && button.dataset.conversationId) {
            onOpen(button.dataset.conversationId);
        }
    });

    /** @param {number} unread */
    const unreadLabel = (unread) =>
        unread === 1
            ? strings.conversations.unreadOne
            : format(strings.conversations.unread, { n: unread });

    /**
     * @param {import("../state/store.js").ConversationEntry} entry
     * @param {boolean} current
     */
    const item = (entry, current) => {
        const dm = entry.kind === "dm";
        const button = el("button", {
            class: "c-nav-item c-conversation-nav__item",
            attrs: { type: "button" },
        });
        button.dataset.conversationId = entry.conversationId;
        if (current) button.setAttribute("aria-current", "page");
        if (entry.unread > 0) button.classList.add("c-conversation-nav__item--unread");

        const glyph = el("span", { class: "c-nav-item__icon" });
        glyph.appendChild(icon(dm ? "at" : "hash"));
        button.appendChild(glyph);

        const label = el("span", { class: "c-nav-item__label", text: entry.name });
        button.appendChild(label);

        const parts = [entry.name];
        if (dm && entry.peer) {
            const online = entry.peer.online;
            const dot = el("span", {
                class: `c-conversation-nav__presence${online ? " c-conversation-nav__presence--online" : ""}`,
            });
            dot.setAttribute("aria-hidden", "true");
            button.appendChild(dot);
            parts.push(
                `@${entry.peer.username}`,
                online ? strings.conversations.online : strings.conversations.offline,
            );
        }
        if (entry.unread > 0) {
            const badge = el("span", {
                class: "c-conversation-nav__badge",
                text: entry.unread > 99 ? "99+" : String(entry.unread),
            });
            badge.setAttribute("aria-hidden", "true");
            button.appendChild(badge);
            parts.push(unreadLabel(entry.unread));
        }
        button.setAttribute("aria-label", parts.join(", "));
        button.title = dm && entry.peer ? `${entry.name} (@${entry.peer.username})` : entry.name;
        const li = el("li", { class: "c-conversation-nav__entry" });
        li.appendChild(button);
        return li;
    };

    /**
     * @param {string} title
     * @param {import("../state/store.js").ConversationEntry[]} entries
     * @param {string | null} currentId
     */
    const group = (title, entries, currentId) => {
        const wrap = el("div", { class: "c-conversation-nav__group" });
        const heading = el("p", { class: "c-conversation-nav__heading", text: title });
        const list = el("ul", { class: "c-conversation-nav__list" });
        list.setAttribute("aria-label", title);
        heading.setAttribute("aria-hidden", "true");
        for (const entry of entries)
            list.appendChild(item(entry, entry.conversationId === currentId));
        wrap.append(heading, list);
        return wrap;
    };

    return {
        /**
         * @param {import("../state/store.js").ConversationEntry[]} conversations
         * @param {string | null} currentId
         */
        render(conversations, currentId) {
            const rooms = conversations.filter((entry) => entry.kind !== "dm");
            const dms = conversations.filter((entry) => entry.kind === "dm");
            container.replaceChildren(
                ...(rooms.length ? [group(strings.conversations.rooms, rooms, currentId)] : []),
                ...(dms.length ? [group(strings.conversations.dms, dms, currentId)] : []),
            );
        },
    };
};
