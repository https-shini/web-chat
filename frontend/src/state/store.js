// @ts-check

/**
 * Estado observável da aplicação. Não conhece transporte nem DOM: recebe
 * fatos já traduzidos e avisa quem estiver ouvindo.
 */

/**
 * Estado do enlace com o servidor, do ponto de vista da interface.
 * @typedef {"idle" | "connecting" | "online" | "retrying" | "offline"} LinkState
 */

/**
 * @typedef {object} Person
 * @property {string} id
 * @property {string} name
 */

/**
 * @typedef {object} Message
 * @property {string} id
 * @property {"chat" | "system"} kind
 * @property {string} userId
 * @property {string} userName
 * @property {string} content
 * @property {string} timestamp
 * @property {boolean} own
 * @property {boolean} pending  Enviada pelo usuário, ainda não confirmada.
 */

/**
 * @typedef {object} State
 * @property {"entry" | "room"} screen
 * @property {Person | null} me
 * @property {Message[]} messages
 * @property {Person[]} people
 * @property {Person[]} typing
 * @property {LinkState} link
 * @property {number} attempt   Tentativa de reconexão em curso.
 * @property {number} maxAttempts
 * @property {number} queued    Mensagens aguardando a conexão voltar.
 */

/** @typedef {(state: State) => void} Listener */

/** @returns {State} */
const initialState = () => ({
    screen: "entry",
    me: null,
    messages: [],
    people: [],
    typing: [],
    link: "idle",
    attempt: 0,
    maxAttempts: 0,
    queued: 0,
});

export const createStore = () => {
    /** @type {State} */
    let state = initialState();

    /** @type {Set<Listener>} */
    const listeners = new Set();

    const notify = () => {
        for (const listener of listeners) listener(state);
    };

    /**
     * @param {Partial<State>} partial
     */
    const patch = (partial) => {
        state = { ...state, ...partial };
        notify();
    };

    return {
        /** @returns {State} */
        getState: () => state,

        /**
         * @param {Listener} listener
         * @returns {() => void} cancela a inscrição
         */
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },

        actions: {
            /**
             * @param {Person} me
             */
            enterRoom(me) {
                patch({ screen: "room", me });
            },

            /**
             * @param {Message} message
             */
            addMessage(message) {
                patch({ messages: [...state.messages, message] });
            },

            /**
             * Substitui o histórico inteiro (chegada de `message_history`).
             * @param {Message[]} messages
             */
            replaceMessages(messages) {
                patch({ messages });
            },

            /**
             * @param {Person[]} people
             */
            setPeople(people) {
                patch({ people });
            },

            /**
             * @param {Person[]} typing
             */
            setTyping(typing) {
                patch({ typing });
            },

            /**
             * @param {LinkState} link
             * @param {{attempt?: number, maxAttempts?: number}} [detail]
             */
            setLink(link, detail = {}) {
                patch({
                    link,
                    attempt: detail.attempt ?? state.attempt,
                    maxAttempts: detail.maxAttempts ?? state.maxAttempts,
                });
            },

            /**
             * @param {number} queued
             */
            setQueued(queued) {
                patch({ queued });
            },
        },
    };
};

/** @typedef {ReturnType<typeof createStore>} Store */
