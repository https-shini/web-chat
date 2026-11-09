// @ts-check

/**
 * Página inicial após a identificação. Nenhuma sala é criada implicitamente.
 * Os botões delegam operações ao compositor; permissões ficam no servidor.
 */
import { normalizeRoomCode } from "../state/invite.js";

export const createHome = ({ onCreate, onJoin, onDirect }) => {
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
        </div>`;
    document.querySelector(".c-app")?.append(section);
    const identity = section.querySelector(".c-home__identity");
    const form = /** @type {HTMLFormElement} */ (section.querySelector("form"));
    const input = /** @type {HTMLInputElement} */ (section.querySelector("input"));
    const notice = section.querySelector(".c-home__notice");
    section.querySelector('[data-home-action="create"]')?.addEventListener("click", onCreate);
    section.querySelector('[data-home-action="join"]')?.addEventListener("click", () => {
        form.hidden = false;
        input.focus();
    });
    section.querySelector('[data-home-action="cancel"]')?.addEventListener("click", () => {
        form.hidden = true;
    });
    section.querySelector('[data-home-action="direct"]')?.addEventListener("click", onDirect);
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
        focus() {
            section.querySelector("h1")?.setAttribute("tabindex", "-1");
            /** @type {HTMLElement | null} */ (section.querySelector("h1"))?.focus();
        },
    };
};
