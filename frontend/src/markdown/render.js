// @ts-check

import { strings } from "../i18n/strings.js";
import { el } from "../ui/dom.js";
import { parseMarkdown } from "./parse.js";

/**
 * Desenha o Markdown de uma mensagem só com elementos e nós de texto —
 * nunca `innerHTML`. Links só com http(s), abertos em nova aba, sem
 * `Referer` nem acesso à página que abriu (`noopener noreferrer`).
 *
 * @typedef {import("./parse.js").Inline} Inline
 * @typedef {import("./parse.js").Block} Block
 */

/**
 * Spoiler: o texto fica escondido até a pessoa pedir (botão, com estado).
 * @param {Node[]} content
 */
export const spoilerNode = (content) => {
    const button = el("button", {
        class: "c-spoiler",
        attrs: {
            type: "button",
            "aria-expanded": "false",
            "aria-label": strings.message.spoilerShow,
        },
    });
    const hidden = el("span", { class: "c-spoiler__text", attrs: { "aria-hidden": "true" } });
    hidden.append(...content);
    button.appendChild(hidden);
    button.addEventListener("click", () => {
        const open = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(open));
        hidden.setAttribute("aria-hidden", String(!open));
        if (open) button.removeAttribute("aria-label");
        else button.setAttribute("aria-label", strings.message.spoilerShow);
    });
    return button;
};

/**
 * @param {Inline[]} nodes
 * @param {{me: string | null}} context
 * @returns {Node[]}
 */
const inline = (nodes, context) =>
    nodes.map((node) => {
        switch (node.type) {
            case "text":
                return document.createTextNode(node.text);
            case "br":
                return document.createElement("br");
            case "code":
                return el("code", { class: "c-message__code", text: node.text });
            case "link": {
                const link = el("a", {
                    class: "c-message__link",
                    text: node.text,
                    attrs: {
                        href: node.href,
                        target: "_blank",
                        rel: "noopener noreferrer nofollow",
                    },
                });
                return link;
            }
            case "mention": {
                const self = context.me !== null && node.username === context.me;
                return el("span", {
                    class: self ? "c-mention c-mention--self" : "c-mention",
                    text: `@${node.username}`,
                });
            }
            case "spoiler":
                return spoilerNode(inline(node.children, context));
            default: {
                const tag = node.type === "strong" ? "strong" : node.type === "em" ? "em" : "del";
                const element = el(tag);
                element.append(...inline(node.children, context));
                return element;
            }
        }
    });

/**
 * O conteúdo de uma mensagem como elementos.
 * @param {string} source
 * @param {{me: string | null}} context
 * @returns {HTMLElement}
 */
export const renderMarkdown = (source, context) => {
    const blocks = parseMarkdown(source);
    const root = el("div", { class: "c-message__content" });
    for (const block of blocks) {
        if (block.type === "codeblock") {
            const pre = el("pre", { class: "c-message__pre" });
            const code = el("code", { text: block.text });
            if (block.lang) code.dataset.lang = block.lang;
            pre.appendChild(code);
            root.appendChild(pre);
        } else if (block.type === "quote") {
            const quote = el("blockquote", { class: "c-message__quote" });
            quote.append(...inline(block.children, context));
            root.appendChild(quote);
        } else {
            const paragraph = el("p", { class: "c-message__text" });
            paragraph.append(...inline(block.children, context));
            root.appendChild(paragraph);
        }
    }
    if (!root.firstChild) root.appendChild(el("p", { class: "c-message__text" }));
    return root;
};
