// @ts-check

/**
 * Markdown das mensagens (decisão C2): um subconjunto pequeno, previsível e
 * sem HTML, no espírito do que o Fluxer faz com o interpretador dele (em
 * Rust/WebAssembly, que exigiria afrouxar a CSP). Este é próprio, em JS
 * puro e de custo linear no tamanho da mensagem (no máximo 1000 caracteres).
 *
 * Blocos:
 *   ```linguagem            bloco de código (o texto vai cru, sem marcação)
 *   código
 *   ```
 *   > citação               linha de citação
 *   (o resto)               parágrafo, com as quebras de linha mantidas
 *
 * Em linha:
 *   **negrito**  *itálico* ou _itálico_  ~~riscado~~  ||spoiler||  `código`
 *   https://…               link (só http e https)
 *   @username               menção (o formato do @ do servidor)
 *   \*                      a barra invertida escapa um marcador
 *
 * O resultado é uma árvore de nós simples; quem desenha (render.js) só cria
 * elementos e nós de texto.
 *
 * @typedef {{type: "text", text: string}
 *   | {type: "strong" | "em" | "del" | "spoiler", children: Inline[]}
 *   | {type: "code", text: string}
 *   | {type: "link", href: string, text: string}
 *   | {type: "mention", username: string}
 *   | {type: "br"}} Inline
 * @typedef {{type: "paragraph", children: Inline[]}
 *   | {type: "quote", children: Inline[]}
 *   | {type: "codeblock", lang: string, text: string}} Block
 */

/** Marcadores em linha, do mais longo para o mais curto. */
const DELIMITERS = /** @type {const} */ ([
    ["**", "strong"],
    ["~~", "del"],
    ["||", "spoiler"],
    ["*", "em"],
    ["_", "em"],
]);

const ESCAPABLE = new Set(["*", "_", "~", "|", "`", "\\", "@", ">"]);

/** Caracteres que fazem parte de um @username (formato do servidor). */
const USERNAME_CHAR = /[a-z0-9._]/;

/** Profundidade máxima de aninhamento (negrito dentro de itálico…). */
const MAX_DEPTH = 6;

/**
 * Fim de um link: espaço, ou pontuação final que costuma não ser do link.
 * @param {string} text
 * @param {number} start
 */
