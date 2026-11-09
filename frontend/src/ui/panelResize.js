// @ts-check

import {
    MAIN_MIN_REM,
    fitWidths,
    limitsInPixels,
    maxWidthFor,
    widthFromDrag,
    widthFromKey,
} from "../state/panelSizes.js";
import { must } from "./dom.js";

/**
 * Bordas arrastáveis da barra lateral e do painel de pessoas (Fase 1).
 *
 * Cada borda é um separador ARIA focável (padrão "window splitter"): arrasta
 * com mouse, caneta ou dedo; com o teclado, as setas movem a borda, Shift
 * acelera, Home e End vão aos extremos e Enter volta ao padrão. Duplo clique
 * também volta ao padrão, e Escape durante o arraste o desfaz.
 *
 * A largura aplicada vira uma variável CSS (`--sidebar-width`,
 * `--members-width`) na casca; a conversa ocupa o resto pelo flex, sem
 * cálculo extra. Só painel encaixado ao lado da conversa é ajustável: em
 * gaveta (telas estreitas) a borda some e a gaveta mantém a largura própria.
 *
 * Nada vai para o armazenamento do navegador.
 *
 * @typedef {import("../state/panelSizes.js").Panel} Panel
 * @typedef {import("../state/panelSizes.js").Widths} Widths
 */

/** @type {readonly Panel[]} */
const PANELS = Object.freeze(["sidebar", "members"]);

/** @type {Record<Panel, string>} */
const CSS_VARIABLE = { sidebar: "--sidebar-width", members: "--members-width" };

/**
 * @param {{
 *   layout: {isDocked: (panel: Panel) => boolean, onChange: (listener: () => void) => void},
 *   label: (width: number) => string,
 * }} options
 */
export const createPanelResize = ({ layout, label }) => {
    const shell = /** @type {HTMLElement} */ (must(".c-app"));
    /** @type {Record<Panel, HTMLElement>} */
    const handles = {
        sidebar: /** @type {HTMLElement} */ (must('[data-resize="sidebar"]')),
        members: /** @type {HTMLElement} */ (must('[data-resize="members"]')),
    };

    /** Escolha da pessoa; ausente = padrão. @type {Widths} */
    let desired = {};
    /** Larguras em uso agora. @type {Widths} */
    let applied = {};
    /**
     * Arraste em andamento.
     * @type {{panel: Panel, pointerId: number, startX: number, startWidth: number,
     *   before: number | undefined} | null}
     */
    let drag = null;
    let frame = 0;

    const rootFontSize = () =>
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    const measure = () => {
        const fontSize = rootFontSize();
        return {
            fontSize,
            limits: limitsInPixels(fontSize),
            mainMin: MAIN_MIN_REM * fontSize,
            available: shell.clientWidth,
            visible: PANELS.filter((panel) => layout.isDocked(panel)),
        };
    };

    const apply = () => {
        frame = 0;
        const { limits, mainMin, available, visible } = measure();
        applied = fitWidths({ desired, visible, available, limits, mainMin });

        for (const panel of PANELS) {
            const handle = handles[panel];
            const width = applied[panel];
            handle.hidden = width === undefined;
            if (width === undefined) {
                shell.style.removeProperty(CSS_VARIABLE[panel]);
                continue;
            }
            shell.style.setProperty(CSS_VARIABLE[panel], `${width}px`);
            const max = maxWidthFor({ panel, applied, visible, available, limits, mainMin });
            handle.setAttribute("aria-valuemin", String(limits[panel].min));
            handle.setAttribute("aria-valuemax", String(max));
            handle.setAttribute("aria-valuenow", String(width));
            handle.setAttribute("aria-valuetext", label(width));
        }
    };

    /** Um ajuste por quadro, no máximo: arrastar gera muitos eventos. */
    const schedule = () => {
        if (frame === 0) frame = requestAnimationFrame(apply);
    };

    const applyNow = () => {
        if (frame !== 0) cancelAnimationFrame(frame);
        apply();
    };

    /** @param {Panel} panel */
    const bounds = (panel) => {
        const { fontSize, limits, mainMin, available, visible } = measure();
        return {
            fontSize,
            min: limits[panel].min,
            max: maxWidthFor({ panel, applied, visible, available, limits, mainMin }),
            defaultWidth: limits[panel].default,
        };
    };

    /** @param {boolean} cancelled */
    const endDrag = (cancelled) => {
        if (!drag) return;
        const { panel, pointerId, before } = drag;
        drag = null;
        delete shell.dataset.resizing;
        delete handles[panel].dataset.active;
        if (handles[panel].hasPointerCapture(pointerId)) {
            handles[panel].releasePointerCapture(pointerId);
        }
        if (cancelled) {
            if (before === undefined) delete desired[panel];
            else desired[panel] = before;
        }
        applyNow();
    };

    for (const panel of PANELS) {
        const handle = handles[panel];

        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0 || drag) return;
            const width = applied[panel];
            if (width === undefined) return;
            // Sem isto o navegador seleciona texto e rola a página ao arrastar.
            event.preventDefault();
            handle.setPointerCapture(event.pointerId);
            drag = {
                panel,
                pointerId: event.pointerId,
                startX: event.clientX,
                startWidth: width,
                before: desired[panel],
            };
            shell.dataset.resizing = panel;
            handle.dataset.active = "";
        });

        handle.addEventListener("pointermove", (event) => {
            if (!drag || drag.pointerId !== event.pointerId) return;
            const { min, max } = bounds(panel);
            desired[panel] = widthFromDrag({
                panel,
                startWidth: drag.startWidth,
                deltaX: event.clientX - drag.startX,
                min,
                max,
            });
            schedule();
        });

        handle.addEventListener("pointerup", () => endDrag(false));
        handle.addEventListener("pointercancel", () => endDrag(false));
        handle.addEventListener("lostpointercapture", () => endDrag(false));

        handle.addEventListener("dblclick", () => {
            delete desired[panel];
            applyNow();
        });

        handle.addEventListener("keydown", (event) => {
            const width = applied[panel];
            if (width === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
            const { fontSize, min, max, defaultWidth } = bounds(panel);
            const next = widthFromKey({
                panel,
                key: event.key,
                shift: event.shiftKey,
                width,
                min,
                max,
                defaultWidth,
                rootFontSize: fontSize,
            });
            if (next === null) return;
            event.preventDefault();
            if (event.key === "Enter") delete desired[panel];
            else desired[panel] = next;
            applyNow();
        });
    }

    // Escape durante o arraste desfaz; a tecla não chega às gavetas.
    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key !== "Escape" || !drag) return;
            event.preventDefault();
            event.stopPropagation();
            endDrag(true);
        },
        { capture: true },
    );

    window.addEventListener("resize", schedule);
    layout.onChange(applyNow);
    applyNow();

    return {
        /** Volta as duas barras ao padrão (ex.: ao sair da sala). */
        reset() {
            endDrag(false);
            desired = {};
            applyNow();
        },
    };
};
