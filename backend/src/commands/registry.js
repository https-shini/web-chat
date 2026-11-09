/**
 * Registro central de comandos — a fonte oficial da lista.
 *
 * O servidor envia ao cliente o catálogo derivado daqui (`command_catalog`):
 * autocomplete e `/help` no navegador são montados a partir dele, sem lista
 * paralela no frontend. Comandos `scope: "client"` (ex.: `/clear`) também
 * vivem aqui: o navegador os executa, mas a definição é única.
 *
 * Acrescentar um comando = acrescentar uma definição num arquivo de
 * `handlers/`; o parser e o executor não mudam.
 */

import { hasPermission, PERMISSIONS } from "../room/policy.js";

export const CATEGORIES = Object.freeze({
    basic: "Básicos",
    profile: "Perfil",
    social: "Interação",
    formatting: "Formatação",
    room: "Salas",
    admin: "Moderação",
});

const NAME = /^[a-z][a-z0-9]{0,31}$/;

/**
 * @typedef {import("./validator.js").Param} Param
 * @typedef {{
 *   name: string,
 *   aliases?: string[],
 *   category: keyof typeof CATEGORIES,
 *   description: string,
 *   syntax: string,
 *   examples?: string[],
 *   permission?: string,
 *   scope?: "server" | "client",
 *   params?: Param[],
 *   cooldownMs?: number,
 *   requiresRoom?: boolean,  só roda dentro de uma sala (payload.conversationId)
 *   run?: (ctx: any) => unknown,
 * }} CommandDefinition
 */

export const createCommandRegistry = () => {
    /** @type {Map<string, CommandDefinition>} nome ou alias → definição */
    const byName = new Map();
    /** @type {CommandDefinition[]} */
    const ordered = [];

    return {
        /** @param {CommandDefinition} definition */
        register(definition) {
            const command = {
                aliases: [],
                examples: [],
                permission: PERMISSIONS.EVERYONE,
                scope: "server",
                params: [],
                cooldownMs: 0,
                requiresRoom: false,
                ...definition,
            };
            for (const name of [command.name, ...command.aliases]) {
                if (!NAME.test(name)) throw new Error(`Nome de comando inválido: ${name}`);
                if (byName.has(name)) throw new Error(`Comando ou alias duplicado: /${name}`);
            }
            if (!(command.category in CATEGORIES)) {
                throw new Error(`Categoria desconhecida em /${command.name}: ${command.category}`);
            }
            if (!Object.values(PERMISSIONS).includes(command.permission)) {
                throw new Error(`Permissão desconhecida em /${command.name}`);
            }
            if (command.scope === "server" && typeof command.run !== "function") {
                throw new Error(`/${command.name} precisa de run()`);
            }
            const textParams = command.params.filter((param) => param.type === "text");
            if (
                textParams.length > 1 ||
                (textParams[0] && command.params.at(-1) !== textParams[0])
            ) {
                throw new Error(`/${command.name}: o parâmetro de texto deve ser único e o último`);
            }
            Object.freeze(command);
            for (const name of [command.name, ...command.aliases]) byName.set(name, command);
            ordered.push(command);
            return command;
        },

        /** @param {string} name já em minúsculas */
        resolve: (name) => byName.get(name) ?? null,

        /** Definições na ordem de registro. */
        list: () => [...ordered],

        /**
         * Nomes conhecidos que começam com `prefix` (para sugerir em erro).
         * @param {string} prefix
         */
        suggest(prefix) {
            return ordered
                .filter((command) =>
                    [command.name, ...command.aliases].some((name) => name.startsWith(prefix)),
                )
                .map((command) => command.name);
        },

        /**
         * Catálogo para o cliente: metadados públicos + se a pessoa pode usar.
         * Nunca inclui o handler.
         * @param {{role: string}} identity
         * @param {import("../room/policy.js").Membership} [membership] papel numa sala
         */
        catalogFor(identity, membership = null) {
            return ordered.map((command) => ({
                name: command.name,
                aliases: command.aliases,
                category: command.category,
                categoryLabel: CATEGORIES[command.category],
                description: command.description,
                syntax: command.syntax,
                examples: command.examples,
                permission: command.permission,
                scope: command.scope,
                requiresRoom: command.requiresRoom,
                allowed: hasPermission(identity, command.permission, membership),
            }));
        },
    };
};
