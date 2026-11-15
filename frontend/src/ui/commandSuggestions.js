// @ts-check

import { completion, suggest } from "../commands/autocomplete.js";
import { format, strings } from "../i18n/strings.js";
import { el, must } from "./dom.js";

/**
 * Autocomplete de comandos (padrão ARIA combobox + listbox).
 *
 * Ao digitar `/`, lista os comandos do catálogo do servidor que combinam
 * com o que foi digitado. Setas navegam, Tab ou Enter completam, Escape
 * fecha, clique/toque escolhe. Depois do nome, mostra só a sintaxe — sem
 * tomar nenhuma tecla. Mensagens comuns não abrem nada.
 *
 * Também sugere pessoas ao digitar "@" (decisão C3): só quem está na
 * conversa aberta, com os dados que o navegador já tem (lista de pessoas).
 * Escolher troca o trecho "@parcial" por "@username ".
 *
 * @typedef {import("../state/store.js").CommandInfo} CommandInfo
 * @typedef {import("../state/store.js").Person} Person
 */

/**
 * "@parcial" logo antes do cursor (início de palavra), ou null.
 * @param {string} text
 * @param {number} cursor
 * @returns {{start: number, query: string} | null}
 */
export const mentionQuery = (text, cursor) => {
    const before = text.slice(0, cursor);
    const match = /(^|\s)@([a-z0-9._]{0,20})$/.exec(before);
    if (!match) return null;
    return { start: before.length - (match[2] ?? "").length - 1, query: match[2] ?? "" };
};

/** Sem acento e em minúsculas. @param {string} text */
const fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

/**
 * Pessoas que combinam com o "@parcial" (no máximo 8, sem você).
 * @param {Person[]} people
 * @param {string} query
 * @param {string | null} me
 */
export const matchPeople = (people, query, me) => {
    const q = fold(query);
    return people
        .filter((person) => person.username && person.username !== me)
        .filter(
            (person) =>
                !q ||
                (person.username ?? "").startsWith(q) ||
                fold(person.name)
                    .split(/\s+/)
                    .some((word) => word.startsWith(q)),
        )
        .slice(0, 8);
};

/**
 * @param {{
 *   input: HTMLInputElement | HTMLTextAreaElement,
 *   getCatalog: () => CommandInfo[],
 *   onChoose: (text: string) => void,
 *   getPeople?: () => Person[],
 *   getMe?: () => string | null,
 *   onMention?: (start: number, end: number, text: string) => void,
 * }} options
 */
