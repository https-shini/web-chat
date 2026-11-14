// @ts-check

import { format, strings } from "../../i18n/strings.js";
import { el } from "../dom.js";
import { hueFor, initialsFor, renderIdentity } from "../identity.js";
import { icon } from "../icons.js";
import { bindContextMenu } from "../primitives/contextMenu.js";
import { showMenu } from "../primitives/menu.js";

/**
 * Lista de conversas da barra lateral: Fixadas, Salas e Privadas (ou a lista
 * mista), cada seção recolhível, com itens compactos de uma linha.
 *
 * Teclado (a lista inteira é UMA parada de Tab, com foco itinerante):
 *   ↑ ↓ Home End   andam entre títulos de seção e conversas
 *   → ←            num título: abre/recolhe; numa conversa, ← vai ao título
 *   Enter/Espaço   abre a conversa (ou alterna a seção)
 *   Ctrl/⌘+Shift+↑/↓  move a conversa focada (o leitor de tela ouve a posição)
 *   Shift+F10 / tecla de menu  menu da conversa
 *
 * Ponteiro: passar sobre um item mostra "Fixar" e "⋯"; arrastar com o mouse
 * reordena (uma linha mostra onde vai cair) e soltar em Fixadas fixa. No
 * toque, o toque longo abre o menu (que tem "Mover para cima/baixo").
 *
 * Os nomes vêm de outras pessoas e entram só como texto. Os ids das
 * conversas são do servidor e não identificam pessoas.
 *
 * @typedef {import("../../state/store.js").ConversationEntry} ConversationEntry
 * @typedef {import("../../state/navigation.js").Section} Section
 * @typedef {import("../../state/navigation.js").SectionId} SectionId
 * @typedef {import("../primitives/menuModel.js").MenuItem} MenuItem
 */

/** @param {SectionId} id */
const sectionName = (id) =>
    id === "pinned"
        ? strings.nav.pinned
        : id === "rooms"
          ? strings.nav.rooms
          : id === "dms"
            ? strings.nav.dms
            : strings.nav.all;

/** @param {SectionId} id */
const emptyText = (id) =>
    id === "pinned"
        ? strings.nav.emptyPinned
        : id === "dms"
          ? strings.nav.emptyDms
          : strings.nav.emptyRooms;

/** @param {number} unread */
const unreadLabel = (unread) =>
    unread === 1
        ? strings.conversations.unreadOne
        : format(strings.conversations.unread, { n: unread });

/**
 * Ícone da conversa: sala = quadrado com iniciais na cor da sala; privada =
 * avatar da pessoa com presença.
 * @param {ConversationEntry} entry
 */
export const conversationGlyph = (entry) => {
    if (entry.kind === "dm" && entry.peer) {
        return renderIdentity({
            id: entry.peer.username,
            author: entry.peer.author,
            name: entry.name,
            own: false,
            withName: false,
            size: "sm",
            presence: entry.peer.online ? "online" : "offline",
        });
    }
    const glyph = el("span", {
        class: `c-room-glyph c-identity--sender-${hueFor(entry.conversationId)}`,
        text: initialsFor(entry.name),
        attrs: { "aria-hidden": "true" },
    });
    return glyph;
};

/**
 * @param {{
 *   container: HTMLElement,
 *   pill: HTMLButtonElement,
 *   onOpen: (id: string) => void,
 *   onToggleSection: (id: SectionId) => void,
 *   onPin: (id: string, value: boolean, at?: number) => void,
 *   onMove: (id: string, to: number) => {position: number, total: number, section: SectionId} | null,
 *   onMoveBy: (id: string, delta: -1 | 1) => {position: number, total: number, section: SectionId} | null,
 *   onNew: (kind: "room" | "dm") => void,
 *   menuFor: (id: string) => {items: MenuItem[], label: string} | null,
 *   isPinned: (id: string) => boolean,
 *   announce: (text: string) => void,
 * }} deps
 */
