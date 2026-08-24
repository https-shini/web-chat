// @ts-check

/**
 * Utilitários de DOM. Toda criação de elemento do projeto passa por aqui,
 * e nenhuma delas aceita HTML: `textContent` e `createElement`, sempre.
 */

/**
 * Busca um elemento obrigatório. Falha alto se o HTML e o JS divergirem,
 * em vez de silenciar com `null`.
 * @template {Element} T
 * @param {string} selector
 * @param {ParentNode} [scope]
 * @returns {T}
 */
export const must = (selector, scope = document) => {
    const node = scope.querySelector(selector);
    if (!node) throw new Error(`Elemento ausente no HTML: ${selector}`);
    return /** @type {T} */ (node);
};

/**
 * Cria um elemento com classes e texto.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {{class?: string, text?: string, attrs?: Record<string, string>}} [options]
 * @returns {HTMLElementTagNameMap[K]}
 */
export const el = (tag, options = {}) => {
    const node = document.createElement(tag);
    if (options.class) node.className = options.class;
    if (options.text !== undefined) node.textContent = options.text;
    for (const [name, value] of Object.entries(options.attrs ?? {})) {
        node.setAttribute(name, value);
    }
    return node;
};

/**
 * Esvazia um elemento sem passar por HTML.
 * @param {Element} node
 */
export const clear = (node) => {
    node.replaceChildren();
};

/**
 * Mostra ou esconde pelo atributo `hidden`, que também tira o elemento da
 * árvore de acessibilidade — `display` sozinho não faz isso.
 * @param {HTMLElement} node
 * @param {boolean} visible
 */
export const toggle = (node, visible) => {
    node.hidden = !visible;
};
