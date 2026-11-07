/** Comandos básicos: ajuda, sala, conexão e informações do servidor. */

import { isMuted } from "../../room/policy.js";

/** Regras da sala exibidas por /rules — fonte única. */
export const ROOM_RULES = [
    "Trate as pessoas com respeito. Sem ataques, assédio ou discriminação.",
    "Nada de spam ou flood: o servidor limita a velocidade de envio.",
    "Não compartilhe dados pessoais seus ou de outras pessoas.",
    "A sala é efêmera: nada é salvo de forma permanente — nem as mensagens, nem quem esteve aqui.",
    "Administradores podem silenciar ou remover quem descumprir as regras.",
];

/** @type {import("../registry.js").CommandDefinition[]} */
export const basicCommands = [
    {
        name: "help",
        aliases: ["ajuda", "comandos"],
        category: "basic",
        description: "Mostra os comandos disponíveis ou explica um comando.",
        syntax: "/help [comando]",
        examples: ["/help", "/help roll"],
        scope: "client",
    },
    {
        name: "clear",
        aliases: ["limpar"],
        category: "basic",
        description:
            "Limpa a conversa só na sua tela. Ninguém mais é afetado e nada é apagado no servidor.",
        syntax: "/clear",
        examples: ["/clear"],
        scope: "client",
    },
    {
        name: "time",
        aliases: ["hora", "date"],
        category: "basic",
        description: "Mostra a data e a hora deste dispositivo.",
        syntax: "/time",
        examples: ["/time"],
        scope: "client",
    },
    {
        name: "users",
        aliases: ["online", "who"],
        category: "basic",
        description: "Lista quem está na sala agora, com o id curto de cada pessoa.",
        syntax: "/users",
        examples: ["/users"],
        run: (ctx) => {
            const time = ctx.now();
            const people = ctx.room.listMembers();
            const lines = people.map(({ identity }) => {
                const tags = [
                    identity.id === ctx.identity.id ? "você" : null,
                    identity.role === "admin" ? "admin" : null,
                    identity.away !== null ? `ausente: ${identity.away}` : null,
                    isMuted(identity, time) ? "silenciado" : null,
                ].filter(Boolean);
                return `${identity.name} · ${identity.id.slice(0, 8)}${tags.length ? ` · ${tags.join(" · ")}` : ""}`;
            });
            return ctx.reply.result(
                people.length === 1 ? "1 pessoa na sala" : `${people.length} pessoas na sala`,
                { lines },
            );
        },
    },
    {
        name: "ping",
        aliases: [],
        category: "basic",
        description: "Mede o tempo de ida e volta da sua mensagem até o servidor.",
        syntax: "/ping",
        examples: ["/ping"],
        run: (ctx) => ctx.reply.success("pong", { data: { serverTime: ctx.now() } }),
    },
    {
        name: "about",
        aliases: ["sobre"],
        category: "basic",
        description: "O que é esta sala.",
        syntax: "/about",
        examples: ["/about"],
        run: (ctx) =>
            ctx.reply.info("web-chat: uma sala única, efêmera e anônima.", {
                lines: [
                    "Ninguém precisa de conta; você entra só com um nome.",
                    "As mensagens ficam em memória e somem quando o servidor reinicia.",
                    "Digite / para ver os comandos.",
                ],
            }),
    },
    {
        name: "version",
        aliases: ["versao"],
        category: "basic",
        description: "Versão do servidor e há quanto tempo ele está no ar.",
        syntax: "/version",
        examples: ["/version"],
        run: (ctx) => {
            const minutes = Math.floor((ctx.now() - ctx.services.startedAt) / 60000);
            return ctx.reply.info(`Servidor web-chat ${ctx.services.version}`, {
                lines: [`No ar há ${minutes} min.`],
            });
        },
    },
    {
        name: "rules",
        aliases: ["regras"],
        category: "basic",
        description: "Regras de convivência da sala.",
        syntax: "/rules",
        examples: ["/rules"],
        run: (ctx) =>
            ctx.reply.info("Regras da sala", {
                lines: ROOM_RULES.map((rule, i) => `${i + 1}. ${rule}`),
            }),
    },
];
