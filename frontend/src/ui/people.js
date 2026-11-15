// @ts-check

import { format, peopleCount, strings } from "../i18n/strings.js";
import { el, must } from "./dom.js";
import { badge, renderIdentity } from "./identity.js";
import { icon } from "./icons.js";
import { bindContextMenu } from "./primitives/contextMenu.js";
import { showMenu } from "./primitives/menu.js";

/**
 * Painel de pessoas, agrupado como nos chats em grupo:
 * Administradores — N · Online — N · Ausentes — N.
 *
 * Todo dado vem da lista `user_list` do servidor — nada é inventado aqui.
 * Cada pessoa é um botão que abre o cartão dela (ui/memberCard.js). Ao
 * passar o ponteiro aparecem "Mensagem privada" e "⋯"; o mesmo menu abre
 * com clique direito, Shift+F10 e toque longo. O filtro (nome ou arroba) é só
 * no navegador.
 *
 * @typedef {import("../state/store.js").Person} Person
 */

/** Sem acento e em minúsculas. @param {string} text */
const fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

/**
 * @param {{
 *   onSelect: (person: Person, trigger: HTMLButtonElement) => void,
 *   onDirect?: (person: Person) => void,
 *   menuFor?: (person: Person) => import("./primitives/menuModel.js").MenuItem[],
 * }} handlers
 */
