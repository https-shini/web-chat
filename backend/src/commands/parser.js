/**
 * Leitura de um comando digitado: `/nome argumentos`.
 *
 * Só texto: nada aqui executa código, chama o sistema operacional ou
 * interpreta expressões. O resultado é um nome (minúsculo) e o resto da
 * linha como string — quem decide o que os argumentos significam é o
 * validador, a partir da definição do comando.
 */

/**
 * `/` seguido de letra, depois letras e dígitos. "/ olá", "1/2", "a/b" e
 * "//texto" não são comandos.
 */
const COMMAND = /^\/([A-Za-z][A-Za-z0-9]{0,31})(?:\s+([\s\S]*))?$/;

/**
 * @param {string} text
 * @returns {{ok: true, name: string, rest: string} | {ok: false}}
 */
export const parseCommand = (text) => {
    const match = COMMAND.exec(text.trim());
    if (!match) return { ok: false };
    return { ok: true, name: match[1].toLowerCase(), rest: (match[2] ?? "").trim() };
};

/**
 * Divide argumentos por espaço, respeitando aspas: `"João Silva" 10` →
 * ["João Silva", "10"]. Aspa sem par é tratada como texto comum.
 * @param {string} rest
 * @returns {string[]}
 */
export const tokenize = (rest) => {
    const tokens = [];
    const pattern = /"([^"]*)"|(\S+)/g;
    let match;
    while ((match = pattern.exec(rest)) !== null) tokens.push(match[1] ?? match[2]);
    return tokens;
};

/**
 * Lê o primeiro argumento e devolve o resto da linha intacto.
 * @param {string} rest
 * @returns {{token: string, rest: string} | null}
 */
export const nextToken = (rest) => {
    const match = /^\s*(?:"([^"]*)"|(\S+))/.exec(rest);
    if (!match) return null;
    return { token: match[1] ?? match[2], rest: rest.slice(match[0].length) };
};
