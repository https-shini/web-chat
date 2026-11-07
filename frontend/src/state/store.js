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
 * @property {"online" | "away"} [status]
 * @property {string} [statusText]
 * @property {"member" | "admin"} [role]
 */

/**
 * Entrada da transcrição. Três tipos:
 *  - `chat`: mensagem de alguém (com `variant` e `format` opcionais);
 *  - `system`: entrada/saída e avisos do servidor (`notice`);
 *  - `notice`: resposta de comando, visível só para você.
 *
 * `key` é estável durante a vida da entrada (é o que a lista usa para não
 * redesenhar). Para mensagens que você enviou, nasce do `clientMsgId` e não
 * muda quando o servidor confirma e atribui o `id` definitivo.
 *
 * @typedef {object} Message
 * @property {string} id
 * @property {string} key
 * @property {"chat" | "system" | "notice"} kind
 * @property {string} userId
 * @property {string} userName
 * @property {string} content
 * @property {string} timestamp
 * @property {boolean} own
 * @property {"text" | "action" | "roll" | "announcement"} [variant]
 * @property {"bold" | "italic" | "code" | "spoiler" | null} [format]
 * @property {string | null} [clientMsgId]
 * @property {"confirmed" | "pending" | "failed"} delivery
 * @property {number | null} [sentAt]   quando saiu pela rede (pendentes)
 * @property {string} [failReason]
 * @property {string} [tone]            notice/system: info, success, warning, error, result, admin
 * @property {string} [title]
 * @property {"join" | "leave"} [event]  system: entrada ou saída (só muda o ícone)
 * @property {string[]} [lines]
 */

/**
 * Metadados de um comando, como vieram do servidor (`command_catalog`).
 * @typedef {object} CommandInfo
 * @property {string} name
 * @property {string[]} aliases
 * @property {string} category
 * @property {string} categoryLabel
 * @property {string} description
 * @property {string} syntax
 * @property {string[]} examples
 * @property {string} permission
 * @property {"server" | "client"} scope
 * @property {boolean} allowed
 */

/**
 * @typedef {object} State
 * @property {"entry" | "room"} screen
 * @property {Person | null} me
 * @property {"member" | "admin"} role
 * @property {Message[]} messages
 * @property {Person[]} people
 * @property {Person[]} typing
 * @property {LinkState} link
 * @property {number} attempt   Tentativa de reconexão em curso.
 * @property {number} maxAttempts
 * @property {number} queued    Mensagens aguardando a conexão voltar.
 * @property {number | null} closeCode  Fechamento definitivo (ex.: 4003 removido).
 * @property {CommandInfo[]} catalog
 * @property {number | null} historyVersion
 */

/** @typedef {(state: State) => void} Listener */

/** Quantas entradas escondidas por /clear são lembradas (para o histórico não trazê-las de volta). */
const HIDDEN_LIMIT = 2000;

/** @returns {State} */
const initialState = () => ({
    screen: "entry",
    me: null,
    role: "member",
    messages: [],
    people: [],
    typing: [],
    link: "idle",
    attempt: 0,
    maxAttempts: 0,
    queued: 0,
    closeCode: null,
    catalog: [],
    historyVersion: null,
});