const linkEnd = (text, start) => {
    let end = start;
    while (end < text.length && !/\s/.test(text.charAt(end))) end += 1;
    // Pontuação no fim ("veja https://x.com.") e parêntese sem par saem.
    while (end > start) {
        const last = text.charAt(end - 1);
        if (/[.,;:!?'"]/.test(last)) end -= 1;
        else if (last === ")" && !text.slice(start, end).includes("(")) end -= 1;
        else break;
    }
    return end;
};

/**
 * @param {string} text
 * @param {number} depth
 * @returns {Inline[]}
 */
export const parseInline = (text, depth = 0) => {
    /** @type {Inline[]} */
    const out = [];
    let buffer = "";
    const flush = () => {
        if (buffer) out.push({ type: "text", text: buffer });
        buffer = "";
    };
    let i = 0;
    while (i < text.length) {
        const ch = text.charAt(i);

        if (ch === "\\" && i + 1 < text.length && ESCAPABLE.has(text.charAt(i + 1))) {
            buffer += text.charAt(i + 1);
            i += 2;
            continue;
        }
        if (ch === "\n") {
            flush();
            out.push({ type: "br" });
            i += 1;
            continue;
        }
        if (ch === "`") {
            const close = text.indexOf("`", i + 1);
            if (close > i + 1) {
                flush();
                out.push({ type: "code", text: text.slice(i + 1, close) });
                i = close + 1;
                continue;
            }
        }
        if (
            (ch === "h" || ch === "H") &&
            /^https?:\/\/[^\s]/i.test(text.slice(i, i + 9)) &&
            (i === 0 || /[\s(]/.test(text.charAt(i - 1)))
        ) {
            const end = linkEnd(text, i);
            const href = text.slice(i, end);
            if (/^https?:\/\/[^\s/]+/i.test(href)) {
                flush();
                out.push({ type: "link", href, text: href });
                i = end;
                continue;
            }
        }
        if (ch === "@" && (i === 0 || !USERNAME_CHAR.test(text.charAt(i - 1)))) {
            let end = i + 1;
            while (end < text.length && USERNAME_CHAR.test(text.charAt(end))) end += 1;
            // Ponto final não é do @ ("fala com @ana.").
            while (end > i + 1 && text.charAt(end - 1) === ".") end -= 1;
            const username = text.slice(i + 1, end);
            if (username.length >= 3 && username.length <= 20) {
                flush();
                out.push({ type: "mention", username });
                i = end;
                continue;
            }
        }
        if (depth < MAX_DEPTH) {
            let matched = false;
            for (const [mark, type] of DELIMITERS) {
                if (!text.startsWith(mark, i)) continue;
                const inner = i + mark.length;
                // Não abre com espaço logo depois (ex.: "2 * 3").
                if (inner >= text.length || /\s/.test(text.charAt(inner))) continue;
                // `*` seguido de outro `*` é parte de um `**` sem par.
                if (mark === "*" && text.charAt(inner) === "*") continue;
                // `_` no meio de palavra não marca (nomes_de_variavel).
                if (mark === "_" && i > 0 && /\w/.test(text.charAt(i - 1))) continue;
                let close = text.indexOf(mark, inner);
                // `*` sozinho não fecha num `**`.
                while (close !== -1 && mark === "*" && text.startsWith("**", close)) {
                    close = text.indexOf(mark, close + 2);
                }
                if (close === -1 || close === inner) continue;
                if (/\s/.test(text.charAt(close - 1))) continue;
                if (mark === "_" && /\w/.test(text.charAt(close + mark.length))) continue;
                flush();
                out.push({
                    type,
                    children: parseInline(text.slice(inner, close), depth + 1),
                });
                i = close + mark.length;
                matched = true;
                break;
            }
            if (matched) continue;
        }
        buffer += ch;
        i += 1;
    }
    flush();
    return out;
};

/**
 * @param {string} source
 * @returns {Block[]}
 */
export const parseMarkdown = (source) => {
    const lines = source.split("\n");
    /** @type {Block[]} */
    const blocks = [];
    /** @type {string[]} */
    let paragraph = [];
    const flushParagraph = () => {
        if (paragraph.length)
            blocks.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
        paragraph = [];
    };
    for (let i = 0; i < lines.length; i += 1) {
        const line = /** @type {string} */ (lines[i]);
        const fence = /^```([\w+#.-]{0,20})\s*$/.exec(line);
        if (fence) {
            const end = lines.findIndex((other, j) => j > i && /^```\s*$/.test(other));
            if (end !== -1) {
                flushParagraph();
                blocks.push({
                    type: "codeblock",
                    lang: fence[1] ?? "",
                    text: lines.slice(i + 1, end).join("\n"),
                });
                i = end;
                continue;
            }
        }
        // Bloco de uma linha só: ```código```
        const inline = /^```(.+)```$/.exec(line);
        if (inline && inline[1] && !inline[1].includes("```")) {
            flushParagraph();
            blocks.push({ type: "codeblock", lang: "", text: inline[1] });
            continue;
        }
        if (line.startsWith("> ") || line === ">") {
            flushParagraph();
            const quoted = [line.slice(2)];
            while (
                i + 1 < lines.length &&
                (lines[i + 1]?.startsWith("> ") || lines[i + 1] === ">")
            ) {
                i += 1;
                quoted.push((lines[i] ?? "").slice(2));
            }
            blocks.push({ type: "quote", children: parseInline(quoted.join("\n")) });
            continue;
        }
        paragraph.push(line);
    }
    flushParagraph();
    return blocks;
};

/**
 * Texto puro da mensagem, sem marcação (para o leitor de tela e para copiar).
 * @param {Inline[]} nodes
 * @returns {string}
 */
export const plainInline = (nodes) =>
    nodes
        .map((node) => {
            switch (node.type) {
                case "text":
                case "code":
                case "link":
                    return node.text;
                case "mention":
                    return `@${node.username}`;
                case "br":
                    return "\n";
                default:
                    return plainInline(node.children);
            }
        })
        .join("");

/**
 * As menções de uma mensagem.
 * @param {Block[]} blocks
 * @returns {string[]}
 */
export const mentionsOf = (blocks) => {
    /** @type {string[]} */
    const found = [];
    /** @param {Inline[]} nodes */
    const walk = (nodes) => {
        for (const node of nodes) {
            if (node.type === "mention") found.push(node.username);
            else if ("children" in node) walk(node.children);
        }
    };
    for (const block of blocks) if (block.type !== "codeblock") walk(block.children);
    return found;
};

/**
 * Trecho de uma linha para citações (resposta e fixadas): sem marcação,
 * e com o spoiler escondido — a citação não pode revelar o que foi ocultado.
 * @param {string} text
 * @returns {string}
 */
export const excerptPlain = (text) => {
    /** @param {Inline[]} nodes @returns {string} */
    const walk = (nodes) =>
        nodes
            .map((node) =>
                node.type === "spoiler"
                    ? "▒▒▒"
                    : node.type === "br"
                      ? " "
                      : "children" in node
                        ? walk(node.children)
                        : node.type === "mention"
                          ? `@${node.username}`
                          : node.text,
            )
            .join("");
    return walk(parseInline(text.replace(/```/g, "").replace(/^>\s?/gm, "")))
        .replace(/\s+/g, " ")
        .trim();
};
