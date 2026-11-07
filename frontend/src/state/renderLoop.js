// @ts-check

/**
 * Agenda a renderização: no máximo uma por quadro de animação, sempre com o
 * estado mais recente, e informando o estado da renderização anterior para
 * que cada componente só seja redesenhado se a sua parte mudou.
 *
 * Por que (medido na Fase 3): cada evento recebido redesenhava a tela
 * inteira e forçava um layout completo. Com 150 pessoas e 2.000 mensagens
 * chegando, o navegador gastou 43 s só em layout. Mensagens que chegam no
 * mesmo quadro (~16 ms) agora custam um ciclo só.
 *
 * Sem DOM: o agendador é injetável (requestAnimationFrame no navegador,
 * função controlada nos testes).
 */

/**
 * @template S
 * @param {{
 *   getState: () => S,
 *   render: (state: S, previous: S | null) => void,
 *   schedule?: (callback: () => void) => unknown,
 * }} options
 */
export const createRenderLoop = ({ getState, render, schedule }) => {
    const defer =
        schedule ??
        (typeof requestAnimationFrame === "function"
            ? (callback) => requestAnimationFrame(() => callback())
            : (callback) => setTimeout(callback, 16));

    /** @type {S | null} */
    let previous = null;
    let pending = false;

    const flush = () => {
        pending = false;
        const state = getState();
        if (state === previous) return;
        const before = previous;
        previous = state;
        render(state, before);
    };

    return {
        /** Pede uma renderização; várias chamadas no mesmo quadro viram uma. */
        request() {
            if (pending) return;
            pending = true;
            defer(flush);
        },

        /**
         * Renderiza agora, sem esperar o quadro. Para quando o passo seguinte
         * depende do DOM atualizado (ex.: mover o foco para um campo que
         * acabou de aparecer).
         */
        flush,
    };
};

/**
 * Alguma das chaves mudou (por referência) entre dois estados?
 * Na primeira renderização (`previous` nulo), tudo conta como mudado.
 * @template {object} S
 * @param {S} state
 * @param {S | null} previous
 * @param {(keyof S)[]} keys
 */
export const changed = (state, previous, keys) =>
    previous === null || keys.some((key) => state[key] !== previous[key]);
