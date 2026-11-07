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
 * @typedef {import("../state/store.js").CommandInfo} CommandInfo
 */

/**
 * @param {{
 *   input: HTMLInputElement,
 *   getCatalog: () => CommandInfo[],
 *   onChoose: (text: string) => void,
 * }} options
 */
export const createCommandSuggestions = ({ input, getCatalog, onChoose }) => {
    const root = /** @type {HTMLElement} */ (must(".c-command-suggestions"));
    const list = /** @type {HTMLUListElement} */ (must(".c-command-suggestions__list", root));
    const hint = /** @type {HTMLElement} */ (must(".c-command-suggestions__hint", root));

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", list.id);
    input.setAttribute("aria-expanded", "false");

    /** @type {{command: CommandInfo, matched: string}[]} */
    let items = [];
    let active = 0;
    let query = "";
    /** Escape fecha até o texto mudar. */
    /** @type {string | null} */
    let dismissedFor = null;

    /** @param {number} index */
    const optionId = (index) => `${list.id}-opcao-${index}`;

    const close = () => {
        items = [];
        root.hidden = true;
        list.hidden = true;
        hint.hidden = true;
        list.replaceChildren();
        input.setAttribute("aria-expanded", "false");
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
            if (!result) return close();

            root.hidden = false;
            if (result.mode === "syntax") {
                items = [];
                list.hidden = true;
                list.replaceChildren();
                hint.hidden = false;
                hint.textContent = `${format(strings.commands.syntax, { syntax: result.command.syntax })} — ${result.command.description}`;
                input.setAttribute("aria-expanded", "false");
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
            input.setAttribute("aria-expanded", "true");
            highlight();
        },

        /**
         * Teclas enquanto a lista está aberta. Devolve true se a tecla foi usada.
         * @param {KeyboardEvent} event
         */
        handleKey(event) {
            if (items.length === 0) return false;
            switch (event.key) {
                case "ArrowDown":
                    active = (active + 1) % items.length;
                    highlight();
                    return true;
                case "ArrowUp":
                    active = (active - 1 + items.length) % items.length;
                    highlight();
                    return true;
                case "Tab":
                    if (event.shiftKey) return false;
                    choose(active);
                    return true;
                case "Enter": {
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