export const createStore = () => {
    /** @type {State} */
    let state = initialState();

    /** Ids escondidos por /clear: o histórico do servidor não os traz de volta. */
    const hidden = new Set();

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

    /**
     * Troca as mensagens que satisfazem `match` por `update(mensagem)`.
     * @param {(message: Message) => boolean} match
     * @param {(message: Message) => Message} update
     */
    const updateWhere = (match, update) => {
        let changed = false;
        const messages = state.messages.map((message) => {
            if (!match(message)) return message;
            changed = true;
            return update(message);
        });
        if (changed) patch({ messages });
        return changed;
    };

    /**
     * Mensagem do servidor que confirma uma enviada por você (mesmo
     * `clientMsgId`): mantém a posição e a `key`, assume o `id` e o horário
     * do servidor.
     * @param {Message} incoming
     */
    const confirm = (incoming) =>
        incoming.clientMsgId
            ? updateWhere(
                  (message) => message.clientMsgId === incoming.clientMsgId && message.own,
                  (message) => ({ ...incoming, key: message.key, delivery: "confirmed" }),
              )
            : false;

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
                patch({ screen: "room", me, closeCode: null });
            },

            /**
             * Identidade confirmada pelo servidor (evento `session`).
             * @param {Person} me
             * @param {"member" | "admin"} [role]
             */
            setIdentity(me, role = state.role) {
                if (state.me?.id === me.id && state.me.name === me.name && state.role === role)
                    return;
                patch({ me, role });
            },

            /**
             * Versão do histórico do servidor. Se mudou enquanto você estava
             * fora (a sala foi limpa), a conversa local é descartada.
             * @param {number} version
             * @returns {boolean} true se a conversa foi descartada
             */
            syncHistoryVersion(version) {
                const stale = state.historyVersion !== null && state.historyVersion !== version;
                if (!stale && state.historyVersion === version) return false;
                patch(
                    stale ? { historyVersion: version, messages: [] } : { historyVersion: version },
                );
                return stale;
            },

            /** Volta para a tela de entrada (o servidor recusou a entrada). */
            leaveRoom() {
                hidden.clear();
                patch({ ...initialState() });
            },

            /**
             * Acrescenta uma entrada. Id repetido é ignorado; mensagem que
             * confirma uma enviada por você atualiza a original.
             * @param {Message} message
             */
            addMessage(message) {
                if (hidden.has(message.id)) return;
                if (confirm(message)) return;
                if (state.messages.some((existing) => existing.id === message.id)) return;
                patch({ messages: [...state.messages, message] });
            },

            /**
             * Mescla o histórico enviado pelo servidor: entram, no fim e na
             * ordem do servidor, só as mensagens que não estão na tela (nem
             * foram escondidas por /clear); pendentes suas são confirmadas.
             * @param {Message[]} history
             */
            mergeHistory(history) {
                for (const message of history) confirm(message);
                const known = new Set(state.messages.map((message) => message.id));
                const fresh = history.filter((message) => {
                    if (known.has(message.id) || hidden.has(message.id)) return false;
                    known.add(message.id);
                    return true;
                });
                if (fresh.length === 0) return;
                patch({ messages: [...state.messages, ...fresh] });
            },

            /**
             * /clear: esconde a conversa só nesta tela. Nada muda no servidor
             * nem para outras pessoas.
             */
            clearLocal() {
                for (const message of state.messages) {
                    if (message.kind === "chat") hidden.add(message.id);
                }
                while (hidden.size > HIDDEN_LIMIT) hidden.delete(hidden.values().next().value);
                patch({ messages: [] });
            },

            /**
             * A sala foi limpa por um administrador (`chat_cleared`).
             * @param {number} version
             * @param {Message} notice aviso a exibir no lugar da conversa
             */
            roomCleared(version, notice) {
                patch({ historyVersion: version, messages: [notice] });
            },

            /**
             * @param {string} clientMsgId
             * @param {string} reason
             */
            failMessage(clientMsgId, reason) {
                return updateWhere(
                    (message) =>
                        message.clientMsgId === clientMsgId && message.delivery === "pending",
                    (message) => ({ ...message, delivery: "failed", failReason: reason }),
                );
            },

            /**
             * Reenvio: a mensagem volta a "enviando".
             * @param {string} clientMsgId
             * @param {number | null} sentAt
             */
            retryMessage(clientMsgId, sentAt) {
                return updateWhere(
                    (message) =>
                        message.clientMsgId === clientMsgId && message.delivery === "failed",
                    (message) => ({
                        ...message,
                        delivery: "pending",
                        sentAt,
                        failReason: undefined,
                    }),
                );
            },

            /**
             * Pendentes que esperavam a conexão agora saíram pela rede.
             * @param {number} time
             */
            markPendingSent(time) {
                updateWhere(
                    (message) => message.delivery === "pending" && !message.sentAt,
                    (message) => ({ ...message, sentAt: time }),
                );
            },

            /**
             * Pendentes sem confirmação há mais de `timeoutMs` viram falha.
             * @param {number} time
             * @param {number} timeoutMs
             * @param {string} reason
             * @returns {boolean}
             */
            expirePending(time, timeoutMs, reason) {
                return updateWhere(
                    (message) =>
                        message.delivery === "pending" &&
                        typeof message.sentAt === "number" &&
                        time - message.sentAt > timeoutMs,
                    (message) => ({ ...message, delivery: "failed", failReason: reason }),
                );
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
             * @param {CommandInfo[]} catalog
             */
            setCatalog(catalog) {
                patch({ catalog });
            },

            /**
             * @param {LinkState} link
             * @param {{attempt?: number, maxAttempts?: number, closeCode?: number}} [detail]
             */
            setLink(link, detail = {}) {
                patch({
                    link,
                    attempt: detail.attempt ?? state.attempt,
                    maxAttempts: detail.maxAttempts ?? state.maxAttempts,
                    closeCode: link === "offline" ? (detail.closeCode ?? null) : null,
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
