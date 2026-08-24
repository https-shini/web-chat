// @ts-check

/**
 * Quem está digitando agora.
 *
 * Guarda um prazo de validade por pessoa: se o sinal de parada se perder —
 * aba fechada, rede caída, quadro descartado — a pessoa sai da lista sozinha
 * em vez de ficar "digitando" para sempre.
 *
 * @typedef {import("./store.js").Person} Person
 */

/** Tempo máximo que alguém fica marcado como digitando sem novo sinal. */
const STALE_AFTER = 6000;

/**
 * @param {(people: Person[]) => void} onChange
 */
export const createTypingTracker = (onChange) => {
    /** @type {Map<string, {name: string, expiresAt: number}>} */
    const active = new Map();

    /** @type {ReturnType<typeof setTimeout> | null} */
    let sweeper = null;

    const publish = () => {
        onChange([...active.entries()].map(([id, entry]) => ({ id, name: entry.name })));
    };

    const sweep = () => {
        const now = Date.now();
        let removed = false;
        for (const [id, entry] of active) {
            if (entry.expiresAt <= now) {
                active.delete(id);
                removed = true;
            }
        }
        if (removed) publish();
        if (active.size === 0 && sweeper !== null) {
            clearInterval(sweeper);
            sweeper = null;
        }
    };

    return {
        /**
         * @param {string} id
         * @param {string} name
         * @param {boolean} isTyping
         */
        set(id, name, isTyping) {
            if (!id) return;
            if (isTyping) {
                active.set(id, { name, expiresAt: Date.now() + STALE_AFTER });
                if (sweeper === null) sweeper = setInterval(sweep, 1000);
            } else if (!active.delete(id)) {
                return;
            }
            publish();
        },

        /**
         * Alguém saiu da sala: sai também da lista de digitando.
         * @param {string} id
         */
        remove(id) {
            if (active.delete(id)) publish();
        },

        clear() {
            if (active.size === 0) return;
            active.clear();
            publish();
        },
    };
};
