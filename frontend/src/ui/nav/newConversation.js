// @ts-check

import { strings } from "../../i18n/strings.js";
import { normalizeRoomCode } from "../../state/invite.js";
import { el } from "../dom.js";
import { readUsername } from "../home.js";
import { anchorTo } from "../primitives/position.js";

/**
 * "Nova conversa" (botão "+" da navegação): as três formas de começar —
 * nova sala, entrar com código, conversa privada pelo @ exato — sem sair
 * da conversa aberta nem ir ao início. Mesmas validações de formato do
 * início; quem decide de verdade é o servidor (recusas chegam como aviso).
 *
 * Popover não modal com abas (`tablist`): Escape ou clique fora fecham e o
 * foco volta ao botão que abriu.
 *
 * @typedef {"room" | "code" | "dm"} Tab
 */

/**
 * @param {{
 *   onCreate: (name: string) => void,
 *   onJoin: (code: string) => void,
 *   onDirect: (username: string) => void,
 * }} actions
 */
export const createNewConversation = ({ onCreate, onJoin, onDirect }) => {
    const panel = el("div", {
        class: "c-popover c-new-conversation",
        attrs: {
            role: "dialog",
            "aria-modal": "false",
            "aria-label": strings.newConversation.title,
        },
    });
    panel.hidden = true;
    const tabs = el("div", {
        class: "c-tabs",
        attrs: { role: "tablist", "aria-label": strings.newConversation.title },
    });
    const body = el("div", { class: "c-new-conversation__body" });
    panel.append(tabs, body);
    document.body.appendChild(panel);

    /** @type {Record<Tab, {label: string, field: string, hint: string, submit: string, maxlength: string}>} */
    const meta = {
        room: {
            label: strings.newConversation.roomName,
            field: "nova-sala-nome",
            hint: strings.newConversation.roomHint,
            submit: strings.newConversation.create,
            maxlength: "40",
        },
        code: {
            label: strings.newConversation.codeLabel,
            field: "nova-sala-codigo",
            hint: strings.newConversation.codeHint,
            submit: strings.newConversation.join,
            maxlength: "200",
        },
        dm: {
            label: strings.newConversation.dmLabel,
            field: "nova-privada-arroba",
            hint: strings.newConversation.dmHint,
            submit: strings.newConversation.open,
            maxlength: "21",
        },
    };
    /** @type {Tab[]} */
    const order = ["room", "code", "dm"];
    const tabButtons = order.map((tab) => {
        const button = el("button", {
            class: "c-tabs__tab",
            text:
                tab === "room"
                    ? strings.newConversation.room
                    : tab === "code"
                      ? strings.newConversation.code
                      : strings.newConversation.dm,
            attrs: {
                type: "button",
                role: "tab",
                id: `nova-aba-${tab}`,
                "aria-controls": "nova-painel",
            },
        });
        button.dataset.tab = tab;
        tabs.appendChild(button);
        return button;
    });

    const form = el("form", {
        class: "c-new-conversation__form",
        attrs: { role: "tabpanel", id: "nova-painel", novalidate: "" },
    });
    const label = el("label", { class: "c-field__label" });
    const input = el("input", {
        class: "c-field__input",
        attrs: { type: "text", autocomplete: "off", autocapitalize: "none", spellcheck: "false" },
    });
    const hint = el("p", { class: "c-field__hint" });
    const error = el("p", { class: "c-field__error", attrs: { role: "alert" } });
    const submit = el("button", {
        class: "c-button c-button--primary c-button--block",
        attrs: { type: "submit" },
    });
    form.append(label, input, hint, error, submit);
    body.appendChild(form);

    /** @type {Tab} */
    let tab = "room";
    /** @type {HTMLElement | null} */
    let opener = null;
    let stop = () => {};

    /** @param {Tab} next @param {boolean} [focusTab] */
    const select = (next, focusTab = false) => {
        tab = next;
        const info = meta[next];
        for (const button of tabButtons) {
            const on = button.dataset.tab === next;
            button.setAttribute("aria-selected", String(on));
            button.tabIndex = on ? 0 : -1;
            if (on && focusTab) button.focus();
        }
        form.setAttribute("aria-labelledby", `nova-aba-${next}`);
        label.textContent = info.label;
        label.htmlFor = info.field;
        input.id = info.field;
        input.maxLength = Number(info.maxlength);
        input.value = "";
        input.removeAttribute("aria-invalid");
        input.setAttribute("aria-describedby", `${info.field}-dica ${info.field}-erro`);
        hint.id = `${info.field}-dica`;
        error.id = `${info.field}-erro`;
        hint.textContent = info.hint;
        error.textContent = "";
        submit.textContent = info.submit;
    };

    tabs.addEventListener("click", (event) => {
        const button = /** @type {Element} */ (event.target).closest("[role='tab']");
        if (button instanceof HTMLElement) {
            select(/** @type {Tab} */ (button.dataset.tab));
            input.focus();
        }
    });
    tabs.addEventListener("keydown", (event) => {
        const index = order.indexOf(tab);
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            const next =
                order[
                    (index + (event.key === "ArrowRight" ? 1 : -1) + order.length) % order.length
                ];
            if (next) select(next, true);
        }
    });

    input.addEventListener("input", () => {
        input.removeAttribute("aria-invalid");
        error.textContent = "";
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        /** @param {string} message */
        const invalid = (message) => {
            input.setAttribute("aria-invalid", "true");
            error.textContent = message;
            input.focus();
        };
        if (tab === "room") {
            const name = input.value.trim();
            close(false);
            onCreate(name);
            return;
        }
        if (tab === "code") {
            const code = normalizeRoomCode(input.value);
            if (!code) return invalid(strings.conversations.homeInvalidCode);
            close(false);
            onJoin(code);
            return;
        }
        const username = readUsername(input.value);
        if (!username) return invalid(strings.conversations.homeInvalidUser);
        close(false);
        onDirect(username);
    });

    /** @param {boolean} [restore] */
    const close = (restore = true) => {
        if (panel.hidden) return;
        panel.hidden = true;
        stop();
        stop = () => {};
        opener?.setAttribute("aria-expanded", "false");
        if (restore && opener?.isConnected) opener.focus();
        opener = null;
    };

    panel.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    });
    document.addEventListener(
        "pointerdown",
        (event) => {
            if (panel.hidden) return;
            const target = /** @type {Node} */ (event.target);
            if (panel.contains(target) || opener?.contains(target)) return;
            close(false);
        },
        true,
    );

    return {
        /**
         * @param {HTMLElement} anchor
         * @param {Tab} [first]
         */
        open(anchor, first = "room") {
            if (!panel.hidden && opener === anchor) {
                close();
                return;
            }
            close(false);
            opener = anchor;
            anchor.setAttribute("aria-expanded", "true");
            select(first);
            panel.hidden = false;
            stop = anchorTo(anchor, panel, { placement: "bottom-start", gap: 8, minHeight: 200 });
            input.focus();
        },
        close,
    };
};
