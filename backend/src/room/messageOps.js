/**
 * Operações sobre mensagens já publicadas, comuns a salas e conversas
 * privadas (decisões F1 a F5): responder, editar, apagar, reagir e fixar.
 *
 * O modelo de dados segue o do Fluxer (referência da mensagem respondida,
 * carimbo de edição, reações com contagem, mensagens fixadas), adaptado ao
 * produto: tudo em memória, some com a conversa, e ninguém é identificado
 * pelo id interno — a autoria é o `@username` mais o número de autor DESTA
 * conversa, que já é público nela.
 *
 * Regras puras: quem chama (sala ou privada) diz quem é a pessoa, se ela
 * modera e por onde os quadros saem.
 */

import { ERROR_CODES } from "../errors.js";
import { LIMITS, MESSAGE_KINDS, serverMessage } from "../protocol.js";
import { normalizeText, readClientId, readContent } from "../validation.js";

/**
 * Emojis de reação: lista fixa, sem texto livre (nada de conteúdo arbitrário
 * entrando por reação).
 */
export const REACTION_EMOJIS = Object.freeze([
    "👍",
    "❤️",
    "😂",
    "🎉",
    "😮",
    "😢",
    "🙏",
    "🔥",
    "👀",
    "✅",
    "❓",
    "💯",
]);

/** Emojis diferentes numa mesma mensagem. */
export const MAX_REACTIONS_PER_MESSAGE = 8;
/** Mensagens fixadas por conversa. */
export const MAX_PINS = 25;
/** Tamanho do trecho copiado na resposta e na lista de fixadas. */
export const EXCERPT_LENGTH = 100;

/**
 * Trecho de uma mensagem numa linha só.
 * @param {string} content
 */
export const excerptOf = (content) => {
    const line = normalizeText(content.replace(/\s+/g, " "), EXCERPT_LENGTH + 1);
    return line.length > EXCERPT_LENGTH ? `${line.slice(0, EXCERPT_LENGTH - 1)}…` : line;
};

/**
 * @typedef {{name: string, username: string, author: number}} Persona
 * @typedef {{ok: true} | {ok: false, code: string}} Result
 * @typedef {ReturnType<typeof import("./transcript.js").createTranscript>} Transcript
 * @typedef {{id: string, userName: string, username: string, author: number | null, excerpt: string, at: string, by: string}} Pin
 */

/**
 * @param {{
 *   transcript: Transcript,
 *   broadcast: (message: Record<string, unknown>) => void,
 *   notice: (text: string) => void,
 *   timestamp: () => string,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   conversationId: string,
 * }} deps
 */
