// @ts-check

/**
 * Emissor do sinal "estou digitando".
 *
 * Antes, cada tecla gerava um `typing_start` — tráfego O(pessoas na sala)
 * por tecla, e (no servidor antigo) consumo do mesmo limite de taxa das
 * mensagens, o que fazia uma mensagem legítima ser descartada depois de uma
 * rajada de digitação (P02). Agora o início é reenviado no máximo uma vez
 * por `interval` enquanto houver digitação; o receptor mantém a pessoa como
 * "digitando" por 6 s a cada sinal (`state/typing.js`), então `interval`
 * precisa ficar abaixo disso.
 *
 * Os relógios são injetáveis para que o comportamento seja testado sem
 * esperar tempo real.
 */

/**
 * @typedef {object} TypingSignalOptions
 * @property {(type: "typing_start" | "typing_stop") => void} send
 * @property {number} interval   Intervalo mínimo entre dois `typing_start`, em ms.
 * @property {number} idle       Silêncio no teclado que encerra a digitação, em ms.
 * @property {() => number} [now]
 * @property {(callback: () => void, ms: number) => unknown} [schedule]
 * @property {(handle: unknown) => void} [cancel]
 */

/**
 * @param {TypingSignalOptions} options
 */
export const createTypingSignal = ({
    send,
    interval,
    idle,
    now = Date.now,
    schedule = (callback, ms) => setTimeout(callback, ms),
    cancel = (handle) => clearTimeout(/** @type {ReturnType<typeof setTimeout>} */ (handle)),
}) => {
    let active = false;
    let lastStart = 0;
    /** @type {unknown} */
    let idleTimer = null;

    const clearIdle = () => {
        if (idleTimer !== null) {
            cancel(idleTimer);
            idleTimer = null;
        }
    };

    return {
        /** Uma tecla (evento `input`) no campo de mensagem. */
        input() {
            const time = now();
            if (!active || time - lastStart >= interval) {
                send("typing_start");
                lastStart = time;
                active = true;
            }
            clearIdle();
            idleTimer = schedule(() => {
                idleTimer = null;
                active = false;
                send("typing_stop");
            }, idle);
        },

        /** Mensagem enviada: a digitação acabou agora. */
        stop() {
            clearIdle();
            if (!active) return;
            active = false;
            send("typing_stop");
        },
    };
};
