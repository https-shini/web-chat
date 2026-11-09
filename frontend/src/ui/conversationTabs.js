// @ts-check

/**
 * Navegação entre conversas sem alterar participações.
 * Os identificadores são do servidor e usados apenas em callbacks internos.
 * @param {{onOpen: (conversationId: string) => void}} options
 */
export const createConversationTabs = ({ onOpen }) => {
    const nav = document.createElement("nav");
    nav.className = "c-conversation-tabs";
    nav.setAttribute("aria-label", "Alternar conversas ativas");

    nav.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button[data-conversation-id]");
        if (!(button instanceof HTMLButtonElement)) return;
        const id = button.dataset.conversationId;
        if (id) onOpen(id);
    });

    return {
        element: nav,
        /**
         * @param {import("../state/store.js").State["conversations"]} conversations
         * @param {string | null} selectedId
         */
        render(conversations, selectedId) {
            nav.replaceChildren();
            for (const item of conversations) {
                const button = document.createElement("button");
                button.type = "button";
                button.dataset.conversationId = item.conversationId;
                button.className = "c-conversation-tabs__item";
                button.textContent =
                    (item.kind === "dm" ? "@ " : "# ") +
                    item.name +
                    (item.unread ? " (" + item.unread + ")" : "");
                button.title = item.name;
                if (item.conversationId === selectedId) {
                    button.setAttribute("aria-current", "page");
                }
                nav.append(button);
            }
        },
    };
};
