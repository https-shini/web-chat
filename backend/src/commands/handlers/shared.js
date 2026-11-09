/**
 * Apoio comum aos handlers. Nenhuma regra nova aqui: localizar alvo usa
 * `room.findMembers`, publicar usa `room.publish`, autorizar usa
 * `room/policy.js`. Todos operam na sala do comando (`ctx.room`), que o
 * executor já conferiu.
 */

import { ERROR_CODES } from "../../errors.js";
import { canModerate } from "../../room/policy.js";

/**
 * Publica na sala em nome de quem executou o comando e traduz recusas.
 * @param {any} ctx
 * @param {{content: string, kind?: string, format?: string | null}} message
 */
export const publishFor = (ctx, message) => {
    if (message.content.length > 1000) {
        return ctx.reply.error(
            ctx.errors.INVALID_ARGUMENTS,
            "O texto ficou longo demais (máximo 1000 caracteres).",
        );
    }
    const result = ctx.room.publish(ctx.identity, message);
    if (result.ok) return null; // o efeito já aparece na sala para todos
    if (result.code === ERROR_CODES.MUTED) {
        return ctx.reply.error(
            ctx.errors.MUTED,
            "Você foi silenciado nesta sala e não pode publicar agora.",
        );
    }
    return ctx.reply.error(result.code, "Não foi possível publicar.");
};

/**
 * Encontra exatamente uma pessoa na sala por @username, nome ou id (prefixo 6+).
 * @param {any} ctx
 * @param {string} query
 * @returns {{ok: true, target: {identity: any, membership: any}} | {ok: false, response: any}}
 */
export const findTarget = (ctx, query) => {
    const found = ctx.room.findMembers(query);
    if (found.length === 0) {
        return {
            ok: false,
            response: ctx.reply.error(
                ctx.errors.NOT_FOUND,
                `Ninguém chamado "${query}" está na sala. Veja /users.`,
            ),
        };
    }
    if (found.length > 1) {
        return {
            ok: false,
            response: ctx.reply.error(
                ctx.errors.AMBIGUOUS_TARGET,
                `Há ${found.length} pessoas chamadas "${query}". Use o @username mostrado em /users.`,
            ),
        };
    }
    return { ok: true, target: found[0] };
};

/**
 * Localiza o alvo e aplica a hierarquia de moderação.
 * @param {any} ctx
 * @param {string} query
 */
export const findModerationTarget = (ctx, query) => {
    const found = findTarget(ctx, query);
    if (!found.ok) return found;
    const allowed = canModerate({
        actor: ctx.identity,
        actorMembership: ctx.membership,
        target: found.target.identity,
        targetMembership: found.target.membership,
    });
    if (allowed.ok) return found;
    const text = {
        forbidden: "Somente quem modera a sala (anfitrião ou administrador) pode fazer isso.",
        self: "Você não pode aplicar isso a si mesmo.",
        protected: "Esta pessoa também modera a sala e não pode ser moderada por você.",
    }[allowed.reason];
    return { ok: false, response: ctx.reply.error(ctx.errors.CANNOT_MODERATE, text) };
};

/** Hora curta pt-BR. @param {number} ms */
export const clock = (ms) =>
    new Date(ms).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
    }) + " UTC";
