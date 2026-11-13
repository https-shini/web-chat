// @ts-check

import { SOCKET_URL, TIMING } from "./config.js";
import { CLIENT_EVENTS, CLOSE_CODES, ERROR_CODES } from "./protocol.js";
import { routeInput } from "./commands/input.js";
import { helpReply, timeReply } from "./commands/local.js";
import { createCommandSuggestions } from "./ui/commandSuggestions.js";
import { createAnnouncer } from "./a11y/announce.js";
import { format, strings } from "./i18n/strings.js";
import { createEventHandler, noticeMessage } from "./state/events.js";
import { createStore } from "./state/store.js";
import { departedAuthors } from "./state/departed.js";
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
import { inviteHash, readInviteHash } from "./state/invite.js";
import { createMemberCard } from "./ui/memberCard.js";
import { createTooltips } from "./ui/tooltip.js";
import { createUserPanel } from "./ui/userPanel.js";
import { createHome } from "./ui/home.js";
import { createConversationNav } from "./ui/conversationNav.js";

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

/**
 * Botão "Ativar notificações" do painel "você": a única forma de ligar as
 * notificações do sistema (nada é pedido sozinho).
 */
const notifyButton = /** @type {HTMLButtonElement | null} */ (
    document.querySelector('[data-action="toggle-notifications"]')
);
const renderNotifyButton = () => {
    if (!notifyButton) return;
    const current = notifier.state();
    notifyButton.hidden = current === "unsupported";
    const on = current === "on";
    const label = on ? strings.notify.disable : strings.notify.enable;
    notifyButton.setAttribute("aria-pressed", String(on));
    notifyButton.setAttribute("aria-label", label);
    notifyButton.dataset.tooltip = label;
    notifyButton.dataset.state = current;
};
notifyButton?.addEventListener("click", async () => {
    if (notifier.state() === "on") {
        notifier.disable();
        renderNotifyButton();
        announcer.say(strings.notify.disabled, { force: true });
        return;
    }
    const result = await notifier.enable();
    renderNotifyButton();
    // Negada: explica uma vez como liberar; não pede de novo sozinho.
    const text =
        result === "on"
            ? strings.notify.enabled
            : result === "denied"
              ? strings.notify.denied
              : result === "unsupported"
                ? strings.notify.unsupported
                : strings.notify.disabled;
    toasts.show(text, result === "on" ? "info" : "error");
});
renderNotifyButton();
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
 * Código de convite pendente: o do link que abriu a página (`#/s/código`).
 * Vale para a primeira entrada; depois a sala aberta é que manda.
 * @type {string | null}
 */
let pendingInvite = readInviteHash(location.hash);

/** Correlação dos pedidos de sala (criar ou entrar). */
const ROOM_REQUEST_ID = "entrada-sala";
/**
 * Pedido de sala em andamento, feito por você: a sala que chegar em
 * resposta é aberta na tela. `fromEntry`: veio do link de convite, logo
 * depois de entrar (recusa leva ao início, com o motivo).
 * @type {{kind: "create" | "join", fromEntry: boolean} | null}
 */
let roomRequest = null;

/** Arroba de quem você pediu para abrir conversa privada (a resposta é aberta). */
let pendingDm = /** @type {string | null} */ (null);

