// @ts-check

/**
 * Página inicial após a identificação. Nenhuma sala é criada implicitamente.
 * Os botões delegam operações ao compositor; permissões ficam no servidor.
 */
import { normalizeRoomCode } from "../state/invite.js";

/**
 * @param {{
 *   onCreate: () => void,
 *   onJoin: (code: string) => void,
 *   onDirect: () => void,
 *   onOpen: (id: string) => void,
 *   onLeave: (id: string) => void,
 * }} actions
 */
export const createHome = ({ onCreate, onJoin, onDirect, onOpen, onLeave }) => {
    const section = document.createElement("section");
    section.className = "c-home";
    section.hidden = true;
    section.setAttribute("aria-label", "Início");
    section.innerHTML = `
        <div class="c-home__content">
            <p class="c-home__eyebrow">WEB CHAT</p>
            <h1 class="c-home__title">Suas conversas começam aqui.</h1>
            <p class="c-home__identity"></p>
            <p class="c-home__description">Crie uma sala, entre por convite ou converse diretamente com alguém.</p>
            <div class="c-home__actions">
                <button type="button" data-home-action="create">+ Criar sala</button>
                <button type="button" data-home-action="join">Entrar com código</button>
                <button type="button" data-home-action="direct">Mensagem direta por @</button>
            </div>
            <form class="c-home__join" hidden>
                <label for="home-room-code">Código ou link de convite</label>
                <input id="home-room-code" name="code" autocomplete="off" required />
                <button type="submit">Entrar na sala</button>
                <button type="button" data-home-action="cancel">Cancelar</button>
            </form>
            <p class="c-home__notice" role="status" aria-live="polite"></p>
            <div class="c-home__connection" role="status"></div>
            <section aria-label="Conversas ativas" class="c-home__conversations">
                <h2>Suas salas</h2>
                <p class="c-home__empty">Nenhuma sala ativa. Crie uma ou entre com um convite.</p>
                <ul class="c-home__conversation-list"></ul>
            </section>
        </div>`;
    document.querySelector(".c-app")?.append(section);
    const identity = section.querySelector(".c-home__identity");
    const form = /** @type {HTMLFormElement} */ (section.querySelector("form"));
    const input = /** @type {HTMLInputElement} */ (section.querySelector("input"));
    const notice = section.querySelector(".c-home__notice");
    const connection = section.querySelector(".c-home__connection");
    const list = /** @type {HTMLUListElement} */ (
        section.querySelector(".c-home__conversation-list")
    );
    const empty = section.querySelector(".c-home__empty");
    section.querySelector('[data-home-action="create"]')?.addEventListener("click", onCreate);
    section.querySelector('[data-home-action="join"]')?.addEventListener("click", () => {
        form.hidden = false;
        input.focus();
    });
    section.querySelector('[data-home-action="cancel"]')?.addEventListener("click", () => {
        form.hidden = true;
    });
    section.querySelector('[data-home-action="direct"]')?.addEventListener("click", onDirect);
    list.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button[data-conversation-id]");
        if (!(button instanceof HTMLButtonElement)) return;
        const id = button.dataset.conversationId;
        if (!id) return;
        if (button.dataset.action === "leave") onLeave(id);
        else onOpen(id);
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const raw = input.value.trim();
        const code = normalizeRoomCode(raw);
        if (!code) {
            showNotice("Informe um código ou link de convite válido.");
            return;
        }
        onJoin(code);
    });
    const showNotice = (message) => {
        if (notice) notice.textContent = message;
    };
    return {
        setVisible(visible) {
            section.hidden = !visible;
        },
        setIdentity(name, username) {
            if (identity) identity.textContent = `${name} · @${username}`;
        },
        setInvite(code) {
            if (!code) return;
            form.hidden = false;
            input.value = code;
            showNotice("Convite encontrado. Confirme para entrar na sala.");
        },
        showNotice,
        /** @param {import("../state/store.js").State["conversations"]} conversations */
        renderConversations(conversations) {
            list.replaceChildren();
            if (empty) empty.hidden = conversations.length > 0;
            for (const room of conversations) {
                const item = document.createElement("li");
                item.className = "c-home__conversation";
                const open = document.createElement("button");
                open.type = "button";
                open.dataset.conversationId = room.conversationId;
                open.dataset.action = "open";
                const title = document.createElement("strong");
                title.textContent = room.name;
                const detail = document.createElement("span");
                detail.textContent = room.unread
                    ? " · " + room.unread + " não lida(s)"
                    : room.lastMessage
                      ? " · " + room.lastMessage.slice(0, 80)
                      : " · Sem mensagens recentes";
                open.append(title, detail);
                const leave = document.createElement("button");
                leave.type = "button";
                leave.dataset.conversationId = room.conversationId;
                leave.dataset.action = "leave";
                leave.textContent = "Sair da sala";
                leave.setAttribute("aria-label", "Sair da sala " + room.name);
                item.append(open, leave);
                list.append(item);
            }
        },
        /** @param {import("../state/store.js").LinkState} link */
        setConnection(link) {
            if (connection) {
                connection.textContent =
                    link === "online"
                        ? "Conectado"
                        : link === "retrying" || link === "connecting"
                          ? "Reconectando…"
                          : link === "offline"
                            ? "Sem conexão"
                            : "Aguardando conexão";
            }
        },
        focus() {
            section.querySelector("h1")?.setAttribute("tabindex", "-1");
            /** @type {HTMLElement | null} */ (section.querySelector("h1"))?.focus();
        },
    };
};
