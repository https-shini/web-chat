// @ts-check

import "./css/tokens.css";
import "./css/base/reset.css";
import "./css/base/typography.css";
import "./css/base/a11y.css";
import "./css/base/motion.css";
import "./css/components/app-shell.css";
import "./css/components/skip-link.css";
import "./css/components/button.css";
import "./css/components/field.css";
import "./css/components/entry.css";
import "./css/components/composer.css";
import "./css/components/thread.css";
import "./css/components/message-list.css";
import "./css/components/identity.css";
import "./css/components/message.css";
import "./css/components/typing.css";
import "./css/components/connection.css";
import "./css/components/people.css";
import "./css/components/toast.css";
import "./css/components/empty.css";
import "./css/components/failure.css";
import "./css/components/theme-toggle.css";

import { SOCKET_URL, TIMING } from "./config.js";
import { createAnnouncer } from "./a11y/announce.js";
import { format, strings } from "./i18n/strings.js";
import { createEventHandler } from "./state/events.js";
import { createStore } from "./state/store.js";
import { createTypingTracker } from "./state/typing.js";
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

/** @type {(event: {type: string, payload: unknown}) => void} */
let handleEvent = () => {};

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
        transport.send("user_login", { userId: me.id, userName: me.name });
    },
    onEvent: (event) => handleEvent(event),
});

handleEvent = createEventHandler({ store, toasts, notifier, typingTracker });

/** @type {ReturnType<typeof setTimeout> | null} */
let typingTimer = null;

const composer = createComposer({
    onSend: (content) => {
        // Gesto do usuário: é aqui, e só aqui, que a permissão de
        // notificação pode ser pedida.
        notifier.requestOnGesture();
        transport.send("chat_message", { content });
        if (typingTimer) clearTimeout(typingTimer);
        transport.signal("typing_stop");
    },
    onTyping: () => {
        transport.signal("typing_start");
        if (typingTimer) clearTimeout(typingTimer);
        typingTimer = setTimeout(() => transport.signal("typing_stop"), TIMING.typingIdle);
    },
});

const failure = createFailure({
    onRetry: () => transport.retryNow(),
});

const entry = createEntry({
    onSubmit: (name) => {
        store.actions.enterRoom({ id: crypto.randomUUID(), name });
        transport.open();
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

store.subscribe((state) => {
    const inRoom = state.screen === "room";

    shell.dataset.screen = state.screen;
    entry.setVisible(!inRoom);
    header.hidden = !inRoom;
    room.hidden = !inRoom;
    composer.setVisible(inRoom);

    const noMessages = state.messages.length === 0;
    connection.render(state.link, state.attempt, noMessages);
    empty.render(inRoom && state.link === "online" && noMessages);
    failure.render(inRoom && state.link === "offline", state.maxAttempts);

    typing.render(state.typing);
    messageList.render(state.messages);
    people.render(state.people, state.me?.id ?? null, state.link === "online");
    composer.render(state.link, state.queued);

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
});

// Estado inicial: pinta a tela de entrada sem esperar por nenhum evento.
//
// Sem foco automático no campo de nome, de propósito: focar um campo no
// carregamento rouba o primeiro Tab e torna o skip link inalcançável, além
// de mover o foco sem que o usuário tenha pedido. O foco só é movido na
// troca de tela, que é mudança de contexto e precisa ser anunciada.
entry.setVisible(true);
themeToggle.current();
