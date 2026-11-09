// @ts-check

import { SOCKET_URL, TIMING } from "./config.js";
import { CLIENT_EVENTS, CLOSE_CODES } from "./protocol.js";
import { routeInput } from "./commands/input.js";
import { helpReply, timeReply } from "./commands/local.js";
import { createCommandSuggestions } from "./ui/commandSuggestions.js";
import { createAnnouncer } from "./a11y/announce.js";
import { format, strings } from "./i18n/strings.js";
import { createEventHandler, noticeMessage } from "./state/events.js";
import { createStore } from "./state/store.js";
import { createTypingTracker } from "./state/typing.js";
import { createTypingSignal } from "./state/typingSignal.js";
import { changed, createRenderLoop } from "./state/renderLoop.js";
import { createTransport } from "./transport/socket.js";
import { must } from "./ui/dom.js";
import { createComposer } from "./ui/composer.js";
import { createConnection } from "./ui/connection.js";
import { createEmpty } from "./ui/empty.js";
import { createFailure } from "./ui/failure.js";
import { createEntry } from "./ui/entry.js";
import { createConversationTabs } from "./ui/conversationTabs.js";
import { createHome } from "./ui/home.js";
import { createMessageList } from "./ui/messageList.js";
import { createPeople } from "./ui/people.js";
import { createThemeToggle } from "./ui/themeToggle.js";
import { createToasts } from "./ui/toast.js";
import { createTyping } from "./ui/typing.js";
import { createNotifier } from "./ui/notify.js";
import { createDialog } from "./ui/dialog.js";
import { hydrateIcons } from "./ui/icons.js";
import { createLayout } from "./ui/layout.js";
import { createPanelResize } from "./ui/panelResize.js";
import { createRoomHeader } from "./ui/roomHeader.js";
import { inviteHash, readInviteHash, normalizeRoomCode } from "./state/invite.js";
import { createMemberCard } from "./ui/memberCard.js";
import { createTooltips } from "./ui/tooltip.js";
import { createUserPanel } from "./ui/userPanel.js";

/**
 * Raiz de composição. É o único lugar em que transporte, estado e interface
 * se conhecem: `ui/` e `state/` não sabem que existe um canal em tempo real,
 * e `transport/` não sabe que existe um DOM.
 */

const store = createStore();

// Ícones primeiro: os módulos abaixo podem trocar um ícone já desenhado.
hydrateIcons();

const room = /** @type {HTMLElement} */ (must(".c-room"));
const shell = /** @type {HTMLElement} */ (must(".c-app"));
const skeleton = /** @type {HTMLElement} */ (must(".c-skeleton"));

const layout = createLayout();
const panelResize = createPanelResize({ layout, label: strings.layout.width });
const dialog = createDialog();
createTooltips();

const announcer = createAnnouncer();
const connection = createConnection();
const empty = createEmpty();
const messageList = createMessageList({
    onRetry: (message) => retryMessage(message),
    onFailed: (message) =>
        announcer.say(
            format(strings.delivery.announceFailed, { reason: message.failReason ?? "" }),
            {
                force: true,
            },
        ),
});
const typing = createTyping();
const notifier = createNotifier();
const toasts = createToasts();

const typingTracker = createTypingTracker((people) => store.actions.setTyping(people));

const themeToggle = createThemeToggle({
    // O foco permanece no controle: só o rótulo e o estado mudam. O anúncio
    // sai pela região live, não por um toast que o leitor de tela ignoraria.
    onChange: (_theme, label) => {
        // Sem toast: ele nasce sobre o próprio alternador. O feedback visual é
        // a página inteira mudando e o rótulo do botão invertendo.
        announcer.say(label, { force: true });
    },
});

/** @type {(event: {type: string, payload: unknown, id?: string}) => void} */
let handleEvent = () => {};

/**
 * Token secreto de retomada entregue pelo servidor no evento `session`.
 * Prova, numa reconexão, que esta aba é a dona da identidade — sem ele o
 * servidor atribuiria um id novo e as próprias mensagens anteriores
 * deixariam de aparecer como "Você". Fica só em memória: fechar a aba
 * encerra a identidade, como a sala promete.
 * @type {string | null}
 */
