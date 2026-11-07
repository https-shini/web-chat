/**
 * Respostas padronizadas de comandos. Todo handler devolve um destes
 * objetos (ou `null`, quando o efeito já foi comunicado à sala e não há o
 * que dizer só a quem executou). O executor os envia como `command_result`.
 */

import { TONES } from "../protocol.js";

/**
 * @typedef {{tone: string, text: string, title?: string, lines?: string[],
 *   code?: string, data?: Record<string, unknown>}} CommandReply
 */

/** @param {string} tone */
const make =
    (tone) =>
    /**
     * @param {string} text
     * @param {{title?: string, lines?: string[], code?: string, data?: Record<string, unknown>}} [extra]
     * @returns {CommandReply}
     */
    (text, extra = {}) => ({ tone, text, ...extra });

export const reply = Object.freeze({
    info: make(TONES.INFO),
    success: make(TONES.SUCCESS),
    warning: make(TONES.WARNING),
    result: make(TONES.RESULT),
    admin: make(TONES.ADMIN),
    /**
     * @param {string} code estável, para máquinas (ver docs/CHAT_COMMANDS.md)
     * @param {string} text exibível
     * @param {{lines?: string[], data?: Record<string, unknown>}} [extra]
     * @returns {CommandReply}
     */
    error: (code, text, extra = {}) => ({ tone: TONES.ERROR, text, code, ...extra }),
});

/** Códigos de erro de comandos (vão em `command_result.payload.code`). */
export const COMMAND_ERRORS = Object.freeze({
    UNKNOWN_COMMAND: "unknown_command",
    INVALID_ARGUMENTS: "invalid_arguments",
    FORBIDDEN: "forbidden",
    NOT_FOUND: "not_found",
    AMBIGUOUS_TARGET: "ambiguous_target",
    CANNOT_MODERATE: "cannot_moderate",
    COOLDOWN: "cooldown",
    MUTED: "muted",
    CONFIRMATION_REQUIRED: "confirmation_required",
    ADMIN_DISABLED: "admin_disabled",
    ADMIN_LOCKED: "admin_locked",
    ADMIN_WRONG_KEY: "admin_wrong_key",
    CLIENT_COMMAND: "client_command",
    INVALID_COMMAND: "invalid_command",
});