export const createPeople = ({ onSelect, onDirect, menuFor }) => {
    const count = /** @type {HTMLElement} */ (must(".c-people__count"));
    const list = /** @type {HTMLElement} */ (must(".c-people__list"));
    const headerCount = /** @type {HTMLElement} */ (must(".c-header__count"));

    /** id → pessoa, para o clique achar o dado atual. */
    /** @type {Map<string, Person>} */
    let byId = new Map();

    /** Filtro atual (nome ou arroba). */
    let query = "";
    /** Última lista desenhada, para refazer com outro filtro. @type {[Person[], string | null, boolean]} */
    let last = [[], null, false];

    list.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const direct = target?.closest("[data-person-direct]");
        const more = target?.closest("[data-person-more]");
        const row = target?.closest(".c-member-row");
        const button = /** @type {HTMLButtonElement | null} */ (
            row?.querySelector(".c-member") ?? null
        );
        const person = button ? byId.get(button.dataset.personId ?? "") : undefined;
        if (!button || !person) return;
        if (direct) {
            onDirect?.(person);
            return;
        }
        if (more instanceof HTMLElement && menuFor) {
            showMenu({
                label: format(strings.context.memberMenu, { name: person.name }),
                anchor: more,
                placement: "bottom-end",
                returnFocus: button,
                items: menuFor(person),
            });
            return;
        }
        if (target?.closest(".c-member")) onSelect(person, button);
    });

    if (menuFor) {
        bindContextMenu(list, {
            selector: ".c-member",
            resolve: (target) => {
                const person = byId.get(target.dataset.personId ?? "");
                return person
                    ? {
                          label: format(strings.context.memberMenu, { name: person.name }),
                          items: menuFor(person),
                      }
                    : null;
            },
        });
    }

    /**
     * @param {Person} person
     * @param {string | null} meId
     */
    const renderMember = (person, meId) => {
        const own = person.id === meId;
        const away = person.status === "away";
        const button = el("button", {
            class: "c-member",
            attrs: {
                type: "button",
                "aria-haspopup": "dialog",
                "aria-expanded": "false",
                "data-person-id": person.id,
            },
        });
        if (away) button.dataset.status = "away";

        button.appendChild(
            renderIdentity({
                id: person.id,
                author: person.author ?? null,
                name: person.name,
                own,
                withName: false,
                presence: away ? "away" : "online",
            }),
        );

        const info = el("span", { class: "c-member__info" });
        const line = el("span", { class: "c-member__line" });
        line.appendChild(el("span", { class: "c-member__name", text: person.name }));
        if (own) line.appendChild(badge(strings.room.youBadge));
        if (person.role === "admin") line.appendChild(badge(strings.people.admin, "role"));
        if (person.role === "host") line.appendChild(badge(strings.people.host, "role"));
        info.appendChild(line);
        // Linha de baixo: @username e, se ausente, a presença em texto (não
        // só a cor do ponto).
        const handle = person.username ? `@${person.username}` : "";
        const presence = away
            ? person.statusText
                ? format(strings.memberCard.awayWith, { reason: person.statusText })
                : strings.memberCard.away
            : "";
        const sub = [handle, presence].filter(Boolean).join(" · ");
        if (sub) info.appendChild(el("span", { class: "c-member__sub", text: sub }));
        button.appendChild(info);
        const row = el("div", { class: "c-member-row" });
        row.appendChild(button);
        // Ações ao passar o ponteiro (fora do Tab: o teclado usa o cartão
        // ou o menu de contexto).
        const actions = el("span", { class: "c-member-row__actions" });
        if (!own && onDirect && person.username) {
            const direct = el("button", {
                class: "c-icon-button c-icon-button--sm",
                attrs: {
                    type: "button",
                    tabindex: "-1",
                    "data-person-direct": "",
                    "aria-label": `${strings.memberCard.direct}: ${person.name}`,
                    "data-tooltip": strings.memberCard.direct,
                },
            });
            direct.appendChild(icon("at"));
            actions.appendChild(direct);
        }
        if (menuFor) {
            const more = el("button", {
                class: "c-icon-button c-icon-button--sm",
                attrs: {
                    type: "button",
                    tabindex: "-1",
                    "data-person-more": "",
                    "aria-haspopup": "menu",
                    "aria-expanded": "false",
                    "aria-label": format(strings.context.memberMenu, { name: person.name }),
                    "data-tooltip": strings.context.more,
                },
            });
            more.appendChild(icon("dots"));
            actions.appendChild(more);
        }
        row.appendChild(actions);
        return row;
    };

    /**
     * @param {string} title
     * @param {Person[]} members
     * @param {string | null} meId
     */
    const renderGroup = (title, members, meId) => {
        const group = el("section", { class: "c-people__group" });
        const heading = el("h3", {
            class: "c-people__title",
            text: format(title, { n: members.length }),
        });
        group.appendChild(heading);
        const ul = el("ul");
        for (const person of members) {
            const li = el("li");
            li.appendChild(renderMember(person, meId));
            ul.appendChild(li);
        }
        group.appendChild(ul);
        return group;
    };

    return {
        /**
         * @param {Person[]} people
         * @param {string | null} meId
         * @param {boolean} known  Falso enquanto a conexão está fora do ar.
         */
        render(people, meId, known) {
            last = [people, meId, known];
            // Fora do ar o título fica só "Pessoas"; o motivo vai no corpo do painel.
            count.textContent = known ? peopleCount(people.length) : "";
            headerCount.textContent = known ? String(people.length) : "";
            byId = new Map(people.map((person) => [person.id, person]));
            // A lista é redesenhada a cada mudança: quem estava com o foco
            // numa pessoa continua nela (se ela ainda estiver na sala).
            const active = document.activeElement;
            const focusedId =
                active instanceof HTMLElement && list.contains(active)
                    ? (active.dataset.personId ?? null)
                    : null;

            if (!known) {
                list.replaceChildren(
                    el("p", { class: "c-people__empty", text: strings.people.unknown }),
                );
                return;
            }

            const q = fold(query.trim().replace(/^@/, ""));
            const shown = q
                ? people.filter((person) =>
                      [person.name, person.username ?? ""].some((text) => fold(text).includes(q)),
                  )
                : people;
            if (shown.length === 0) {
                list.replaceChildren(
                    el("p", { class: "c-people__empty", text: strings.context.noMatch }),
                );
                return;
            }
            const admins = shown.filter((person) => person.role === "admin");
            const rest = shown.filter((person) => person.role !== "admin");
            const online = rest.filter((person) => person.status !== "away");
            const away = rest.filter((person) => person.status === "away");

            const groups = [];
            if (admins.length) groups.push(renderGroup(strings.people.groupAdmins, admins, meId));
            if (online.length) groups.push(renderGroup(strings.people.groupOnline, online, meId));
            if (away.length) groups.push(renderGroup(strings.people.groupAway, away, meId));
            list.replaceChildren(...groups);
            if (focusedId) this.buttonFor(focusedId)?.focus();
        },

        /**
         * Filtra a lista por nome ou arroba (só no navegador).
         * @param {string} text
         */
        setFilter(text) {
            query = text;
            this.render(...last);
        },

        /**
         * Botão de uma pessoa (para devolver o foco depois de um redesenho).
         * @param {string} id
         * @returns {HTMLButtonElement | null}
         */
        buttonFor(id) {
            return list.querySelector(`.c-member[data-person-id="${CSS.escape(id)}"]`);
        },
    };
};
