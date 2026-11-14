// @ts-check

import { el } from "../dom.js";
import { icon } from "../icons.js";
import { first, isFocusable, move, tidy, typeahead } from "./menuModel.js";
import { anchorTo, pointAnchor } from "./position.js";

/**
 * Menu (padrão "menu" do APG) para ações de mensagens, pessoas e conversas.
 *
 * - Desktop: menu flutuante preso à âncora (botão "⋯") ou ao ponto do
 *   clique direito, posicionado pelo `@floating-ui/dom`.
 * - Celular (até 767 px): o mesmo menu vira uma folha inferior, como no
 *   Fluxer (`menu_bottom_sheet`), com fundo escurecido e área de toque maior.
 *
 * Teclado: setas, Home/End, letras (busca), Enter/Espaço, → abre submenu,
 * ← ou Escape fecha o submenu, Escape fecha o menu e devolve o foco a quem
 * abriu, Tab fecha e segue o fluxo normal.
 *
 * Só um menu fica aberto por vez. Nada de HTML: rótulos entram como texto.
 *
 * @typedef {import("./menuModel.js").MenuItem} MenuItem
 * @typedef {{
 *   items: MenuItem[],
 *   label: string,
 *   anchor?: Element | null,
 *   point?: {x: number, y: number} | null,
 *   placement?: import("@floating-ui/dom").Placement,
 *   returnFocus?: HTMLElement | null,
 *   onClose?: () => void,
 * }} MenuOptions
 */

/** Largura em que o menu vira folha inferior. */
const SHEET_QUERY = "(max-width: 47.99rem)";

/** @type {{close: (options?: {restoreFocus?: boolean}) => void} | null} */
let openMenu = null;

/** Fecha o menu aberto (se houver). */
export const closeMenus = () => openMenu?.close({ restoreFocus: false });

/** Há um menu aberto? */
export const isMenuOpen = () => openMenu !== null;

/**
 * Desenha a lista de itens. Devolve os botões, alinhados aos itens.
 * @param {HTMLElement} list
 * @param {MenuItem[]} items
 * @returns {(HTMLElement | null)[]}
 */
const paint = (list, items) => {
    list.replaceChildren();
    return items.map((item) => {
        const type = item.type ?? "item";
        if (type === "separator") {
            list.appendChild(
                el("div", { class: "c-menu__separator", attrs: { role: "separator" } }),
            );
            return null;
        }
        if (type === "label") {
            list.appendChild(
                el("div", {
                    class: "c-menu__label",
                    text: item.label ?? "",
                    attrs: { role: "presentation" },
                }),
            );
            return null;
        }
        const role = type === "check" ? "menuitemcheckbox" : "menuitem";
        const button = el("button", {
            class: `c-menu__item${item.danger ? " c-menu__item--danger" : ""}`,
            attrs: { type: "button", role, tabindex: "-1" },
        });
        if (type === "check") button.setAttribute("aria-checked", String(Boolean(item.checked)));
        if (type === "submenu") {
            button.setAttribute("aria-haspopup", "menu");
            button.setAttribute("aria-expanded", "false");
        }
        if (item.disabled) button.setAttribute("aria-disabled", "true");
        const glyph = el("span", { class: "c-menu__icon" });
        if (type === "check") {
            if (item.checked) glyph.appendChild(icon("check"));
        } else if (item.icon) glyph.appendChild(icon(item.icon));
        glyph.setAttribute("aria-hidden", "true");
        button.appendChild(glyph);
        button.appendChild(el("span", { class: "c-menu__text", text: item.label ?? "" }));
        if (item.hint) {
            button.appendChild(
                el("span", {
                    class: "c-menu__hint",
                    text: item.hint,
                    attrs: { "aria-hidden": "true" },
                }),
            );
        }
        if (type === "submenu") {
            const chevron = el("span", { class: "c-menu__chevron" });
            chevron.appendChild(icon("chevron-right"));
            chevron.setAttribute("aria-hidden", "true");
            button.appendChild(chevron);
        }
        list.appendChild(button);
        return button;
    });
};

/**
 * Abre um menu. Fecha o anterior, se houver.
 * @param {MenuOptions} options
 * @returns {{close: (options?: {restoreFocus?: boolean}) => void}}
 */
