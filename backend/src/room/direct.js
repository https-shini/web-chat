/**
 * Conversas privadas (Fase 3 da evolução): duas identidades, ninguém mais.
 *
 * Mesmo núcleo de histórico das salas (`transcript.js`), regras próprias:
 *  - só as duas participantes leem, escrevem ou recebem qualquer coisa
 *    (mensagem, digitação, presença) — não há como entrar numa conversa
 *    privada; ela é aberta pelo hub entre duas identidades;
 *  - a conversa é ligada aos IDS INTERNOS das duas identidades, nunca ao @:
 *    uma identidade nova que reutilize o mesmo @ não acha nada;
 *  - quem abre recebe a conversa na hora; a outra pessoa só fica sabendo
 *    dela com a primeira mensagem — abrir conversas não vira spam de avisos;
 *  - acaba quando uma das duas a encerra, bloqueia a outra ou deixa de
 *    existir; o histórico vai junto. Uma queda dentro da janela de retomada
 *    não encerra nada.
 *
 * Tudo em memória: reiniciar o servidor apaga todas.
 */

import crypto from "node:crypto";
import { ERROR_CODES } from "../errors.js";
import { DM_CLOSED_REASONS, MESSAGE_KINDS, scoped, serverMessage } from "../protocol.js";
import { readClientId, readContent } from "../validation.js";
import { createTranscript } from "./transcript.js";

/** Limites padrão; configuráveis por variável de ambiente. */
export const DM_DEFAULTS = Object.freeze({
    /** Conversas privadas abertas por identidade ao mesmo tempo. */
    maxPerIdentity: 20,
    /** Conversas privadas no servidor inteiro. */
    maxTotal: 5000,
    /** Mensagens guardadas por conversa privada. */
    historySize: 100,
});

/** Id opaco da conversa privada (o prefixo diz o tipo). */
export const generateDmId = () => `d_${crypto.randomBytes(12).toString("base64url")}`;

/**
 * @typedef {import("./sessions.js").Identity} Identity
 * @typedef {ReturnType<typeof createDirectConversation>} DirectConversation
 */

/**
 * @param {{
 *   id: string,
 *   a: Identity,
 *   b: Identity,
 *   deliver: (holder: unknown, data: string) => void,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   historySize: number,
 *   historyOnJoin: number,
 *   now?: () => Date,
 *   newMessageId?: () => string,
 *   onPresenceChange?: (identity: Identity) => void,
 * }} options
 */
