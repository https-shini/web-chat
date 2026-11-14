// @ts-check

import { strings } from "../../i18n/strings.js";
import { el, must } from "../dom.js";
import { icon } from "../icons.js";
import { renderIdentity } from "../identity.js";

/**
 * Página "Perfil e preferências". Tudo aqui é real e passa pelos caminhos
 * que já existem:
 * - nome de exibição → comando /nick (validado pelo servidor);
 * - ausente e motivo → comando /afk;
 * - tema → o mesmo alternador do resto do app (guardado no navegador);
 * - densidade → padrão ou compacta (ui/density.js; guardada no navegador,
 *   como o tema: só preferência visual);
 * - notificações → o mesmo controle opt-in do painel "você";
 * - sair do chat → a mesma confirmação de sempre.
 *
 * O @ não muda durante a sessão (regra do servidor).
 *
 * @typedef {{
 *   name: string,
 *   username: string,
 *   away: boolean,
 *   awayText: string,
 *   theme: "dark" | "light",
 *   density: "default" | "compact",
 *   notifications: "on" | "off" | "denied" | "unsupported",
 *   online: boolean,
 * }} ProfileView
 */

/**
 * @param {{
 *   onRename: (name: string) => void,
 *   onAway: (away: boolean, reason: string) => void,
 *   onTheme: (theme: "dark" | "light") => void,
 *   onDensity: (density: "default" | "compact") => void,
 *   onNotifications: () => void,
 *   onLogout: () => void,
 *   onCopyHandle: () => void,
 * }} deps
 */