export const createCommandSuggestions = ({
    input,
    getCatalog,
    onChoose,
    getPeople = () => [],
    getMe = () => null,
    onMention = () => {},
}) => {
    const root = /** @type {HTMLElement} */ (must(".c-command-suggestions"));
    const list = /** @type {HTMLUListElement} */ (must(".c-command-suggestions__list", root));
    const hint = /** @type {HTMLElement} */ (must(".c-command-suggestions__hint", root));

    // Campo de uma linha: combobox. Área de texto (o campo de mensagem):
    // continua "caixa de texto" de várias linhas — o ARIA não permite
    // combobox num textarea — e indica as sugestões com aria-autocomplete,
    // aria-controls e aria-activedescendant, como os chats que usam um
    // editor de várias linhas.
    const isTextarea = input instanceof HTMLTextAreaElement;
    if (!isTextarea) input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    /** @param {boolean} open */
    const setExpanded = (open) => {
        if (!isTextarea) input.setAttribute("aria-expanded", String(open));
    };
    setExpanded(false);

    /** @type {{command: CommandInfo, matched: string}[]} */
    let items = [];
    /** Modo pessoas ("@"): as pessoas e onde o "@" começa. */
    /** @type {Person[]} */
    let people = [];
    let mentionStart = -1;
    const heading = root.querySelector(".c-command-suggestions__heading");
    let active = 0;
    let query = "";
    /** Escape fecha até o texto mudar. */
    /** @type {string | null} */
    let dismissedFor = null;

    /** @param {number} index */
    const optionId = (index) => `${list.id}-opcao-${index}`;

    const close = () => {
        items = [];
        people = [];
        mentionStart = -1;
        root.hidden = true;
        list.hidden = true;
        hint.hidden = true;
        list.replaceChildren();
        setExpanded(false);
        input.removeAttribute("aria-activedescendant");
    };

    const highlight = () => {
        [...list.children].forEach((node, index) => {
            node.setAttribute("aria-selected", String(index === active));
        });
        input.setAttribute("aria-activedescendant", optionId(active));
        list.children[active]?.scrollIntoView({ block: "nearest" });
    };

    /** @param {number} index */
    const choose = (index) => {
        if (people.length) {
            const person = people[index];
            const start = mentionStart;
            const end = input.selectionStart ?? input.value.length;
            close();
            if (person?.username) onMention(start, end, `@${person.username} `);
            return;
        }
        const item = items[index];
        if (!item) return;
        close();
        onChoose(completion(item.command));
    };

    /** @param {CommandInfo} command @param {string} matched @param {number} index */
    const renderOption = (command, matched, index) => {
        const option = el("li", {
            class: "c-command-suggestions__option",
            attrs: { role: "option", id: optionId(index), "aria-selected": "false" },
        });
        if (!command.allowed) option.dataset.locked = "true";
        const head = el("span", { class: "c-command-suggestions__name", text: `/${command.name}` });
        option.appendChild(head);
        if (matched !== command.name) {
            option.appendChild(
                el("span", { class: "c-command-suggestions__alias", text: `(/${matched})` }),
            );
        }
        option.appendChild(
            el("span", { class: "c-command-suggestions__desc", text: command.description }),
        );
        if (!command.allowed) {
            option.appendChild(
                el("span", {
                    class: "c-command-suggestions__tag",
                    text: strings.commands.adminOnly,
                }),
            );
        }
        // mousedown, não click: o campo não perde o foco ao tocar na opção.
        option.addEventListener("mousedown", (event) => {
            event.preventDefault();
            choose(index);
        });
        return option;
    };

    return {
        /**
         * Recalcula as sugestões para o texto e a posição do cursor.
         * @param {string} text
         * @param {number} cursor
         */
        update(text, cursor) {
            if (dismissedFor !== null && dismissedFor !== text) dismissedFor = null;
            const result = dismissedFor === null ? suggest(text, cursor, getCatalog()) : null;
            if (!result) {
                const mention = dismissedFor === null ? mentionQuery(text, cursor) : null;
                const found = mention ? matchPeople(getPeople(), mention.query, getMe()) : [];
                if (!mention || found.length === 0) return close();
                const same =
                    people.length === found.length &&
                    people.every((person, index) => person.username === found[index]?.username);
                items = [];
                people = found;
                mentionStart = mention.start;
                if (!same) active = 0;
                root.hidden = false;
                hint.hidden = true;
                list.hidden = false;
                if (heading) heading.textContent = strings.commands.peopleHeading;
                list.replaceChildren(
                    ...people.map((person, index) => {
                        const option = el("li", {
                            class: "c-command-suggestions__option",
                            attrs: {
                                role: "option",
                                id: optionId(index),
                                "aria-selected": "false",
                            },
                        });
                        option.appendChild(
                            el("span", { class: "c-command-suggestions__name", text: person.name }),
                        );
                        option.appendChild(
                            el("span", {
                                class: "c-command-suggestions__desc",
                                text: `@${person.username}`,
                            }),
                        );
                        option.addEventListener("mousedown", (event) => {
                            event.preventDefault();
                            choose(index);
                        });
                        return option;
                    }),
                );
                setExpanded(true);
                highlight();
                return;
            }
            if (heading) heading.textContent = strings.commands.helpTitle;

            root.hidden = false;
            if (result.mode === "syntax") {
                items = [];
                list.hidden = true;
                list.replaceChildren();
                hint.hidden = false;
                hint.textContent = `${format(strings.commands.syntax, { syntax: result.command.syntax })} — ${result.command.description}`;
                setExpanded(false);
                input.removeAttribute("aria-activedescendant");
                return;
            }

            const sameList =
                items.length === result.items.length &&
                items.every((item, index) => item.command === result.items[index]?.command);
            items = result.items;
            query = result.query;
            if (!sameList) active = 0;
            hint.hidden = true;
            list.hidden = false;
            list.replaceChildren(
                ...items.map((item, index) => renderOption(item.command, item.matched, index)),
            );
            setExpanded(true);
            highlight();
        },

        /**
         * Teclas enquanto a lista está aberta. Devolve true se a tecla foi usada.
         * @param {KeyboardEvent} event
         */
        handleKey(event) {
            const total = people.length || items.length;
            if (total === 0) return false;
            switch (event.key) {
                case "ArrowDown":
                    active = (active + 1) % total;
                    highlight();
                    return true;
                case "ArrowUp":
                    active = (active - 1 + total) % total;
                    highlight();
                    return true;
                case "Tab":
                    if (event.shiftKey) return false;
                    choose(active);
                    return true;
                case "Enter": {
                    if (people.length) {
                        choose(active);
                        return true;
                    }
                    // Nome já completo (ex.: "/help"): Enter envia. Senão, completa.
                    const item = items[active];
                    if (!item || item.matched === query) return false;
                    choose(active);
                    return true;
                }
                case "Escape":
                    dismissedFor = input.value;
                    close();
                    return true;
                default:
                    return false;
            }
        },

        close,
    };
};
