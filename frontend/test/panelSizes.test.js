// Larguras ajustáveis das barras laterais (Fase 1): regras puras.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    MAIN_MIN_REM,
    PANEL_LIMITS_REM,
    clamp,
    fitWidths,
    limitsInPixels,
    maxWidthFor,
    widthFromDrag,
    widthFromKey,
} from "../src/state/panelSizes.js";

const limits = limitsInPixels(16);
const mainMin = MAIN_MIN_REM * 16;
const both = /** @type {const} */ (["sidebar", "members"]);

describe("limites", () => {
    test("convertidos de rem pelo tamanho da letra da raiz", () => {
        assert.deepEqual(limits.sidebar, { min: 224, default: 256, max: 448 });
        assert.deepEqual(limits.members, { min: 192, default: 240, max: 416 });
        // Zoom de texto: tudo acompanha.
        assert.equal(limitsInPixels(20).sidebar.default, 320);
    });

    test("padrões espelham os tokens de largura do CSS", async () => {
        const { readFile } = await import("node:fs/promises");
        const css = await readFile(new URL("../src/css/tokens.css", import.meta.url), "utf8");
        assert.match(css, new RegExp(`--sidebar-width: ${PANEL_LIMITS_REM.sidebar.default}rem;`));
        assert.match(css, new RegExp(`--members-width: ${PANEL_LIMITS_REM.members.default}rem;`));
    });

    test("clamp nunca devolve abaixo do mínimo, mesmo com máximo menor", () => {
        assert.equal(clamp(50, 100, 200), 100);
        assert.equal(clamp(500, 100, 200), 200);
        assert.equal(clamp(150, 100, 80), 100);
    });
});

describe("fitWidths: largura aplicada", () => {
    test("sem escolha, usa o padrão de cada painel visível", () => {
        const widths = fitWidths({ desired: {}, visible: both, available: 1440, limits, mainMin });
        assert.deepEqual(widths, { sidebar: 256, members: 240 });
    });

    test("painel não visível não ocupa espaço nem aparece", () => {
        const widths = fitWidths({
            desired: { members: 300 },
            visible: ["sidebar"],
            available: 900,
            limits,
            mainMin,
        });
        assert.deepEqual(widths, { sidebar: 256 });
    });

    test("escolha fora dos limites é contida", () => {
        const widths = fitWidths({
            desired: { sidebar: 10, members: 5000 },
            visible: both,
            available: 2560,
            limits,
            mainMin,
        });
        assert.deepEqual(widths, { sidebar: 224, members: 416 });
    });

    test("janela estreita: pessoas encolhe primeiro, a conversa mantém o mínimo", () => {
        const desired = { sidebar: 400, members: 400 };
        const widths = fitWidths({ desired, visible: both, available: 1100, limits, mainMin });
        assert.equal(widths.sidebar, 400);
        assert.equal(widths.members, 1100 - mainMin - 400);
        assert.ok((widths.members ?? 0) >= limits.members.min);
    });

    test("sem espaço nem com pessoas no mínimo: a barra lateral também cede", () => {
        const desired = { sidebar: 448, members: 416 };
        const widths = fitWidths({ desired, visible: both, available: 1024, limits, mainMin });
        assert.deepEqual(widths, { sidebar: 1024 - mainMin - 192, members: 192 });
        assert.equal((widths.sidebar ?? 0) + (widths.members ?? 0) + mainMin, 1024);
    });

    test("a escolha não se perde: a janela volta a crescer e o painel volta", () => {
        const desired = { sidebar: 420, members: 380 };
        const narrow = fitWidths({ desired, visible: both, available: 1024, limits, mainMin });
        assert.ok((narrow.members ?? 0) < 380);
        const wide = fitWidths({ desired, visible: both, available: 1920, limits, mainMin });
        assert.deepEqual(wide, { sidebar: 420, members: 380 });
    });

    test("em toda largura onde os painéis ficam encaixados, nada fica abaixo do mínimo", () => {
        // Barra lateral encaixa a partir de 48rem (768px); pessoas a partir de 64rem.
        for (let available = 768; available <= 2560; available += 16) {
            const visible = available >= 1024 ? both : /** @type {const} */ (["sidebar"]);
            const widths = fitWidths({
                desired: { sidebar: 448, members: 416 },
                visible,
                available,
                limits,
                mainMin,
            });
            const used = (widths.sidebar ?? 0) + (widths.members ?? 0);
            assert.ok(available - used >= mainMin, `conversa espremida em ${available}px`);
            for (const panel of visible) {
                assert.ok((widths[panel] ?? 0) >= limits[panel].min, `${panel} em ${available}px`);
            }
        }
    });
});

