// @ts-check

import { THEME_STORAGE_KEY } from "../config.js";
import { strings } from "../i18n/strings.js";
import { setIcon } from "./icons.js";

/**
 * Alternador de tema. O tema já foi aplicado pelo script inline do <head>
 * antes da primeira pintura; aqui só se lê o que está valendo e se troca.
 *
 * A diferença de tema mora inteira na camada semântica de tokens.css, sob
 * um único seletor. Este módulo não conhece nenhuma cor.
 */

/** @typedef {"dark" | "light"} Theme */

/** @returns {Theme} */
const currentTheme = () =>
    document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";

/**
 * @param {{onChange: (theme: Theme, label: string) => void}} handlers
 */
export const createThemeToggle = ({ onChange }) => {
    const buttons = /** @type {HTMLButtonElement[]} */ ([
        ...document.querySelectorAll("[data-theme-toggle]"),
    ]);

    /**
     * @param {Theme} theme
     */
    const paint = (theme) => {
        const label = theme === "light" ? strings.theme.toDark : strings.theme.toLight;
        for (const button of buttons) {
            // O nome diz o que o botão FAZ ("Mudar para tema claro"); o
            // desenho mostra o destino: sol leva ao claro, lua ao escuro.
            button.setAttribute("aria-pressed", String(theme === "light"));
            button.setAttribute("aria-label", label);
            button.dataset.tooltip = label;
            const glyph = button.querySelector(".c-theme-toggle__icon");
            if (glyph) setIcon(glyph, theme === "light" ? "moon" : "sun");
        }
    };

    /**
     * @param {Theme} theme
     */
    const apply = (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch {
            // Armazenamento bloqueado: o tema vale só nesta sessão.
        }
        paint(theme);
    };

    for (const button of buttons) {
        button.addEventListener("click", () => {
            const next = /** @type {Theme} */ (currentTheme() === "light" ? "dark" : "light");
            apply(next);
            onChange(next, next === "light" ? strings.theme.nowLight : strings.theme.nowDark);
        });
    }

    paint(currentTheme());

    return {
        current: currentTheme,
        /** Escolha explícita (menu do perfil, página Perfil). @param {Theme} theme */
        set(theme) {
            if (theme === currentTheme()) return;
            apply(theme);
            onChange(theme, theme === "light" ? strings.theme.nowLight : strings.theme.nowDark);
        },
    };
};
