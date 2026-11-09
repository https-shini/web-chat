/**
 * Regras de autorização das salas — fonte única.
 *
 * Toda decisão de "quem pode fazer o quê com quem" passa por aqui, seja a
 * operação pedida por comando ou por qualquer outro meio. Nada vem do
 * cliente: papel, silêncio e identidade são lidos do que o servidor emitiu.
 *
 * Dois níveis de poder:
 *  - administrador (`identity.role === "admin"`): global, obtido com a chave
 *    do servidor; modera em qualquer sala de que participe;
 *  - anfitrião (`membership.role === "host"`): quem criou a sala, ou quem
 *    herdou o papel; modera só aquela sala.
 */

import { ROLES } from "../protocol.js";

/** Permissões que um comando pode exigir. */
export const PERMISSIONS = Object.freeze({
    EVERYONE: "everyone",
    /** Anfitrião da sala em que o comando roda, ou administrador. */
    MODERATOR: "moderator",
    /** Só administrador global. */
    ADMIN: "admin",
});

/**
 * @typedef {{role: string}} RoleHolder
 * @typedef {{role: string, mutedUntil: number | null} | null | undefined} Membership
 */

/** @param {RoleHolder} identity */
export const isAdmin = (identity) => identity.role === ROLES.ADMIN;

/** @param {Membership} membership */
export const isHost = (membership) => membership?.role === ROLES.HOST;

/**
 * Pode moderar a sala? Administrador sempre; anfitrião só a própria sala.
 * @param {RoleHolder} identity
 * @param {Membership} membership participação na sala em questão
 */
export const isModerator = (identity, membership) => isAdmin(identity) || isHost(membership);

/**
 * A identidade tem a permissão (na sala da `membership`, quando houver)?
 * @param {RoleHolder} identity
 * @param {string} permission
 * @param {Membership} [membership]
 */
export const hasPermission = (identity, permission, membership = null) => {
    if (permission === PERMISSIONS.EVERYONE) return true;
    if (permission === PERMISSIONS.MODERATOR) return isModerator(identity, membership);
    return permission === PERMISSIONS.ADMIN && isAdmin(identity);
};

/**
 * Está silenciada agora (na sala dessa participação)? Silêncio com prazo
 * expira sozinho.
 * @param {{mutedUntil: number | null}} membership
 * @param {number} now
 */
export const isMuted = (membership, now) =>
    membership.mutedUntil !== null && membership.mutedUntil > now;

/**
 * Pode moderar (silenciar, remover) o alvo NESTA sala? Hierarquia:
 *  - só quem modera a sala modera alguém nela;
 *  - ninguém modera a si mesmo;
 *  - administrador não é moderado por ninguém;
 *  - anfitrião só é moderado por administrador.
 * @param {{actor: {id: string, role: string}, actorMembership: Membership,
 *   target: {id: string, role: string}, targetMembership: Membership}} input
 * @returns {{ok: true} | {ok: false, reason: "forbidden" | "self" | "protected"}}
 */
export const canModerate = ({ actor, actorMembership, target, targetMembership }) => {
    if (!isModerator(actor, actorMembership)) return { ok: false, reason: "forbidden" };
    if (actor.id === target.id) return { ok: false, reason: "self" };
    if (isAdmin(target)) return { ok: false, reason: "protected" };
    if (isHost(targetMembership) && !isAdmin(actor)) return { ok: false, reason: "protected" };
    return { ok: true };
};