let resumeToken = null;

/**
 * Retomada restrita à mesma aba (sessionStorage). Não há armazenamento de
 * mensagens nem cadastro permanente. Tokens são rotacionados pelo servidor.
 */
const SESSION_KEY = "web-chat:temporary-session:v1";
const readSavedSession = () => {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (
            typeof data?.name !== "string" ||
            typeof data?.username !== "string" ||
            typeof data?.token !== "string"
        )
            return null;
        return data;
    } catch {
        return null;
    }
};
/** @param {import("./state/store.js").Person | null} me @param {string | null} token */
const saveSession = (me, token) => {
    try {
        if (token && me) {
            sessionStorage.setItem(
                SESSION_KEY,
                JSON.stringify({ name: me.name, username: me.username, token }),
            );
        } else {
            sessionStorage.removeItem(SESSION_KEY);
        }
    } catch {
        // Sem armazenamento, a retomada por refresh fica indisponível.
    }
};

/**
 * Código de convite pendente: o do link que abriu a página (`#/s/código`).
 * Vale para a primeira entrada; depois a sala aberta é que manda.
 * @type {string | null}
 */
let pendingInvite = readInviteHash(location.hash);

/** Correlação do pedido de sala feito na entrada (criar ou entrar). */
const ROOM_REQUEST_ID = "entrada-sala";
/** @type {"create" | "join" | "direct" | null} */
let roomRequest = null;

/**
 * Acrescenta a conversa aberta ao payload: o servidor só aceita mensagem,
 * sinal e comando de quem participa da conversa informada.
 * @param {Record<string, unknown>} payload
 */
const inRoom = (payload) => {
    const conversationId = store.getState().room?.conversationId;
    return conversationId ? { ...payload, conversationId } : payload;
};

/** Sem confirmação do servidor nesse prazo, a mensagem vira "não enviada". */
const DELIVERY_TIMEOUT_MS = 10_000;

/**
 * Comandos enviados ao servidor aguardando resposta (correlação pelo
 * `requestId`). Guarda o nome e o instante, para o /ping medir a ida e volta.
 * @type {Map<string, {name: string, sentAt: number}>}
 */
const pendingRequests = new Map();

const transport = createTransport({
    url: SOCKET_URL,
    onStatus: (status, detail) => {
        if (status !== "online") typingTracker.clear();
        store.actions.setLink(status, detail);
        // Mensagens que esperavam a conexão saem agora pela fila: o prazo
        // de confirmação começa a contar daqui.
        if (status === "online") store.actions.markPendingSent(Date.now());
    },
    onQueueChange: (queued) => {
        store.actions.setQueued(queued);
    },
    onOpen: () => {
        const me = store.getState().me;
        if (!me) return;
        // `userId` é ignorado pelo servidor atual (que atribui a identidade)
        // e mantido só para compatibilidade com um servidor antigo.
        // Numa retomada o servidor usa o username guardado; o enviado só
        // vale se a identidade não puder ser retomada (ex.: servidor
        // reiniciou) — aí ela é recriada com o mesmo @, se estiver livre.
        transport.send(CLIENT_EVENTS.LOGIN, {
            userId: me.id,
            userName: me.name,
            username: me.username ?? "",
            ...(resumeToken ? { resumeToken } : {}),
        });
    },
    onEvent: (event) => handleEvent(event),
});

const typingSignal = createTypingSignal({
    send: (type) => transport.signal(type, inRoom({})),
    interval: TIMING.typingSignalInterval,
    idle: TIMING.typingIdle,
});

/**
 * Envia uma mensagem comum. Ela aparece na hora como "enviando…" e é
 * confirmada quando o servidor a devolve com o mesmo `clientMsgId`.
 * @param {string} content
 */
