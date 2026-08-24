// @ts-check

/**
 * Região live única do projeto, com fila e deduplicação.
 *
 * Por que fila: dois `textContent` no mesmo tick viram um anúncio só — o
 * leitor de tela lê o valor final. A fila espaça as falas.
 *
 * Por que deduplicação: seis tentativas de reconexão não podem virar seis
 * anúncios. Só a *mudança* de estado é dita.
 *
 * O que este módulo NÃO anuncia: mensagens de chat. A lista é `role="log"`
 * com `aria-live="polite"`, e é ela quem anuncia a mensagem nova — uma vez.
 * Se os dois falassem, cada mensagem seria lida duas vezes.
 */

/** Espaçamento entre falas consecutivas, em ms. */
const GAP = 150;

export const createAnnouncer = () => {
    const region = document.querySelector("[data-announcer]");
    if (!(region instanceof HTMLElement)) {
        throw new Error("Elemento ausente no HTML: [data-announcer]");
    }

    /** @type {string[]} */
    const queue = [];
    let lastSpoken = "";
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;

    const pump = () => {
        const next = queue.shift();
        if (next === undefined) {
            timer = null;
            return;
        }
        // Limpar antes de escrever garante que um texto repetido, quando
        // pedido de propósito, ainda seja percebido como mudança.
        region.textContent = "";
        region.textContent = next;
        timer = setTimeout(pump, GAP);
    };

    return {
        /**
         * @param {string} text
         * @param {{force?: boolean}} [options] `force` ignora a deduplicação.
         */
        say(text, options = {}) {
            const message = text.trim();
            if (!message) return;
            if (!options.force && message === lastSpoken) return;
            lastSpoken = message;
            queue.push(message);
            if (timer === null) pump();
        },
    };
};

/** @typedef {ReturnType<typeof createAnnouncer>} Announcer */
