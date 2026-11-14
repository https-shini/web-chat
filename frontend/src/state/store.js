// @ts-check

import { initialNav, reconcile } from "./navigation.js";

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
 * @property {string} id  chave da pessoa na interface: o próprio username (o id interno do servidor nunca chega ao navegador)
 * @property {string} name
 * @property {string} [username]  sem o arroba, minúsculo; único entre quem está conectado
 * @property {"online" | "away"} [status]
 * @property {string} [statusText]
 * @property {"member" | "admin" | "host"} [role]  papel NA SALA (admin é global)
 * @property {number | null} [author]  número de autor NESTA conversa (dado pelo servidor)
 */

/**
 * Chave de quem escreveu, dentro de uma conversa: o @ mais o número de autor.
 * Distingue duas pessoas que usaram o mesmo @ em momentos diferentes, sem
 * nada do id interno.
 * @param {string | undefined} username
 * @param {number | null | undefined} author
 * @returns {string | null}
 */
export const authorKey = (username, author) =>
    username && typeof author === "number" ? `${username}#${author}` : null;

/**
 * A outra pessoa de uma conversa privada.
 * @typedef {object} Peer
 * @property {string} name
 * @property {string} username
 * @property {boolean} online
 * @property {number | null} author  número de autor dela na conversa
 */

/**
 * Resumo de uma conversa (sala ou privada), como o servidor descreve.
 * `room` no estado é a conversa ABERTA agora; `conversations` são todas as
 * de que você participa, na ordem em que apareceram.
 * @typedef {object} RoomInfo
 * @property {string} conversationId
 * @property {"room" | "dm"} [kind]  ausente = sala
 * @property {string} [code]   código de convite (só salas)
 * @property {string} name     nome da sala, ou o nome da outra pessoa (privada)
 * @property {"member" | "host"} role  seu papel nesta sala
 * @property {number | null} [author]  seu número de autor nesta conversa (dado pelo servidor)
 * @property {Peer} [peer]     a outra pessoa (só conversas privadas)
 * @property {string} [description]  descrição da sala (definida por quem modera)
 */

/**
 * Conversa na lista lateral: o resumo mais as mensagens não lidas.
 * @typedef {RoomInfo & {unread: number}} ConversationEntry
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
 * @property {number} [author]  número de autor na conversa (dado pelo servidor)
 * @property {string} content
 * @property {string} timestamp
 * @property {boolean} own
 * @property {"text" | "action" | "roll" | "announcement"} [variant]
 * @property {"bold" | "italic" | "code" | "spoiler" | null} [format]
 * @property {string | null} [clientMsgId]
 * @property {"confirmed" | "pending" | "failed"} delivery
 * @property {number | null} [sentAt]   quando saiu pela rede (pendentes)
 * @property {number} [attempt]  tentativa de envio em curso (1 = primeira; 2+ = reenvio)
 * @property {string} [failReason]
 * @property {string} [tone]            notice/system: info, success, warning, error, result, admin
 * @property {string} [title]
 * @property {"join" | "leave"} [event]  system: entrada ou saída (só muda o ícone)
 * @property {string[]} [lines]
 * @property {{id: string, userName: string, username: string, author: number | null, excerpt: string}} [reference]  a mensagem respondida (cópia)
 * @property {string} [editedAt]  editada por quem escreveu
 * @property {{emoji: string, count: number, authors: string[]}[]} [reactions]
 */

/**
 * Mensagem fixada (cópia de trecho e autoria, feita pelo servidor).
 * @typedef {{id: string, userName: string, username: string, author: number | null, excerpt: string, at: string, by: string}} Pin
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
 * @property {"entry" | "home" | "room"} screen  entrada, início (sem conversa aberta) ou conversa
 * @property {"home" | "commands" | "profile"} page  com `screen: "home"`, qual página ocupa o centro
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
 * @property {string[]} authorsSeen  quem esteve na conversa enquanto você estava (chaves de autor)
 * @property {string[]} authorsLeft  quem saiu da conversa (chaves de autor)
 * @property {boolean} pageVisible  a aba está à vista (mensagem na conversa aberta com a aba escondida conta como não lida)
 * @property {RoomInfo | null} room  a conversa aberta agora
 * @property {ConversationEntry[]} conversations  todas as conversas desta participação
 * @property {import("./navigation.js").NavPrefs} nav  organização da lista (fixadas, ordem, seções) — só em memória
 * @property {Pin[]} pins  mensagens fixadas da conversa aberta
 */

