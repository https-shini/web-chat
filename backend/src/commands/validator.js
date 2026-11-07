/**
 * Validação dos argumentos de um comando a partir da sua definição.
 *
 * Tipos de parâmetro:
 *  - `int`    inteiro, com `min`/`max` opcionais;
 *  - `word`   uma palavra (ou um trecho entre aspas);
 *  - `choice` uma palavra dentre `choices` (sem diferenciar maiúsculas);
 *  - `text`   o resto da linha, como digitado (deve ser o último).
 * Parâmetros com `optional: true` podem faltar — só no fim.
 */

import { nextToken } from "./parser.js";

/**
 * @typedef {{name: string, type: "int" | "word" | "choice" | "text", optional?: boolean,
 *   min?: number, max?: number, choices?: string[], maxLength?: number}} Param
 */

/**
 * @param {Param[]} params
 * @param {string} rest
 * @returns {{ok: true, values: Record<string, unknown>} | {ok: false, problem: string}}
 */
export const validateArgs = (params, rest) => {
    const values = {};
    const textParam = params.find((param) => param.type === "text");
    const positional = params.filter((param) => param.type !== "text");

    // Os primeiros tokens alimentam os parâmetros posicionais; o que sobra
    // da linha original vai para o parâmetro `text`, preservando espaços.
    let remaining = rest;
    for (const param of positional) {
        const read = nextToken(remaining);
        if (read === null) {
            if (param.optional) continue;
            return { ok: false, problem: `falta o argumento <${param.name}>` };
        }
        const { token } = read;
        remaining = read.rest;

        if (param.type === "int") {
            if (!/^-?\d{1,10}$/.test(token)) {
                return { ok: false, problem: `<${param.name}> precisa ser um número inteiro` };
            }
            const value = Number(token);
            if (param.min !== undefined && value < param.min) {
                return { ok: false, problem: `<${param.name}> precisa ser no mínimo ${param.min}` };
            }
            if (param.max !== undefined && value > param.max) {
                return { ok: false, problem: `<${param.name}> precisa ser no máximo ${param.max}` };
            }
            values[param.name] = value;
        } else if (param.type === "choice") {
            const value = token.toLowerCase();
            if (!param.choices?.includes(value)) {
                return {
                    ok: false,
                    problem: `<${param.name}> precisa ser: ${param.choices?.join(", ")}`,
                };
            }
            values[param.name] = value;
        } else {
            values[param.name] = token;
        }
    }

    remaining = remaining.trim();
    if (textParam) {
        if (!remaining && !textParam.optional) {
            return { ok: false, problem: `falta o texto <${textParam.name}>` };
        }
        if (textParam.maxLength !== undefined && remaining.length > textParam.maxLength) {
            return {
                ok: false,
                problem: `<${textParam.name}> pode ter no máximo ${textParam.maxLength} caracteres`,
            };
        }
        if (remaining) values[textParam.name] = remaining;
    } else if (remaining) {
        return { ok: false, problem: "argumentos a mais" };
    }
    return { ok: true, values };
};
