// @ts-check

/**
 * Ícones da interface. Uma fonte só para o HTML (elementos `[data-icon]`,
 * hidratados na carga) e para o JS (`icon("nome")`).
 *
 * Desenhados com `createElementNS`, sem HTML nem arquivo externo: nada passa
 * pela CSP além do próprio módulo. Todo ícone é decorativo (`aria-hidden`):
 * quem nomeia o controle é o rótulo do botão, nunca o desenho.
 *
 * Traço em `currentColor`, grade de 24 unidades, traço 2 — o ícone herda a
 * cor e o tamanho (`1em` por padrão, ajustável pelo componente).
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** @typedef {[tag: "path" | "circle" | "rect", attrs: Record<string, string>]} Shape */

/** @param {string} d @returns {Shape} */
const p = (d) => ["path", { d }];
/** @param {number} cx @param {number} cy @param {number} r @returns {Shape} */
const c = (cx, cy, r) => ["circle", { cx: String(cx), cy: String(cy), r: String(r) }];

/** @type {Record<string, Shape[]>} */
const SHAPES = {
    hash: [p("M4 9h16"), p("M4 15h16"), p("M10 3 8 21"), p("M16 3l-2 18")],
    users: [
        c(9, 7, 4),
        p("M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"),
        p("M16 3.13a4 4 0 0 1 0 7.75"),
        p("M22 21v-1a6 6 0 0 0-4-5.65"),
    ],
    menu: [p("M4 6h16"), p("M4 12h16"), p("M4 18h16")],
    home: [p("M3 10.5 12 3l9 7.5"), p("M5 9v12h14V9"), p("M10 21v-6h4v6")],
    plus: [p("M12 5v14"), p("M5 12h14")],
    at: [c(12, 12, 4), p("M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8")],
    close: [p("M18 6 6 18"), p("M6 6l12 12")],
    help: [c(12, 12, 10), p("M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"), p("M12 17h.01")],
    send: [p("M22 2 11 13"), p("M22 2 15 22l-4-9-9-4z")],
    sun: [
        c(12, 12, 4),
        p("M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41"),
        p("M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"),
    ],
    moon: [p("M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z")],
    trash: [p("M3 6h18"), p("M8 6V4h8v2"), p("M19 6l-1 14H6L5 6"), p("M10 11v6M14 11v6")],
    eraser: [
        p("m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21z"),
        p("M22 21H7"),
        p("m5 11 9 9"),
    ],
    clock: [c(12, 12, 10), p("M12 6v6l4 2")],
    terminal: [p("m4 17 6-6-6-6"), p("M12 19h8")],
    info: [c(12, 12, 10), p("M12 16v-4"), p("M12 8h.01")],
    alert: [
        p("M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"),
        p("M12 9v4"),
        p("M12 17h.01"),
    ],
    copy: [
        ["rect", { x: "8", y: "8", width: "14", height: "14", rx: "2" }],
        p("M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"),
    ],
    user: [c(12, 8, 4), p("M5 21a7 7 0 0 1 14 0")],
    ban: [c(12, 12, 10), p("m4.9 4.9 14.2 14.2")],
    check: [p("M20 6 9 17l-5-5")],
    logout: [p("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"), p("m16 17 5-5-5-5"), p("M21 12H9")],
    "arrow-in": [p("M5 12h14"), p("m12 5 7 7-7 7")],
    "arrow-out": [p("M19 12H5"), p("m12 19-7-7 7-7")],
    megaphone: [p("m3 11 18-5v12L3 14v-3z"), p("M11.6 16.8a3 3 0 1 1-5.8-1.6")],
    shield: [p("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z")],
    pencil: [p("M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z")],
};

/** O logotipo é preenchido, não traçado: uma bolha de conversa. */
const LOGO = "M4 6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-5l-4.5 4v-4H8a4 4 0 0 1-4-4z";

/**
 * Cria um ícone SVG decorativo.
 * @param {string} name
 * @returns {SVGSVGElement}
 */
export const icon = (name) => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "c-icon");

    if (name === "logo") {
        svg.setAttribute("fill", "currentColor");
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", LOGO);
        svg.appendChild(path);
        return svg;
    }

    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    for (const [tag, attrs] of SHAPES[name] ?? []) {
        const shape = document.createElementNS(SVG_NS, tag);
        for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, value);
        svg.appendChild(shape);
    }
    return svg;
};

/**
 * Troca o desenho de um marcador `[data-icon]` já hidratado.
 * @param {Element} host
 * @param {string} name
 */
export const setIcon = (host, name) => {
    host.setAttribute("data-icon", name);
    host.setAttribute("aria-hidden", "true");
    host.replaceChildren(icon(name));
};

/**
 * Desenha todos os marcadores `[data-icon]` dentro de `scope`. "theme" é
 * resolvido pelo alternador de tema, que sabe qual tema está valendo.
 * @param {ParentNode} [scope]
 */
export const hydrateIcons = (scope = document) => {
    for (const host of scope.querySelectorAll("[data-icon]")) {
        const name = host.getAttribute("data-icon") ?? "";
        if (name === "theme" || host.firstChild) continue;
        host.setAttribute("aria-hidden", "true");
        host.appendChild(icon(name));
    }
};