export const createMessageOps = ({
    transcript,
    broadcast,
    notice,
    timestamp,
    log,
    conversationId,
}) => {
    /** @type {Pin[]} */
    const pins = [];

    /** A mensagem foi escrita por esta pessoa (mesmo @ E mesmo número)? */
    const isAuthor = (/** @type {any} */ message, /** @type {Persona} */ persona) =>
        message.payload.username === persona.username && message.payload.author === persona.author;

    /** @param {unknown} raw */
    const find = (raw) => {
        const id = readClientId(raw);
        return id ? transcript.find(id) : null;
    };

    const pinsUpdated = () => serverMessage.pinsUpdated(pins);

    /** Tira a mensagem das fixadas (apagada, ou desafixada). @param {string} id */
    const unpinQuietly = (id) => {
        const index = pins.findIndex((pin) => pin.id === id);
        if (index === -1) return false;
        pins.splice(index, 1);
        return true;
    };

    return {
        /**
         * Referência da mensagem respondida (F1): cópia de quem escreveu e de
         * um trecho, feita na hora — continua legível mesmo que a original
         * saia do histórico ou seja apagada. Id que não é desta conversa é
         * ignorado (a resposta vira uma mensagem comum).
         * @param {unknown} replyTo
         */
        reference(replyTo) {
            const message = /** @type {any} */ (find(replyTo));
            if (!message) return null;
            return {
                id: message.id,
                userName: message.payload.userName,
                username: message.payload.username,
                ...(typeof message.payload.author === "number"
                    ? { author: message.payload.author }
                    : {}),
                excerpt: excerptOf(message.payload.content),
            };
        },

        /**
         * Editar a própria mensagem (F2): só quem escreveu (mesma identidade
         * na conversa), só texto digitado, enquanto estiver no histórico.
         * @param {Persona} persona
         * @param {Record<string, unknown>} payload `{ id, content }`
         * @returns {Result}
         */
        edit(persona, payload) {
            const message = /** @type {any} */ (find(payload.id));
            if (!message) return { ok: false, code: ERROR_CODES.MESSAGE_NOT_FOUND };
            if (
                !isAuthor(message, persona) ||
                (message.payload.kind ?? MESSAGE_KINDS.TEXT) !== MESSAGE_KINDS.TEXT ||
                message.payload.format
            ) {
                return { ok: false, code: ERROR_CODES.NOT_ALLOWED };
            }
            const content = readContent(payload.content);
            if (!content.ok) return content;
            if (content.content === message.payload.content) return { ok: true };
            const editedAt = timestamp();
            message.payload.content = content.content;
            message.payload.editedAt = editedAt;
            const pin = pins.find((item) => item.id === message.id);
            if (pin) {
                pin.excerpt = excerptOf(content.content);
                broadcast(pinsUpdated());
            }
            broadcast(serverMessage.messageUpdated(message.id, content.content, editedAt));
            return { ok: true };
        },

        /**
         * Apagar (F3): quem escreveu, sempre; quem modera a sala, qualquer
         * mensagem dela. Some do histórico de todos.
         * @param {Persona} persona
         * @param {Record<string, unknown>} payload `{ id }`
         * @param {{moderator: boolean, actorId: string}} who
         * @returns {Result}
         */
        remove(persona, payload, { moderator, actorId }) {
            const message = /** @type {any} */ (find(payload.id));
            if (!message) return { ok: false, code: ERROR_CODES.MESSAGE_NOT_FOUND };
            const own = isAuthor(message, persona);
            if (!own && !moderator) return { ok: false, code: ERROR_CODES.NOT_ALLOWED };
            transcript.remove(message.id);
            const wasPinned = unpinQuietly(message.id);
            broadcast(serverMessage.messageDeleted(message.id, own ? "author" : "moderation"));
            if (wasPinned) broadcast(pinsUpdated());
            if (!own) {
                log("warn", "moderation_action", {
                    action: "delete_message",
                    conversation: conversationId,
                    actor: actorId,
                });
            }
            return { ok: true };
        },

        /**
         * Reagir (F4): liga ou desliga a sua reação com um dos emojis da
         * lista. Até `MAX_REACTIONS_PER_MESSAGE` emojis diferentes.
         * @param {Persona} persona
         * @param {Record<string, unknown>} payload `{ id, emoji }`
         * @returns {Result}
         */
        react(persona, payload) {
            const message = /** @type {any} */ (find(payload.id));
            if (!message) return { ok: false, code: ERROR_CODES.MESSAGE_NOT_FOUND };
            const emoji = typeof payload.emoji === "string" ? payload.emoji : "";
            if (!REACTION_EMOJIS.includes(emoji))
                return { ok: false, code: ERROR_CODES.INVALID_REACTION };
            const key = `${persona.username}#${persona.author}`;
            /** @type {{emoji: string, count: number, authors: string[]}[]} */
            const reactions = message.payload.reactions ?? [];
            const existing = reactions.find((item) => item.emoji === emoji);
            if (existing) {
                const at = existing.authors.indexOf(key);
                if (at === -1) existing.authors.push(key);
                else existing.authors.splice(at, 1);
                existing.count = existing.authors.length;
            } else {
                if (reactions.length >= MAX_REACTIONS_PER_MESSAGE) {
                    return { ok: false, code: ERROR_CODES.REACTION_LIMIT };
                }
                reactions.push({ emoji, count: 1, authors: [key] });
            }
            const kept = reactions.filter((item) => item.count > 0);
            if (kept.length) message.payload.reactions = kept;
            else delete message.payload.reactions;
            broadcast(serverMessage.messageReactions(message.id, kept));
            return { ok: true };
        },

        /**
         * Fixar ou desafixar (F5). Quem pode é decidido por quem chama.
         * @param {Persona} persona
         * @param {Record<string, unknown>} payload `{ id, pinned }`
         * @param {boolean} allowed
         * @returns {Result}
         */
        pin(persona, payload, allowed) {
            if (!allowed) return { ok: false, code: ERROR_CODES.NOT_ALLOWED };
            const message = /** @type {any} */ (find(payload.id));
            if (!message) return { ok: false, code: ERROR_CODES.MESSAGE_NOT_FOUND };
            const want = payload.pinned !== false;
            const already = pins.some((pin) => pin.id === message.id);
            if (want === already) return { ok: true };
            if (want) {
                if (pins.length >= MAX_PINS) return { ok: false, code: ERROR_CODES.PIN_LIMIT };
                pins.unshift({
                    id: message.id,
                    userName: message.payload.userName,
                    username: message.payload.username,
                    author:
                        typeof message.payload.author === "number" ? message.payload.author : null,
                    excerpt: excerptOf(message.payload.content),
                    at: timestamp(),
                    by: persona.username,
                });
                message.payload.pinned = true;
                notice(`${persona.name} fixou uma mensagem de ${message.payload.userName}.`);
            } else {
                unpinQuietly(message.id);
                delete message.payload.pinned;
                notice(`${persona.name} desafixou uma mensagem de ${message.payload.userName}.`);
            }
            broadcast(pinsUpdated());
            return { ok: true };
        },

        /** O quadro com as fixadas (para quem entra ou volta). */
        pinsUpdated,

        /** Quantas fixadas há (o estado só é enviado se houver). */
        get pinCount() {
            return pins.length;
        },

        /** O histórico foi apagado: as fixadas vão junto. */
        reset() {
            pins.length = 0;
        },
    };
};

/** Limite de texto da descrição de uma sala (F6). */
export const DESCRIPTION_MAX_LENGTH = LIMITS.roomDescriptionMaxLength;
