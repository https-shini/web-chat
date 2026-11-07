/**
 * Regras de autorização da sala — fonte única.
 *
 * Toda decisão de "quem pode fazer o quê com quem" passa por aqui, seja a
 * operação pedida por comando ou por qualquer outro meio. Nada vem do
 * cliente: papel, silêncio e identidade são lidos da identidade emitida
 * pelo servidor.
 */

import { ROLES } from "../protocol.js";

/** Permissões que um comando pode exigir. */
export const PERMISSIONS = Object.freeze({
    EVERYONE: "everyone",
    ADMIN: "admin",
});

/** @param {{role: string}} identity */
export const isAdmin = (identity) => identity.role === ROLES.ADMIN;

/**
 * A identidade tem a permissão?
 * @param {{role: string}} identity
 * @param {string} permission
 */
export const hasPermission = (identity, permission) =>
    permission === PERMISSIONS.EVERYONE || (permission === PERMISSIONS.ADMIN && isAdmin(identity));

/**
 * Está silenciada agora? Silêncio com prazo expira sozinho.
 * @param {{mutedUntil: number | null}} identity
 * @param {number} now
 */
export const isMuted = (identity, now) => identity.mutedUntil !== null && identity.mutedUntil > now;

/**
 * Pode moderar (silenciar, remover) o alvo? Hierarquia: só administrador
 * modera, ninguém modera a si mesmo, e administrador não modera outro
 * administrador.
 * @param {{id: string, role: string}} actor
 * @param {{id: string, role: string}} target
 * @returns {{ok: true} | {ok: false, reason: "forbidden" | "self" | "protected"}}
 */
export const canModerate = (actor, target) => {
    if (!isAdmin(actor)) return { ok: false, reason: "forbidden" };
    if (actor.id === target.id) return { ok: false, reason: "self" };
    if (isAdmin(target)) return { ok: false, reason: "protected" };
    return { ok: true };
};
