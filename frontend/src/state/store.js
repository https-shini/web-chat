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
 * @property {string} [username]  sem o arroba, minúsculo; único na sala
 * @property {"online" | "away"} [status]
 * @property {string} [statusText]
 * @property {"member" | "admin" | "host"} [role]  papel NA SALA (admin é global)
 */

/**
 * Sala aberta agora (Fase 2 da evolução: a interface mostra uma sala por
 * vez; a navegação entre várias chega nas próximas fases).
 * @typedef {object} RoomInfo
 * @property {string} conversationId
 * @property {string} code      código de convite
 * @property {string} name
 * @property {"member" | "host"} role  seu papel nesta sala
 * @property {number} [memberCount]
 * @property {"room" | "dm"} [kind]
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
 * @property {string} [username]
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
 * @property {"entry" | "home" | "room"} screen
 * @property {boolean} joining  pediu para entrar e espera o servidor confirmar (na tela de entrada)
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
 * @property {RoomInfo | null} room
 * @property {ConversationSummary[]} conversations
 */

/**
 * Resumo de uma conversa que a identidade participa.
 * @typedef {RoomInfo & {unread: number, lastMessage: string | null, lastActivity: string | null}} ConversationSummary
 */

/** @typedef {(state: State) => void} Listener */

/** Quantas entradas escondidas por /clear são lembradas (para o histórico não trazê-las de volta). */
const HIDDEN_LIMIT = 2000;

/** @returns {State} */
const initialState = () => ({
    screen: "entry",
    joining: false,
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
    room: null,
    conversations: [],
});

