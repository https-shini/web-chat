// @ts-check

import { RECONNECT } from "../config.js";

/**
 * Camada de transporte. Conecta, reconecta com backoff exponencial com teto
 * e jitter, enfileira envios enquanto o canal está fora do ar e decodifica o
 * payload em eventos de domínio.
 *
 * Este módulo não toca no DOM. Nenhum seletor, nenhum elemento, nenhum
 * `document` — é o que permite testar o backoff sem navegador e o que
 * impede que a interface passe a depender do formato do canal.
 */

/**
 * Estado do canal reportado para fora.
 * @typedef {"connecting" | "online" | "retrying" | "offline"} LinkStatus
 */

/**
 * Evento de domínio já decodificado.
 * @typedef {object} DomainEvent
 * @property {string} type
 * @property {unknown} payload
 */

/**
 * @typedef {object} TransportOptions
 * @property {string} url
 * @property {(status: LinkStatus, detail: {attempt: number, maxAttempts: number}) => void} onStatus
 * @property {(event: DomainEvent) => void} onEvent
 * @property {() => void} onOpen   Chamado antes de esvaziar a fila.
 * @property {(queued: number) => void} onQueueChange
 */

/** Teto de mensagens em espera: acima disso as mais antigas caem. */
const MAX_QUEUE = 50;

/**
 * @param {TransportOptions} options
 */
export const createTransport = ({ url, onStatus, onEvent, onOpen, onQueueChange }) => {
    /** @type {WebSocket | null} */
    let socket = null;

    /** @type {ReturnType<typeof setTimeout> | null} */
    let retryTimer = null;

    /** @type {string[]} */
    let queue = [];

    let attempt = 0;
    let closedByUs = false;

    const publishQueue = () => onQueueChange(queue.length);

    const cancelRetry = () => {
        if (retryTimer !== null) {
            clearTimeout(retryTimer);
            retryTimer = null;
        }
    };

    /**
     * Backoff exponencial com teto e jitter. O jitter existe para que muitos
     * clientes derrubados ao mesmo tempo não voltem todos no mesmo instante.
     * @param {number} nth
     * @returns {number} atraso em ms
     */
    const delayFor = (nth) => {
        const growth = RECONNECT.baseDelay * 2 ** (nth - 1);
        const capped = Math.min(growth, RECONNECT.maxDelay);
        const spread = capped * RECONNECT.jitter;
        return Math.round(capped - spread + Math.random() * spread * 2);
    };

    const flush = () => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const pending = queue;
        queue = [];
        for (const frame of pending) socket.send(frame);
        publishQueue();
    };

    /**
     * @param {MessageEvent} event
     */
    const handleMessage = (event) => {
        try {
            const decoded = JSON.parse(String(event.data));
            if (decoded && typeof decoded.type === "string") {
                onEvent({ type: decoded.type, payload: decoded.payload });
            }
        } catch {
            // Quadro ilegível: descartar é melhor do que derrubar a sessão.
        }
    };

    const scheduleRetry = () => {
        if (attempt >= RECONNECT.maxAttempts) {
            onStatus("offline", { attempt, maxAttempts: RECONNECT.maxAttempts });
            return;
        }
        attempt += 1;
        onStatus("retrying", { attempt, maxAttempts: RECONNECT.maxAttempts });
        cancelRetry();
        retryTimer = setTimeout(open, delayFor(attempt));
    };

    function open() {
        cancelRetry();
        closedByUs = false;
        onStatus(attempt === 0 ? "connecting" : "retrying", {
            attempt,
            maxAttempts: RECONNECT.maxAttempts,
        });

        try {
            socket = new WebSocket(url);
        } catch {
            scheduleRetry();
            return;
        }

        socket.addEventListener("open", () => {
            attempt = 0;
            onStatus("online", { attempt, maxAttempts: RECONNECT.maxAttempts });
            onOpen();
            flush();
        });

        socket.addEventListener("message", handleMessage);

        socket.addEventListener("close", () => {
            socket = null;
            if (closedByUs) return;
            scheduleRetry();
        });

        // `error` sempre é seguido de `close`; reagir aqui duplicaria a
        // tentativa de reconexão.
        socket.addEventListener("error", () => {});
    }

    return {
        open,

        /**
         * Envia um quadro. Fora do ar, enfileira em vez de descartar em
         * silêncio — a interface informa que a mensagem está na fila.
         * @param {string} type
         * @param {Record<string, unknown>} [payload]
         */
        send(type, payload = {}) {
            const frame = JSON.stringify({ type, payload });
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(frame);
                return;
            }
            queue.push(frame);
            if (queue.length > MAX_QUEUE) queue.shift();
            publishQueue();
        },

        /**
         * Envia sem enfileirar: para sinais efêmeros como "está digitando",
         * que não fazem sentido entregues minutos depois.
         * @param {string} type
         * @param {Record<string, unknown>} [payload]
         */
        signal(type, payload = {}) {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type, payload }));
            }
        },

        /** Caminho manual de volta quando o teto de tentativas estoura. */
        retryNow() {
            attempt = 0;
            open();
        },

        close() {
            closedByUs = true;
            cancelRetry();
            socket?.close();
            socket = null;
        },
    };
};

/** @typedef {ReturnType<typeof createTransport>} Transport */
