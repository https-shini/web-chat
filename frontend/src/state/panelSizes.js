// @ts-check

/**
 * Larguras das barras laterais ajustáveis (Fase 1).
 *
 * Regras puras, sem DOM: quem mede a janela e aplica o resultado é
 * `ui/panelResize.js`. Tudo em pixels; os limites nascem em rem e são
 * convertidos pelo tamanho de letra da raiz, para acompanhar o zoom de
 * texto do navegador.
 *
 * Dois números por painel:
 *  - a largura DESEJADA, escolhida pela pessoa ao arrastar;
 *  - a largura APLICADA, que é a desejada ajustada ao espaço que existe agora.
 *
 * Guardar as duas é o que faz o layout se adaptar sem perder a escolha: se a
 * janela estreita, o painel encolhe para a conversa caber; quando ela volta a
 * crescer, o painel volta ao tamanho escolhido.
 *
 * Nada aqui é salvo no navegador: as larguras vivem só nesta página aberta.
 * Ao recarregar, ou ao sair da sala, voltam ao padrão.
 *
 * @typedef {"sidebar" | "members"} Panel
 * @typedef {{min: number, default: number, max: number}} Limits
 * @typedef {Record<Panel, Limits>} PanelLimits
 * @typedef {Partial<Record<Panel, number>>} Widths
 */

/**
 * Limites em rem. Os padrões espelham `--sidebar-width` e `--members-width`
 * em tokens.css.
 *  - barra lateral: abaixo de 14rem o painel "você" (nome, @username e três
 *    botões) começa a cortar o nome;
 *  - painel de contexto (dados, integrantes e ações): abaixo de 16rem as
 *    ações rápidas e os nomes com selos começam a cortar.
 */
export const PANEL_LIMITS_REM = Object.freeze({
    sidebar: Object.freeze({ min: 14, default: 17, max: 28 }),
    members: Object.freeze({ min: 16, default: 21, max: 28 }),
});

/** Largura mínima da conversa, para a leitura e a caixa de mensagem caberem. */
export const MAIN_MIN_REM = 24;

/** Passo das setas do teclado; com Shift, o passo grande. */
export const KEY_STEP_REM = 1;
export const KEY_STEP_LARGE_REM = 4;

/**
 * Quando falta espaço, quem cede primeiro. Pessoas é o painel secundário: a
 * barra lateral é a navegação e só encolhe depois.
 * @type {readonly Panel[]}
 */
const SHRINK_ORDER = Object.freeze(["members", "sidebar"]);

/** @param {number} value @param {number} min @param {number} max */
export const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Converte os limites de rem para pixels.
 * @param {number} rootFontSize tamanho da letra da raiz, em px (16 no padrão)
 * @returns {PanelLimits}
 */
export const limitsInPixels = (rootFontSize) => {
    /** @param {Limits} limits */
    const convert = (limits) => ({
        min: Math.round(limits.min * rootFontSize),
        default: Math.round(limits.default * rootFontSize),
        max: Math.round(limits.max * rootFontSize),
    });
    return {
        sidebar: convert(PANEL_LIMITS_REM.sidebar),
        members: convert(PANEL_LIMITS_REM.members),
    };
};

/**
 * Larguras aplicadas para os painéis visíveis numa janela de `available` px.
 *
 * Cada painel fica entre o seu mínimo e o seu máximo; se mesmo assim a
 * conversa ficaria abaixo de `mainMin`, os painéis encolhem (pessoas antes,
 * nunca abaixo do mínimo). Painel ausente de `visible` não ocupa espaço e
 * não aparece no resultado.
 *
 * @param {{
 *   desired: Widths,
 *   visible: readonly Panel[],
 *   available: number,
 *   limits: PanelLimits,
 *   mainMin: number,
 * }} input
 * @returns {Widths}
 */
export const fitWidths = ({ desired, visible, available, limits, mainMin }) => {
    /** @type {Widths} */
    const widths = {};
    for (const panel of visible) {
        const { min, max } = limits[panel];
        widths[panel] = clamp(desired[panel] ?? limits[panel].default, min, max);
    }
    let excess = Object.values(widths).reduce((sum, width) => sum + width, 0) + mainMin - available;
    for (const panel of SHRINK_ORDER) {
        const width = widths[panel];
        if (excess <= 0) break;
        if (width === undefined) continue;
        const cut = Math.min(excess, width - limits[panel].min);
        widths[panel] = width - cut;
        excess -= cut;
    }
    return widths;
};

/**
 * Até onde um painel pode crescer agora: o próprio máximo ou o que sobra
 * depois da conversa (no mínimo) e do outro painel (como está aplicado).
 * Nunca abaixo do próprio mínimo.
 *
 * @param {{
 *   panel: Panel,
 *   applied: Widths,
 *   visible: readonly Panel[],
 *   available: number,
 *   limits: PanelLimits,
 *   mainMin: number,
 * }} input
 */
export const maxWidthFor = ({ panel, applied, visible, available, limits, mainMin }) => {
    const other = panel === "sidebar" ? "members" : "sidebar";
    const otherWidth = visible.includes(other) ? (applied[other] ?? limits[other].default) : 0;
    const room = available - mainMin - otherWidth;
    return clamp(room, limits[panel].min, limits[panel].max);
};

/**
 * Nova largura desejada a partir de um arraste.
 *
 * A barra lateral fica à esquerda, então arrastar para a direita a alarga;
 * pessoas fica à direita, então arrastar para a ESQUERDA a alarga.
 *
 * @param {{panel: Panel, startWidth: number, deltaX: number, min: number, max: number}} input
 */
export const widthFromDrag = ({ panel, startWidth, deltaX, min, max }) =>
    Math.round(clamp(startWidth + (panel === "sidebar" ? deltaX : -deltaX), min, max));

/**
 * Nova largura a partir de uma tecla, ou `null` se a tecla não redimensiona.
 *
 * As setas seguem a direção visual da borda (→ move a borda para a direita):
 * na barra lateral, → alarga; em pessoas, → estreita. Home e End vão aos
 * extremos: Home é sempre o mínimo e End o máximo, como num controle
 * deslizante. Enter volta ao padrão.
 *
 * @param {{
 *   panel: Panel, key: string, shift: boolean, width: number,
 *   min: number, max: number, defaultWidth: number, rootFontSize: number,
 * }} input
 * @returns {number | null}
 */
export const widthFromKey = ({
    panel,
    key,
    shift,
    width,
    min,
    max,
    defaultWidth,
    rootFontSize,
}) => {
    const step = (shift ? KEY_STEP_LARGE_REM : KEY_STEP_REM) * rootFontSize;
    const towardRight = panel === "sidebar" ? step : -step;
    switch (key) {
        case "ArrowRight":
            return Math.round(clamp(width + towardRight, min, max));
        case "ArrowLeft":
            return Math.round(clamp(width - towardRight, min, max));
        case "Home":
            return min;
        case "End":
            return max;
        case "Enter":
            return clamp(defaultWidth, min, max);
        default:
            return null;
    }
};