const sendChat = (content) => {
    const me = store.getState().me;
    if (!me) return;
    const clientMsgId = crypto.randomUUID();
    const sent = transport.send(CLIENT_EVENTS.CHAT_MESSAGE, inRoom({ content, clientMsgId }));
    store.actions.addMessage({
        id: `local:${clientMsgId}`,
        key: `c:${clientMsgId}`,
        kind: "chat",
        userId: me.id,
        userName: me.name,
        ...(me.username ? { username: me.username } : {}),
        content,
        timestamp: new Date().toISOString(),
        own: true,
        variant: "text",
        format: null,
        clientMsgId,
        delivery: "pending",
        sentAt: sent ? Date.now() : null,
    });
};

/**
 * "Tentar de novo": reenvia com o MESMO `clientMsgId` — se a original
 * tiver chegado, o servidor não duplica.
 * @param {import("./state/store.js").Message} message
 */
const retryMessage = (message) => {
    if (!message.clientMsgId) return;
    const sent = transport.send(
        CLIENT_EVENTS.CHAT_MESSAGE,
        inRoom({ content: message.content, clientMsgId: message.clientMsgId }),
    );
    store.actions.retryMessage(message.clientMsgId, sent ? Date.now() : null);
};

setInterval(() => {
    store.actions.expirePending(Date.now(), DELIVERY_TIMEOUT_MS, strings.delivery.timeout);
}, 1000);

/**
 * Comando local (`scope: "client"` no catálogo do servidor).
 * @param {import("./state/store.js").CommandInfo} command
 * @param {string} args
 */
const runLocalCommand = (command, args) => {
    const catalog = store.getState().catalog;
    switch (command.name) {
        case "clear":
            store.actions.clearLocal();
            store.actions.addMessage(
                noticeMessage({ tone: "success", text: strings.system.localCleared }),
            );
            break;
        case "time":
            store.actions.addMessage(noticeMessage(timeReply()));
            break;
        default:
            store.actions.addMessage(noticeMessage(helpReply(catalog, args)));
    }
};

/**
 * Caminho único de envio: o campo de mensagem e os atalhos da interface
 * (barra lateral, cartão de pessoa) passam por aqui. Um botão nunca fala
 * com o servidor por fora do sistema de comandos — validação e permissão
 * continuam todas no servidor.
 * @param {string} content
 */
const submit = (content) => {
    // Gesto do usuário: é aqui, e só aqui, que a permissão de
    // notificação pode ser pedida.
    notifier.requestOnGesture();
    typingSignal.stop();
    const route = routeInput(content, store.getState().catalog);
    if (route.type === "message") {
        sendChat(route.content);
    } else if (route.type === "client") {
        runLocalCommand(route.command, route.args);
    } else {
        // Comando do servidor: vai como texto bruto; quem interpreta,
        // valida e autoriza é o servidor.
        const requestId = crypto.randomUUID();
        pendingRequests.set(requestId, { name: route.name, sentAt: Date.now() });
        transport.send(CLIENT_EVENTS.COMMAND, inRoom({ requestId, text: route.text }));
    }
};

const composer = createComposer({
    onSend: submit,
    onTyping: () => typingSignal.input(),
    onInput: (text, cursor) => suggestions.update(text, cursor),
    onKeyDown: (event) => suggestions.handleKey(event),
});

const suggestions = createCommandSuggestions({
    input: composer.input,
    getCatalog: () => store.getState().catalog,
    onChoose: (text) => composer.setValue(text),
});

/**
 * Papel efetivo para a INTERFACE (mostrar ou não atalhos de moderação).
 * O `session` só traz o papel global; o papel NA SALA (anfitrião) e um
 * /admin posterior chegam na lista de pessoas do servidor. Permissão de
 * verdade é sempre conferida no servidor, a cada comando.
 * @param {import("./state/store.js").State} state
 * @returns {"member" | "admin" | "host"}
 */
const effectiveRole = (state) => {
    const listed = state.people.find((person) => person.id === state.me?.id);
    if (listed?.role) return listed.role;
    if (state.role === "admin") return "admin";
    return state.room?.role === "host" ? "host" : "member";
};

const memberCard = createMemberCard({
    getContext: () => {
        const state = store.getState();
        return { meId: state.me?.id ?? null, role: effectiveRole(state) };
    },
    runCommand: (text) => {
        layout.closeDrawer();
        submit(text);
        composer.focus();
    },
    prefill: (text) => {
        layout.closeDrawer();
        composer.setValue(text);
    },
    confirm: (options) => dialog.confirm(options),
    notify: (text, kind) => toasts.show(text, kind),
});

