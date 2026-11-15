// @ts-check

import { format, strings } from "../../i18n/strings.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { conversationGlyph } from "./sidebarNav.js";

/**
 * "Ir para conversa" (Ctrl/⌘ K), como o *quick switcher* do Fluxer, com as
 * regras de privacidade deste produto:
 * - procura SÓ entre as suas conversas (nome da sala, nome e @ da pessoa);
 * - nada é buscado no servidor, a não ser o @ exato, e só quando a pessoa
 *   escolhe "Conversa privada com @x" (a mesma busca exata do início);
 * - também oferece criar a sala com o texto digitado ou entrar pelo código.
 *
 * Diálogo modal nativo (`<dialog>`) com caixa de combinação: o foco fica no
 * campo e a opção ativa é indicada por `aria-activedescendant`.
 *
 * @typedef {import("../../state/store.js").ConversationEntry} ConversationEntry
 * @typedef {{kind: "open", entry: ConversationEntry} | {kind: "dm", username: string} | {kind: "create", name: string} | {kind: "join", code: string}} Choice
 */

/** Sem acento e em minúsculas, para comparar. @param {string} text */
const fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

/**
 * Conversas que combinam com o texto, das melhores para as piores: começa
 * com o texto, depois uma palavra que começa com ele, depois contém.
 * @param {ConversationEntry[]} conversations
 * @param {string} query
 * @returns {ConversationEntry[]}
 */
