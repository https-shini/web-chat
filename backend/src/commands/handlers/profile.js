/** Perfil e presença: nome, id, perfil público, ausência, ação. */

import { MESSAGE_KINDS } from "../../protocol.js";
import { isMuted } from "../../room/policy.js";
import { clock, findTarget, publishFor } from "./shared.js";

/** @type {import("../registry.js").CommandDefinition[]} */
export const profileCommands = [
    {
        name: "nick",
        aliases: ["nome"],
        category: "profile",
        description: "Troca o seu nome de exibição. O seu id continua o mesmo.",
        syntax: "/nick <novo nome>",
        examples: ["/nick João Silva"],
        params: [{ name: "novo nome", type: "text" }],
        run: (ctx) => {
            const result = ctx.room.rename(ctx.member, ctx.args["novo nome"]);
            if (result.ok) {
                return result.changed
                    ? ctx.reply.success(`Agora você se chama ${result.name}.`)
                    : ctx.reply.info(`Você já se chama ${result.name}.`);
            }
            if (result.code === "cooldown") {
                return ctx.reply.error(
                    ctx.errors.COOLDOWN,
                    `Aguarde ${Math.ceil(result.retryInMs / 1000)} s para trocar de nome de novo.`,
                );
            }
            return ctx.reply.error(
                ctx.errors.INVALID_ARGUMENTS,
                "Nome inválido: use de 1 a 30 caracteres visíveis.",
            );
        },
    },
    {
        name: "profile",
        aliases: ["whois", "perfil"],
        category: "profile",
        description: "Mostra o perfil público de alguém (ou o seu).",
        syntax: "/profile [nome ou id]",
        examples: ["/profile", "/profile @ana", "/profile Ana"],
        params: [{ name: "nome ou id", type: "text", optional: true }],
        run: (ctx) => {
            let identity = ctx.identity;
            const query = ctx.args["nome ou id"];
            if (query) {
                const found = findTarget(ctx, query);
                if (!found.ok) return found.response;
                identity = found.target.identity;
            }
            const time = ctx.now();
            return ctx.reply.result(identity.name, {
                title: "Perfil",
                lines: [
                    `Username: @${identity.username}`,
                    `Id: ${identity.id}`,
                    `Papel: ${identity.role === "admin" ? "administrador" : "participante"}`,
                    `Status: ${identity.away !== null ? `ausente (${identity.away})` : "presente"}${isMuted(identity, time) ? " · silenciado" : ""}`,
                    `Na sala desde: ${clock(identity.joinedAt)}`,
                    `Mensagens nesta sessão do servidor: ${identity.messageCount}`,
                ],
            });
        },
    },
    {
        name: "id",
        aliases: [],
        category: "profile",
        description: "Mostra o seu id completo, atribuído pelo servidor.",
        syntax: "/id",
        examples: ["/id"],
        run: (ctx) => ctx.reply.result(`Seu id: ${ctx.identity.id}`),
    },
    {
        name: "me",
        aliases: [],
        category: "profile",
        description: "Publica uma ação em terceira pessoa.",
        syntax: "/me <ação>",
        examples: ["/me está estudando programação"],
        params: [{ name: "ação", type: "text" }],
        run: (ctx) => publishFor(ctx, { content: ctx.args["ação"], kind: MESSAGE_KINDS.ACTION }),
    },
    {
        name: "afk",
        aliases: ["away", "ausente"],
        category: "profile",
        description:
            "Marca você como ausente (com motivo opcional). Repita, ou envie uma mensagem, para voltar.",
        syntax: "/afk [motivo]",
        examples: ["/afk", "/afk almoçando"],
        params: [{ name: "motivo", type: "text", optional: true }],
        run: (ctx) => {
            const reason = ctx.args.motivo;
            if (!reason && ctx.identity.away !== null) {
                ctx.room.setAway(ctx.member, null);
                return ctx.reply.success("Bem-vindo de volta: você está presente.");
            }
            const result = ctx.room.setAway(ctx.member, reason ?? "");
            return ctx.reply.success(
                `Você está ausente: ${result.away}. Envie uma mensagem ou /afk para voltar.`,
            );
        },
    },
];