const roomHeader = createRoomHeader();

const people = createPeople({ onSelect: (person, button) => memberCard.open(person, button) });

const userPanel = createUserPanel({ onToggleAway: () => submit("/afk") });

/**
 * Atalhos da barra lateral e do cabeçalho. Cada um é um comando que já
 * existe — nada de botão decorativo.
 * @type {Record<string, () => void | Promise<void>>}
 */
const shortcuts = {
    "go-home": () => {
        if (store.getState().screen !== "room") return;
        // Navegação não significa abandono: a participação permanece no servidor.
        store.actions.goHome();
        history.replaceState(null, "", location.pathname + location.search);
    },
    "leave-room": async () => {
        const active = store.getState().room;
        if (!active) return;
        const confirmed = await dialog.confirm({
            title: active.kind === "dm" ? "Encerrar DM?" : "Sair da sala?",
            body:
                active.kind === "dm"
                    ? "O histórico da conversa privada será apagado para ambos."
                    : "Você deixará esta sala. Se não houver outros participantes, o histórico será apagado.",
            confirmLabel: active.kind === "dm" ? "Encerrar DM" : "Sair da sala",
        });
        if (!confirmed) return;
        transport.send(CLIENT_EVENTS.ROOM_LEAVE, { conversationId: active.conversationId });
    },
    help: () => submit("/help"),
    "clear-local": () => submit("/clear"),
    "clear-room": async () => {
        const ok = await dialog.confirm({
            title: strings.dialogs.clearAllTitle,
            body: strings.dialogs.clearAllBody,
            confirmLabel: strings.dialogs.clearAllConfirm,
        });
        if (ok) submit("/clearall confirmar");
    },
};

for (const button of document.querySelectorAll("[data-action]")) {
    const action = button.getAttribute("data-action") ?? "";
    const run = shortcuts[action];
    if (!run) continue;
    button.addEventListener("click", () => {
        layout.closeDrawer();
        void Promise.resolve(run()).then(() => composer.focus());
    });
}

/**
 * Encerra a participação neste navegador: a identidade temporária acaba no
 * servidor (token inválido, username livre, fora de todas as salas) e tudo
 * o que era desta participação é descartado aqui: conversa, fila de envio,
 * token de retomada, link de convite e os campos da entrada. A preferência
 * de tema não é dado da participação e fica. Sem conexão no momento, não há
 * como avisar o servidor: a identidade expira sozinha no fim do prazo de
 * retomada (2 min).
 * @param {{announce?: string, notice?: string}} [options]
 */
const endParticipation = ({ announce = strings.logout.done, notice } = {}) => {
    typingSignal.stop();
    transport.signal(CLIENT_EVENTS.LOGOUT);
    transport.close();
    resumeToken = null;
    saveSession(null, null);
    pendingRequests.clear();
    typingTracker.clear();
    memberCard.close({ restoreFocus: false });
    // Larguras ajustadas são desta participação: a próxima começa no padrão.
    panelResize.reset();
    store.actions.leaveRoom();
    // A tela de entrada precisa estar visível antes de receber o foco.
    renderLoop.flush();
    entry.clear();
    entry.focus();
    pendingInvite = null;
    roomRequest = null;
    history.replaceState(null, "", location.pathname + location.search);
    if (notice) toasts.show(notice, "error");
    announcer.say(announce, { force: true });
};

/** Sair, com confirmação: o botão "Sair" da interface. */
const logout = async () => {
    layout.closeDrawer();
    const confirmed = await dialog.confirm({
        title: strings.logout.title,
        body: strings.logout.body,
        confirmLabel: strings.logout.confirm,
    });
    if (!confirmed) return;
    endParticipation();
};

/**
 * Depois da sessão nova, a sala: a do convite (ou a que estava aberta, se o
 * servidor reiniciou e a identidade é outra) ou uma sala nova. Numa
 * retomada o servidor devolve as salas sozinho.
 */
