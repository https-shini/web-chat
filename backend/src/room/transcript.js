/**
 * O que foi dito numa conversa — sala ou conversa privada.
 *
 * Núcleo comum aos dois tipos de conversa: histórico limitado, versão do
 * histórico (muda a cada limpeza) e anti-duplicação por `clientMsgId`. Quem
 * decide QUEM pode publicar é a conversa (`room.js`, `direct.js`); aqui só
 * se registra o que foi publicado. Tudo em memória.
 */

import crypto from "node:crypto";
import { MESSAGE_KINDS, serverMessage } from "../protocol.js";

/** Mensagens recentes guardadas por identidade para ignorar reenvios. */
export const RECENT_MESSAGES_PER_IDENTITY = 20;

/**
 * @typedef {import("./sessions.js").Identity} Identity
 * @typedef {ReturnType<typeof serverMessage.chat>} ChatMessage
 */

/**
 * @param {{
 *   id: string,
 *   historySize: number,
 *   now?: () => Date,
 *   newMessageId?: () => string,
 * }} options
 */
export const createTranscript = ({
    id,
    historySize,
    now = () => new Date(),
    newMessageId = () => crypto.randomUUID(),
}) => {
    /** Mensagens no formato de envio, da mais antiga à mais nova. @type {ChatMessage[]} */
    const history = [];
    let version = 0;
    /** A chave inclui a conversa: o mesmo id de correlação em outra conversa é outra mensagem. */
    const prefix = `${id}:`;

    return {
        /**
         * Registra uma mensagem. Reenvio com o mesmo `clientMsgId` devolve a
         * original em `duplicate`, sem registrar de novo.
         * @param {Identity} identity
         * @param {{content: string, kind?: string, format?: string | null, clientMsgId?: string | null}} message
         * @returns {{message: ChatMessage, duplicate: boolean}}
         */
        append(
            identity,
            { content, kind = MESSAGE_KINDS.TEXT, format = null, clientMsgId = null },
        ) {
            const recentKey = clientMsgId ? prefix + clientMsgId : null;
            if (recentKey) {
                const original = /** @type {ChatMessage | undefined} */ (
                    identity.recent.get(recentKey)
                );
                if (original) return { message: original, duplicate: true };
            }
            const message = serverMessage.chat({
                id: newMessageId(),
                user: identity,
                content,
                timestamp: now().toISOString(),
                kind,
                format,
                clientMsgId,
            });
            history.push(message);
            if (history.length > historySize) history.shift();
            identity.messageCount += 1;
            if (recentKey) {
                identity.recent.set(recentKey, message);
                if (identity.recent.size > RECENT_MESSAGES_PER_IDENTITY) {
                    identity.recent.delete(identity.recent.keys().next().value);
                }
            }
            return { message, duplicate: false };
        },

        /** As `count` mais recentes. @param {number} count */
        recent: (count) => (count > 0 ? history.slice(-count) : []),

        /**
         * Apaga o histórico e muda a versão. A anti-duplicação desta conversa
         * também é esquecida por quem participa.
         * @param {Iterable<Identity>} participants
         * @returns {number} quantas mensagens foram apagadas
         */
        clear(participants) {
            const removed = history.length;
            history.length = 0;
            version += 1;
            for (const identity of participants) {
                for (const key of identity.recent.keys()) {
                    if (key.startsWith(prefix)) identity.recent.delete(key);
                }
            }
            return removed;
        },

        /** Fim da conversa: nada fica. @param {Iterable<Identity>} participants */
        discard(participants) {
            history.length = 0;
            for (const identity of participants) {
                for (const key of identity.recent.keys()) {
                    if (key.startsWith(prefix)) identity.recent.delete(key);
                }
            }
        },

        get version() {
            return version;
        },

        get length() {
            return history.length;
        },
    };
};