export const matchConversations = (conversations, query) => {
    const q = fold(query.trim().replace(/^@/, ""));
    if (!q) return conversations.slice();
    /** @param {ConversationEntry} entry */
    const score = (entry) => {
        const names = [entry.name, entry.peer?.username ?? ""].map(fold);
        let best = 0;
        for (const name of names) {
            if (!name) continue;
            if (name.startsWith(q)) best = Math.max(best, 3);
            else if (name.split(/[\s._-]+/).some((word) => word.startsWith(q)))
                best = Math.max(best, 2);
            else if (name.includes(q)) best = Math.max(best, 1);
        }
        return best;
    };
    return conversations
        .map((entry, index) => ({ entry, index, score: score(entry) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((item) => item.entry);
};

/**
 * @param {{
 *   getConversations: () => ConversationEntry[],
 *   isUsername: (text: string) => boolean,
 *   readCode: (text: string) => string | null,
 *   onChoose: (choice: Choice) => void,
 * }} deps
 */
export const createQuickSwitcher = ({ getConversations, isUsername, readCode, onChoose }) => {
    const dialog = el("dialog", {
        class: "c-quick",
        attrs: { "aria-labelledby": "quick-titulo" },
    });
    const title = el("h2", {
        class: "sr-only",
        text: strings.quick.title,
        attrs: { id: "quick-titulo" },
    });
    const bar = el("div", { class: "c-quick__bar" });
    const glass = el("span", { class: "c-quick__icon" });
    glass.appendChild(icon("search"));
    glass.setAttribute("aria-hidden", "true");
    const input = el("input", {
        class: "c-quick__input",
        attrs: {
            type: "text",
            role: "combobox",
            "aria-expanded": "true",
            "aria-controls": "quick-lista",
            "aria-autocomplete": "list",
            "aria-label": strings.quick.title,
            placeholder: strings.quick.placeholder,
            autocomplete: "off",
            autocapitalize: "none",
            spellcheck: "false",
            maxlength: "200",
        },
    });
    const esc = el("kbd", { class: "c-quick__kbd", text: "Esc", attrs: { "aria-hidden": "true" } });
    bar.append(glass, input, esc);
    const list = el("div", {
        class: "c-quick__list",
        attrs: { id: "quick-lista", role: "listbox", "aria-label": strings.quick.yours },
    });
    const status = el("p", { class: "sr-only", attrs: { role: "status", "aria-live": "polite" } });
    const foot = el("p", { class: "c-quick__foot" });
    foot.append(
        el("span", { text: strings.quick.hint }),
        el("span", { class: "c-quick__privacy", text: strings.quick.privacy }),
    );
    dialog.append(title, bar, list, status, foot);
    document.body.appendChild(dialog);

    /** @type {Choice[]} */
    let choices = [];
    let active = 0;
    /** @type {HTMLElement | null} */
    let returnFocus = null;

    /** @param {Choice} choice @param {number} index */
    const option = (choice, index) => {
        const node = el("div", {
            class: "c-quick__option",
            attrs: { role: "option", id: `quick-opcao-${index}`, "aria-selected": "false" },
        });
        node.dataset.index = String(index);
        const lead = el("span", { class: "c-quick__lead" });
        const text = el("span", { class: "c-quick__text" });
        if (choice.kind === "open") {
            lead.appendChild(conversationGlyph(choice.entry));
            text.appendChild(el("span", { class: "c-quick__name", text: choice.entry.name }));
            const sub =
                choice.entry.kind === "dm" && choice.entry.peer
                    ? `@${choice.entry.peer.username}`
                    : strings.quick.room;
            text.appendChild(el("span", { class: "c-quick__sub", text: sub }));
            if (choice.entry.unread > 0) {
                node.appendChild(lead);
                node.appendChild(text);
                node.appendChild(
                    el("span", {
                        class: "c-conversation-nav__badge",
                        text: String(choice.entry.unread),
                        attrs: { "aria-hidden": "true" },
                    }),
                );
                return node;
            }
        } else {
            lead.appendChild(
                icon(choice.kind === "dm" ? "at" : choice.kind === "join" ? "hash" : "plus"),
            );
            const label =
                choice.kind === "dm"
                    ? format(strings.quick.dmWith, { username: choice.username })
                    : choice.kind === "join"
                      ? format(strings.quick.joinCode, { code: choice.code })
                      : format(strings.quick.createRoom, { name: choice.name });
            text.appendChild(el("span", { class: "c-quick__name", text: label }));
            if (choice.kind === "dm") {
                text.appendChild(el("span", { class: "c-quick__sub", text: strings.quick.dmHint }));
            }
        }
        lead.setAttribute("aria-hidden", "true");
        node.append(lead, text);
        return node;
    };

    const paintActive = () => {
        for (const node of list.querySelectorAll("[role='option']")) {
            const on = Number(/** @type {HTMLElement} */ (node).dataset.index) === active;
            node.setAttribute("aria-selected", String(on));
            if (on) node.scrollIntoView({ block: "nearest" });
        }
        if (choices.length) input.setAttribute("aria-activedescendant", `quick-opcao-${active}`);
        else input.removeAttribute("aria-activedescendant");
    };

    const update = () => {
        const query = input.value.trim();
        const found = matchConversations(getConversations(), query);
        /** @type {Choice[]} */
        const actions = [];
        if (query) {
            const code = readCode(query);
            const handle = query.replace(/^@/, "").toLowerCase();
            if (code) actions.push({ kind: "join", code });
            else {
                const isKnownDm = found.some(
                    (entry) => entry.kind === "dm" && entry.peer?.username === handle,
                );
                if (isUsername(handle) && !isKnownDm)
                    actions.push({ kind: "dm", username: handle });
                if (!query.startsWith("@") && query.length <= 40) {
                    actions.push({ kind: "create", name: query });
                }
            }
        }
        choices = [
            ...found.map((entry) => /** @type {Choice} */ ({ kind: "open", entry })),
            ...actions,
        ];
        active = 0;
        list.replaceChildren();
        if (found.length) {
            list.appendChild(
                el("div", {
                    class: "c-quick__group",
                    text: strings.quick.yours,
                    attrs: { role: "presentation" },
                }),
            );
        } else if (query) {
            list.appendChild(
                el("div", {
                    class: "c-quick__empty",
                    text: strings.quick.none,
                    attrs: { role: "presentation" },
                }),
            );
        }
        choices.forEach((choice, index) => {
            if (index === found.length && actions.length) {
                list.appendChild(
                    el("div", {
                        class: "c-quick__group",
                        text: strings.quick.actions,
                        attrs: { role: "presentation" },
                    }),
                );
            }
            list.appendChild(option(choice, index));
        });
        status.textContent = format(strings.quick.results, { n: choices.length });
        paintActive();
    };

    /** @param {number} index */
    const choose = (index) => {
        const choice = choices[index];
        if (!choice) return;
        returnFocus = null;
        dialog.close();
        onChoose(choice);
    };

    input.addEventListener("input", update);
    input.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!choices.length) return;
            active =
                (active + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
            paintActive();
        } else if (event.key === "Enter") {
            event.preventDefault();
            choose(active);
        }
    });
    list.addEventListener("pointermove", (event) => {
        const node = /** @type {Element} */ (event.target).closest("[role='option']");
        if (!(node instanceof HTMLElement)) return;
        const index = Number(node.dataset.index);
        if (index !== active) {
            active = index;
            paintActive();
        }
    });
    list.addEventListener("click", (event) => {
        const node = /** @type {Element} */ (event.target).closest("[role='option']");
        if (node instanceof HTMLElement) choose(Number(node.dataset.index));
    });
    // Clique no fundo fecha, como Escape.
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
        if (returnFocus?.isConnected) returnFocus.focus();
        returnFocus = null;
    });

    return {
        /** @param {HTMLElement | null} [opener] */
        open(opener = null) {
            if (dialog.open) return;
            returnFocus =
                opener ??
                (document.activeElement instanceof HTMLElement ? document.activeElement : null);
            input.value = "";
            update();
            dialog.showModal();
            input.focus();
        },
        isOpen: () => dialog.open,
    };
};