/** @param {string | null} [requestedCode] */
const enterRoom = (requestedCode = null) => {
    const code = requestedCode ? normalizeRoomCode(requestedCode) : null;
    if (requestedCode && !code) {
        home.showNotice("Código de convite inválido.");
        return;
    }
    // A navegação não remove participações anteriores do servidor.
    if (store.getState().screen === "room") {
        home.showNotice("Volte à Home antes de abrir outra sala.");
        return;
    }
    roomRequest = code ? "join" : "create";
    transport.send(
        code ? CLIENT_EVENTS.ROOM_JOIN : CLIENT_EVENTS.ROOM_CREATE,
        code ? { code, requestId: ROOM_REQUEST_ID } : { requestId: ROOM_REQUEST_ID },
    );
};

for (const button of document.querySelectorAll('[data-action="logout"]')) {
    button.addEventListener("click", () => void logout());
}

/** @param {string} id */
const openConversation = (id) => {
    if (!store.actions.openConversation(id)) return;
    const selected = store.getState().room;
    history.replaceState(
        null,
        "",
        selected?.kind === "dm"
            ? location.pathname + location.search
            : selected
              ? inviteHash(selected.code)
              : location.pathname + location.search,
    );
};

const home = createHome({
    onCreate: () => enterRoom(),
    onJoin: (code) => enterRoom(code),
    onOpen: (id) => {
        if (!store.actions.openConversation(id)) return;
        const selected = store.getState().room;
        if (selected?.kind !== "dm" && selected)
            history.replaceState(null, "", inviteHash(selected.code));
    },
    onLeave: (id) => {
        const selected = store.getState().conversations.find((item) => item.conversationId === id);
        if (!selected) return;
        void (async () => {
            const confirmed = await dialog.confirm({
                title: "Sair da sala?",
                body: "Você deixará esta sala. Se for a última pessoa, o histórico será apagado.",
                confirmLabel: "Sair da sala",
            });
            if (confirmed) transport.send(CLIENT_EVENTS.ROOM_LEAVE, { conversationId: id });
        })();
    },
    onDirect: () => {},
    onSearch: (query) => {
        transport.send(CLIENT_EVENTS.USER_SEARCH, { query, requestId: crypto.randomUUID() });
    },
    onStartDirect: (username) => {
        roomRequest = "direct";
        transport.send(CLIENT_EVENTS.DM_OPEN, { username, requestId: ROOM_REQUEST_ID });
    },
});

// Controles explícitos: navegar não é o mesmo que abandonar uma sala.
const roomNavigation = document.createElement("nav");
roomNavigation.className = "c-room-navigation";
roomNavigation.setAttribute("aria-label", "Navegação da conversa");
const homeButton = document.createElement("button");
homeButton.type = "button";
homeButton.dataset.roomNav = "home";
homeButton.textContent = "← Início";
const leaveButton = document.createElement("button");
leaveButton.type = "button";
leaveButton.dataset.roomNav = "leave";
leaveButton.textContent = "Sair da sala";
roomNavigation.append(homeButton, leaveButton);
const conversationTabs = createConversationTabs({ onOpen: openConversation });
roomNavigation.append(conversationTabs.element);
room.prepend(roomNavigation);
roomNavigation.querySelector('[data-room-nav="home"]')?.addEventListener("click", () => {
    void shortcuts["go-home"]?.();
});
roomNavigation.querySelector('[data-room-nav="leave"]')?.addEventListener("click", () => {
    void shortcuts["leave-room"]?.();
});

const failure = createFailure({
    onRetry: () => transport.retryNow(),
});

const entry = createEntry({
    onSubmit: (name, username) => {
        // O link pode ter mudado sem recarregar a página (só o `#` muda ao
        // abrir um convite com a aba já aberta): vale o endereço de agora.
        pendingInvite = readInviteHash(location.hash) ?? pendingInvite;
        // A pessoa fica na entrada, vendo o progresso, até o servidor aceitar
        // (evento `session`). Id provisório: o definitivo vem na sessão.
        store.actions.startJoin({ id: crypto.randomUUID(), name, username });
        transport.open();
    },
    // Desistiu de esperar: nada fica pendente nem tenta de novo sozinho.
    onCancel: () => {
        transport.close();
        resumeToken = null;
        saveSession(null, null);
        store.actions.leaveRoom();
    },
    onRetry: () => transport.retryNow(),
});