export const createDirectConversation = ({
    id,
    a,
    b,
    deliver,
    log,
    historySize,
    historyOnJoin,
    now = () => new Date(),
    newMessageId = () => crypto.randomUUID(),
    onPresenceChange = () => {},
}) => {
    const participants = [a, b];
    const transcript = createTranscript({ id, historySize, now, newMessageId });
    /** Quem já sabe que a conversa existe (e por isso recebe os eventos dela). */
    const announced = new Set();
    let closed = false;

    /** @param {Identity} identity */
    const has = (identity) => identity === a || identity === b;
    /** @param {Identity} identity */
    const peerOf = (identity) => (identity === a ? b : a);

    /** @param {Identity} identity @param {Record<string, unknown>} message */
    const sendTo = (identity, message) => {
        if (closed || identity.holder === null) return;
        deliver(identity.holder, JSON.stringify(message));
    };

    /**
     * Resumo do ponto de vista de quem recebe: a outra pessoa e a presença dela.
     * @param {Identity} identity
     * @returns {import("../protocol.js").DmSummary}
     */
    const summaryFor = (identity) => {
        const peer = peerOf(identity);
        return {
            conversationId: id,
            kind: "dm",
            peer: {
                name: peer.name,
                username: peer.username,
                online: peer.holder !== null,
            },
            historyVersion: transcript.version,
        };
    };

    /**
     * Resumo e histórico recente para uma das duas.
     * @param {Identity} identity
     * @param {{created?: boolean, resumed?: boolean}} how
     */
    const sendState = (identity, how) => {
        announced.add(identity);
        sendTo(identity, serverMessage.dmOpened(summaryFor(identity), how));
        const recent = transcript.recent(historyOnJoin);
        if (recent.length > 0) sendTo(identity, scoped(id, serverMessage.history(recent)));
    };

    /** A outra pessoa (se já sabe da conversa) recebe o resumo atualizado. @param {Identity} identity */
    const updatePeerOf = (identity) => {
        const peer = peerOf(identity);
        if (announced.has(peer)) sendTo(peer, serverMessage.dmUpdated(summaryFor(peer)));
    };

    /**
     * Publica. Único caminho de escrita no histórico desta conversa.
     * @param {Identity} identity
     * @param {{content: string, kind?: string, format?: string | null, clientMsgId?: string | null}} input
     * @returns {{ok: true, duplicate?: boolean} | {ok: false, code: string}}
     */
    const publish = (identity, input) => {
        if (closed || !has(identity))
            return { ok: false, code: ERROR_CODES.CONVERSATION_NOT_FOUND };
        const { message, duplicate } = transcript.append(identity, {
            kind: MESSAGE_KINDS.TEXT,
            ...input,
        });
        const scopedMessage = scoped(id, message);
        if (duplicate) {
            sendTo(identity, scopedMessage);
            return { ok: true, duplicate: true };
        }
        sendTo(identity, scopedMessage);
        const peer = peerOf(identity);
        // Primeira mensagem: a outra pessoa descobre a conversa agora, já
        // com esta mensagem no histórico.
        if (announced.has(peer)) sendTo(peer, scopedMessage);
        else sendState(peer, { created: true });

        if (identity.away !== null) {
            identity.away = null;
            onPresenceChange(identity);
        }
        return { ok: true };
    };

    return {
        id,
        kind: /** @type {const} */ ("dm"),
        has,
        peerOf,
        summaryFor,

        /** Quem abre (ou reabre) recebe o estado; a outra pessoa, não. */
        open: sendState,

        /**
         * Mensagem digitada. Autor é a identidade; `kind` e `format` do
         * payload são ignorados.
         * @param {Identity} identity
         * @param {Record<string, unknown>} payload
         */
        post(identity, payload) {
            if (closed || !has(identity))
                return { ok: false, code: ERROR_CODES.CONVERSATION_NOT_FOUND };
            const content = readContent(payload.content);
            if (!content.ok) return content;
            return publish(identity, {
                content: content.content,
                clientMsgId: readClientId(payload.clientMsgId),
            });
        },

        publish,

        /**
         * Digitação, só para a outra pessoa — e só se ela já sabe da conversa.
         * @param {Identity} identity
         * @param {boolean} isTyping
         */
        typing(identity, isTyping) {
            if (closed || !has(identity)) return;
            const peer = peerOf(identity);
            if (announced.has(peer)) {
                sendTo(peer, scoped(id, serverMessage.typing(identity, isTyping)));
            }
        },

        /** A identidade voltou: recebe a conversa de novo; a outra vê "online". @param {Identity} identity */
        reconnect(identity) {
            if (closed || !has(identity)) return;
            if (announced.has(identity)) sendState(identity, { resumed: true });
            updatePeerOf(identity);
        },

        /** A conexão caiu (janela de retomada): a outra pessoa vê "offline". @param {Identity} identity */
        disconnect(identity) {
            if (closed || !has(identity)) return;
            updatePeerOf(identity);
        },

        /** Nome mudou: a outra pessoa recebe o resumo novo. @param {Identity} identity */
        refreshPeerOf: updatePeerOf,

        /**
         * Fim da conversa, para as duas. Com `ended`, a identidade que deixou
         * de existir não é avisada (não há mais a quem avisar).
         * @param {{ended?: Identity | null, reason?: string}} [options]
         */
        close({
            ended = null,
            reason = ended ? DM_CLOSED_REASONS.ENDED : DM_CLOSED_REASONS.CLOSED,
        } = {}) {
            if (closed) return;
            for (const identity of participants) {
                if (identity !== ended && announced.has(identity)) {
                    sendTo(identity, serverMessage.dmClosed(id, reason));
                }
                identity.dms.delete(id);
            }
            closed = true;
            transcript.discard(participants);
            announced.clear();
            log("info", "dm_closed", { conversation: id, reason });
        },

        get closed() {
            return closed;
        },

        get historyLength() {
            return transcript.length;
        },
    };
};

