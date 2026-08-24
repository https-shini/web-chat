// @ts-check

import { format, strings } from "../i18n/strings.js";
import { must } from "./dom.js";

/**
 * Indicador de digitação. O servidor já emitia `user_typing` e o cliente
 * tinha um stub vazio — o recurso existia no protocolo e não na tela.
 *
 * Fica fora da região live: "está digitando" muda a cada instante e, se
 * fosse anunciado, atropelaria a leitura das mensagens.
 *
 * @typedef {import("../state/store.js").Person} Person
 */
export const createTyping = () => {
    const root = /** @type {HTMLElement} */ (must(".c-typing"));
    const text = /** @type {HTMLElement} */ (must(".c-typing__text", root));

    return {
        /**
         * @param {Person[]} people
         */
        render(people) {
            if (people.length === 0) {
                root.hidden = true;
                text.textContent = "";
                return;
            }

            const [first, second] = people;
            if (people.length === 1 && first) {
                text.textContent = format(strings.typing.one, { name: first.name });
            } else if (people.length === 2 && first && second) {
                text.textContent = format(strings.typing.two, {
                    a: first.name,
                    b: second.name,
                });
            } else {
                text.textContent = strings.typing.many;
            }

            root.hidden = false;
        },
    };
};