handleEvent = createEventHandler({
    store,
    toasts,
    notifier,
    typingTracker,
    onSession: (token, resumed) => {
        resumeToken = token;
        saveSession(store.getState().me, token);
        if (!resumed) store.actions.clearConversations();
        transport.send(CLIENT_EVENTS.ROOM_LIST, {});
        home.setIdentity(store.getState().me?.name ?? "", store.getState().me?.username ?? "");
        if (pendingInvite) home.setInvite(pendingInvite);
    },
    onUserSearchResults: (query, users) => home.setSearchResults(query, users),
    onRoomJoined: (room) => {
        // Na reconexão o servidor reenvia todas as salas: não abrir
        // automaticamente a última chegada.
        if (roomRequest === null) return;
        pendingInvite = null;
        roomRequest = null;
        store.actions.openConversation(room.conversationId);
        if (room.kind !== "dm") history.replaceState(null, "", inviteHash(room.code));
        else history.replaceState(null, "", location.pathname + location.search);
    },
    onRoomRefused: (code, message) => {
        if (roomRequest === "join" && store.getState().room === null) {
            pendingInvite = null;
            roomRequest = null;
            home.showNotice(message);
            return;
        }
        if (
            (roomRequest === "create" || roomRequest === "direct") &&
            store.getState().room === null
        ) {
            // Não encerra a identidade por falha ao criar uma sala.
            roomRequest = null;
            home.showNotice(message);
            return;
        }
        toasts.show(message, "error");
    },
    onRoomLeft: (reason) => {
        // O estado da sala já foi removido do registro. Outras conversas
        // seguem ativas, inclusive se o aviso era de outra sala.
        if (!store.getState().room) {
            history.replaceState(null, "", location.pathname + location.search);
        }
        if (reason === "removed") home.showNotice(strings.room.removed);
    },
    onCommandResult: (requestId, result) => {
        const request = requestId ? pendingRequests.get(requestId) : undefined;
        if (requestId) pendingRequests.delete(requestId);
        // Texto vazio: confirmação de um comando cujo efeito já apareceu na sala.
        if (!result.text) return;
        // /ping: o servidor responde; a ida e volta é medida aqui.
        const reply =
            request?.name === "ping" && result.tone === "success"
                ? {
                      ...result,
                      text: format(strings.commands.ping, { ms: Date.now() - request.sentAt }),
                  }
                : result;
        store.actions.addMessage(noticeMessage(reply));
    },
    onLoginRejected: (message, field) => {
        // Entrada recusada pelo servidor: a pessoa volta à tela do nome com
        // a explicação, em vez de ficar numa sala em que não pode falar.
        transport.close();
        resumeToken = null;
        saveSession(null, null);
        typingTracker.clear();
        store.actions.leaveRoom();
        // A tela de entrada precisa estar visível antes de receber o foco.
        renderLoop.flush();
        entry.reset(message, field);
    },
});

/** @type {import("./state/store.js").State["screen"]} */
let lastScreen = "entry";
/** @type {import("./state/store.js").State["link"]} */
let lastLink = "idle";

/**
 * Texto do estado da conexão para leitor de tela. Anunciado uma vez por
 * mudança — nunca uma vez por tentativa.
 * @param {import("./state/store.js").State} state
 * @returns {string}
 */
const linkAnnouncement = (state) => {
    switch (state.link) {
        case "connecting":
            return strings.conn.connecting;
        case "online":
            return lastLink === "retrying" ? strings.conn.restored : strings.conn.online;
        case "retrying":
            return format(strings.conn.retryingNth, { n: state.attempt });
        case "offline":
            return format(strings.conn.lostBody, { n: state.maxAttempts });
        default:
            return "";
    }
};

