// @ts-check

/**
 * Sugestões de comando a partir do catálogo do servidor — nenhuma consulta
 * à rede enquanto se digita.
 *
 *  - enquanto o cursor está no nome (`/cl|`): lista os comandos cujo nome ou
 *    alias começa com o que foi digitado;
 *  - depois do nome (`/roll |`): mostra a sintaxe do comando, sem capturar
 *    teclas — a pessoa digita os argumentos livremente.
 */

/**
 * @typedef {import("../state/store.js").CommandInfo} CommandInfo
 * @typedef {{mode: "names", query: string, items: {command: CommandInfo, matched: string}[]}
 *   | {mode: "syntax", command: CommandInfo}} Suggestion
 */

/**
 * @param {string} text
 * @param {number} cursor posição do cursor no campo
 * @param {CommandInfo[]} catalog
 * @returns {Suggestion | null}
 */
export const suggest = (text, cursor, catalog) => {
    if (!text.startsWith("/") || text.startsWith("//") || catalog.length === 0) return null;
    const head = /^\/([A-Za-z0-9]*)/.exec(text);
    if (!head) return null;
    const typed = (head[1] ?? "").toLowerCase();
    const nameEnd = head[0].length;

    if (cursor <= nameEnd && text.length === nameEnd) {
        const items = [];
        for (const command of catalog) {
            if (command.name.startsWith(typed)) {
                items.push({ command, matched: command.name });
            } else {
                const alias = command.aliases.find((name) => name.startsWith(typed));
                if (alias) items.push({ command, matched: alias });
            }
        }
        // Liberados primeiro; dentro de cada grupo, nome exato, depois alfabético.
        items.sort(
            (a, b) =>
                Number(b.command.allowed) - Number(a.command.allowed) ||
                Number(b.command.name === typed) - Number(a.command.name === typed) ||
                a.command.name.localeCompare(b.command.name),
        );
        return items.length > 0 ? { mode: "names", query: typed, items } : null;
    }

    const command = catalog.find((entry) => entry.name === typed || entry.aliases.includes(typed));
    return command ? { mode: "syntax", command } : null;
};

/**
 * Texto do campo depois de escolher uma sugestão: `/nome ` (com espaço,
 * pronto para os argumentos).
 * @param {CommandInfo} command
 */
export const completion = (command) => `/${command.name} `;
