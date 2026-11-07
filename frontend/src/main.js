// @ts-check

import { SOCKET_URL, TIMING } from "./config.js";
import { CLIENT_EVENTS } from "./protocol.js";
import { createAnnouncer } from "./a11y/announce.js";
import { format, strings } from "./i18n/strings.js";
import { createEventHandler } from "./state/events.js";
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
import { createMessageList } from "./ui/messageList.js";
import { createPeople } from "./ui/people.js";
import { createThemeToggle } from "./ui/themeToggle.js";
import { createToasts } from "./ui/toast.js";
import { createTyping } from "./ui/typing.js";
import { createNotifier } from "./ui/notify.js";

/**
 * Raiz de composição. É o único lugar em que transporte, estado e interface
 * se conhecem: `ui/` e `state/` não sabem que existe um canal em tempo real,
 * e `transport/` não sabe que existe um DOM.
 */

const store = createStore();

const header = /** @type {HTMLElement} */ (must(".c-app__header"));
const room = /** @type {HTMLElement} */ (must(".c-room"));
const shell = /** @type {HTMLElement} */ (must(".c-app"));

const announcer = createAnnouncer();
const connection = createConnection();
const empty = createEmpty();
const messageList = createMessageList();
const typing = createTyping();
const notifier = createNotifier();
const people = createPeople();
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

/** Último texto enviado, para devolvê-lo ao campo se o servidor recusar. */
let lastSent = "";

const transport = createTransport({
    url: SOCKET_URL,
    onStatus: (status, detail) => {
        if (status !== "online") typingTracker.clear();
        store.actions.setLink(status, detail);
    },
    onQueueChange: (queued) => {
        store.actions.setQueued(queued);
    },
    onOpen: () => {
        const me = store.getState().me;
        if (!me) return;
        // `userId` é ignorado pelo servidor atual (que atribui a identidade)
        // e mantido só para compatibilidade com um servidor antigo.
        transport.send(CLIENT_EVENTS.LOGIN, {
            userId: me.id,
            userName: me.name,
            ...(resumeToken ? { resumeToken } : {}),
        });
    },
    onEvent: (event) => handleEvent(event),
});

const typingSignal = createTypingSignal({
    send: (type) => transport.signal(type),
    interval: TIMING.typingSignalInterval,
    idle: TIMING.typingIdle,
});

const composer = createComposer({
    onSend: (content) => {
        // Gesto do usuário: é aqui, e só aqui, que a permissão de
        // notificação pode ser pedida.
        notifier.requestOnGesture();
        lastSent = content;
        transport.send(CLIENT_EVENTS.CHAT_MESSAGE, { content });
        typingSignal.stop();
    },
    onTyping: () => typingSignal.input(),
});

const failure = createFailure({
    onRetry: () => transport.retryNow(),
});

const entry = createEntry({
    onSubmit: (name) => {
        // Id provisório: o definitivo chega do servidor no evento `session`.
        store.actions.enterRoom({ id: crypto.randomUUID(), name });
        transport.open();
    },
});

handleEvent = createEventHandler({
    store,
    toasts,
    notifier,
    typingTracker,
    onSession: (token) => {
        resumeToken = token;
    },
    onRateLimited: () => composer.restoreDraft(lastSent),
    onLoginRejected: (message) => {
        // Entrada recusada pelo servidor: a pessoa volta à tela do nome com
        // a explicação, em vez de ficar numa sala em que não pode falar.
        transport.close();
        resumeToken = null;
        typingTracker.clear();
        store.actions.leaveRoom();
        // A tela de entrada precisa estar visível antes de receber o foco.
        renderLoop.flush();
        entry.reset(message);
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
        entry.setVisible(!inRoom);
        header.hidden = !inRoom;
        room.hidden = !inRoom;
        composer.setVisible(inRoom);
    }

    if (changed(state, previous, ["link", "attempt"]) || noMessages !== wasEmpty) {
        connection.render(state.link, state.attempt, noMessages);
    }
    if (changed(state, previous, ["screen", "link"]) || noMessages !== wasEmpty) {
        empty.render(inRoom && state.link === "online" && noMessages);
    }
    if (changed(state, previous, ["screen", "link", "maxAttempts"])) {
        failure.render(inRoom && state.link === "offline", state.maxAttempts);
    }
    if (changed(state, previous, ["typing"])) typing.render(state.typing);
    if (changed(state, previous, ["messages"])) messageList.render(state.messages);
    if (changed(state, previous, ["people", "me", "link"])) {
        people.render(state.people, state.me?.id ?? null, state.link === "online");
    }
    if (changed(state, previous, ["link", "queued"])) composer.render(state.link, state.queued);

    // Trocar `display` sem mover o foco é bug de acessibilidade: na entrada
    // da sala o foco vai para o composer e a mudança de contexto é anunciada.
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
