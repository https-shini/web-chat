// @ts-check

import { strings } from "../i18n/strings.js";
import { findCommand } from "./input.js";

/**
 * Comandos que rodam no navegador (`scope: "client"` no catálogo). Cada um
 * devolve a resposta a exibir; nenhum fala com o servidor.
 *
 * @typedef {import("../state/store.js").CommandInfo} CommandInfo
 * @typedef {{tone: string, text: string, title?: string, lines?: string[]}} LocalReply
 */

const ADMIN = "admin";

/**
 * /help e /help comando — montado do catálogo oficial.
 * @param {CommandInfo[]} catalog
 * @param {string} args
 * @returns {LocalReply}
 */
export const helpReply = (catalog, args) => {
    const wanted = args.replace(/^\//, "").trim().toLowerCase();
    if (wanted) {
        const command = findCommand(catalog, wanted);
        if (!command) {
            return { tone: "error", text: `Não existe /${wanted}. Digite /help para ver todos.` };
        }
        const lines = [command.description, `Uso: ${command.syntax}`];
        if (command.aliases.length)
            lines.push(`Também: ${command.aliases.map((a) => `/${a}`).join(", ")}`);
        if (command.examples.length) lines.push(`Exemplos: ${command.examples.join("  ·  ")}`);
        if (command.permission === ADMIN) {
            lines.push(
                command.allowed
                    ? "Restrito a administradores (você é um)."
                    : "Restrito a administradores.",
            );
        }
        return { tone: "info", title: `/${command.name}`, text: command.categoryLabel, lines };
    }

    const lines = [];
    const categories = [...new Set(catalog.map((command) => command.categoryLabel))];
    for (const label of categories) {
        const entries = catalog
            .filter((command) => command.categoryLabel === label)
            .map(
                (command) =>
                    `/${command.name}${command.permission === ADMIN && !command.allowed ? " 🔒" : ""}`,
            );
        lines.push(`${label}: ${entries.join("  ")}`);
    }
    lines.push(strings.commands.helpFooter);
    return {
        tone: "info",
        title: strings.commands.helpTitle,
        text: strings.commands.helpIntro,
        lines,
    };
};

/**
 * /time — data e hora deste dispositivo.
 * @param {Date} [now]
 * @returns {LocalReply}
 */
export const timeReply = (now = new Date()) => ({
    tone: "result",
    text: now.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" }),
    lines: [strings.commands.timeNote],
});
