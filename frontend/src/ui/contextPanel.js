// @ts-check

import { format, strings } from "../i18n/strings.js";
import { el, must } from "./dom.js";
import { icon } from "./icons.js";
import { excerptPlain } from "../markdown/parse.js";
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
 *   onJumpTo?: (id: string) => void,
 *   onUnpin?: (id: string) => void,
 *   onDescribe?: (text: string) => void,
 * }} deps
 */
export const createContextPanel = ({
    onInvite,
    onCopyHandle,
    onPin,
    onClearLocal,
    onClearRoom,
    onFilter,
    onJumpTo = () => {},
    onUnpin = () => {},
    onDescribe = () => {},
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
    const pinsBlock = /** @type {HTMLElement} */ (must('[data-context-block="pins"]', panel));
    const pinsList = /** @type {HTMLElement} */ (must("[data-pins-list]", panel));
    const pinsCount = /** @type {HTMLElement} */ (must("[data-pins-count]", panel));
    /** Editando a descrição agora (o redesenho não apaga o que está sendo escrito). */
    let editingDescription = false;

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

    /**
     * Descrição da sala, com edição no lugar para quem modera (decisão F6).
     * @param {string} text
     * @param {boolean} editable
     */
    const description = (text, editable) => {
        const box = el("div", { class: "c-context__description" });
        box.appendChild(el("p", { class: "c-context__label", text: strings.description.label }));
        box.appendChild(
            el("p", {
                class: text ? "c-context__about" : "c-context__about c-context__about--empty",
                text: text || strings.description.empty,
            }),
        );
        if (!editable) return box;
        const edit = el("button", {
            class: "c-button c-button--ghost c-button--sm",
            text: text ? strings.description.edit : strings.description.add,
            attrs: { type: "button" },
        });
        edit.addEventListener("click", () => {
            editingDescription = true;
            const form = el("form", {
                class: "c-context__description-form",
                attrs: { novalidate: "" },
            });
            const field = el("textarea", {
                class: "c-field__input",
                attrs: {
                    rows: "3",
                    maxlength: "200",
                    "aria-label": strings.description.label,
                    placeholder: strings.description.placeholder,
                    "aria-describedby": "descricao-dica",
                },
            });
            field.value = text;
            const hint = el("p", {
                class: "c-field__hint",
                text: strings.description.hint,
                attrs: { id: "descricao-dica" },
            });
            const row = el("div", { class: "c-context__description-actions" });
            const cancel = el("button", {
                class: "c-button c-button--ghost c-button--sm",
                text: strings.description.cancel,
                attrs: { type: "button" },
            });
            const save = el("button", {
                class: "c-button c-button--primary c-button--sm",
                text: strings.description.save,
                attrs: { type: "submit" },
            });
            row.append(cancel, save);
            form.append(field, hint, row);
            box.replaceWith(form);
            field.focus();
            const done = () => {
                editingDescription = false;
                form.replaceWith(description(text, editable));
            };
            cancel.addEventListener("click", done);
            form.addEventListener("keydown", (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    done();
                }
            });
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                editingDescription = false;
                onDescribe(field.value.trim());
                done();
            });
        });
        box.appendChild(edit);
        return box;
    };

    return {
        /**
         * @param {RoomInfo | null} room
         * @param {{people: number, role: "member" | "admin" | "host", pinned: boolean, online: boolean, pins?: import("../state/store.js").Pin[]}} detail
         */
        render(room, { people, role, pinned, pins = [] }) {
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
            const moderates = !dm && (role === "host" || role === "admin");
            if (!dm && !editingDescription)
                parts.push(description(room.description ?? "", moderates));
            if (!editingDescription) info.replaceChildren(...parts);

            // Mensagens fixadas: trecho e autoria; o clique leva à mensagem.
            pinsBlock.hidden = pins.length === 0;
            pinsCount.textContent = pins.length ? String(pins.length) : "";
            const canUnpin = dm || moderates;
            pinsList.replaceChildren(
                ...pins.map((pin) => {
                    const li = el("li", { class: "c-pin" });
                    const open = el("button", {
                        class: "c-pin__open",
                        attrs: {
                            type: "button",
                            "aria-label": format(strings.pins.open, {
                                name: pin.userName || `@${pin.username}`,
                                excerpt: excerptPlain(pin.excerpt),
                            }),
                        },
                    });
                    open.append(
                        el("span", {
                            class: "c-pin__who",
                            text: `@${pin.username}`,
                            attrs: { "aria-hidden": "true" },
                        }),
                        el("span", {
                            class: "c-pin__text",
                            text: excerptPlain(pin.excerpt),
                            attrs: { "aria-hidden": "true" },
                        }),
                    );
                    open.addEventListener("click", () => onJumpTo(pin.id));
                    li.appendChild(open);
                    if (canUnpin) {
                        const remove = el("button", {
                            class: "c-icon-button c-icon-button--sm c-pin__remove",
                            attrs: {
                                type: "button",
                                "aria-label": format(strings.pins.unpinLabel, {
                                    name: pin.userName || pin.username,
                                }),
                                "data-tooltip": strings.pins.unpin,
                            },
                        });
                        remove.appendChild(icon("close"));
                        remove.addEventListener("click", () => onUnpin(pin.id));
                        li.appendChild(remove);
                    }
                    return li;
                }),
            );

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
