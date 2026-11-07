// @ts-check

/**
 * Para onde vai o que a pessoa digitou. NÃO é um interpretador: só lê o
 * nome do comando para decidir entre
 *  - mensagem comum;
 *  - comando local (`scope: "client"` no catálogo do servidor);
 *  - comando do servidor (texto bruto enviado como está; argumentos e
 *    permissões são decididos lá).
 *
 * Regras (as mesmas do parser do servidor):
 *  - é comando quando começa com `/` seguido de letra: `/help`, `/roll 20`;
 *  - `1/2`, `a/b`, `/ olá` são mensagens comuns;
 *  - `//texto` envia `/texto` como mensagem (escape).
 */

const COMMAND = /^\/([A-Za-z][A-Za-z0-9]{0,31})(?:\s+([\s\S]*))?$/;

/**
 * @typedef {import("../state/store.js").CommandInfo} CommandInfo
 * @typedef {{type: "message", content: string}
 *   | {type: "client", command: CommandInfo, args: string}
 *   | {type: "server", name: string, text: string}} Route
 */

/**
 * @param {CommandInfo[]} catalog
 * @param {string} name minúsculo
 * @returns {CommandInfo | null}
 */
export const findCommand = (catalog, name) =>
    catalog.find((command) => command.name === name || command.aliases.includes(name)) ?? null;

/**
 * @param {string} raw texto do campo
 * @param {CommandInfo[]} catalog
 * @returns {Route}
 */
export const routeInput = (raw, catalog) => {
    const text = raw.trim();
    if (text.startsWith("//")) return { type: "message", content: text.slice(1) };
    const match = COMMAND.exec(text);
    if (!match) return { type: "message", content: text };
    const name = (match[1] ?? "").toLowerCase();
    const command = findCommand(catalog, name);
    if (command?.scope === "client")
        return { type: "client", command, args: (match[2] ?? "").trim() };
    // Comando do servidor ou desconhecido: quem decide é o servidor.
    return { type: "server", name: command?.name ?? name, text };
};
