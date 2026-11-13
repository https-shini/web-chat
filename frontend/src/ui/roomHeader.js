// @ts-check

import { format, strings } from "../i18n/strings.js";
import { setIcon } from "./icons.js";

/**
 * Nome e descrição da conversa aberta nos lugares que dependem dela:
 * cabeçalho, boas-vindas, dica do campo de mensagem e as ações do
 * cabeçalho (convite, bloquear, sair/encerrar). Só texto (`textContent`),
 * nunca HTML: nome de sala e nome de pessoa vêm de outra pessoa.
 */
export const createRoomHeader = () => {
    const names = /** @type {HTMLElement[]} */ ([...document.querySelectorAll("[data-room-name]")]);
    const glyph = /** @type {HTMLElement | null} */ (document.querySelector("[data-room-icon]"));
    const topic = /** @type {HTMLElement | null} */ (document.querySelector("[data-room-topic]"));
    const welcome = /** @type {HTMLElement | null} */ (
        document.querySelector("[data-room-welcome]")
    );
    const input = /** @type {HTMLInputElement | null} */ (
        document.querySelector("#campo-mensagem")
    );
    /** @param {string} action */
    const action = (action) =>
        /** @type {HTMLButtonElement | null} */ (
            document.querySelector(`[data-conversation-action="${action}"]`)
        );
    const invite = action("invite");
    const block = action("block");
    const leave = action("leave");

    /** @param {HTMLButtonElement | null} button @param {string} label */
    const label = (button, label) => {
        if (!button) return;
        button.setAttribute("aria-label", label);
        button.dataset.tooltip = label;
    };

    let lastKind = "";

    return {
        /** @param {import("../state/store.js").RoomInfo | null} room */
        render(room) {
            const dm = room?.kind === "dm";
            const name = room?.name || strings.room.untitled;
            for (const node of names) {
                node.textContent = name;
                node.title = name;
            }
            const kind = dm ? "dm" : "room";
            if (glyph && kind !== lastKind) setIcon(glyph, dm ? "at" : "hash");
            lastKind = kind;
            if (topic) {
                topic.textContent =
                    dm && room?.peer
                        ? format(strings.conversations.dmTopic, {
                              username: room.peer.username,
                              presence: room.peer.online
                                  ? strings.conversations.online
                                  : strings.conversations.offline,
                          })
                        : room?.code
                          ? format(strings.room.topic, { code: room.code })
                          : strings.room.topicPending;
            }
            if (welcome) {
                welcome.textContent = dm
                    ? format(strings.conversations.dmWelcome, { name })
                    : format(strings.room.welcome, { name });
            }
            if (input) {
                input.placeholder = dm
                    ? format(strings.conversations.dmPlaceholder, { name })
                    : format(strings.room.placeholder, { name });
            }
            if (invite) invite.hidden = dm || !room?.code;
            if (block) {
                block.hidden = !dm;
                label(block, format(strings.conversations.block, { name }));
            }
            label(leave, dm ? strings.conversations.closeDm : strings.conversations.leaveRoom);
        },
    };
};
