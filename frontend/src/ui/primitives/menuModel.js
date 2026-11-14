// @ts-check

/**
 * Modelo de um menu (padrão "menu" do APG/WAI-ARIA), sem DOM: quais itens
 * recebem foco, para onde as setas levam e a busca pela primeira letra.
 * O desenho e os eventos ficam em `menu.js`.
 *
 * Inspirado na organização dos menus de contexto do Fluxer (um menu por
 * entidade, montado a partir de grupos de itens) — implementação própria.
 */

/**
 * @typedef {object} MenuItem
 * @property {"item" | "check" | "separator" | "label" | "submenu"} [type]  padrão: "item"
 * @property {string} [id]
 * @property {string} [label]
 * @property {string} [icon]   nome em `icons.js`
 * @property {string} [hint]   texto à direita (atalho, valor atual)
 * @property {boolean} [danger]
 * @property {boolean} [disabled]
 * @property {boolean} [checked]  só `check`
 * @property {() => void} [run]
 * @property {MenuItem[]} [items]  só `submenu`
 */

/** @param {MenuItem} item */
export const isFocusable = (item) =>
    (item.type ?? "item") !== "separator" && item.type !== "label" && !item.disabled;

/**
 * Tira separadores no começo, no fim e repetidos (sobram quando um grupo
 * inteiro some por falta de permissão) e rótulos de grupo sem itens.
 * @param {MenuItem[]} items
 * @returns {MenuItem[]}
 */
export const tidy = (items) => {
    /** @type {MenuItem[]} */
    const out = [];
    for (const [index, item] of items.entries()) {
        const type = item.type ?? "item";
        if (type === "separator") {
            if (out.length === 0 || (out.at(-1)?.type ?? "item") === "separator") continue;
        }
        if (type === "label") {
            const next = items[index + 1];
            if (!next || (next.type ?? "item") === "separator" || next.type === "label") continue;
        }
        out.push(item);
    }
    while (out.length && (out.at(-1)?.type ?? "item") === "separator") out.pop();
    return out;
};

/**
 * Próximo índice focável a partir de `from`, andando `step` (com volta).
 * @param {MenuItem[]} items
 * @param {number} from  -1 = antes do primeiro
 * @param {1 | -1} step
 * @returns {number} -1 se nenhum é focável
 */
export const step = (items, from, step) => {
    const n = items.length;
    if (n === 0) return -1;
    let index = from;
    for (let i = 0; i < n; i += 1) {
        index = (index + step + n) % n;
        const item = items[index];
        if (item && isFocusable(item)) return index;
    }
    return -1;
};

/** @param {MenuItem[]} items */
export const first = (items) => step(items, -1, 1);
/** @param {MenuItem[]} items */
export const last = (items) => step(items, 0, -1);

/**
 * Busca pela digitação (letras seguidas em até ~0,5 s formam um prefixo),
 * começando depois do item atual, com volta.
 * @param {MenuItem[]} items
 * @param {number} from
 * @param {string} prefix
 * @returns {number} -1 se nenhum combina
 */
export const typeahead = (items, from, prefix) => {
    const wanted = prefix.toLocaleLowerCase("pt-BR");
    const n = items.length;
    for (let i = 1; i <= n; i += 1) {
        const index = (from + i + n) % n;
        const item = items[index];
        if (
            item &&
            isFocusable(item) &&
            (item.label ?? "").toLocaleLowerCase("pt-BR").startsWith(wanted)
        ) {
            return index;
        }
    }
    return -1;
};

/**
 * Tecla → movimento. `null` = a tecla não é do menu.
 * @param {string} key
 * @param {MenuItem[]} items
 * @param {number} current
 * @returns {number | null}
 */
export const move = (key, items, current) => {
    switch (key) {
        case "ArrowDown":
            return step(items, current, 1);
        case "ArrowUp":
            return step(items, current === -1 ? 0 : current, -1);
        case "Home":
        case "PageUp":
            return first(items);
        case "End":
        case "PageDown":
            return last(items);
        default:
            return null;
    }
};
