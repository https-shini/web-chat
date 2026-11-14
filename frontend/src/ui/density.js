// @ts-check

import { DENSITY_STORAGE_KEY } from "../config.js";

/**
 * Densidade da interface: "padrão" ou "compacta" (decisão do PR 12).
 *
 * A diferença mora inteira em tokens.css, sob `:root[data-density="compact"]`:
 * espaços entre mensagens, avatares e altura dos itens da lista ficam
 * menores. O tamanho do texto, o contraste e as áreas de toque mínimas não
 * mudam, para não perder legibilidade nem acessibilidade.
 *
 * A escolha fica no navegador, como o tema: é uma preferência visual, sem
 * nada da pessoa nem das conversas.
 *
 * @typedef {"default" | "compact"} Density
 */

/** @returns {Density} */
export const currentDensity = () =>
    document.documentElement.getAttribute("data-density") === "compact" ? "compact" : "default";

/**
 * @param {Density} density
 * @param {{persist?: boolean}} [options]
 */
export const applyDensity = (density, { persist = true } = {}) => {
    if (density === "compact") document.documentElement.setAttribute("data-density", "compact");
    else document.documentElement.removeAttribute("data-density");
    if (!persist) return;
    try {
        localStorage.setItem(DENSITY_STORAGE_KEY, density);
    } catch {
        // Armazenamento bloqueado: vale só nesta sessão.
    }
};

/** Aplica a escolha guardada (chamado na partida do app). */
export const restoreDensity = () => {
    try {
        const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
        if (saved === "compact") applyDensity("compact", { persist: false });
    } catch {
        // Sem armazenamento: fica a padrão.
    }
};