/** @typedef {(state: State) => void} Listener */

/**
 * Quantas mensagens cada conversa guarda no navegador. Uma sessão longa
 * acumularia mensagens sem fim (memória e nós no DOM); acima disso, saem as
 * mais antigas. O servidor manda só as últimas 50 a quem entra, então isto
 * é bem mais do que o histórico compartilhado.
 */
export const MAX_MESSAGES_PER_CONVERSATION = 500;

/** As mais recentes, no limite. @param {Message[]} list */
const bounded = (list) =>
    list.length > MAX_MESSAGES_PER_CONVERSATION
        ? list.slice(list.length - MAX_MESSAGES_PER_CONVERSATION)
        : list;

/** Quantas entradas escondidas por /clear são lembradas (para o histórico não trazê-las de volta). */
const HIDDEN_LIMIT = 2000;

/** @returns {State} */
const initialState = () => ({
    screen: "entry",
    page: "home",
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
    authorsSeen: [],
    authorsLeft: [],
    pageVisible: true,
    room: null,
    conversations: [],
    nav: initialNav(),
    pins: [],
});

/**
 * O que é de UMA conversa e precisa sobreviver enquanto outra está aberta.
 * @typedef {{messages: Message[], people: Person[], historyVersion: number | null, authorsSeen: string[], authorsLeft: string[], pins: Pin[]}} View
 */

/**
 * O resumo da conversa, sem a contagem de não lidas (que é da lista).
 * @param {ConversationEntry} entry
 * @returns {RoomInfo}
 */
const summaryOf = (entry) => {
    const room = { ...entry };
    delete (/** @type {Partial<ConversationEntry>} */ (room).unread);
    return room;
};

/** @returns {View} */
const emptyView = () => ({
    messages: [],
    people: [],
    historyVersion: null,
    authorsSeen: [],
    authorsLeft: [],
    pins: [],
});

/** Os campos da vista que vivem no estado quando a conversa está aberta. */
const CLEAR_VIEW = Object.freeze({
    messages: [],
    people: [],
    typing: [],
    historyVersion: null,
    authorsSeen: [],
    authorsLeft: [],
    pins: [],
});

/** Mesma conversa, mesmos dados visíveis? @param {RoomInfo} a @param {RoomInfo} b */
const sameSummary = (a, b) =>
    a.conversationId === b.conversationId &&
    (a.kind ?? "room") === (b.kind ?? "room") &&
    a.code === b.code &&
    a.name === b.name &&
    a.role === b.role &&
    (a.description ?? "") === (b.description ?? "") &&
    (a.author ?? null) === (b.author ?? null) &&
    JSON.stringify(a.peer ?? null) === JSON.stringify(b.peer ?? null);