export const createSidebarNav = ({
    container,
    pill,
    onOpen,
    onToggleSection,
    onPin,
    onMove,
    onMoveBy,
    onNew,
    menuFor,
    isPinned,
    announce,
}) => {
    /** Chave do item que recebe o Tab (foco itinerante): `c:<id>` ou `s:<seção>`. */
    let rovingKey = "";
    /** @type {Section[]} */
    let lastSections = [];

    /** Todos os controles que participam das setas, na ordem da tela. */
    const stops = () =>
        /** @type {HTMLElement[]} */ ([...container.querySelectorAll("[data-roving]")]);

    /** @param {HTMLElement} target */
    const keyOf = (target) => target.dataset.roving ?? "";

    /** @param {HTMLElement | undefined} target */
    const focusStop = (target) => {
        if (!target) return;
        for (const stop of stops()) stop.tabIndex = stop === target ? 0 : -1;
        rovingKey = keyOf(target);
        target.focus();
    };

    /**
     * @param {ConversationEntry} entry
     * @param {boolean} current
     * @param {SectionId} section
     * @param {number} index
     */
    const item = (entry, current, section, index) => {
        const dm = entry.kind === "dm";
        const li = el("li", { class: "c-conv-entry" });
        li.dataset.entryId = entry.conversationId;
        li.dataset.section = section;
        li.dataset.index = String(index);

        const button = el("button", {
            class: "c-nav-item c-conversation-nav__item c-conv",
            attrs: { type: "button" },
        });
        button.dataset.conversationId = entry.conversationId;
        button.dataset.roving = `c:${entry.conversationId}`;
        if (current) button.setAttribute("aria-current", "page");
        if (entry.unread > 0) button.classList.add("c-conversation-nav__item--unread");

        const glyph = el("span", { class: "c-conv__glyph" });
        glyph.appendChild(conversationGlyph(entry));
        button.appendChild(glyph);

        const label = el("span", { class: "c-nav-item__label c-conv__label" });
        label.appendChild(el("span", { class: "c-conv__name", text: entry.name }));
        if (dm && entry.peer) {
            label.appendChild(
                el("span", { class: "c-conv__sub", text: `@${entry.peer.username}` }),
            );
        }
        button.appendChild(label);

        const parts = [entry.name];
        if (dm && entry.peer) {
            parts.push(
                `@${entry.peer.username}`,
                entry.peer.online ? strings.conversations.online : strings.conversations.offline,
            );
        }
        if (entry.unread > 0) {
            const badge = el("span", {
                class: "c-conversation-nav__badge",
                text: entry.unread > 99 ? "99+" : String(entry.unread),
            });
            badge.setAttribute("aria-hidden", "true");
            button.appendChild(badge);
            parts.push(unreadLabel(entry.unread));
        }
        if (section === "pinned") parts.push(strings.nav.pinnedState);
        button.setAttribute("aria-label", parts.join(", "));
        button.title = dm && entry.peer ? `${entry.name} (@${entry.peer.username})` : entry.name;
        li.appendChild(button);

        // Ações ao passar o ponteiro: fora do Tab (o teclado usa o menu).
        const actions = el("span", { class: "c-conv__actions" });
        const pinned = section === "pinned";
        const pin = el("button", {
            class: `c-icon-button c-icon-button--sm c-conv__pin${pinned ? " c-conv__pin--on" : ""}`,
            attrs: {
                type: "button",
                tabindex: "-1",
                "aria-label": format(pinned ? strings.nav.unpinFor : strings.nav.pinFor, {
                    name: entry.name,
                }),
                "aria-pressed": String(pinned),
                "data-tooltip": pinned ? strings.nav.unpin : strings.nav.pin,
            },
        });
        pin.appendChild(icon("pin"));
        pin.dataset.navPin = entry.conversationId;
        const more = el("button", {
            class: "c-icon-button c-icon-button--sm c-conv__more",
            attrs: {
                type: "button",
                tabindex: "-1",
                "aria-haspopup": "menu",
                "aria-expanded": "false",
                "aria-label": format(strings.nav.moreFor, { name: entry.name }),
                "data-tooltip": strings.nav.moreFor.replace(": {name}", ""),
            },
        });
        more.appendChild(icon("dots"));
        more.dataset.navMore = entry.conversationId;
        actions.append(pin, more);
        li.appendChild(actions);
        return li;
    };

    /** @param {Section} section @param {string | null} currentId */
    const group = (section, currentId) => {
        const wrap = el("section", { class: "c-nav-group" });
        wrap.dataset.section = section.id;
        const name = sectionName(section.id);
        const listId = `secao-${section.id}`;
        const head = el("div", { class: "c-nav-group__head" });
        const toggle = el("button", {
            class: "c-nav-group__toggle",
            attrs: {
                type: "button",
                "aria-expanded": String(!section.collapsed),
                "aria-controls": listId,
            },
        });
        toggle.dataset.roving = `s:${section.id}`;
        toggle.dataset.sectionToggle = section.id;
        const chevron = el("span", { class: "c-nav-group__chevron" });
        chevron.appendChild(icon("chevron-down"));
        chevron.setAttribute("aria-hidden", "true");
        toggle.appendChild(chevron);
        toggle.appendChild(el("span", { class: "c-nav-group__title", text: name }));
        toggle.setAttribute(
            "aria-label",
            [
                name,
                format(section.total === 1 ? "1 conversa" : "{n} conversas", { n: section.total }),
                ...(section.unread > 0 ? [unreadLabel(section.unread)] : []),
            ].join(", "),
        );
        if (section.collapsed && section.unread > 0) {
            const badge = el("span", {
                class: "c-conversation-nav__badge c-nav-group__badge",
                text: section.unread > 99 ? "99+" : String(section.unread),
            });
            badge.setAttribute("aria-hidden", "true");
            toggle.appendChild(badge);
        } else {
            toggle.appendChild(
                el("span", {
                    class: "c-nav-group__count",
                    text: String(section.total),
                    attrs: { "aria-hidden": "true" },
                }),
            );
        }
        head.appendChild(toggle);
        if (section.id === "rooms" || section.id === "dms" || section.id === "all") {
            const add = el("button", {
                class: "c-icon-button c-icon-button--sm c-nav-group__add",
                attrs: {
                    type: "button",
                    tabindex: "-1",
                    "aria-label": section.id === "dms" ? strings.nav.newDm : strings.nav.newRoom,
                    "data-tooltip": section.id === "dms" ? strings.nav.newDm : strings.nav.newRoom,
                },
            });
            add.appendChild(icon("plus"));
            add.dataset.navAdd = section.id === "dms" ? "dm" : "room";
            head.appendChild(add);
        }
        wrap.appendChild(head);

        const list = el("ul", {
            class: "c-conversation-nav__list c-nav-group__list",
            attrs: { id: listId, "aria-label": name },
        });
        list.dataset.section = section.id;
        list.hidden = section.collapsed;
        section.items.forEach((entry, index) =>
            list.appendChild(item(entry, entry.conversationId === currentId, section.id, index)),
        );
        if (!section.collapsed && section.items.length === 0) {
            list.appendChild(
                el("li", {
                    class: "c-nav-group__empty",
                    text: section.total > 0 ? strings.nav.emptyUnread : emptyText(section.id),
                }),
            );
        }
        wrap.appendChild(list);
        return wrap;
    };

    // ─── Eventos ─────────────────────────────────────────────────────────
    container.addEventListener("click", (event) => {
        if (dragged) return;
        const target = /** @type {Element | null} */ (event.target);
        const add = target?.closest("[data-nav-add]");
        if (add instanceof HTMLElement) {
            onNew(/** @type {"room" | "dm"} */ (add.dataset.navAdd));
            return;
        }
        const pin = target?.closest("[data-nav-pin]");
        if (pin instanceof HTMLElement && pin.dataset.navPin) {
            const id = pin.dataset.navPin;
            onPin(id, !isPinned(id));
            return;
        }
        const more = target?.closest("[data-nav-more]");
        if (more instanceof HTMLElement && more.dataset.navMore) {
            const menu = menuFor(more.dataset.navMore);
            const row = more.closest(".c-conv-entry")?.querySelector(".c-conv");
            if (menu) {
                showMenu({
                    ...menu,
                    anchor: more,
                    placement: "bottom-end",
                    returnFocus: row instanceof HTMLElement ? row : more,
                });
            }
            return;
        }
        const toggle = target?.closest("[data-section-toggle]");
        if (toggle instanceof HTMLElement) {
            rovingKey = keyOf(toggle);
            onToggleSection(/** @type {SectionId} */ (toggle.dataset.sectionToggle));
            return;
        }
        const button = target?.closest("button[data-conversation-id]");
        if (button instanceof HTMLButtonElement && button.dataset.conversationId) {
            rovingKey = keyOf(button);
            onOpen(button.dataset.conversationId);
        }
    });

    container.addEventListener("focusin", (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        if (!target.dataset?.roving) return;
        rovingKey = keyOf(target);
        for (const stop of stops()) stop.tabIndex = stop === target ? 0 : -1;
    });

    container.addEventListener("keydown", (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        if (!target.dataset?.roving) return;
        const all = stops();
        const at = all.indexOf(target);
        const isToggle = target.dataset.sectionToggle !== undefined;
        const id = target.dataset.conversationId;

        // Mover a conversa: Ctrl/⌘ + Shift + ↑/↓.
        if (
            id &&
            event.shiftKey &&
            (event.ctrlKey || event.metaKey) &&
            (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
            event.preventDefault();
            const result = onMoveBy(id, event.key === "ArrowUp" ? -1 : 1);
            if (result) {
                rovingKey = `c:${id}`;
                announcePosition(id, result);
            }
            return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey) return;

        switch (event.key) {
            case "ArrowDown":
                event.preventDefault();
                focusStop(all[Math.min(all.length - 1, at + 1)]);
                return;
            case "ArrowUp":
                event.preventDefault();
                focusStop(all[Math.max(0, at - 1)]);
                return;
            case "Home":
                event.preventDefault();
                focusStop(all[0]);
                return;
            case "End":
                event.preventDefault();
                focusStop(all.at(-1));
                return;
            case "ArrowRight":
                if (isToggle && target.getAttribute("aria-expanded") === "false") {
                    event.preventDefault();
                    onToggleSection(/** @type {SectionId} */ (target.dataset.sectionToggle));
                }
                return;
            case "ArrowLeft":
                event.preventDefault();
                if (isToggle && target.getAttribute("aria-expanded") === "true") {
                    onToggleSection(/** @type {SectionId} */ (target.dataset.sectionToggle));
                } else if (!isToggle) {
                    const head = target
                        .closest(".c-nav-group")
                        ?.querySelector("[data-section-toggle]");
                    if (head instanceof HTMLElement) focusStop(head);
                }
                return;
            default:
        }
    });

    bindContextMenu(container, {
        selector: ".c-conv",
        resolve: (target) =>
            target.dataset.conversationId ? menuFor(target.dataset.conversationId) : null,
    });

    /**
     * @param {string} id
     * @param {{position: number, total: number, section: SectionId}} result
     */
    const announcePosition = (id, result) => {
        const entry = lastSections.flatMap((s) => s.items).find((e) => e.conversationId === id);
        announce(
            format(strings.nav.moved, {
                name: entry?.name ?? "",
                position: result.position,
                total: result.total,
                section: sectionName(result.section),
            }),
        );
    };

    // ─── Arrastar para reordenar (mouse) ─────────────────────────────────
    /** @type {{id: string, section: SectionId, startX: number, startY: number, ghost: HTMLElement | null, source: HTMLElement} | null} */
    let drag = null;
    /** Houve arrasto: o clique que vem depois não abre a conversa. */
    let dragged = false;
    /** @type {{li: HTMLElement | null, list: HTMLElement, section: SectionId, index: number, after: boolean} | null} */
    let drop = null;

    const clearDrop = () => {
        for (const node of container.querySelectorAll(
            ".c-conv-entry--drop-before, .c-conv-entry--drop-after, .c-nav-group--drop",
        )) {
            node.classList.remove(
                "c-conv-entry--drop-before",
                "c-conv-entry--drop-after",
                "c-nav-group--drop",
            );
        }
        drop = null;
    };

    /** @param {SectionId} from @param {SectionId} to */
    const allowed = (from, to) => from === to || to === "pinned" || from === "pinned";

    /** @param {number} x @param {number} y */
    const findDrop = (x, y) => {
        clearDrop();
        if (!drag) return;
        const hit = document.elementFromPoint(x, y);
        const li = /** @type {HTMLElement | null} */ (hit?.closest(".c-conv-entry") ?? null);
        const list = /** @type {HTMLElement | null} */ (
            hit?.closest(".c-nav-group")?.querySelector(".c-nav-group__list") ?? null
        );
        if (!list || !container.contains(list)) return;
        const section = /** @type {SectionId} */ (list.dataset.section);
        if (!allowed(drag.section, section)) return;
        if (section !== "pinned" && drag.section === "pinned") {
            // Desafixar devolve ao lugar de origem: a seção toda é o alvo.
            list.closest(".c-nav-group")?.classList.add("c-nav-group--drop");
            drop = { li: null, list, section, index: -1, after: false };
            return;
        }
        if (li && li.dataset.entryId !== drag.id) {
            const box = li.getBoundingClientRect();
            const after = y > box.top + box.height / 2;
            li.classList.add(after ? "c-conv-entry--drop-after" : "c-conv-entry--drop-before");
            drop = { li, list, section, index: Number(li.dataset.index), after };
        } else if (!li) {
            list.closest(".c-nav-group")?.classList.add("c-nav-group--drop");
            drop = { li: null, list, section, index: list.children.length, after: false };
        }
    };

    const endDrag = (apply = true) => {
        if (!drag) return;
        const current = drag;
        drag = null;
        current.ghost?.remove();
        current.source.classList.remove("c-conv-entry--dragging");
        container.classList.remove("c-sidebar__scroll--dragging");
        const target = drop;
        clearDrop();
        if (!apply || !target || !current.ghost) return;
        if (target.section === "pinned" && current.section !== "pinned") {
            const at = target.index < 0 ? undefined : target.index + (target.after ? 1 : 0);
            onPin(current.id, true, at);
            return;
        }
        if (current.section === "pinned" && target.section !== "pinned") {
            onPin(current.id, false);
            return;
        }
        if (target.li) {
            const from = Number(current.source.dataset.index);
            let to = target.index + (target.after ? 1 : 0);
            if (from < to) to -= 1;
            const result = onMove(current.id, to);
            if (result) announcePosition(current.id, result);
        }
    };

    container.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        const target = /** @type {Element | null} */ (event.target);
        if (target?.closest(".c-conv__actions")) return;
        const li = target?.closest(".c-conv-entry");
        if (!(li instanceof HTMLElement) || !li.dataset.entryId) return;
        dragged = false;
        drag = {
            id: li.dataset.entryId,
            section: /** @type {SectionId} */ (li.dataset.section),
            startX: event.clientX,
            startY: event.clientY,
            ghost: null,
            source: li,
        };
    });
    window.addEventListener("pointermove", (event) => {
        if (!drag) return;
        if (!drag.ghost) {
            if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
            const box = drag.source.getBoundingClientRect();
            const ghost = /** @type {HTMLElement} */ (drag.source.cloneNode(true));
            ghost.classList.add("c-conv-ghost");
            ghost.setAttribute("aria-hidden", "true");
            ghost.style.width = `${box.width}px`;
            document.body.appendChild(ghost);
            drag.ghost = ghost;
            drag.source.classList.add("c-conv-entry--dragging");
            container.classList.add("c-sidebar__scroll--dragging");
            dragged = true;
        }
        drag.ghost.style.left = `${event.clientX + 8}px`;
        drag.ghost.style.top = `${event.clientY - 14}px`;
        findDrop(event.clientX, event.clientY);
    });
    window.addEventListener("pointerup", () => {
        endDrag(true);
        // O clique sintetizado depois do arrasto é ignorado.
        setTimeout(() => (dragged = false), 0);
    });
    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && drag?.ghost) {
            event.preventDefault();
            endDrag(false);
        }
    });

    // ─── Não lidas fora da vista ─────────────────────────────────────────
    const updatePill = () => {
        const view = container.getBoundingClientRect();
        let below = 0;
        let above = 0;
        /** @type {HTMLElement | null} */
        let firstBelow = null;
        /** @type {HTMLElement | null} */
        let lastAbove = null;
        for (const node of container.querySelectorAll(".c-conversation-nav__item--unread")) {
            const box = node.getBoundingClientRect();
            if (box.height === 0) continue;
            const count =
                Number(node.querySelector(".c-conversation-nav__badge")?.textContent) || 1;
            if (box.top >= view.bottom - 4) {
                below += count;
                firstBelow ??= /** @type {HTMLElement} */ (node);
            } else if (box.bottom <= view.top + 4) {
                above += count;
                lastAbove = /** @type {HTMLElement} */ (node);
            }
        }
        const target = firstBelow ?? lastAbove;
        pill.hidden = !target;
        if (!target) return;
        pill.replaceChildren(
            icon(firstBelow ? "arrow-down" : "arrow-up"),
            document.createTextNode(
                format(firstBelow ? strings.nav.unreadBelow : strings.nav.unreadAbove, {
                    n: firstBelow ? below : above,
                }),
            ),
        );
        pill.dataset.target = target.dataset.conversationId ?? "";
        pill.dataset.edge = firstBelow ? "bottom" : "top";
    };
    container.addEventListener("scroll", updatePill, { passive: true });
    window.addEventListener("resize", updatePill);
    pill.addEventListener("click", () => {
        const id = pill.dataset.target;
        const node = id
            ? container.querySelector(`[data-conversation-id="${CSS.escape(id)}"]`)
            : null;
        if (node instanceof HTMLElement) {
            node.scrollIntoView({ block: "center" });
            focusStop(node);
        }
    });

    return {
        /**
         * @param {Section[]} sections
         * @param {string | null} currentId
         */
        render(sections, currentId) {
            lastSections = sections;
            const hadFocus = container.contains(document.activeElement);
            const scroll = container.scrollTop;
            container.replaceChildren(...sections.map((section) => group(section, currentId)));
            container.scrollTop = scroll;
            const all = stops();
            const wanted =
                all.find((stop) => keyOf(stop) === rovingKey) ??
                (currentId ? all.find((stop) => keyOf(stop) === `c:${currentId}`) : undefined) ??
                all[0];
            for (const stop of all) stop.tabIndex = stop === wanted ? 0 : -1;
            if (hadFocus && wanted) wanted.focus({ preventScroll: false });
            requestAnimationFrame(updatePill);
        },

        /** Põe o foco na conversa aberta (ou no primeiro controle da lista). */
        focusCurrent() {
            const all = stops();
            focusStop(all.find((stop) => stop.getAttribute("aria-current") === "page") ?? all[0]);
        },
    };
};