/**
 * Diretório das conversas privadas: no máximo uma por par de identidades.
 *
 * @param {{
 *   makeConversation: (input: {id: string, a: Identity, b: Identity}) => DirectConversation,
 *   log: (level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>) => void,
 *   limits?: Partial<typeof DM_DEFAULTS>,
 *   newId?: () => string,
 * }} options
 */
export const createDirectDirectory = ({
    makeConversation,
    log,
    limits = {},
    newId = generateDmId,
}) => {
    const { maxPerIdentity, maxTotal } = { ...DM_DEFAULTS, ...limits };
    /** @type {Map<string, {conversation: DirectConversation, pair: string}>} */
    const byId = new Map();
    /** par de ids internos (ordenados) → id da conversa @type {Map<string, string>} */
    const byPair = new Map();

    /** @param {Identity} x @param {Identity} y */
    const pairKey = (x, y) => [x.id, y.id].sort().join("|");

    /** @param {DirectConversation} conversation @param {{ended?: Identity | null}} [options] */
    const close = (conversation, options = {}) => {
        conversation.close(options);
        const entry = byId.get(conversation.id);
        byId.delete(conversation.id);
        if (entry && byPair.get(entry.pair) === conversation.id) byPair.delete(entry.pair);
    };

    return {
        /**
         * A conversa entre as duas, existente ou nova.
         * @param {Identity} from quem abre
         * @param {Identity} to
         * @returns {{ok: true, conversation: DirectConversation, created: boolean} | {ok: false, code: string}}
         */
        open(from, to) {
            const pair = pairKey(from, to);
            const existing = byPair.get(pair);
            const entry = existing === undefined ? undefined : byId.get(existing);
            if (entry) return { ok: true, conversation: entry.conversation, created: false };
            if (from.dms.size >= maxPerIdentity) return { ok: false, code: ERROR_CODES.DM_LIMIT };
            // Do lado de quem recebe, "cheio" é igual a "indisponível": a
            // resposta não diz nada sobre a outra pessoa.
            if (to.dms.size >= maxPerIdentity)
                return { ok: false, code: ERROR_CODES.USER_UNAVAILABLE };
            if (byId.size >= maxTotal) return { ok: false, code: ERROR_CODES.DMS_FULL };

            let id = newId();
            while (byId.has(id)) id = newId();
            const conversation = makeConversation({ id, a: from, b: to });
            byId.set(id, { conversation, pair });
            byPair.set(pair, id);
            from.dms.add(id);
            to.dms.add(id);
            log("info", "dm_opened", { conversation: id, user: from.id, peer: to.id });
            return { ok: true, conversation, created: true };
        },

        /**
         * A conversa, se a identidade participa dela; senão null ("não existe"
         * e "não é sua" são a mesma resposta).
         * @param {Identity} identity
         * @param {string | null} conversationId
         */
        forIdentity(identity, conversationId) {
            if (conversationId === null || !identity.dms.has(conversationId)) return null;
            const conversation = byId.get(conversationId)?.conversation ?? null;
            return conversation && conversation.has(identity) ? conversation : null;
        },

        /** @param {Identity} x @param {Identity} y */
        between: (x, y) => {
            const id = byPair.get(pairKey(x, y));
            return id === undefined ? null : (byId.get(id)?.conversation ?? null);
        },

        /** Conversas da identidade, na ordem em que foram abertas. @param {Identity} identity */
        of(identity) {
            return [...identity.dms].flatMap((id) => {
                const conversation = byId.get(id)?.conversation;
                return conversation ? [conversation] : [];
            });
        },

        close,

        /**
         * A identidade acabou: todas as conversas dela acabam, e a outra
         * pessoa de cada uma é avisada.
         * @param {Identity} identity
         */
        dropIdentity(identity) {
            for (const conversation of this.of(identity)) close(conversation, { ended: identity });
            identity.dms.clear();
        },

        get size() {
            return byId.size;
        },

        /** Desligamento: nada fica. */
        closeAll() {
            for (const { conversation } of [...byId.values()]) close(conversation);
        },
    };
};
