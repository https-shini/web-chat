// @ts-check

import { format, peopleCount, strings } from "../i18n/strings.js";
import { el, must } from "./dom.js";
import { badge, renderIdentity } from "./identity.js";

/**
 * Painel de pessoas, agrupado como nos chats em grupo:
 * Administradores — N · Online — N · Ausentes — N.
 *
 * Todo dado vem da lista `user_list` do servidor — nada é inventado aqui.
 * Cada pessoa é um botão que abre o cartão dela (ui/memberCard.js).
 *
 * @typedef {import("../state/store.js").Person} Person
 */

/**
 * @param {{onSelect: (person: Person, trigger: HTMLButtonElement) => void}} handlers
 */
export const createPeople = ({ onSelect }) => {
    const count = /** @type {HTMLElement} */ (must(".c-people__count"));
    const list = /** @type {HTMLElement} */ (must(".c-people__list"));
    const headerCount = /** @type {HTMLElement} */ (must(".c-header__count"));

    /** id → pessoa, para o clique achar o dado atual. */
    /** @type {Map<string, Person>} */
    let byId = new Map();

    list.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const button = /** @type {HTMLButtonElement | null} */ (target?.closest(".c-member"));
        const person = button ? byId.get(button.dataset.personId ?? "") : undefined;
        if (button && person) onSelect(person, button);
    });

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
        if (person.role === "admin") line.appendChild(badge(strings.people.admin, "brand"));
        info.appendChild(line);
        // Presença em texto (não só a cor do ponto).
        if (away) {
            info.appendChild(
                el("span", {
                    class: "c-member__sub",
                    text: person.statusText
                        ? format(strings.memberCard.awayWith, { reason: person.statusText })
                        : strings.memberCard.away,
                }),
            );
        }
        button.appendChild(info);
        return button;
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

            const admins = people.filter((person) => person.role === "admin");
            const rest = people.filter((person) => person.role !== "admin");
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
         * Botão de uma pessoa (para devolver o foco depois de um redesenho).
         * @param {string} id
         * @returns {HTMLButtonElement | null}
         */
        buttonFor(id) {
            return list.querySelector(`.c-member[data-person-id="${CSS.escape(id)}"]`);
        },
    };
};
