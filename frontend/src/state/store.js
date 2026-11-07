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
             * Identidade confirmada pelo servidor (evento `session`). O id
             * local provisório gerado na entrada é substituído pelo id que o
             * servidor atribuiu à conexão.
             * @param {Person} me
             */
            setIdentity(me) {
                if (state.me?.id === me.id && state.me.name === me.name) return;
                patch({ me });
            },

            /**
             * Volta para a tela de entrada (o servidor recusou a entrada).
             */
            leaveRoom() {
                patch({ ...initialState() });
            },

            /**
             * Acrescenta uma mensagem. Um id já presente é ignorado: a mesma
             * mensagem nunca aparece duas vezes.
             * @param {Message} message
             */
            addMessage(message) {
                if (state.messages.some((existing) => existing.id === message.id)) return;
                patch({ messages: [...state.messages, message] });
            },

            /**
             * Mescla o histórico enviado pelo servidor (`message_history`)
             * com o que já está na tela. Antes, o histórico substituía tudo:
             * na reconexão a lista inteira era redesenhada e os avisos de
             * entrada/saída sumiam (P09). Agora só entram, no fim e na ordem
             * do servidor, as mensagens que ainda não estão na tela.
             * @param {Message[]} history
             */
            mergeHistory(history) {
                const known = new Set(state.messages.map((message) => message.id));
                const fresh = history.filter((message) => {
                    if (known.has(message.id)) return false;
                    known.add(message.id);
                    return true;
                });
                if (fresh.length === 0) return;
                patch({ messages: [...state.messages, ...fresh] });
            },

            /**
             * Substitui o histórico inteiro.
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
