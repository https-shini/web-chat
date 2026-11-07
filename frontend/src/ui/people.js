// @ts-check

import { peopleCount, strings } from "../i18n/strings.js";
import { clear, el, must } from "./dom.js";
import { renderIdentity } from "./identity.js";

/**
 * @typedef {import("../state/store.js").Person} Person
 */

/**
 * Lista de pessoas online. Cada pessoa usa o mesmo monograma que assina
 * suas mensagens: uma identidade só, repetida.
 */
export const createPeople = () => {
    const count = /** @type {HTMLElement} */ (must(".c-people__count"));
    const list = /** @type {HTMLUListElement} */ (must(".c-people__list"));

    return {
        /**
         * @param {Person[]} people
         * @param {string | null} meId
         * @param {boolean} known  Falso enquanto a conexão está fora do ar.
         */
        render(people, meId, known) {
            count.textContent = known ? peopleCount(people.length) : strings.peopleCount.unknown;

            clear(list);
            if (!known) return;

            for (const person of people) {
                const item = el("li", { class: "c-people__item" });
                if (person.status === "away") item.dataset.status = "away";
                item.appendChild(
                    renderIdentity({
                        id: person.id,
                        name: person.name,
                        own: person.id === meId,
                    }),
                );
                // Papel e presença em texto (não só cor): "admin", "ausente".
                if (person.role === "admin") {
                    item.appendChild(
                        el("span", { class: "c-people__tag", text: strings.people.admin }),
                    );
                }
                if (person.status === "away") {
                    const away = el("span", { class: "c-people__tag", text: strings.people.away });
                    if (person.statusText) away.title = person.statusText;
                    item.appendChild(away);
                }
                list.appendChild(item);
            }
        },
    };
};