export const showMenu = ({
    items: rawItems,
    label,
    anchor = null,
    point = null,
    placement = "bottom-start",
    returnFocus = null,
    onClose = () => {},
}) => {
    openMenu?.close({ restoreFocus: false });
    const items = tidy(rawItems);
    const asSheet = window.matchMedia(SHEET_QUERY).matches;
    const previousFocus =
        returnFocus ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    const host = el("div", { class: asSheet ? "c-menu-sheet" : "c-menu-layer" });
    const scrim = asSheet ? el("div", { class: "c-menu-sheet__scrim" }) : null;
    const panel = el("div", {
        class: asSheet ? "c-menu c-menu--sheet" : "c-menu",
        attrs: { role: "menu", "aria-label": label },
    });
    if (asSheet) {
        panel.appendChild(
            el("div", { class: "c-menu__grabber", attrs: { "aria-hidden": "true" } }),
        );
        panel.appendChild(
            el("p", { class: "c-menu__title", text: label, attrs: { "aria-hidden": "true" } }),
        );
    }
    const list = el("div", { class: "c-menu__list" });
    panel.appendChild(list);
    if (scrim) host.appendChild(scrim);
    host.appendChild(panel);
    document.body.appendChild(host);

    /** Submenu aberto: o painel, os itens e o botão que o abriu. */
    /** @type {{panel: HTMLElement, items: MenuItem[], buttons: (HTMLElement | null)[], index: number, owner: HTMLElement, stop: () => void} | null} */
    let sub = null;

    let buttons = paint(list, items);
    let index = -1;
    let buffer = "";
    /** @type {ReturnType<typeof setTimeout> | null} */
    let bufferTimer = null;

    /** @param {(HTMLElement | null)[]} list @param {number} i */
    const focusAt = (list, i) => {
        const button = list[i];
        if (button) button.focus();
    };

    const closeSub = (restore = true) => {
        if (!sub) return;
        sub.stop();
        sub.panel.remove();
        sub.owner.setAttribute("aria-expanded", "false");
        if (restore) sub.owner.focus();
        sub = null;
    };

    /** @param {number} i */
    const openSub = (i) => {
        const item = items[i];
        const owner = buttons[i];
        if (!item || !owner || (item.type ?? "item") !== "submenu") return;
        closeSub(false);
        const subItems = tidy(item.items ?? []);
        const subPanel = el("div", {
            class: asSheet ? "c-menu c-menu--sheet c-menu--sub" : "c-menu c-menu--sub",
            attrs: { role: "menu", "aria-label": item.label ?? "" },
        });
        const subList = el("div", { class: "c-menu__list" });
        subPanel.appendChild(subList);
        host.appendChild(subPanel);
        const subButtons = paint(subList, subItems);
        owner.setAttribute("aria-expanded", "true");
        const stop = asSheet
            ? () => {}
            : anchorTo(owner, subPanel, { placement: "right-start", gap: 2 });
        sub = {
            panel: subPanel,
            items: subItems,
            buttons: subButtons,
            index: first(subItems),
            owner,
            stop,
        };
        focusAt(subButtons, sub.index);
    };

    /** @param {MenuItem} item */
    const activate = (item) => {
        if (!item || item.disabled) return;
        const type = item.type ?? "item";
        if (type === "submenu") return;
        close({ restoreFocus: true });
        item.run?.();
    };

    /** @param {KeyboardEvent} event */
    const onKey = (event) => {
        const inSub = sub !== null && sub.panel.contains(/** @type {Node} */ (event.target));
        const current = inSub && sub ? sub : { items, buttons, index };
        if (event.key === "Escape" || (inSub && event.key === "ArrowLeft")) {
            event.preventDefault();
            event.stopPropagation();
            if (inSub) closeSub(true);
            else close({ restoreFocus: true });
            return;
        }
        if (event.key === "Tab") {
            close({ restoreFocus: false });
            return;
        }
        const next = move(event.key, current.items, current.index);
        if (next !== null) {
            event.preventDefault();
            if (next >= 0) {
                if (inSub && sub) sub.index = next;
                else index = next;
                focusAt(current.buttons, next);
            }
            return;
        }
        const item = current.items[current.index];
        if (event.key === "ArrowRight" && !inSub && item && (item.type ?? "item") === "submenu") {
            event.preventDefault();
            openSub(index);
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!inSub && item && (item.type ?? "item") === "submenu") openSub(index);
            else if (item) activate(item);
            return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            buffer += event.key;
            if (bufferTimer) clearTimeout(bufferTimer);
            bufferTimer = setTimeout(() => (buffer = ""), 500);
            const found = typeahead(current.items, current.index, buffer);
            if (found >= 0) {
                if (inSub && sub) sub.index = found;
                else index = found;
                focusAt(current.buttons, found);
            }
        }
    };

    /** @param {MouseEvent} event */
    const onClick = (event) => {
        const target = /** @type {Element | null} */ (event.target);
        const button = target?.closest(".c-menu__item");
        if (!(button instanceof HTMLElement)) return;
        const inSub = sub !== null && sub.panel.contains(button);
        const list = inSub && sub ? sub.buttons : buttons;
        const source = inSub && sub ? sub.items : items;
        const i = list.indexOf(button);
        const item = source[i];
        if (!item) return;
        if (!inSub && (item.type ?? "item") === "submenu") {
            index = i;
            if (sub?.owner === button) closeSub(true);
            else openSub(i);
            return;
        }
        activate(item);
    };

    /** @param {PointerEvent} event */
    const onPointerDownOutside = (event) => {
        const target = /** @type {Node} */ (event.target);
        if (panel.contains(target) || sub?.panel.contains(target)) return;
        // O clique fora fecha sem roubar o foco do que foi clicado.
        close({ restoreFocus: false });
        // O toque no próprio botão que abriu não deve reabrir o menu.
        if (anchor instanceof Node && anchor.contains(target)) {
            event.preventDefault();
        }
    };

    /** @param {FocusEvent} event */
    const onFocusIn = (event) => {
        const inSub = sub !== null && sub.panel.contains(/** @type {Node} */ (event.target));
        const list = inSub && sub ? sub.buttons : buttons;
        const i = list.indexOf(/** @type {HTMLElement} */ (event.target));
        if (i < 0) return;
        if (inSub && sub) sub.index = i;
        else {
            index = i;
            // Voltar ao menu principal fecha o submenu aberto.
            if (sub && buttons[i] !== sub.owner) closeSub(false);
        }
    };

    /** @param {PointerEvent} event — passar o ponteiro sobre um item o foca (sem rolar). */
    const onPointerMove = (event) => {
        if (event.pointerType !== "mouse") return;
        const target = /** @type {Element | null} */ (event.target);
        const button = target?.closest(".c-menu__item");
        if (button instanceof HTMLElement && document.activeElement !== button) {
            button.focus({ preventScroll: true });
        }
    };

    host.addEventListener("keydown", onKey);
    host.addEventListener("click", onClick);
    host.addEventListener("focusin", onFocusIn);
    host.addEventListener("pointermove", onPointerMove);
    scrim?.addEventListener("click", () => close({ restoreFocus: true }));
    document.addEventListener("pointerdown", onPointerDownOutside, true);

    const stop = asSheet
        ? () => {}
        : anchorTo(anchor ?? pointAnchor(point?.x ?? 0, point?.y ?? 0), panel, {
              placement: anchor ? placement : "right-start",
              gap: anchor ? 6 : 2,
          });

    index = first(items);
    // O foco vai para o primeiro item depois do primeiro desenho (o
    // posicionamento é assíncrono e o foco não pode rolar a página).
    requestAnimationFrame(() => {
        if (openMenu === handle) {
            const button = buttons[index];
            button?.focus({ preventScroll: true });
        }
    });
    anchor?.setAttribute("aria-expanded", "true");

    let closed = false;
    /** @param {{restoreFocus?: boolean}} [options] */
    const close = ({ restoreFocus = true } = {}) => {
        if (closed) return;
        closed = true;
        closeSub(false);
        stop();
        document.removeEventListener("pointerdown", onPointerDownOutside, true);
        host.remove();
        anchor?.setAttribute("aria-expanded", "false");
        if (openMenu === handle) openMenu = null;
        if (restoreFocus && previousFocus?.isConnected)
            previousFocus.focus({ preventScroll: true });
        onClose();
    };

    const handle = {
        close,
        /** Troca os itens sem fechar (ex.: um estado mudou). @param {MenuItem[]} next */
        refresh(next) {
            items.splice(0, items.length, ...tidy(next));
            buttons = paint(list, items);
            index = Math.min(Math.max(index, first(items)), items.length - 1);
            if (!isFocusable(items[index] ?? {})) index = first(items);
            focusAt(buttons, index);
        },
    };
    openMenu = handle;
    return handle;
};
