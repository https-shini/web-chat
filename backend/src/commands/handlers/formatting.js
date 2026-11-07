/** Formatação: emoticons e estilos aplicados à mensagem pelo servidor. */

import { MESSAGE_FORMATS } from "../../protocol.js";
import { publishFor } from "./shared.js";

/**
 * Comando que acrescenta um emoticon ao texto (opcional).
 * @param {string} name @param {string} art @param {string} description
 * @returns {import("../registry.js").CommandDefinition}
 */
const emoticon = (name, art, description) => ({
    name,
    category: "formatting",
    description,
    syntax: `/${name} [texto]`,
    examples: [`/${name}`, `/${name} fazer o quê`],
    params: [{ name: "texto", type: "text", optional: true }],
    run: (ctx) => publishFor(ctx, { content: [ctx.args.texto, art].filter(Boolean).join(" ") }),
});

/**
 * Comando que publica o texto com um estilo.
 * @param {string} name @param {string} format @param {string} description @param {string[]} aliases
 * @returns {import("../registry.js").CommandDefinition}
 */
const styled = (name, format, description, aliases = []) => ({
    name,
    aliases,
    category: "formatting",
    description,
    syntax: `/${name} <texto>`,
    examples: [`/${name} texto de exemplo`],
    params: [{ name: "texto", type: "text" }],
    run: (ctx) => publishFor(ctx, { content: ctx.args.texto, format }),
});

/** @type {import("../registry.js").CommandDefinition[]} */
export const formattingCommands = [
    emoticon("shrug", "¯\\_(ツ)_/¯", "Envia ¯\\_(ツ)_/¯, depois do texto se houver."),
    emoticon("tableflip", "(╯°□°)╯︵ ┻━┻", "Envia (╯°□°)╯︵ ┻━┻, depois do texto se houver."),
    emoticon("unflip", "┬─┬ノ( º _ ºノ)", "Envia ┬─┬ノ( º _ ºノ), depois do texto se houver."),
    styled("bold", MESSAGE_FORMATS.BOLD, "Envia o texto em negrito.", ["negrito"]),
    styled("italic", MESSAGE_FORMATS.ITALIC, "Envia o texto em itálico.", ["italico"]),
    styled("code", MESSAGE_FORMATS.CODE, "Envia o texto como código, em fonte monoespaçada."),
    styled(
        "spoiler",
        MESSAGE_FORMATS.SPOILER,
        "Envia o texto escondido; cada pessoa decide quando revelar.",
    ),
];