export const createStore = () => {
    /** @type {State} */
    let state = initialState();

    /** Ids escondidos por /clear: o histórico do servidor não os traz de volta. */
    const hidden = new Set();

    /**
     * Conversas que não estão abertas: as mensagens, a lista de pessoas e a
     * versão do histórico ficam aqui até a pessoa voltar a elas. A aberta
     * vive direto no estado (`messages`, `people`, `historyVersion`).
     * @type {Map<string, View>}
     */
    const buffers = new Map();

    /** @param {string | null | undefined} id */
    const isActive = (id) => !id || id === state.room?.conversationId;

    /** @type {Set<Listener>} */
    const listeners = new Set();

    const notify = () => {
        for (const listener of listeners) listener(state);
    };

    /**
     * @param {Partial<State>} partial
     */
    const patch = (partial) => {
        const next = { ...state, ...partial };
        // A organização da lista acompanha as conversas: nova entra no topo,
        // a que acabou sai das fixadas e da ordem.
        if (partial.conversations && partial.conversations !== state.conversations) {
            next.nav = reconcile(next.nav, next.conversations);
        }
        state = next;
        notify();
    };

    /**
     * Troca as mensagens que satisfazem `match` por `update(mensagem)`, na
     * conversa aberta e nas guardadas (uma mensagem sua pode ser confirmada
     * ou falhar depois que você trocou de conversa).
     * @param {(message: Message) => boolean} match
     * @param {(message: Message) => Message} update
     * @param {string | null} [only] limita a uma conversa
     */
    const updateWhere = (match, update, only = null) => {
        let changed = false;
        /** @param {Message[]} list */
        const apply = (list) => {
            let touched = false;
            const next = list.map((message) => {
                if (!match(message)) return message;
                touched = true;
                return update(message);
            });
            if (touched) changed = true;
            return touched ? next : list;
        };
        for (const [id, view] of buffers) {
            if (only && id !== only) continue;
            const messages = apply(view.messages);
            if (messages !== view.messages) buffers.set(id, { ...view, messages });
        }
        const messages = !only || isActive(only) ? apply(state.messages) : state.messages;
        if (messages !== state.messages) patch({ messages });
        else if (changed) notify();
        return changed;
    };

    /**
     * Conversa guardada (não aberta) que existe na lista.
     * @param {string} id
     */
    const bufferOf = (id) => {
        if (!state.conversations.some((entry) => entry.conversationId === id)) return null;
        let view = buffers.get(id);
        if (!view) {
            view = emptyView();
            buffers.set(id, view);
        }
        return view;
    };

    /** @param {string} id @param {number} delta */
    const bumpUnread = (id, delta) => {
        patch({
            conversations: state.conversations.map((entry) =>
                entry.conversationId === id
                    ? { ...entry, unread: delta === 0 ? 0 : entry.unread + delta }
                    : entry,
            ),
        });
    };

    /** Guarda a conversa aberta e esvazia a vista. */
    const stashActive = () => {
        const id = state.room?.conversationId;
        if (!id) return;
        buffers.set(id, {
            messages: state.messages,
            people: state.people,
            historyVersion: state.historyVersion,
            authorsSeen: state.authorsSeen,
            authorsLeft: state.authorsLeft,
            pins: state.pins,
        });
    };

    /**
     * Mensagem do servidor que confirma uma enviada por você (mesmo
     * `clientMsgId`): mantém a posição e a `key`, assume o `id` e o horário
     * do servidor.
     * @param {Message} incoming
     * @param {string | null} [only] limita a uma conversa
     */
    const confirm = (incoming, only = null) =>
        incoming.clientMsgId
            ? updateWhere(
                  (message) => message.clientMsgId === incoming.clientMsgId && message.own,
                  (message) => ({ ...incoming, key: message.key, delivery: "confirmed" }),
                  only,
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
             * Resumo de uma conversa vindo do servidor: entra na lista (ou a
             * atualiza). Se nenhuma conversa está aberta, ela passa a ser a
             * aberta; se é a aberta, o resumo dela é atualizado. As demais
             * ficam na lista, sem mudar o que está na tela.
             * @param {RoomInfo} room
             */
            setRoom(room) {
                const index = state.conversations.findIndex(
                    (entry) => entry.conversationId === room.conversationId,
                );
                const known = index === -1 ? null : state.conversations[index];
                const conversations =
                    known && sameSummary(known, room)
                        ? state.conversations
                        : index === -1
                          ? [...state.conversations, { ...room, unread: 0 }]
                          : state.conversations.map((entry, i) =>
                                i === index ? { ...room, unread: entry.unread } : entry,
                            );
                const opensNow = state.room === null && state.screen !== "home";
                const isOpen = state.room?.conversationId === room.conversationId;
                if (!opensNow && !isOpen) {
                    if (conversations !== state.conversations) patch({ conversations });
                    return;
                }
                if (isOpen && state.room && sameSummary(state.room, room)) {
                    if (conversations !== state.conversations) patch({ conversations });
                    return;
                }
                if (opensNow) {
                    const view = buffers.get(room.conversationId) ?? emptyView();
                    buffers.delete(room.conversationId);
                    patch({ conversations, room, ...view, typing: [] });
                    return;
                }
                patch({ conversations, room });
            },

            /**
             * Abre uma conversa da lista: a aberta é guardada como está e a
             * escolhida volta com tudo o que chegou enquanto estava fechada.
             * @param {string} id
             * @returns {boolean} false se a conversa não existe
             */
            openConversation(id) {
                const entry = state.conversations.find((item) => item.conversationId === id);
                if (!entry) return false;
                if (state.room?.conversationId === id) {
                    if (state.screen !== "room" || entry.unread) {
                        patch({
                            screen: "room",
                            conversations: state.conversations.map((item) =>
                                item === entry ? { ...item, unread: 0 } : item,
                            ),
                        });
                    }
                    return true;
                }
                stashActive();
                const view = buffers.get(id) ?? emptyView();
                buffers.delete(id);
                const room = summaryOf(entry);
                patch({
                    screen: "room",
                    room,
                    ...view,
                    typing: [],
                    conversations: state.conversations.map((item) =>
                        item === entry ? { ...item, unread: 0 } : item,
                    ),
                });
                return true;
            },

            /**
             * A aba ficou à vista ou escondida. Ao voltar, a conversa aberta
             * é a que está sendo lida: as não lidas dela zeram.
             * @param {boolean} visible
             */
            setPageVisible(visible) {
                if (state.pageVisible === visible) return;
                const openId =
                    visible && state.screen === "room" ? state.room?.conversationId : null;
                patch({
                    pageVisible: visible,
                    ...(openId
                        ? {
                              conversations: state.conversations.map((entry) =>
                                  entry.conversationId === openId && entry.unread
                                      ? { ...entry, unread: 0 }
                                      : entry,
                              ),
                          }
                        : {}),
                });
            },

            /**
             * Tela de início: nenhuma conversa aberta (todas continuam na
             * lista, recebendo mensagens).
             */
            goHome() {
                if (state.screen === "entry") return;
                stashActive();
                patch({ screen: "home", page: "home", room: null, ...CLEAR_VIEW });
            },

            /**
             * Página no centro sem conversa aberta: Comandos ou Perfil. As
             * conversas continuam na lista, recebendo mensagens.
             * @param {"home" | "commands" | "profile"} page
             */
            showPage(page) {
                if (state.screen === "entry") return;
                stashActive();
                patch({ screen: "home", page, room: null, ...CLEAR_VIEW });
            },

            /**
             * Muda a organização da lista (fixar, mover, recolher, misturar,
             * filtrar). Só em memória.
             * @param {(nav: import("./navigation.js").NavPrefs) => import("./navigation.js").NavPrefs} change
             */
            updateNav(change) {
                const nav = reconcile(change(state.nav), state.conversations);
                if (nav !== state.nav) patch({ nav });
            },

            /**
             * Zera as não lidas de uma conversa sem abri-la ("Marcar como lida").
             * @param {string} id
             */
            markRead(id) {
                if (!state.conversations.some((e) => e.conversationId === id && e.unread)) return;
                bumpUnread(id, 0);
            },

            /**
             * A conversa acabou para você (saiu, foi removido, a outra
             * pessoa encerrou). Se era a aberta, abre a próxima da lista ou
             * volta ao início.
             * @param {string} id
             * @returns {string | null} a conversa aberta agora
             */
            removeConversation(id) {
                buffers.delete(id);
                const conversations = state.conversations.filter(
                    (entry) => entry.conversationId !== id,
                );
                if (state.room?.conversationId !== id) {
                    if (conversations.length !== state.conversations.length) {
                        patch({ conversations });
                    }
                    return state.room?.conversationId ?? null;
                }
                const next = conversations.at(-1) ?? null;
                if (next) {
                    const view = buffers.get(next.conversationId) ?? emptyView();
                    buffers.delete(next.conversationId);
                    const room = summaryOf(next);
                    patch({
                        conversations: conversations.map((entry) =>
                            entry === next ? { ...entry, unread: 0 } : entry,
                        ),
                        room,
                        ...view,
                        typing: [],
                    });
                    return next.conversationId;
                }
                patch({
                    conversations,
                    screen: state.screen === "entry" ? "entry" : "home",
                    page: "home",
                    room: null,
                    ...CLEAR_VIEW,
                });
                return null;
            },

            /**
             * As conversas deixaram de valer (identidade nova depois de o
             * servidor reiniciar): todas são descartadas.
             */
            forgetRoom() {
                buffers.clear();
                if (state.room === null && state.conversations.length === 0) return;
                patch({ room: null, conversations: [], ...CLEAR_VIEW });
            },

            /** Sala e sessão aceitas pelo servidor: agora sim, a conversa. */
            completeJoin() {
                if (!state.joining) return;
                patch({ screen: "room", joining: false });
            },

            /**
             * Sessão aceita sem conversa a abrir (sem convite): a pessoa vai
             * para o início, de onde cria uma sala, entra por código ou
             * procura alguém pelo arroba.
             */
            completeLogin() {
                if (!state.joining) return;
                patch({ screen: "home", page: "home", joining: false });
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
             * @param {string | null} [conversationId] outra conversa que não a aberta
             */
            syncHistoryVersion(version, conversationId = null) {
                if (!isActive(conversationId)) {
                    const view = bufferOf(/** @type {string} */ (conversationId));
                    if (!view) return false;
                    const old = view.historyVersion !== null && view.historyVersion !== version;
                    buffers.set(/** @type {string} */ (conversationId), {
                        ...view,
                        historyVersion: version,
                        messages: old ? [] : view.messages,
                    });
                    return old;
                }
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
                buffers.clear();
                // A aba continua à vista ou escondida: isso não é da participação.
                patch({ ...initialState(), pageVisible: state.pageVisible });
            },

            /**
             * Acrescenta uma entrada. Id repetido é ignorado; mensagem que
             * confirma uma enviada por você atualiza a original.
             * @param {Message} message
             * @param {string | null} [conversationId] outra conversa que não a aberta
             */
            addMessage(message, conversationId = null) {
                if (hidden.has(message.id)) return;
                if (!isActive(conversationId)) {
                    const id = /** @type {string} */ (conversationId);
                    if (confirm(message, id)) return;
                    const view = bufferOf(id);
                    if (!view || view.messages.some((existing) => existing.id === message.id))
                        return;
                    buffers.set(id, { ...view, messages: bounded([...view.messages, message]) });
                    // Só mensagem de alguém conta como não lida; avisos não.
                    bumpUnread(id, message.kind === "chat" && !message.own ? 1 : 0);
                    return;
                }
                if (confirm(message)) return;
                if (state.messages.some((existing) => existing.id === message.id)) return;
                patch({ messages: bounded([...state.messages, message]) });
                // Aba escondida: a conversa aberta não está sendo lida.
                const openId = state.room?.conversationId;
                if (!state.pageVisible && openId && message.kind === "chat" && !message.own) {
                    bumpUnread(openId, 1);
                }
            },

            /**
             * Mescla o histórico enviado pelo servidor: entram, no fim e na
             * ordem do servidor, só as mensagens que não estão na tela (nem
             * foram escondidas por /clear); pendentes suas são confirmadas.
             * @param {Message[]} history
             * @param {string | null} [conversationId] outra conversa que não a aberta
             * @param {{countUnread?: boolean}} [options] conta como não lidas (conversa nova)
             */
            mergeHistory(history, conversationId = null, { countUnread = false } = {}) {
                if (!isActive(conversationId)) {
                    const id = /** @type {string} */ (conversationId);
                    for (const message of history) confirm(message, id);
                    const view = bufferOf(id);
                    if (!view) return;
                    const seen = new Set(view.messages.map((message) => message.id));
                    const fresh = history.filter((message) => {
                        if (seen.has(message.id) || hidden.has(message.id)) return false;
                        seen.add(message.id);
                        return true;
                    });
                    if (fresh.length) {
                        buffers.set(id, {
                            ...view,
                            messages: bounded([...view.messages, ...fresh]),
                        });
                        // Conversa que acabou de chegar (alguém começou a falar
                        // com você): o que veio no histórico ainda não foi lido.
                        if (countUnread) {
                            bumpUnread(
                                id,
                                fresh.filter((message) => message.kind === "chat" && !message.own)
                                    .length,
                            );
                        }
                    }
                    return;
                }
                for (const message of history) confirm(message);
                const known = new Set(state.messages.map((message) => message.id));
                const fresh = history.filter((message) => {
                    if (known.has(message.id) || hidden.has(message.id)) return false;
                    known.add(message.id);
                    return true;
                });
                if (fresh.length === 0) return;
                patch({ messages: bounded([...state.messages, ...fresh]) });
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
             * @param {string | null} [conversationId] outra conversa que não a aberta
             */
            roomCleared(version, notice, conversationId = null) {
                if (!isActive(conversationId)) {
                    const id = /** @type {string} */ (conversationId);
                    const view = bufferOf(id);
                    if (view)
                        buffers.set(id, {
                            ...view,
                            historyVersion: version,
                            messages: [notice],
                            pins: [],
                        });
                    return;
                }
                patch({ historyVersion: version, messages: [notice], pins: [] });
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
             * Muda campos de uma mensagem (edição, reações) onde ela estiver.
             * @param {string} id
             * @param {Partial<Message>} change
             * @param {string | null} [conversationId]
             */
            updateMessage(id, change, conversationId = null) {
                return updateWhere(
                    (message) => message.id === id && message.kind === "chat",
                    (message) => ({ ...message, ...change }),
                    conversationId,
                );
            },

            /**
             * Mensagem apagada (por quem escreveu ou pela moderação).
             * @param {string} id
             * @param {string | null} [conversationId]
             */
            deleteMessage(id, conversationId = null) {
                if (!isActive(conversationId)) {
                    const view = bufferOf(/** @type {string} */ (conversationId));
                    if (!view) return;
                    const messages = view.messages.filter((m) => m.id !== id);
                    if (messages.length !== view.messages.length) {
                        buffers.set(/** @type {string} */ (conversationId), { ...view, messages });
                    }
                    return;
                }
                const messages = state.messages.filter((m) => m.id !== id);
                if (messages.length !== state.messages.length) patch({ messages });
            },

            /**
             * Mensagens fixadas de uma conversa.
             * @param {Pin[]} pins
             * @param {string | null} [conversationId]
             */
            setPins(pins, conversationId = null) {
                if (!isActive(conversationId)) {
                    const view = bufferOf(/** @type {string} */ (conversationId));
                    if (view)
                        buffers.set(/** @type {string} */ (conversationId), { ...view, pins });
                    return;
                }
                patch({ pins });
            },

            /**
             * Tira da tela uma entrada que só existe aqui (resposta de
             * comando "Dispensar"). Não mexe em nada do servidor.
             * @param {string} id
             */
            removeLocal(id) {
                const messages = state.messages.filter(
                    (m) => !(m.id === id && m.kind === "notice"),
                );
                if (messages.length !== state.messages.length) patch({ messages });
            },

            /**
             * Tira da tela uma mensagem SUA que o servidor recusou de vez (o
             * texto volta para o rascunho). Só falhas: uma confirmada nunca
             * some, e uma pendente ainda pode chegar.
             * @param {string} clientMsgId
             * @returns {boolean}
             */
            discardFailed(clientMsgId) {
                /** @param {Message} m */
                const keep = (m) =>
                    !(m.own && m.clientMsgId === clientMsgId && m.delivery === "failed");
                let removed = false;
                for (const [id, view] of buffers) {
                    const messages = view.messages.filter(keep);
                    if (messages.length !== view.messages.length) {
                        removed = true;
                        buffers.set(id, { ...view, messages });
                    }
                }
                const messages = state.messages.filter(keep);
                if (messages.length !== state.messages.length) {
                    patch({ messages });
                    return true;
                }
                if (removed) notify();
                return removed;
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
                        attempt: (message.attempt ?? 1) + 1,
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
             * @param {string | null} [conversationId] outra conversa que não a aberta
             */
            setPeople(people, conversationId = null) {
                /** @param {string[]} seen @param {string[]} left */
                const track = (seen, left) => {
                    const keys = people
                        .map((person) => authorKey(person.username, person.author))
                        .filter(/** @returns {key is string} */ (key) => key !== null);
                    return {
                        authorsSeen: [...new Set([...seen, ...keys])],
                        authorsLeft: left.filter((key) => !keys.includes(key)),
                    };
                };
                if (!isActive(conversationId)) {
                    const id = /** @type {string} */ (conversationId);
                    const view = bufferOf(id);
                    if (view) {
                        buffers.set(id, {
                            ...view,
                            people,
                            ...track(view.authorsSeen, view.authorsLeft),
                        });
                    }
                    return;
                }
                patch({ people, ...track(state.authorsSeen, state.authorsLeft) });
            },

            /**
             * Alguém entrou (ou voltou) ou saiu de uma conversa: quem saiu
             * aparece marcado no histórico; quem voltou, não mais.
             * @param {string} key chave de autor (@ + número)
             * @param {boolean} present
             * @param {string | null} [conversationId]
             */
            setAuthorPresence(key, present, conversationId = null) {
                /** @param {string[]} seen @param {string[]} left */
                const next = (seen, left) => ({
                    authorsSeen: seen.includes(key) ? seen : [...seen, key],
                    authorsLeft: present
                        ? left.filter((item) => item !== key)
                        : left.includes(key)
                          ? left
                          : [...left, key],
                });
                if (!isActive(conversationId)) {
                    const id = /** @type {string} */ (conversationId);
                    const view = bufferOf(id);
                    if (view)
                        buffers.set(id, { ...view, ...next(view.authorsSeen, view.authorsLeft) });
                    return;
                }
                patch(next(state.authorsSeen, state.authorsLeft));
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
