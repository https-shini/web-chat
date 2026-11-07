/**
 * Verificação da chave de administrador (`ADMIN_KEY`).
 *
 * A sala é anônima: o único modelo de administração confiável é o operador
 * do servidor definir uma chave secreta e entregá-la a quem vai moderar.
 * Garantias:
 *  - sem `ADMIN_KEY` configurada, a administração fica desativada — não há
 *    controle administrativo fingido;
 *  - comparação em tempo constante (hashes SHA-256 + timingSafeEqual);
 *  - após `MAX_FAILURES` erros, a identidade fica bloqueada por
 *    `LOCKOUT_MS`; e, contra tentativa distribuída, mais de
 *    `GLOBAL_MAX_FAILURES` erros por minuto bloqueiam todas as tentativas
 *    por um minuto;
 *  - a chave nunca é registrada em log nem devolvida ao cliente.
 */

import crypto from "node:crypto";

export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 10 * 60 * 1000;
export const GLOBAL_MAX_FAILURES = 20;
const GLOBAL_WINDOW_MS = 60 * 1000;

const digest = (value) => crypto.createHash("sha256").update(value, "utf8").digest();

/**
 * @param {{adminKey: string | null, now?: () => number}} options
 */
export const createAdminAuth = ({ adminKey, now = Date.now }) => {
    const expected = adminKey ? digest(adminKey) : null;
    /** @type {WeakMap<object, {failures: number, lockedUntil: number}>} */
    const perIdentity = new WeakMap();
    let globalFailures = [];

    return {
        enabled: expected !== null,

        /**
         * @param {object} identity
         * @param {string} candidate
         * @returns {{ok: true} | {ok: false, reason: "disabled" | "locked" | "wrong", retryInMs?: number}}
         */
        attempt(identity, candidate) {
            if (expected === null) return { ok: false, reason: "disabled" };
            const time = now();
            globalFailures = globalFailures.filter((at) => time - at < GLOBAL_WINDOW_MS);
            const state = perIdentity.get(identity) ?? { failures: 0, lockedUntil: 0 };
            if (state.lockedUntil > time) {
                return { ok: false, reason: "locked", retryInMs: state.lockedUntil - time };
            }
            if (globalFailures.length >= GLOBAL_MAX_FAILURES) {
                return {
                    ok: false,
                    reason: "locked",
                    retryInMs: GLOBAL_WINDOW_MS - (time - globalFailures[0]),
                };
            }

            if (crypto.timingSafeEqual(digest(candidate), expected)) {
                perIdentity.delete(identity);
                return { ok: true };
            }

            globalFailures.push(time);
            state.failures += 1;
            if (state.failures >= MAX_FAILURES) {
                state.failures = 0;
                state.lockedUntil = time + LOCKOUT_MS;
            }
            perIdentity.set(identity, state);
            return { ok: false, reason: "wrong" };
        },
    };
};