export const createStore = () => {
    /** @type {State} */
    let state = initialState();

    /** Ids escondidos por /clear: o histórico do servidor não os traz de volta. */
    const hidden = new Set();

    /**
     * Transcrições e presença por conversa. Nada aqui é persistido: o
     * servidor é a fonte de verdade após login/reconexão.
     * @type {Map<string, {room: RoomInfo, messages: Message[], people: Person[], typing: Person[], historyVersion: number | null, unread: number, lastMessage: string | null, lastActivity: string | null}>}
     */
    const records = new Map();

    const summaries = () =>
        [...records.values()].map(({ room, unread, lastMessage, lastActivity }) => ({
            ...room,
            unread,
            lastMessage,
            lastActivity,
        }));

    /** @param {RoomInfo} room */
    const register = (room) => {
        const existing = records.get(room.conversationId);
        records.set(room.conversationId, existing
            ? { ...existing, room }
            : {
                room,
                messages: [],
                people: [],
                typing: [],
                historyVersion: null,
                unread: 0,
                lastMessage: null,
                lastActivity: null,
            });
    };

    /** @param {Message[]} messages */
    const latestChat = (messages) =>
        [...messages].reverse().find((message) => message.kind === "chat") ?? null;

    /**
     * @param {string} conversationId
     * @param {Message[]} incoming
     * @param {boolean} history
     */
    const updateConversationMessages = (conversationId, incoming, history) => {
        const record = records.get(conversationId);
        if (!record) return;
        const active = state.screen === "room" && state.room?.conversationId === conversationId;
        let messages = record.messages.slice();
        let freshUnread = 0;
        for (const item of incoming) {
            if (hidden.has(item.id)) continue;
            const optimisticIndex = item.clientMsgId
                ? messages.findIndex((known) => known.own && known.clientMsgId === item.clientMsgId)
                : -1;
            if (optimisticIndex >= 0) {
                messages[optimisticIndex] = { ...item, key: messages[optimisticIndex].key, delivery: "confirmed" };
                continue;
            }
            if (messages.some((known) => known.id === item.id)) continue;
            messages.push(item);
            if (!history && !active && item.kind === "chat" && !item.own) freshUnread += 1;
        }
        const last = latestChat(messages);
        records.set(conversationId, {
            ...record,
            messages,
            unread: record.unread + freshUnread,
            lastMessage: last?.content ?? record.lastMessage,
            lastActivity: last?.timestamp ?? record.lastActivity,
        });
        if (active) patch({ messages });
        else patch({});
    };


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
        const active = state.room && records.get(state.room.conversationId);
        if (active) {
            records.set(state.room.conversationId, {
                ...active,
                room: state.room,
                messages: state.messages,
                people: state.people,
                typing: state.typing,
                historyVersion: state.historyVersion,
            });
        }
        state = { ...state, conversations: summaries() };
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
                patch({ screen: "room", joining: false, me, closeCode: null });
            },

            /**
             * Pedido de entrada: a pessoa continua na tela de entrada, que
             * mostra o progresso, até o servidor aceitar (ver `completeJoin`).
             * Recusa (nome, username) volta ao formulário sem troca de tela.
             * @param {Person} me  identidade provisória (o id definitivo vem na sessão)
             */
            startJoin(me) {
                patch({ screen: "entry", joining: true, me, closeCode: null });
            },

            /**
             * A sala aberta (resumo do servidor). Trocar de sala descarta a
             * conversa da anterior.
             * @param {RoomInfo} room
             */
            setRoom(room) {
                register(room);
                const previous = state.room;
                if (previous?.conversationId === room.conversationId) {
                    patch({ room });
                    return;
                }
                const record = records.get(room.conversationId);
                if (!record) return;
                patch({
                    room,
                    messages: record.messages,
                    people: record.people,
                    typing: record.typing,
                    historyVersion: record.historyVersion,
                });
            },

            /** @param {RoomInfo} room */
            registerRoom(room) {
                register(room);
                if (state.room?.conversationId === room.conversationId) {
                    patch({ room });
                } else {
                    patch({});
                }
            },

            /** @param {string} conversationId */
            openConversation(conversationId) {
                const record = records.get(conversationId);
                if (!record) return false;
                this.setRoom(record.room);
                patch({ screen: "room" });
                // Visualizar marca a conversa como lida; participar continua
                // independente de qual conversa está selecionada.
                records.set(conversationId, { ...records.get(conversationId), unread: 0 });
                patch({});
                return true;
            },

            /** @param {string} conversationId */
            removeConversation(conversationId) {
                if (!records.delete(conversationId)) return;
                if (state.room?.conversationId === conversationId) {
                    patch({
                        screen: "home",
                        room: null,
                        messages: [],
                        people: [],
                        typing: [],
                        historyVersion: null,
                    });
                } else {
                    patch({});
                }
            },

            /** Resposta autoritativa do servidor a room_list. @param {RoomInfo[]} rooms */
            syncRooms(rooms) {
                const authorized = new Set(rooms.map((room) => room.conversationId));
                for (const id of records.keys()) {
                    if (!authorized.has(id)) records.delete(id);
                }
                for (const room of rooms) register(room);
                if (state.room && !authorized.has(state.room.conversationId)) {
                    patch({
                        screen: "home",
                        room: null,
                        messages: [],
                        people: [],
                        typing: [],
                        historyVersion: null,
                    });
                } else {
                    patch({});
                }
            },

            /** @param {string} conversationId @param {Message} message */
            addConversationMessage(conversationId, message) {
                updateConversationMessages(conversationId, [message], false);
            },

            /** @param {string} conversationId @param {Message[]} history */
            mergeConversationHistory(conversationId, history) {
                updateConversationMessages(conversationId, history, true);
            },

            /** @param {string} conversationId @param {Person[]} people */
            setConversationPeople(conversationId, people) {
                const record = records.get(conversationId);
                if (!record) return;
                records.set(conversationId, { ...record, people });
                if (state.room?.conversationId === conversationId) patch({ people });
                else patch({});
            },

            /** @param {string} conversationId @param {number} version */
            setConversationHistoryVersion(conversationId, version) {
                const record = records.get(conversationId);
                if (!record) return;
                const changed = record.historyVersion !== null && record.historyVersion !== version;
                records.set(conversationId, {
                    ...record,
                    historyVersion: version,
                    messages: changed ? [] : record.messages,
                    ...(changed ? { lastMessage: null, lastActivity: null, unread: 0 } : {}),
                });
                if (state.room?.conversationId === conversationId) {
                    patch({ historyVersion: version, ...(changed ? { messages: [] } : {}) });
                } else {
                    patch({});
                }
            },

            /** Uma identidade nova nunca herda conversas da anterior. */
            clearConversations() {
                records.clear();
                hidden.clear();
                patch({
                    screen: "home",
                    room: null,
                    messages: [],
                    people: [],
                    typing: [],
                    historyVersion: null,
                });
            },

            /**
             * A sala aberta deixou de valer (identidade nova depois de o
             * servidor reiniciar): conversa e lista dela são descartadas.
             */
            forgetRoom() {
                if (state.room === null) return;
                patch({ room: null, messages: [], people: [], typing: [], historyVersion: null });
            },

            /** Identidade aceita; a escolha da conversa acontece na Home. */
            completeLogin() {
                if (state.screen === "entry") patch({ screen: "home", joining: false });
            },

            /** Retorna à Home sem encerrar a identidade. */
            goHome() {
                patch({
                    screen: "home",
                    room: null,
                    messages: [],
                    people: [],
                    typing: [],
                    historyVersion: null,
                });
            },

            /** Uma sala foi escolhida e confirmada pelo servidor. */
            completeJoin() {
                patch({ screen: "room", joining: false });
            },

            /**
             * Identidade confirmada pelo servidor (evento `session`).
             * @param {Person} me
             * @param {"member" | "admin"} [role]
             */
            setIdentity(me, role = state.role) {
                if (
                    state.me?.id === me.id &&
                    state.me.name === me.name &&
                    state.me.username === me.username &&
                    state.role === role
                )
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
                records.clear();
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
                if (state.room && message.kind === "chat") {
                    const record = records.get(state.room.conversationId);
                    if (record) {
                        records.set(state.room.conversationId, {
                            ...record,
                            lastMessage: message.content,
                            lastActivity: message.timestamp,
                        });
                        patch({});
                    }
                }
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
