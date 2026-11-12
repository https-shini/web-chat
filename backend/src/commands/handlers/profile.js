/** Perfil e presença: nome, id, perfil público, ausência, ação. */

import { MESSAGE_KINDS } from "../../protocol.js";
import { isAdmin, isMuted, PERMISSIONS } from "../../room/policy.js";
import { clock, findTarget, publishFor } from "./shared.js";

/** @type {import("../registry.js").CommandDefinition[]} */
export const profileCommands = [
    {
        name: "nick",
        aliases: ["nome"],
        category: "profile",
        description: "Troca o seu nome de exibição. O seu @ continua o mesmo.",
        syntax: "/nick <novo nome>",
        examples: ["/nick João Silva"],
        params: [{ name: "novo nome", type: "text" }],
        run: (ctx) => {
            const result = ctx.hub.rename(ctx.member, ctx.args["novo nome"]);
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
        description: "Mostra o perfil público de alguém da sala (ou o seu).",
        syntax: "/profile [@ ou nome]",
        examples: ["/profile", "/profile @ana", "/profile Ana"],
        params: [{ name: "@ ou nome", type: "text", optional: true }],
        run: (ctx) => {
            let identity = ctx.identity;
            let membership = ctx.membership;
            const query = ctx.args["@ ou nome"];
            if (query) {
                // Procurar alguém só faz sentido dentro de uma sala: fora dela
                // não há como saber quem você "vê".
                if (!ctx.room) {
                    return ctx.reply.error(
                        ctx.errors.NO_CONVERSATION,
                        "Para ver o perfil de alguém, use /profile dentro de uma sala.",
                    );
                }
                const found = findTarget(ctx, query);
                if (!found.ok) return found.response;
                identity = found.target.identity;
                membership = found.target.membership;
            }
            const time = ctx.now();
            const role =
                identity.role === "admin"
                    ? "administrador"
                    : membership?.role === "host"
                      ? "anfitrião da sala"
                      : "participante";
            const muted = membership && isMuted(membership, time) ? " · silenciado" : "";
            return ctx.reply.result(identity.name, {
                title: "Perfil",
                lines: [
                    `Username: @${identity.username}`,
                    // O id interno só aparece para administradores.
                    ...(isAdmin(ctx.identity) ? [`Id interno: ${identity.id}`] : []),
                    `Papel: ${role}`,
                    `Status: ${identity.away !== null ? `ausente (${identity.away})` : "presente"}${muted}`,
                    membership
                        ? `Na sala desde: ${clock(membership.joinedAt)}`
                        : `No chat desde: ${clock(identity.joinedAt)}`,
                    `Mensagens nesta sessão do servidor: ${identity.messageCount}`,
                ],
            });
        },
    },
    {
        name: "id",
        aliases: [],
        category: "profile",
        permission: PERMISSIONS.ADMIN,
        description: "Mostra o seu id interno. Só para administradores.",
        syntax: "/id",
        examples: ["/id"],
        run: (ctx) => ctx.reply.result(`Seu id interno: ${ctx.identity.id}`),
    },
    {
        name: "me",
        aliases: [],
        category: "profile",
        description: "Publica uma ação em terceira pessoa.",
        syntax: "/me <ação>",
        examples: ["/me está estudando programação"],
        requiresRoom: true,
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
                ctx.hub.setAway(ctx.member, null);
                return ctx.reply.success("Bem-vindo de volta: você está presente.");
            }
            const result = ctx.hub.setAway(ctx.member, reason ?? "");
            return ctx.reply.success(
                `Você está ausente: ${result.away}. Envie uma mensagem ou /afk para voltar.`,
            );
        },
    },
];
