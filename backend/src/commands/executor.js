/**
 * Execução de comandos no servidor — o único interpretador.
 *
 * Fluxo: texto bruto → parser → registro → conversa → permissão →
 * argumentos → intervalo mínimo → handler → resposta padronizada
 * (`command_result`). A identidade vem da sessão e o papel da participação
 * na sala (emitidos pelo servidor), nunca do payload. Comando de sala só
 * roda numa conversa de que a conexão participa (`payload.conversationId`). O texto dos argumentos nunca vai para o log (pode conter a chave
 * de administrador ou conteúdo de mensagem).
 */

import { LIMITS, serverMessage } from "../protocol.js";
import { hasPermission, isAdmin, PERMISSIONS } from "../room/policy.js";
import { readClientId } from "../validation.js";
import { parseCommand } from "./parser.js";
import { COMMAND_ERRORS, reply } from "./response.js";
import { validateArgs } from "./validator.js";

/**
 * @param {{
 *   registry: ReturnType<typeof import("./registry.js").createCommandRegistry>,
 *   hub: ReturnType<typeof import("../room/hub.js").createHub>,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   services: Record<string, unknown>,
 *   metrics?: {count: (name: string, label?: string) => void},
 *   now?: () => number,
 * }} options
 */
export const createCommandExecutor = ({
    registry,
    hub,
    log,
    services,
    metrics = { count() {} },
    now = Date.now,
}) => {
    /** Último uso de cada comando com intervalo mínimo, por identidade. */
    const lastUse = new WeakMap();

    const send = (member, message) => services.deliver(member, JSON.stringify(message));

    /**
     * Catálogo da conexão. "Liberado" para comandos de moderação quando a
     * pessoa modera alguma sala; a decisão de verdade é feita por sala, em
     * cada execução.
     */
    const sendCatalog = (member) => {
        const entry = hub.entryOf(member);
        if (!entry) return;
        const { identity } = entry;
        const moderates = isAdmin(identity) || hub.hostsAnyRoom(identity);
        send(
            member,
            serverMessage.commandCatalog(
                registry.catalogFor(
                    identity,
                    moderates ? { role: "host", mutedUntil: null } : null,
                ),
            ),
        );
    };

    /**
     * @param {unknown} member
     * @param {Record<string, unknown>} payload `{ requestId?, text }`
     */
    const execute = (member, payload) => {
        const requestId = readClientId(payload.requestId);
        // Todo comando recebe exatamente UMA resposta. Quando o efeito já
        // aparece para a sala (ex.: /me, /mute), a resposta é uma confirmação
        // com texto vazio — o cliente a usa só para encerrar o pedido.
        const respond = (result) => {
            send(
                member,
                serverMessage.commandResult({ requestId, ...(result ?? reply.success("")) }),
            );
        };

        const entry = hub.entryOf(member);
        if (!entry) {
            return respond(reply.error("not_logged_in", "Entre no chat antes de usar comandos."));
        }
        const text = payload.text;
        if (typeof text !== "string" || text.length > LIMITS.commandMaxLength) {
            return respond(reply.error(COMMAND_ERRORS.INVALID_COMMAND, "Comando inválido."));
        }
        const parsed = parseCommand(text);
        if (!parsed.ok) {
            return respond(
                reply.error(
                    COMMAND_ERRORS.INVALID_COMMAND,
                    "Comandos começam com / e uma letra, como /help.",
                ),
            );
        }

        const command = registry.resolve(parsed.name);
        if (!command) {
            metrics.count("commandsExecuted", "unknown");
            const similar = registry.suggest(parsed.name.slice(0, 2));
            return respond(
                reply.error(
                    COMMAND_ERRORS.UNKNOWN_COMMAND,
                    `Comando desconhecido: /${parsed.name}. Digite /help para ver os comandos.`,
                    similar.length
                        ? { lines: [`Talvez: ${similar.map((n) => `/${n}`).join(", ")}`] }
                        : {},
                ),
            );
        }
        const { identity } = entry;

        // Conversa: informada → precisa ser uma de que a conexão participa.
        let room = null;
        if (payload.conversationId !== undefined && payload.conversationId !== null) {
            const found = hub.resolve(member, payload.conversationId);
            if (!found.ok) {
                return respond(
                    reply.error(
                        COMMAND_ERRORS.NO_CONVERSATION,
                        "Você não participa desta conversa.",
                    ),
                );
            }
            room = found.room;
        }
        const membership = room ? room.membershipOf(identity) : null;

        const outcome = (ok, code) =>
            log(ok ? "info" : "warn", "command_executed", {
                user: identity.id,
                command: command.name,
                ...(room ? { conversation: room.id } : {}),
                ok,
                ...(code ? { code } : {}),
            });

        if (command.scope === "client") {
            return respond(
                reply.info(
                    `/${command.name} roda no seu navegador. Atualize a página se ele não funcionar.`,
                    {
                        code: COMMAND_ERRORS.CLIENT_COMMAND,
                    },
                ),
            );
        }
        if (command.requiresRoom && !room) {
            return respond(
                reply.error(
                    COMMAND_ERRORS.NO_CONVERSATION,
                    `/${command.name} funciona dentro de uma sala. Abra uma sala e tente de novo.`,
                ),
            );
        }
        if (!hasPermission(identity, command.permission, membership)) {
            outcome(false, COMMAND_ERRORS.FORBIDDEN);
            metrics.count("commandsRejected", COMMAND_ERRORS.FORBIDDEN);
            const why = {
                [PERMISSIONS.ADMIN]: `/${command.name} é restrito a administradores.`,
                [PERMISSIONS.MODERATOR]: `/${command.name} é restrito a quem modera a sala (anfitrião ou administrador).`,
            };
            return respond(
                reply.error(
                    COMMAND_ERRORS.FORBIDDEN,
                    why[command.permission] ?? `Você não pode usar /${command.name}.`,
                ),
            );
        }

        const args = validateArgs(command.params, parsed.rest);
        if (!args.ok) {
            metrics.count("commandsRejected", COMMAND_ERRORS.INVALID_ARGUMENTS);
            return respond(
                reply.error(
                    COMMAND_ERRORS.INVALID_ARGUMENTS,
                    `Uso: ${command.syntax} — ${args.problem}.`,
                ),
            );
        }

        if (command.cooldownMs > 0) {
            const uses = lastUse.get(identity) ?? new Map();
            const wait = (uses.get(command.name) ?? -Infinity) + command.cooldownMs - now();
            if (wait > 0) {
                return respond(
                    reply.error(
                        COMMAND_ERRORS.COOLDOWN,
                        `Aguarde ${Math.ceil(wait / 1000)} s para usar /${command.name} de novo.`,
                    ),
                );
            }
            uses.set(command.name, now());
            lastUse.set(identity, uses);
        }

        const result = command.run({
            member,
            identity,
            args: args.values,
            room,
            membership,
            hub,
            reply,
            errors: COMMAND_ERRORS,
            services,
            sendCatalog,
            now,
        });
        const failed = result?.tone === "error";
        outcome(!failed, failed ? result.code : undefined);
        metrics.count(
            failed ? "commandsRejected" : "commandsExecuted",
            failed ? result.code : command.name,
        );
        return respond(result);
    };

    return { execute, sendCatalog };
};