/**
 * Pinta a tela a partir do estado. Cada componente só é redesenhado quando a
 * parte do estado de que ele depende mudou — antes, todo evento recebido
 * (inclusive cada sinal de digitação de outra pessoa) reconstruía a lista de
 * pessoas e forçava um layout completo da conversa.
 * @param {import("./state/store.js").State} state
 * @param {import("./state/store.js").State | null} previous
 */
const render = (state, previous) => {
    const inRoom = state.screen === "room";
    const noMessages = state.messages.length === 0;
    const wasEmpty = previous ? previous.messages.length === 0 : null;

    if (changed(state, previous, ["screen"])) {
        shell.dataset.screen = state.screen;
        entry.setVisible(state.screen === "entry");
        home.setVisible(state.screen === "home");
        room.hidden = !inRoom;
        composer.setVisible(inRoom);
        layout.setInRoom(inRoom);
        if (!inRoom) memberCard.close({ restoreFocus: false });
    }

    if (changed(state, previous, ["conversations"])) {
        home.renderConversations(state.conversations);
    }
    if (changed(state, previous, ["conversations", "room"])) {
        conversationTabs.render(state.conversations, state.room?.conversationId ?? null);
    }
    if (changed(state, previous, ["link", "attempt"])) {
        home.setConnection(state.link);
        connection.render(state.link, state.attempt);
    }
    if (changed(state, previous, ["joining", "link", "attempt"])) {
        entry.setProgress(state.joining, state.link, state.attempt);
    }
    if (changed(state, previous, ["screen", "link"]) || noMessages !== wasEmpty) {
        empty.render(inRoom && state.link === "online" && noMessages);
        // Primeira conexão ainda a caminho e nada para mostrar: esqueleto.
        skeleton.hidden = !(
            inRoom &&
            noMessages &&
            (state.link === "idle" || state.link === "connecting" || state.link === "retrying")
        );
    }
    if (changed(state, previous, ["screen", "link", "maxAttempts", "closeCode"])) {
        failure.render(
            inRoom && state.link === "offline",
            state.maxAttempts,
            state.closeCode === CLOSE_CODES.REMOVED,
        );
    }
    if (changed(state, previous, ["typing"])) typing.render(state.typing);
    if (changed(state, previous, ["messages"])) messageList.render(state.messages);
    if (changed(state, previous, ["people", "me", "link"])) {
        people.render(state.people, state.me?.id ?? null, state.link === "online");
    }
    if (changed(state, previous, ["room"])) roomHeader.render(state.room);
    if (changed(state, previous, ["people", "me", "role", "link", "room"])) {
        const meId = state.me?.id;
        userPanel.render(
            state.me,
            state.people.find((person) => person.id === meId),
            effectiveRole(state),
            state.link === "online",
        );
    }
    if (changed(state, previous, ["link", "queued"])) composer.render(state.link, state.queued);

    // Trocar `display` sem mover o foco é bug de acessibilidade: na entrada
    // da sala o foco vai para o composer e a mudança de contexto é anunciada.
    if (state.screen === "home" && lastScreen !== "home") home.focus();
    if (inRoom && lastScreen !== "room") {
        composer.focus();
        announcer.say(strings.a11y.enteredRoom, { force: true });
    }
    lastScreen = state.screen;

    if (state.link !== lastLink) {
        announcer.say(linkAnnouncement(state));
        lastLink = state.link;
    }
};

const renderLoop = createRenderLoop({ getState: () => store.getState(), render });
store.subscribe(() => renderLoop.request());

// Estado inicial: pinta a tela de entrada sem esperar por nenhum evento.
//
// Sem foco automático no campo de nome, de propósito: focar um campo no
// carregamento rouba o primeiro Tab e torna o skip link inalcançável, além
// de mover o foco sem que o usuário tenha pedido. O foco só é movido na
// troca de tela, que é mudança de contexto e precisa ser anunciada.
entry.setVisible(true);
themeToggle.current();

const savedSession = readSavedSession();
if (savedSession) {
    resumeToken = savedSession.token;
    store.actions.startJoin({
        id: crypto.randomUUID(),
        name: savedSession.name,
        username: savedSession.username,
    });
    transport.open();
}