describe("maxWidthFor: até onde o arraste vai", () => {
    test("limitado pelo máximo do painel com espaço de sobra", () => {
        const max = maxWidthFor({
            panel: "sidebar",
            applied: { sidebar: 256, members: 240 },
            visible: both,
            available: 2560,
            limits,
            mainMin,
        });
        assert.equal(max, 448);
    });

    test("limitado pela conversa e pelo outro painel quando falta espaço", () => {
        const max = maxWidthFor({
            panel: "members",
            applied: { sidebar: 300, members: 240 },
            visible: both,
            available: 1024,
            limits,
            mainMin,
        });
        assert.equal(max, 1024 - mainMin - 300);
    });

    test("outro painel escondido não conta", () => {
        const max = maxWidthFor({
            panel: "sidebar",
            applied: { sidebar: 256 },
            visible: ["sidebar"],
            available: 800,
            limits,
            mainMin,
        });
        assert.equal(max, 800 - mainMin);
    });
});

describe("arrastar", () => {
    const base = { startWidth: 256, min: 224, max: 448 };

    test("barra lateral alarga para a direita; pessoas alarga para a esquerda", () => {
        assert.equal(widthFromDrag({ ...base, panel: "sidebar", deltaX: 40 }), 296);
        assert.equal(widthFromDrag({ ...base, panel: "members", deltaX: -40 }), 296);
        assert.equal(widthFromDrag({ ...base, panel: "members", deltaX: 20 }), 236);
    });

    test("não passa dos limites, por mais longe que o ponteiro vá", () => {
        assert.equal(widthFromDrag({ ...base, panel: "sidebar", deltaX: 2000 }), 448);
        assert.equal(widthFromDrag({ ...base, panel: "sidebar", deltaX: -2000 }), 224);
    });

    test("frações de pixel são arredondadas", () => {
        assert.equal(widthFromDrag({ ...base, panel: "sidebar", deltaX: 10.6 }), 267);
    });
});

describe("teclado", () => {
    const base = { width: 256, min: 224, max: 448, defaultWidth: 256, rootFontSize: 16 };

    test("setas seguem a direção da borda em cada painel", () => {
        const sidebar = { ...base, panel: /** @type {const} */ ("sidebar"), shift: false };
        assert.equal(widthFromKey({ ...sidebar, key: "ArrowRight" }), 272);
        assert.equal(widthFromKey({ ...sidebar, key: "ArrowLeft" }), 240);
        const members = { ...base, panel: /** @type {const} */ ("members"), shift: false };
        assert.equal(widthFromKey({ ...members, key: "ArrowRight" }), 240);
        assert.equal(widthFromKey({ ...members, key: "ArrowLeft" }), 272);
    });

    test("Shift dá o passo grande; o resultado respeita os limites", () => {
        const input = { ...base, panel: /** @type {const} */ ("sidebar"), shift: true };
        assert.equal(widthFromKey({ ...input, key: "ArrowRight" }), 320);
        assert.equal(widthFromKey({ ...input, key: "ArrowLeft" }), 224);
    });

    test("Home, End e Enter: mínimo, máximo e padrão", () => {
        const input = {
            ...base,
            width: 300,
            panel: /** @type {const} */ ("members"),
            shift: false,
        };
        assert.equal(widthFromKey({ ...input, key: "Home" }), 224);
        assert.equal(widthFromKey({ ...input, key: "End" }), 448);
        assert.equal(widthFromKey({ ...input, key: "Enter" }), 256);
    });

    test("outras teclas não redimensionam", () => {
        const input = { ...base, panel: /** @type {const} */ ("sidebar"), shift: false };
        assert.equal(widthFromKey({ ...input, key: "a" }), null);
        assert.equal(widthFromKey({ ...input, key: "Tab" }), null);
    });
});

describe("sem armazenamento no navegador", () => {
    test("os módulos de redimensionamento não tocam em storage", async () => {
        const { readFile } = await import("node:fs/promises");
        for (const path of ["../src/state/panelSizes.js", "../src/ui/panelResize.js"]) {
            const source = await readFile(new URL(path, import.meta.url), "utf8");
            const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
            assert.doesNotMatch(
                code,
                /localStorage|sessionStorage|indexedDB|document\.cookie/,
                path,
            );
        }
    });
});
