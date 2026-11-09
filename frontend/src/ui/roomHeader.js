// @ts-check

import { format, strings } from "../i18n/strings.js";

/**
 * Nome e código da sala aberta nos lugares que antes diziam "sala-aberta":
 * cabeçalho, item da barra lateral, boas-vindas e dica do campo de mensagem.
 * Só texto (`textContent`), nunca HTML: o nome da sala vem de outra pessoa.
 */
export const createRoomHeader = () => {
    const names = /** @type {HTMLElement[]} */ ([...document.querySelectorAll("[data-room-name]")]);
    const topic = /** @type {HTMLElement | null} */ (document.querySelector("[data-room-topic]"));
    const welcome = /** @type {HTMLElement | null} */ (
        document.querySelector("[data-room-welcome]")
    );
    const input = /** @type {HTMLInputElement | null} */ (
        document.querySelector("#campo-mensagem")
    );

    return {
        /** @param {import("../state/store.js").RoomInfo | null} room */
        render(room) {
            const name = room?.name || strings.room.untitled;
            for (const node of names) {
                node.textContent = name;
                node.title = name;
            }
            if (topic) {
                topic.textContent = room
                    ? format(strings.room.topic, { code: room.code })
                    : strings.room.topicPending;
            }
            if (welcome) welcome.textContent = format(strings.room.welcome, { name });
            if (input) input.placeholder = format(strings.room.placeholder, { name });
        },
    };
};
