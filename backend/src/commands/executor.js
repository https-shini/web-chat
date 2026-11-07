/**
 * Execução de comandos no servidor — o único interpretador.
 *
 * Fluxo: texto bruto → parser → registro → permissão → argumentos →
 * intervalo mínimo → handler → resposta padronizada (`command_result`).
 * A identidade e o papel vêm da sala (emitidos pelo servidor), nunca do
 * payload. O texto dos argumentos nunca vai para o log (pode conter a chave
 * de administrador ou conteúdo de mensagem).
 */

import { LIMITS, serverMessage } from "../protocol.js";
import { hasPermission, PERMISSIONS } from "../room/policy.js";
import { readClientId } from "../validation.js";
import { parseCommand } from "./parser.js";
import { COMMAND_ERRORS, reply } from "./response.js";
import { validateArgs } from "./validator.js";

/**
 * @param {{
 *   registry: ReturnType<typeof import("./registry.js").createCommandRegistry>,
 *   room: ReturnType<typeof import("../room/room.js").createRoom>,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   services: Record<string, unknown>,
 *   metrics?: {count: (name: string, label?: string) => void},
 *   now?: () => number,
 * }} options
 */
export const createCommandExecutor = ({
    registry,
    room,
    log,
    services,
    metrics = { count() {} },
    now = Date.now,
}) => {
    /** Último uso de cada comando com intervalo mínimo, por identidade. */
    const lastUse = new WeakMap();

    const send = (member, message) => services.deliver(member, JSON.stringify(message));

    const sendCatalog = (member) => {
        const entry = room.entryOf(member);
        if (entry) send(member, serverMessage.commandCatalog(registry.catalogFor(entry.identity)));
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

        const entry = room.entryOf(member);
        if (!entry) {
            return respond(reply.error("not_logged_in", "Entre na sala antes de usar comandos."));
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
        const outcome = (ok, code) =>
            log(ok ? "info" : "warn", "command_executed", {
                user: identity.id,
                command: command.name,
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
        if (!hasPermission(identity, command.permission)) {
            outcome(false, COMMAND_ERRORS.FORBIDDEN);
            metrics.count("commandsRejected", COMMAND_ERRORS.FORBIDDEN);
            return respond(
                reply.error(
                    COMMAND_ERRORS.FORBIDDEN,
                    command.permission === PERMISSIONS.ADMIN
                        ? `/${command.name} é restrito a administradores.`
                        : `Você não pode usar /${command.name}.`,
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