export const createProfilePage = ({
    onRename,
    onAway,
    onTheme,
    onDensity,
    onNotifications,
    onLogout,
    onCopyHandle,
}) => {
    const section = /** @type {HTMLElement} */ (must('[data-page="profile"]'));
    const title = /** @type {HTMLElement} */ (must(".c-page__title", section));
    const root = /** @type {HTMLElement} */ (must("[data-profile-page]", section));

    // ─── Cabeçalho ───────────────────────────────────────────────────────
    const hero = el("div", { class: "c-card c-profile__hero" });
    const heroAvatar = el("span", { class: "c-profile__avatar" });
    const heroText = el("div", { class: "c-profile__who" });
    const heroName = el("p", { class: "c-profile__name" });
    const heroHandle = el("p", { class: "c-profile__handle" });
    heroText.append(heroName, heroHandle);
    hero.append(heroAvatar, heroText);
    root.appendChild(el("p", { class: "c-page__lead", text: strings.profile.lead }));
    root.appendChild(hero);

    /** @param {string} heading */
    const card = (heading) => {
        const box = el("section", { class: "c-card" });
        const id = `perfil-${heading.toLowerCase().replace(/[^a-z]+/g, "-")}`;
        box.setAttribute("aria-labelledby", id);
        box.appendChild(el("h2", { class: "c-card__title", text: heading, attrs: { id } }));
        root.appendChild(box);
        return box;
    };

    // ─── Identidade ──────────────────────────────────────────────────────
    const identity = card(strings.profile.identity);
    const nameForm = el("form", { class: "c-field c-profile__row", attrs: { novalidate: "" } });
    const nameLabel = el("label", {
        class: "c-field__label",
        text: strings.profile.displayName,
        attrs: { for: "perfil-nome" },
    });
    const nameInput = el("input", {
        class: "c-field__input",
        attrs: { id: "perfil-nome", type: "text", maxlength: "60", autocomplete: "name" },
    });
    const nameButton = el("button", {
        class: "c-button c-button--secondary",
        text: strings.profile.rename,
        attrs: { type: "submit" },
    });
    const nameLine = el("div", { class: "c-profile__inline" });
    nameLine.append(nameInput, nameButton);
    nameForm.append(nameLabel, nameLine);
    identity.appendChild(nameForm);

    const handleRow = el("div", { class: "c-field c-profile__row" });
    handleRow.appendChild(
        el("span", {
            class: "c-field__label",
            text: strings.profile.handle,
            attrs: { id: "perfil-arroba-rotulo" },
        }),
    );
    const handleLine = el("div", { class: "c-profile__inline" });
    const handleValue = el("output", {
        class: "c-profile__value",
        attrs: { "aria-labelledby": "perfil-arroba-rotulo" },
    });
    const copy = el("button", {
        class: "c-icon-button",
        attrs: {
            type: "button",
            "aria-label": strings.memberCard.copyId,
            "data-tooltip": strings.memberCard.copyId,
        },
    });
    copy.appendChild(icon("copy"));
    handleLine.append(handleValue, copy);
    handleRow.appendChild(handleLine);
    identity.appendChild(handleRow);

    // ─── Status ──────────────────────────────────────────────────────────
    const status = card(strings.profile.status);
    const awaySwitch = el("button", {
        class: "c-switch",
        attrs: {
            type: "button",
            role: "switch",
            "aria-checked": "false",
            "aria-describedby": "perfil-ausente-dica",
        },
    });
    const awayRow = el("div", { class: "c-profile__switch" });
    const awayText = el("span", { class: "c-profile__switch-text" });
    awayText.append(
        el("span", { text: strings.profile.awayToggle, attrs: { id: "perfil-ausente" } }),
        el("span", {
            class: "c-field__hint",
            text: strings.profile.awayHint,
            attrs: { id: "perfil-ausente-dica" },
        }),
    );
    awaySwitch.setAttribute("aria-labelledby", "perfil-ausente");
    awaySwitch.appendChild(
        el("span", { class: "c-switch__thumb", attrs: { "aria-hidden": "true" } }),
    );
    awayRow.append(awayText, awaySwitch);
    status.appendChild(awayRow);
    const reasonForm = el("form", { class: "c-field c-profile__row", attrs: { novalidate: "" } });
    const reasonInput = el("input", {
        class: "c-field__input",
        attrs: {
            id: "perfil-motivo",
            type: "text",
            maxlength: "60",
            autocomplete: "off",
            placeholder: strings.profile.awayReasonPlaceholder,
        },
    });
    const reasonLine = el("div", { class: "c-profile__inline" });
    reasonLine.append(
        reasonInput,
        el("button", {
            class: "c-button c-button--secondary",
            text: strings.profile.awayApply,
            attrs: { type: "submit" },
        }),
    );
    reasonForm.append(
        el("label", {
            class: "c-field__label",
            text: strings.profile.awayReason,
            attrs: { for: "perfil-motivo" },
        }),
        reasonLine,
    );
    status.appendChild(reasonForm);

    // ─── Preferências ────────────────────────────────────────────────────
    const prefs = card(strings.profile.prefs);
    const themeRow = el("div", { class: "c-profile__switch" });
    themeRow.appendChild(
        el("span", {
            class: "c-profile__switch-text",
            text: strings.profile.theme,
            attrs: { id: "perfil-tema" },
        }),
    );
    const themeGroup = el("div", {
        class: "c-segmented",
        attrs: { role: "radiogroup", "aria-labelledby": "perfil-tema" },
    });
    const themes = /** @type {const} */ (["dark", "light"]).map((theme) => {
        const radio = el("button", {
            class: "c-segmented__option",
            text: theme === "dark" ? strings.profile.dark : strings.profile.light,
            attrs: { type: "button", role: "radio", "aria-checked": "false" },
        });
        radio.dataset.theme = theme;
        themeGroup.appendChild(radio);
        return radio;
    });
    themeRow.appendChild(themeGroup);
    prefs.appendChild(themeRow);

    const densityRow = el("div", { class: "c-profile__switch" });
    const densityText = el("span", { class: "c-profile__switch-text" });
    densityText.append(
        el("span", { text: strings.profile.density, attrs: { id: "perfil-densidade" } }),
        el("span", {
            class: "c-field__hint",
            text: strings.profile.densityHint,
            attrs: { id: "perfil-densidade-dica" },
        }),
    );
    const densityGroup = el("div", {
        class: "c-segmented",
        attrs: {
            role: "radiogroup",
            "aria-labelledby": "perfil-densidade",
            "aria-describedby": "perfil-densidade-dica",
        },
    });
    const densities = /** @type {const} */ (["default", "compact"]).map((density) => {
        const radio = el("button", {
            class: "c-segmented__option",
            text:
                density === "default"
                    ? strings.profile.densityDefault
                    : strings.profile.densityCompact,
            attrs: { type: "button", role: "radio", "aria-checked": "false" },
        });
        radio.dataset.density = density;
        densityGroup.appendChild(radio);
        return radio;
    });
    densityRow.append(densityText, densityGroup);
    prefs.appendChild(densityRow);

    /** @param {"default" | "compact"} value */
    const paintDensity = (value) => {
        for (const radio of densities) {
            const on = radio.dataset.density === value;
            radio.setAttribute("aria-checked", String(on));
            radio.tabIndex = on ? 0 : -1;
        }
    };
    /** @param {"default" | "compact"} value */
    const chooseDensity = (value) => {
        onDensity(value);
        if (view) view = { ...view, density: value };
        paintDensity(value);
    };

    const notifyRow = el("div", { class: "c-profile__switch" });
    const notifyText = el("span", { class: "c-profile__switch-text" });
    notifyText.append(
        el("span", { text: strings.profile.notifications, attrs: { id: "perfil-notificacoes" } }),
        el("span", {
            class: "c-field__hint",
            text: strings.profile.notificationsHint,
            attrs: { id: "perfil-notificacoes-dica" },
        }),
    );
    const notifySwitch = el("button", {
        class: "c-switch",
        attrs: {
            type: "button",
            role: "switch",
            "aria-checked": "false",
            "aria-labelledby": "perfil-notificacoes",
            "aria-describedby": "perfil-notificacoes-dica",
        },
    });
    notifySwitch.appendChild(
        el("span", { class: "c-switch__thumb", attrs: { "aria-hidden": "true" } }),
    );
    notifyRow.append(notifyText, notifySwitch);
    prefs.appendChild(notifyRow);

    // ─── Sessão ──────────────────────────────────────────────────────────
    const session = card(strings.profile.session);
    const logout = el("button", { class: "c-action c-action--danger", attrs: { type: "button" } });
    const logoutIcon = el("span", { class: "c-action__icon" });
    logoutIcon.appendChild(icon("logout"));
    logoutIcon.setAttribute("aria-hidden", "true");
    const logoutText = el("span", { class: "c-action__text" });
    logoutText.append(
        el("span", { text: `${strings.logout.button}…` }),
        el("span", { class: "c-action__hint", text: strings.profile.logoutHint }),
    );
    logout.append(logoutIcon, logoutText);
    session.appendChild(logout);

    // ─── Eventos ─────────────────────────────────────────────────────────
    nameForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (name && name !== view?.name) onRename(name);
    });
    copy.addEventListener("click", onCopyHandle);
    awaySwitch.addEventListener("click", () => onAway(!(view?.away ?? false), ""));
    reasonForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const reason = reasonInput.value.trim();
        if (reason) onAway(true, reason);
    });
    themeGroup.addEventListener("click", (event) => {
        const radio = /** @type {Element} */ (event.target).closest("[data-theme]");
        if (radio instanceof HTMLElement)
            onTheme(/** @type {"dark" | "light"} */ (radio.dataset.theme));
    });
    themeGroup.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const next = view?.theme === "dark" ? "light" : "dark";
        onTheme(next);
        themes.find((radio) => radio.dataset.theme === next)?.focus();
    });
    densityGroup.addEventListener("click", (event) => {
        const radio = /** @type {Element} */ (event.target).closest("[data-density]");
        if (radio instanceof HTMLElement)
            chooseDensity(/** @type {"default" | "compact"} */ (radio.dataset.density));
    });
    densityGroup.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        const next = view?.density === "compact" ? "default" : "compact";
        chooseDensity(next);
        densities.find((radio) => radio.dataset.density === next)?.focus();
    });
    notifySwitch.addEventListener("click", onNotifications);
    logout.addEventListener("click", onLogout);

    /** @type {ProfileView | null} */
    let view = null;

    return {
        /** @param {boolean} visible */
        setVisible(visible) {
            section.hidden = !visible;
        },
        /** @param {ProfileView} next */
        render(next) {
            const renamed = view?.name !== next.name;
            view = next;
            heroAvatar.replaceChildren(
                renderIdentity({
                    id: next.username,
                    name: next.name,
                    own: true,
                    withName: false,
                    size: "xl",
                    presence: next.online ? (next.away ? "away" : "online") : null,
                }),
            );
            heroName.textContent = next.name;
            heroHandle.textContent = `@${next.username}`;
            if (renamed || document.activeElement !== nameInput) nameInput.value = next.name;
            handleValue.textContent = `@${next.username}`;
            awaySwitch.setAttribute("aria-checked", String(next.away));
            awaySwitch.disabled = !next.online;
            if (document.activeElement !== reasonInput) reasonInput.value = next.awayText;
            for (const radio of themes) {
                const on = radio.dataset.theme === next.theme;
                radio.setAttribute("aria-checked", String(on));
                radio.tabIndex = on ? 0 : -1;
            }
            paintDensity(next.density);
            notifySwitch.setAttribute("aria-checked", String(next.notifications === "on"));
            notifyRow.hidden = next.notifications === "unsupported";
        },
        focus() {
            title.focus();
        },
    };
};
