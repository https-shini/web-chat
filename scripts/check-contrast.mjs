#!/usr/bin/env node
// Verifica contraste WCAG 2.x a partir de tokens.css. Falha o build se algum par reprovar.
import { readFileSync } from "node:fs";

const TOKENS = "frontend/src/css/tokens.css";
const PAIRS = "scripts/contrast.pairs.json";

const parse = (css) => {
    const themes = { dark: {}, light: {} };
    const blocks = [...css.matchAll(/(:root|\[data-theme="light"\])\s*\{([^}]*)\}/g)];
    for (const [, sel, body] of blocks) {
        const target = sel === ":root" ? themes.dark : themes.light;
        for (const [, k, v] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) target[k] = v.trim();
    }
    themes.light = { ...themes.dark, ...themes.light };
    return themes;
};

const resolve = (value, scope, depth = 0) => {
    if (depth > 10) throw new Error(`Referência circular: ${value}`);
    const ref = value.match(/var\(\s*(--[\w-]+)/);
    if (!ref) return value.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const next = scope[ref[1]];
    if (!next) throw new Error(`Token não declarado: ${ref[1]}`);
    return resolve(next, scope, depth + 1);
};

const toRgb = (hex) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
    if (!/^[0-9a-f]{6}$/i.test(full))
        throw new Error(`Cor não literal (componha sobre a superfície antes de medir): ${hex}`);
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

const lum = (hex) =>
    toRgb(hex)
        .map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4))
        .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);

const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};

const themes = parse(readFileSync(TOKENS, "utf8"));
const pairs = JSON.parse(readFileSync(PAIRS, "utf8"));
let failed = 0;

for (const theme of ["dark", "light"]) {
    const scope = themes[theme];
    if (!Object.keys(scope).length) continue;
    console.log(`\n── tema ${theme} ${"─".repeat(52)}`);
    for (const p of pairs) {
        const fg = resolve(scope[p.fg] ?? p.fg, scope);
        const bg = resolve(scope[p.bg] ?? p.bg, scope);
        const r = ratio(fg, bg);
        const ok = r >= p.min;
        if (!ok) failed++;
        console.log(
            `${ok ? "✅" : "❌"} ${r.toFixed(2).padStart(6)} / ${p.min}  ${p.label}  (${fg} sobre ${bg})`,
        );
    }
}

console.log(failed ? `\n${failed} par(es) reprovado(s).` : "\nTodos os pares passam.");
process.exit(failed ? 1 : 0);
