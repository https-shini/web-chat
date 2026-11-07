/** Interação: dados e moeda, com sorteio no servidor (resultado compartilhado). */

import crypto from "node:crypto";
import { MESSAGE_KINDS } from "../../protocol.js";
import { publishFor } from "./shared.js";

const LIMIT = 1_000_000_000;

/** @type {import("../registry.js").CommandDefinition[]} */
export const socialCommands = [
    {
        name: "roll",
        aliases: ["dice", "dado"],
        category: "social",
        description: "Rola um dado e mostra o resultado para todos. Sem números: 1 a 6.",
        syntax: "/roll [máximo] ou /roll <mínimo> <máximo>",
        examples: ["/roll", "/roll 20", "/roll 1 100"],
        params: [
            { name: "a", type: "int", optional: true, min: -LIMIT, max: LIMIT },
            { name: "b", type: "int", optional: true, min: -LIMIT, max: LIMIT },
        ],
        run: (ctx) => {
            const { a, b } = ctx.args;
            let min = 1;
            let max = 6;
            if (a !== undefined && b === undefined) max = a;
            if (a !== undefined && b !== undefined) [min, max] = [a, b];
            if (max <= min) {
                return ctx.reply.error(
                    ctx.errors.INVALID_ARGUMENTS,
                    "O máximo precisa ser maior que o mínimo.",
                );
            }
            if (max - min > 1_000_000) {
                return ctx.reply.error(
                    ctx.errors.INVALID_ARGUMENTS,
                    "Intervalo grande demais (até 1.000.000 de valores).",
                );
            }
            const value = crypto.randomInt(min, max + 1);
            return publishFor(ctx, {
                content: `rolou um dado (${min}–${max}): ${value}`,
                kind: MESSAGE_KINDS.ROLL,
            });
        },
    },
    {
        name: "flip",
        aliases: ["coin", "moeda"],
        category: "social",
        description: "Joga uma moeda e mostra o resultado para todos.",
        syntax: "/flip",
        examples: ["/flip"],
        run: (ctx) =>
            publishFor(ctx, {
                content: `jogou uma moeda: ${crypto.randomInt(2) === 0 ? "cara" : "coroa"}`,
                kind: MESSAGE_KINDS.ROLL,
            }),
    },
];
