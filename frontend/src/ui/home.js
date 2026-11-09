// @ts-check

/**
 * Página inicial após a identificação. Nenhuma sala é criada implicitamente.
 * Os botões delegam operações ao compositor; permissões ficam no servidor.
 */
import { normalizeRoomCode } from "../state/invite.js";
import { createUserSearch } from "./userSearch.js";

/**
 * @param {{
 *   onCreate: () => void,
 *   onJoin: (code: string) => void,
 *   onDirect: () => void,
 *   onOpen: (id: string) => void,
 *   onLeave: (id: string) => void,
 *   onSearch: (query: string) => void,
 *   onStartDirect: (username: string) => void,
 *   onLogout: () => void,
 * }} actions
 */
export const createHome = ({
    onCreate,
    onJoin,
    onDirect,
    onOpen,
    onLeave,
    onSearch,
    onStartDirect,
    onLogout,
}) => {
    const section = document.createElement("section");
    section.className = "c-home";
    section.hidden = true;
    section.setAttribute("aria-label", "Início");
    // Montagem por DOM seguro; nomes e mensagens de outros participantes
    // entram exclusivamente por textContent (nunca como HTML).
    /** @param {string} tag @param {string} className @param {string} [content] */
    const create = (tag, className, content = "") => {
        const element = document.createElement(tag);
        element.className = className;
        element.textContent = content;
        return element;
    };
    const content = create("div", "c-home__content");
    const eyebrow = create("p", "c-home__eyebrow", "WEB CHAT");
    const heading = create("h1", "c-home__title", "Suas conversas começam aqui.");
    const identityLabel = create("p", "c-home__identity");
    const logoutButton = document.createElement("button");
    logoutButton.type = "button";
    logoutButton.className = "c-home__logout";
    logoutButton.textContent = "Encerrar sessão";
    logoutButton.addEventListener("click", onLogout);
    const description = create(
        "p",
        "c-home__description",
        "Crie uma sala, entre por convite ou converse diretamente com alguém.",
    );
    const actions = create("div", "c-home__actions");
    const userSearch = createUserSearch({ onSearch, onSelect: onStartDirect });
    /** @param {string} action @param {string} title */
    const addAction = (action, title) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.homeAction = action;
        button.textContent = title;
        actions.append(button);
    };
    addAction("create", "+ Criar sala");
    addAction("join", "Entrar com código");
    addAction("direct", "Mensagem direta por @");

    const joinForm = document.createElement("form");
    joinForm.className = "c-home__join";
    joinForm.hidden = true;
    const joinLabel = document.createElement("label");
    joinLabel.htmlFor = "home-room-code";
    joinLabel.textContent = "Código ou link de convite";
    const joinInput = document.createElement("input");
    joinInput.id = "home-room-code";
    joinInput.name = "code";
    joinInput.autocomplete = "off";
    joinInput.required = true;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Entrar na sala";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.dataset.homeAction = "cancel";
    cancel.textContent = "Cancelar";
    joinForm.append(joinLabel, joinInput, submit, cancel);

    const feedback = create("p", "c-home__notice");
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    const connectionLabel = create("div", "c-home__connection");
    connectionLabel.setAttribute("role", "status");
    const conversations = create("section", "c-home__conversations");
    conversations.setAttribute("aria-label", "Conversas ativas");
    conversations.append(
        create("h2", "", "Suas conversas"),
        create("p", "c-home__empty", "Nenhuma conversa ativa. Crie uma sala ou procure alguém por @username."),
        create("ul", "c-home__conversation-list"),
    );
    content.append(
        eyebrow,
        heading,
        identityLabel,
        logoutButton,
        description,
        actions,
        userSearch.element,
        joinForm,
        feedback,
        connectionLabel,
        conversations,
    );
    section.append(content);
    document.querySelector(".c-app")?.append(section);
    const identity = section.querySelector(".c-home__identity");
    const form = /** @type {HTMLFormElement} */ (section.querySelector("form"));
    const input = /** @type {HTMLInputElement} */ (section.querySelector("input"));
    const notice = section.querySelector(".c-home__notice");
    const connection = section.querySelector(".c-home__connection");
    const list = /** @type {HTMLUListElement} */ (
        section.querySelector(".c-home__conversation-list")
    );
    const empty = /** @type {HTMLElement | null} */ (section.querySelector(".c-home__empty"));
    section.querySelector('[data-home-action="create"]')?.addEventListener("click", onCreate);
    section.querySelector('[data-home-action="join"]')?.addEventListener("click", () => {
        form.hidden = false;
        input.focus();
    });
    section.querySelector('[data-home-action="cancel"]')?.addEventListener("click", () => {
        form.hidden = true;
    });
    section.querySelector('[data-home-action="direct"]')?.addEventListener("click", () => {
        userSearch.open();
        onDirect();
    });
    list.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button[data-conversation-id]");
        if (!(button instanceof HTMLButtonElement)) return;
        const id = button.dataset.conversationId;
        if (!id) return;
        if (button.dataset.action === "leave") onLeave(id);
        else onOpen(id);
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const raw = input.value.trim();
        const code = normalizeRoomCode(raw);
        if (!code) {
            showNotice("Informe um código ou link de convite válido.");
            return;
        }
        onJoin(code);
    });
    /** @param {string} message */
    const showNotice = (message) => {
        if (notice) notice.textContent = message;
    };
    return {
        /** @param {boolean} visible */
        setVisible(visible) {
            section.hidden = !visible;
        },
        /** @param {string} name @param {string} username */
        setIdentity(name, username) {
            if (identity) identity.textContent = `${name} · @${username}`;
        },
        /** @param {string | null} code */
        setInvite(code) {
            if (!code) return;
            form.hidden = false;
            input.value = code;
            showNotice("Convite encontrado. Confirme para entrar na sala.");
        },
        showNotice,
        openUserSearch() {
            userSearch.open();
        },
        /** @param {string} query @param {{id: string, name: string, username: string}[]} users */
        setSearchResults(query, users) {
            userSearch.setResults(query, users);
        },
        /** @param {string} error */
        setSearchError(error) {
            userSearch.setError(error);
        },
        /** @param {import("../state/store.js").State["conversations"]} conversations */
        renderConversations(conversations) {
            list.replaceChildren();
            if (empty) empty.hidden = conversations.length > 0;
            for (const room of conversations) {
                const item = document.createElement("li");
                item.className = "c-home__conversation";
                const open = document.createElement("button");
                open.type = "button";
                open.dataset.conversationId = room.conversationId;
                open.dataset.action = "open";
                const title = document.createElement("strong");
                title.textContent = (room.kind === "dm" ? "Mensagem direta · " : "Sala · ") + room.name;
                const detail = document.createElement("span");
                detail.textContent = room.unread
                    ? " · " + room.unread + " não lida(s)"
                    : room.lastMessage
                      ? " · " + room.lastMessage.slice(0, 80)
                      : " · Sem mensagens recentes";
                open.append(title, detail);
                const leave = document.createElement("button");
                leave.type = "button";
                leave.dataset.conversationId = room.conversationId;
                leave.dataset.action = "leave";
                leave.textContent = room.kind === "dm" ? "Encerrar DM" : "Sair da sala";
                leave.setAttribute("aria-label", leave.textContent + " " + room.name);
                item.append(open, leave);
                list.append(item);
            }
        },
        /** @param {import("../state/store.js").LinkState} link */
        setConnection(link) {
            if (connection) {
                connection.textContent =
                    link === "online"
                        ? "Conectado"
                        : link === "retrying" || link === "connecting"
                          ? "Reconectando…"
                          : link === "offline"
                            ? "Sem conexão"
                            : "Aguardando conexão";
            }
        },
        focus() {
            section.querySelector("h1")?.setAttribute("tabindex", "-1");
            /** @type {HTMLElement | null} */ (section.querySelector("h1"))?.focus();
        },
    };
};