/** Conversas privadas que VOCÊ encerrou ou bloqueou (o aviso é outro). */
const closingByMe = new Map();

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
        // Numa retomada o servidor usa o username guardado; o enviado só
        // vale se a identidade não puder ser retomada (ex.: servidor
        // reiniciou) — aí ela é recriada com o mesmo @, se estiver livre.
        transport.send(CLIENT_EVENTS.LOGIN, {
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
 * Rascunho de cada conversa (só em memória, como todo o resto): trocar de
 * conversa guarda o que estava escrito e traz o da outra. Assim o texto
 * nunca "viaja" para a conversa errada.
 * @type {Map<string, string>}
 */
const drafts = new Map();

/**
 * Mensagens suas a caminho: o texto fica guardado até o servidor confirmar.
 * Se o servidor recusar de vez (silenciado, limite, conteúdo inválido), o
 * texto volta para o rascunho da conversa certa em vez de se perder.
 * @type {Map<string, {conversationId: string, text: string}>}
 */
const inFlight = new Map();

/** Recusas em que o servidor certamente NÃO guardou a mensagem. @type {Set<string>} */
const DEFINITE_REJECTIONS = new Set([
    ERROR_CODES.MUTED,
    ERROR_CODES.RATE_LIMITED,
    ERROR_CODES.INVALID_MESSAGE,
]);

/** De qual conversa é o texto que está no campo agora. @type {string | null} */
let composerOwner = null;

/**
 * Põe no campo o rascunho da conversa `id` (ou nada, fora de conversa),
 * guardando antes o da conversa dona do texto atual — se ela ainda existe.
 * Chamado na troca por clique (na hora) e a cada desenho (para trocas que
 * vêm do servidor, como sair ou ser removido da conversa aberta).
 * @param {string | null} id
 */
const syncDraft = (id) => {
    if (id === composerOwner) return;
    if (composerOwner) {
        const owner = composerOwner;
        const alive = store.getState().conversations.some((e) => e.conversationId === owner);
        const text = composer.getValue();
        if (alive && text) drafts.set(owner, text);
        else drafts.delete(owner);
    }
    composer.restore(id ? (drafts.get(id) ?? "") : "");
    composerOwner = id;
};

/**
 * Abre uma conversa da lista. A digitação em curso termina na conversa
 * anterior, e quem estava "digitando" lá some da tela.
 * @param {string} conversationId
 */
const openConversation = (conversationId) => {
    if (store.getState().room?.conversationId === conversationId) {
        store.actions.openConversation(conversationId);
        return;
    }
    typingSignal.stop();
    typingTracker.clear();
    memberCard.close({ restoreFocus: false });
    if (store.actions.openConversation(conversationId)) syncDraft(conversationId);
};

/** Volta ao início; as conversas continuam na lista, recebendo mensagens. */
const goHome = () => {
    typingSignal.stop();
    typingTracker.clear();
    memberCard.close({ restoreFocus: false });
    syncDraft(null);
    store.actions.goHome();
};

/**
 * Pede uma sala ao servidor (criar ou entrar). A resposta (`room_joined`)
 * abre a sala; a recusa volta com o motivo.
 * @param {"create" | "join"} kind
 * @param {{name?: string, code?: string}} detail
 * @param {boolean} [fromEntry]
 */
const requestRoom = (kind, detail, fromEntry = false) => {
    roomRequest = { kind, fromEntry };
    if (kind === "join") {
        transport.send(CLIENT_EVENTS.ROOM_JOIN, { code: detail.code, requestId: ROOM_REQUEST_ID });
    } else {
        transport.send(CLIENT_EVENTS.ROOM_CREATE, {
            ...(detail.name ? { name: detail.name } : {}),
            requestId: ROOM_REQUEST_ID,
        });
    }
};

/**
 * Pede a conversa privada com alguém pelo @ exato. O servidor responde com
 * `dm_opened` (aberta na tela) ou com a recusa (pessoa indisponível, limite).
 * @param {string} username
 */
const requestDm = (username) => {
    if (username === store.getState().me?.username) {
        home.settle(strings.conversations.homeSelf);
        return;
    }
    const existing = store
        .getState()
        .conversations.find((entry) => entry.kind === "dm" && entry.peer?.username === username);
    if (existing) {
        home.settle();
        openConversation(existing.conversationId);
        return;
    }
    pendingDm = username;
    transport.send(CLIENT_EVENTS.DM_OPEN, { username });
};

/**
 * Envia uma mensagem comum. Ela aparece na hora como "enviando…" e é
 * confirmada quando o servidor a devolve com o mesmo `clientMsgId`.
 * @param {string} content
 */
const sendChat = (content) => {
    const me = store.getState().me;
    if (!me) return;
    const clientMsgId = crypto.randomUUID();
    const conversationId = store.getState().room?.conversationId;
    if (conversationId) inFlight.set(clientMsgId, { conversationId, text: content });
    const sent = transport.send(CLIENT_EVENTS.CHAT_MESSAGE, inRoom({ content, clientMsgId }));
    store.actions.addMessage({
        id: `local:${clientMsgId}`,
        key: `c:${clientMsgId}`,
        kind: "chat",
        userId: me.id,
        userName: me.name,
        ...(me.username ? { username: me.username } : {}),
        ...(typeof store.getState().room?.author === "number"
            ? { author: /** @type {number} */ (store.getState().room?.author) }
            : {}),
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
    openDirect: (username) => {
        layout.closeDrawer();
        requestDm(username);
    },
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
    // A preferência de notificação é desta participação.
    notifier.disable();
    renderNotifyButton();
    typingSignal.stop();
    transport.signal(CLIENT_EVENTS.LOGOUT);
    transport.close();
    resumeToken = null;
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
    pendingDm = null;
    closingByMe.clear();
    drafts.clear();
    inFlight.clear();
    composerOwner = null;
    home.clear();
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
 * Depois de uma sessão nova (não retomada): a sala do convite, ou a sala
 * que estava aberta se o servidor reiniciou e a identidade é outra. Sem
 * nenhuma das duas, o início — nenhuma sala é criada sem você pedir. Numa
 * retomada o servidor devolve as conversas sozinho.
 */
const afterNewSession = () => {
    const state = store.getState();
    const code = (state.room?.kind !== "dm" ? state.room?.code : null) ?? pendingInvite;
    // Identidade nova: a participação anterior não existe mais no servidor.
    store.actions.forgetRoom();
    pendingDm = null;
    // Já dentro do chat (o servidor reiniciou): o início fica na tela até a
    // sala voltar — se ela não voltar, a pessoa não fica numa conversa vazia.
    if (!state.joining) store.actions.goHome();
    if (code) {
        requestRoom("join", { code }, state.joining);
        return;
    }
    if (state.joining) store.actions.completeLogin();
};

for (const button of document.querySelectorAll('[data-action="logout"]')) {
    button.addEventListener("click", () => void logout());
}

const home = createHome({
    onCreate: (name) => requestRoom("create", { name }),
    onJoin: (code) => requestRoom("join", { code }),
    onDirect: (username) => requestDm(username),
});

const conversationNavs = [...document.querySelectorAll("[data-conversation-nav]")].map(
    (container) =>
        createConversationNav({
            container: /** @type {HTMLElement} */ (container),
            onOpen: (conversationId) => {
                layout.closeDrawer();
                openConversation(conversationId);
                composer.focus();
            },
        }),
);

// Link de convite colado nesta aba com o chat já aberto: só o `#` muda, a
// página não recarrega. Se é de uma sala que você já tem, ela é aberta; se
// não, é pedida ao servidor como "entrar com código".
window.addEventListener("hashchange", () => {
    const code = readInviteHash(location.hash);
    const state = store.getState();
    if (!code || state.screen === "entry") return;
    if (state.room?.code === code) return;
    const known = state.conversations.find((entry) => entry.code === code);
    if (known) {
        openConversation(known.conversationId);
        return;
    }
    requestRoom("join", { code });
});

for (const button of document.querySelectorAll("[data-go-home]")) {
    button.addEventListener("click", () => {
        layout.closeDrawer();
        goHome();
    });
}

/** Ações do cabeçalho da conversa aberta. @type {Record<string, () => Promise<void> | void>} */
const conversationActions = {
    invite: async () => {
        const room = store.getState().room;
        if (!room?.code) return;
        const link = `${location.origin}${location.pathname}${inviteHash(room.code)}`;
        try {
            await navigator.clipboard.writeText(link);
            toasts.show(strings.conversations.inviteCopied);
        } catch {
            toasts.show(format(strings.conversations.inviteCopyFailed, { code: room.code }));
        }
    },
    leave: async () => {
        const room = store.getState().room;
        if (!room) return;
        const dm = room.kind === "dm";
        const ok = await dialog.confirm(
            dm
                ? {
                      title: format(strings.conversations.closeDmTitle, { name: room.name }),
                      body: strings.conversations.closeDmBody,
                      confirmLabel: strings.conversations.closeDmConfirm,
                  }
                : {
                      title: format(strings.conversations.leaveRoomTitle, { name: room.name }),
                      body: strings.conversations.leaveRoomBody,
                      confirmLabel: strings.conversations.leaveRoomConfirm,
                  },
        );
        if (!ok) return;
        typingSignal.stop();
        if (dm) {
            closingByMe.set(room.conversationId, "closed");
            transport.send(CLIENT_EVENTS.DM_CLOSE, { conversationId: room.conversationId });
        } else {
            transport.send(CLIENT_EVENTS.ROOM_LEAVE, { conversationId: room.conversationId });
        }
    },
    block: async () => {
        const room = store.getState().room;
        if (room?.kind !== "dm" || !room.peer) return;
        const ok = await dialog.confirm({
            title: format(strings.conversations.blockTitle, { name: room.name }),
            body: strings.conversations.blockBody,
            confirmLabel: strings.conversations.blockConfirm,
        });
        if (!ok) return;
        typingSignal.stop();
        closingByMe.set(room.conversationId, "blocked");
        transport.send(CLIENT_EVENTS.USER_BLOCK, { username: room.peer.username });
    },
};

for (const button of document.querySelectorAll("[data-conversation-action]")) {
    const run = conversationActions[button.getAttribute("data-conversation-action") ?? ""];
    if (!run) continue;
    button.addEventListener("click", () => void Promise.resolve(run()));
}

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
        if (!resumed) afterNewSession();
        else if (store.getState().joining && store.getState().conversations.length === 0) {
            // Retomada sem conversa nenhuma: direto para o início.
            store.actions.completeLogin();
        }
    },
    onRoomJoined: (room, how) => {
        pendingInvite = null;
        if (roomRequest) {
            // Resposta a um pedido seu (criar, entrar por código ou link).
            roomRequest = null;
            home.settle();
            home.clear();
            openConversation(room.conversationId);
        } else if (!how.resumed && store.getState().room === null) {
            store.actions.completeJoin();
        }
    },
    onRoomRefused: (code, message) => {
        const request = roomRequest;
        roomRequest = null;
        if (request?.fromEntry) {
            // Convite que não deu certo (código errado, sala que já acabou,
            // remoção): a pessoa vai para o início, com o motivo.
            pendingInvite = null;
            const text = format(strings.room.inviteFailed, { reason: message });
            store.actions.completeLogin();
            home.settle(text);
            toasts.show(text, "error", { announce: false });
            return;
        }
        if (store.getState().screen === "home") home.settle(message);
        else toasts.show(message, "error");
    },
    onRoomLeft: (reason, room) => {
        if (reason === "removed") {
            toasts.show(strings.room.removed, "error");
            announcer.say(strings.room.removed, { force: true });
        } else if (room) {
            announcer.say(format(strings.conversations.leftRoom, { name: room.name }), {
                force: true,
            });
        }
    },
    onDmOpened: (dm, how) => {
        if (pendingDm && dm.peer?.username === pendingDm) {
            pendingDm = null;
            home.settle();
            home.clear();
            openConversation(dm.conversationId);
            return;
        }
        if (!how.resumed && store.getState().room?.conversationId !== dm.conversationId) {
            // Alguém começou uma conversa com você: aparece na lista, com aviso.
            toasts.show(format(strings.conversations.dmIncoming, { name: dm.name }));
        }
    },
    onDmClosed: (reason, dm) => {
        const id = dm?.conversationId ?? "";
        const mine = closingByMe.get(id);
        closingByMe.delete(id);
        const name = dm?.name ?? "";
        const text =
            mine === "blocked"
                ? format(strings.conversations.blocked, { name })
                : mine === "closed"
                  ? format(strings.conversations.dmClosedSelf, { name })
                  : reason === "ended"
                    ? format(strings.conversations.dmEnded, { name })
                    : format(strings.conversations.dmClosedByPeer, { name });
        toasts.show(text);
    },
    onOwnConfirmed: (clientMsgId) => {
        inFlight.delete(clientMsgId);
    },
    onSendRejected: (clientMsgId, code, reason) => {
        const flight = inFlight.get(clientMsgId);
        if (!flight || !DEFINITE_REJECTIONS.has(code)) return;
        const state = store.getState();
        const alive = state.conversations.some(
            (entry) => entry.conversationId === flight.conversationId,
        );
        if (!alive) return;
        const open = composerOwner === flight.conversationId;
        const current = open ? composer.getValue() : (drafts.get(flight.conversationId) ?? "");
        // Só devolve se o rascunho daquela conversa estiver vazio: nunca
        // apaga o que a pessoa já começou a escrever depois.
        if (current.trim()) return;
        inFlight.delete(clientMsgId);
        store.actions.discardFailed(clientMsgId);
        if (open) composer.restore(flight.text);
        else drafts.set(flight.conversationId, flight.text);
        announcer.say(format(strings.delivery.returned, { reason }), { force: true });
    },
    onDmRefused: (_code, message) => {
        pendingDm = null;
        if (store.getState().screen === "home") home.settle(message);
        else toasts.show(message, "error");
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
        typingTracker.clear();
        store.actions.leaveRoom();
        // A tela de entrada precisa estar visível antes de receber o foco.
        renderLoop.flush();
        entry.reset(message, field);
    },
});

/** Título da aba sem a contagem de não lidas. */
const baseTitle = document.title;

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
    const inApp = state.screen !== "entry";
    const isDm = state.room?.kind === "dm";
    const noMessages = state.messages.length === 0;
    const wasEmpty = previous ? previous.messages.length === 0 : null;

    if (changed(state, previous, ["screen", "room"])) {
        shell.dataset.screen = state.screen;
        entry.setVisible(!inApp);
        home.setVisible(state.screen === "home");
        room.hidden = !inRoom;
        composer.setVisible(inRoom);
        layout.setInRoom(inApp, inRoom && !isDm);
        if (!inRoom) memberCard.close({ restoreFocus: false });
    }
    if (changed(state, previous, ["conversations", "room", "screen"])) {
        const current = inRoom ? (state.room?.conversationId ?? null) : null;
        for (const nav of conversationNavs) nav.render(state.conversations, current);
        // O endereço da página é o convite da sala aberta; fora dela, nenhum.
        if (inApp) {
            const hash = inRoom && state.room?.code && !isDm ? inviteHash(state.room.code) : "";
            if (location.hash !== hash) {
                history.replaceState(null, "", hash || location.pathname + location.search);
            }
        }
    }
    if (changed(state, previous, ["conversations"])) {
        // Total de não lidas no título da aba: "(3) web-chat · …".
        const total = state.conversations.reduce((sum, entry) => sum + entry.unread, 0);
        document.title = total > 0 ? `(${total > 99 ? "99+" : total}) ${baseTitle}` : baseTitle;
    }
    if (changed(state, previous, ["me", "conversations"])) {
        home.render(state.me, state.conversations.length);
    }

    if (changed(state, previous, ["link", "attempt"])) {
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
    if (changed(state, previous, ["screen", "room"])) {
        syncDraft(inRoom ? (state.room?.conversationId ?? null) : null);
    }
    if (changed(state, previous, ["messages"])) messageList.render(state.messages);
    if (changed(state, previous, ["messages", "authorsSeen", "authorsLeft", "room"])) {
        messageList.setDeparted(departedAuthors(state));
    }
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
    // da conversa o foco vai para o composer e a mudança de contexto é
    // anunciada; no início, o foco vai para o título.
    const switched =
        inRoom &&
        lastScreen === "room" &&
        previous?.room?.conversationId !== state.room?.conversationId &&
        state.room !== null;
    if ((inRoom && lastScreen !== "room") || switched) {
        composer.focus();
        announcer.say(
            switched || lastScreen === "home"
                ? format(strings.a11y.openedConversation, { name: state.room?.name ?? "" })
                : strings.a11y.enteredRoom,
            { force: true },
        );
    }
    if (state.screen === "home" && lastScreen !== "home") {
        home.focus();
        announcer.say(strings.a11y.home, { force: true });
    }
    lastScreen = state.screen;

    if (state.link !== lastLink) {
        announcer.say(linkAnnouncement(state));
        lastLink = state.link;
    }
};

const renderLoop = createRenderLoop({ getState: () => store.getState(), render });

// Aba escondida: mensagens na conversa aberta contam como não lidas até a
// pessoa voltar a ela.
document.addEventListener("visibilitychange", () =>
    store.actions.setPageVisible(document.visibilityState === "visible"),
);
store.actions.setPageVisible(document.visibilityState === "visible");
store.subscribe(() => renderLoop.request());

// Estado inicial: pinta a tela de entrada sem esperar por nenhum evento.
//
// Sem foco automático no campo de nome, de propósito: focar um campo no
// carregamento rouba o primeiro Tab e torna o skip link inalcançável, além
// de mover o foco sem que o usuário tenha pedido. O foco só é movido na
// troca de tela, que é mudança de contexto e precisa ser anunciada.
entry.setVisible(true);
themeToggle.current();
