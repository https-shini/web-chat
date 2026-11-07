/**
 * Administração. Todos exigem `permission: "admin"` (verificado pelo
 * executor) — exceto /admin, que é como alguém PROVA ser administrador.
 * Hierarquia e alvos: `room/policy.js` via `findModerationTarget`.
 */

import { CLOSE_CODES, MESSAGE_KINDS } from "../../protocol.js";
import { PERMISSIONS } from "../../room/policy.js";
import { findModerationTarget, publishFor } from "./shared.js";

/** @type {import("../registry.js").CommandDefinition[]} */
export const adminCommands = [
    {
        name: "admin",
        aliases: [],
        category: "admin",
        description: "Torna você administrador, com a chave definida por quem opera o servidor.",
        syntax: "/admin <chave>",
        examples: ["/admin ••••••••"],
        params: [{ name: "chave", type: "text", maxLength: 200 }],
        run: (ctx) => {
            if (ctx.identity.role === "admin") return ctx.reply.info("Você já é administrador.");
            const result = ctx.services.adminAuth.attempt(ctx.identity, ctx.args.chave);
            if (result.ok) {
                ctx.room.grantAdmin(ctx.member);
                ctx.sendCatalog(ctx.member); // comandos administrativos passam a constar como liberados
                return ctx.reply.admin(
                    "Você agora é administrador. Digite /help para ver os comandos.",
                );
            }
            if (result.reason === "disabled") {
                return ctx.reply.error(
                    ctx.errors.ADMIN_DISABLED,
                    "A administração está desativada neste servidor.",
                );
            }
            if (result.reason === "locked") {
                return ctx.reply.error(
                    ctx.errors.ADMIN_LOCKED,
                    `Tentativas demais. Tente de novo em ${Math.ceil(result.retryInMs / 60000)} min.`,
                );
            }
            return ctx.reply.error(ctx.errors.ADMIN_WRONG_KEY, "Chave incorreta.");
        },
    },
    {
        name: "clearall",
        aliases: [],
        category: "admin",
        permission: PERMISSIONS.ADMIN,
        description: "Apaga o histórico da sala para todos. Pede confirmação.",
        syntax: "/clearall confirmar",
        examples: ["/clearall", "/clearall confirmar"],
        params: [
            {
                name: "confirmação",
                type: "choice",
                choices: ["confirmar", "confirm"],
                optional: true,
            },
        ],
        run: (ctx) => {
            if (!ctx.args["confirmação"]) {
                return ctx.reply.warning(
                    "Isto apaga a conversa da sala para todos que estão nela.",
                    {
                        code: ctx.errors.CONFIRMATION_REQUIRED,
                        lines: [
                            "O histórico em memória do servidor é descartado; quem entrar depois não verá nada.",
                            "Cópias que alguém já tenha feito não podem ser apagadas.",
                            "Para confirmar, digite: /clearall confirmar",
                        ],
                    },
                );
            }
            ctx.room.clearHistory(ctx.member);
            return null; // todos recebem chat_cleared
        },
    },
    {
        name: "announce",
        aliases: ["anuncio"],
        category: "admin",
        permission: PERMISSIONS.ADMIN,
        description: "Publica um aviso destacado para a sala.",
        syntax: "/announce <texto>",
        examples: ["/announce Reunião começando agora!"],
        params: [{ name: "texto", type: "text" }],
        run: (ctx) =>
            publishFor(ctx, { content: ctx.args.texto, kind: MESSAGE_KINDS.ANNOUNCEMENT }),
    },
    {
        name: "mute",
        aliases: ["silenciar"],
        category: "admin",
        permission: PERMISSIONS.ADMIN,
        description: "Impede alguém de enviar mensagens, por um tempo (minutos) ou até /unmute.",
        syntax: "/mute <nome ou id> [minutos]",
        examples: ["/mute Ana", "/mute Ana 10", '/mute "João Silva" 5'],
        params: [
            { name: "nome ou id", type: "word" },
            { name: "minutos", type: "int", optional: true, min: 1, max: 1440 },
        ],
        run: (ctx) => {
            const found = findModerationTarget(ctx, ctx.args["nome ou id"]);
            if (!found.ok) return found.response;
            const minutes = ctx.args.minutos;
            const actor = { identity: ctx.identity };
            ctx.room.setMuted(
                actor,
                found.target,
                minutes ? ctx.now() + minutes * 60000 : Infinity,
            );
            return null; // a sala recebe o aviso
        },
    },
    {
        name: "unmute",
        aliases: ["liberar"],
        category: "admin",
        permission: PERMISSIONS.ADMIN,
        description: "Libera alguém silenciado.",
        syntax: "/unmute <nome ou id>",
        examples: ["/unmute Ana"],
        params: [{ name: "nome ou id", type: "word" }],
        run: (ctx) => {
            const found = findModerationTarget(ctx, ctx.args["nome ou id"]);
            if (!found.ok) return found.response;
            const { identity } = found.target;
            if (identity.mutedUntil === null || identity.mutedUntil <= ctx.now()) {
                return ctx.reply.info(`${identity.name} não está silenciado.`);
            }
            ctx.room.setMuted({ identity: ctx.identity }, found.target, null);
            return null;
        },
    },
    {
        name: "kick",
        aliases: ["remover"],
        category: "admin",
        permission: PERMISSIONS.ADMIN,
        description: "Remove alguém da sala agora. A pessoa pode voltar, mas como identidade nova.",
        syntax: "/kick <nome ou id>",
        examples: ["/kick Ana", '/kick "João Silva"'],
        params: [{ name: "nome ou id", type: "word" }],
        run: (ctx) => {
            const found = findModerationTarget(ctx, ctx.args["nome ou id"]);
            if (!found.ok) return found.response;
            ctx.room.remove({ identity: ctx.identity }, found.target);
            ctx.services.disconnect(
                found.target.member,
                CLOSE_CODES.REMOVED,
                "Removido por um administrador",
            );
            return null;
        },
    },
];
