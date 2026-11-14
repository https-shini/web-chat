// @ts-check

import { format, strings } from "../../i18n/strings.js";
import { el, must } from "../dom.js";

/**
 * Página "Comandos": o catálogo oficial do servidor (`command_catalog`),
 * com descrição, sintaxe, exemplos, apelidos e quem pode usar — tudo o que
 * o servidor já manda, nada inventado aqui. Busca e filtro por categoria
 * são só no navegador.
 *
 * "Usar" abre a última conversa e põe o comando no campo de mensagem (não
 * envia: a pessoa completa e confirma).
 *
 * @typedef {import("../../state/store.js").CommandInfo} CommandInfo
 */

/** Sem acento e em minúsculas. @param {string} text */
const fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

/**
 * Comandos que combinam com a busca e a categoria.
 * @param {CommandInfo[]} catalog
 * @param {string} query
 * @param {string} category  "" = todas
 */
export const filterCommands = (catalog, query, category) => {
    const q = fold(query.trim().replace(/^\//, ""));
    return catalog.filter((command) => {
        if (category && command.category !== category) return false;
        if (!q) return true;
        return [command.name, ...command.aliases, command.description, command.categoryLabel]
            .map(fold)
            .some((text) => text.includes(q));
    });
};

/**
 * @param {{onUse: (command: CommandInfo) => void, canUse: () => boolean}} deps
 */
export const createCommandsPage = ({ onUse, canUse }) => {
    const section = /** @type {HTMLElement} */ (must('[data-page="commands"]'));
    const title = /** @type {HTMLElement} */ (must(".c-page__title", section));
    const lead = /** @type {HTMLElement} */ (must("[data-commands-lead]", section));
    const search = /** @type {HTMLInputElement} */ (must("#comandos-busca", section));
    const chips = /** @type {HTMLElement} */ (must("[data-commands-categories]", section));
    const list = /** @type {HTMLElement} */ (must("[data-commands-list]", section));
    const status = /** @type {HTMLElement} */ (must("[data-commands-status]", section));
    lead.textContent = strings.commandsPage.lead;

    /** @type {CommandInfo[]} */
    let catalog = [];
    let category = "";

    /** @param {CommandInfo} command */
    const card = (command) => {
        const li = el("li", { class: "c-command-card" });
        if (!command.allowed) li.classList.add("c-command-card--restricted");
        const head = el("div", { class: "c-command-card__head" });
        head.appendChild(el("code", { class: "c-command-card__syntax", text: command.syntax }));
        if (command.permission && command.permission !== "everyone") {
            head.appendChild(
                el("span", { class: "c-badge c-badge--role", text: command.categoryLabel }),
            );
        }
        if (command.scope === "client") {
            head.appendChild(el("span", { class: "c-badge", text: strings.commandsPage.local }));
        }
        li.appendChild(head);
        li.appendChild(el("p", { class: "c-command-card__desc", text: command.description }));
        if (command.examples.length) {
            const examples = el("p", { class: "c-command-card__examples" });
            examples.appendChild(
                el("span", { class: "sr-only", text: `${strings.commandsPage.examples}: ` }),
            );
            command.examples.forEach((example, index) => {
                if (index) examples.appendChild(document.createTextNode(" · "));
                examples.appendChild(el("code", { text: example }));
            });
            li.appendChild(examples);
        }
        if (command.aliases.length) {
            li.appendChild(
                el("p", {
                    class: "c-command-card__aliases",
                    text: format(strings.commandsPage.aliases, {
                        list: command.aliases.map((alias) => `/${alias}`).join(", "),
                    }),
                }),
            );
        }
        const foot = el("div", { class: "c-command-card__foot" });
        foot.appendChild(
            el("span", {
                class: "c-command-card__who",
                text: command.allowed
                    ? strings.commandsPage.allowed
                    : strings.commandsPage.restricted,
            }),
        );
        if (command.allowed) {
            const use = el("button", {
                class: "c-button c-button--secondary c-button--sm",
                text: strings.commandsPage.use,
                attrs: {
                    type: "button",
                    "aria-label": format(strings.commandsPage.useLabel, {
                        name: `/${command.name}`,
                    }),
                },
            });
            use.dataset.command = command.name;
            foot.appendChild(use);
        }
        li.appendChild(foot);
        return li;
    };

    const paint = () => {
        const shown = filterCommands(catalog, search.value, category);
        list.replaceChildren(...shown.map(card));
        if (catalog.length === 0) {
            list.appendChild(
                el("li", { class: "c-commands__empty", text: strings.commandsPage.loading }),
            );
        } else if (shown.length === 0) {
            list.appendChild(
                el("li", { class: "c-commands__empty", text: strings.commandsPage.empty }),
            );
        }
        status.textContent = format("{n} comandos", { n: shown.length });
    };

    const paintChips = () => {
        const categories = [
            ...new Map(catalog.map((c) => [c.category, c.categoryLabel])).entries(),
        ];
        chips.replaceChildren(
            ...[["", strings.commandsPage.all], ...categories].map(([id, label]) => {
                const chip = el("button", {
                    class: "c-chip",
                    text: label,
                    attrs: { type: "button", "aria-pressed": String(id === category) },
                });
                chip.dataset.category = id;
                return chip;
            }),
        );
    };

    search.addEventListener("input", paint);
    chips.addEventListener("click", (event) => {
        const chip = /** @type {Element} */ (event.target).closest("[data-category]");
        if (!(chip instanceof HTMLElement)) return;
        category = chip.dataset.category ?? "";
        paintChips();
        paint();
    });
    list.addEventListener("click", (event) => {
        const button = /** @type {Element} */ (event.target).closest("[data-command]");
        if (!(button instanceof HTMLElement)) return;
        const command = catalog.find((c) => c.name === button.dataset.command);
        if (command) onUse(command);
    });

    return {
        /** @param {boolean} visible */
        setVisible(visible) {
            section.hidden = !visible;
        },
        /** @param {CommandInfo[]} next */
        render(next) {
            catalog = next;
            if (category && !catalog.some((c) => c.category === category)) category = "";
            paintChips();
            paint();
            section.dataset.canUse = String(canUse());
        },
        focus() {
            title.focus();
        },
    };
};
