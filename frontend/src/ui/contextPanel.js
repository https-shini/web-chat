// @ts-check

import { format, strings } from "../i18n/strings.js";
import { el, must } from "./dom.js";
import { icon } from "./icons.js";
import { conversationGlyph } from "./nav/sidebarNav.js";

/**
 * Painel de contexto (direita), com o mesmo esqueleto para sala e privada,
 * como o "Dados do grupo" do WhatsApp e o painel de perfil do Fluxer:
 *
 *   1. Informações: ícone, nome, resumo (pessoas, ou arroba e presença), seu papel
 *      e ações rápidas (convidar ou copiar o arroba, fixar, limpar a tela);
 *   2. Integrantes (sala): filtro e lista agrupada — `ui/people.js`;
 *      Sobre esta conversa (privada);
 *   3. Ações: limpar a tela, apagar o histórico para todos (só quem modera),
 *      sair da sala, ou encerrar e bloquear (privada).
 *
 * Só mostra o que o navegador já recebeu do servidor; permissões de verdade
 * continuam sendo conferidas no servidor.
 *
 * @typedef {import("../state/store.js").RoomInfo} RoomInfo
 */

/**
 * @param {{
 *   onInvite: () => void,
 *   onCopyHandle: (username: string) => void,
 *   onPin: (id: string, value: boolean) => void,
 *   onClearLocal: () => void,
 *   onClearRoom: () => void,
 *   onFilter: (query: string) => void,
 * }} deps
 */
export const createContextPanel = ({
    onInvite,
    onCopyHandle,
    onPin,
    onClearLocal,
    onClearRoom,
    onFilter,
}) => {
    const panel = /** @type {HTMLElement} */ (must(".c-context"));
    const heading = /** @type {HTMLElement} */ (must("#pessoas-titulo", panel));
    const info = /** @type {HTMLElement} */ (must("[data-context-info]", panel));
    const code = /** @type {HTMLElement} */ (must("[data-context-code]", panel));
    const inviteBlock = /** @type {HTMLElement} */ (must('[data-context-block="invite"]', panel));
    const membersBlock = /** @type {HTMLElement} */ (must('[data-context-block="members"]', panel));
    const clearRoom = /** @type {HTMLButtonElement} */ (
        must('[data-context-action="clear-room"]', panel)
    );
    const clearLocal = /** @type {HTMLButtonElement} */ (
        must('[data-context-action="clear-local"]', panel)
    );
    const filter = /** @type {HTMLInputElement} */ (must("#filtro-integrantes", panel));

    // Blocos recolhíveis (disclosure): o estado fica em memória.
    for (const toggle of panel.querySelectorAll(".c-context__toggle")) {
        toggle.addEventListener("click", () => {
            const body = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
            if (!body) return;
            const open = toggle.getAttribute("aria-expanded") !== "true";
            toggle.setAttribute("aria-expanded", String(open));
            body.hidden = !open;
        });
    }
    clearLocal.addEventListener("click", onClearLocal);
    clearRoom.addEventListener("click", onClearRoom);
    filter.addEventListener("input", () => onFilter(filter.value));

    /** @type {{room: RoomInfo | null, pinned: boolean}} */
    let current = { room: null, pinned: false };

    /**
     * @param {string} iconName
     * @param {string} label
     * @param {() => void} run
     * @param {{pressed?: boolean}} [options]
     */
    const quick = (iconName, label, run, options = {}) => {
        const button = el("button", { class: "c-quick-action", attrs: { type: "button" } });
        if (options.pressed !== undefined)
            button.setAttribute("aria-pressed", String(options.pressed));
        const glyph = el("span", { class: "c-quick-action__icon" });
        glyph.appendChild(icon(iconName));
        glyph.setAttribute("aria-hidden", "true");
        button.append(glyph, el("span", { text: label }));
        button.addEventListener("click", run);
        return button;
    };

    return {
        /**
         * @param {RoomInfo | null} room
         * @param {{people: number, role: "member" | "admin" | "host", pinned: boolean, online: boolean}} detail
         */
        render(room, { people, role, pinned }) {
            current = { room, pinned };
            if (!room) return;
            const dm = room.kind === "dm";
            heading.textContent = dm ? strings.context.dmTitle : strings.context.roomTitle;
            panel.dataset.kind = dm ? "dm" : "room";

            const glyph = el("span", { class: "c-context__glyph" });
            glyph.appendChild(conversationGlyph({ ...room, unread: 0 }));
            const text = el("div", { class: "c-context__who" });
            text.appendChild(el("p", { class: "c-context__name", text: room.name }));
            const sub =
                dm && room.peer
                    ? `@${room.peer.username} · ${
                          room.peer.online
                              ? strings.userPanel.online
                              : strings.conversations.offline
                      }`
                    : `${strings.context.room} · ${
                          people === 1
                              ? strings.context.peopleOne
                              : format(strings.context.people, { n: people })
                      }`;
            text.appendChild(el("p", { class: "c-context__sub", text: sub }));
            if (!dm && (role === "host" || role === "admin")) {
                text.appendChild(
                    el("span", {
                        class: "c-badge c-badge--role",
                        text: role === "host" ? strings.context.youHost : strings.context.youAdmin,
                    }),
                );
            }
            const head = el("div", { class: "c-context__head" });
            head.append(glyph, text);

            const actions = el("div", { class: "c-context__quick" });
            actions.appendChild(
                dm && room.peer
                    ? quick("copy", strings.context.copyHandle, () =>
                          onCopyHandle(room.peer?.username ?? ""),
                      )
                    : quick("link", strings.context.invite, onInvite),
            );
            actions.appendChild(
                quick(
                    "pin",
                    pinned ? strings.context.pinned : strings.context.pin,
                    () => onPin(room.conversationId, !current.pinned),
                    { pressed: pinned },
                ),
            );
            actions.appendChild(quick("eraser", strings.context.clearLocal, onClearLocal));

            const parts = [head, actions];
            if (dm) {
                parts.push(el("p", { class: "c-context__about", text: strings.context.about }));
            }
            info.replaceChildren(...parts);

            code.textContent = room.code ?? "";
            inviteBlock.hidden = dm || !room.code;
            membersBlock.hidden = dm;
            clearRoom.hidden = dm || (role !== "admin" && role !== "host");
        },

        /** Limpa o filtro (outra conversa aberta). */
        resetFilter() {
            if (!filter.value) return;
            filter.value = "";
            onFilter("");
        },
    };
};
