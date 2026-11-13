// @ts-check

import { format, strings } from "../i18n/strings.js";
import { normalizeRoomCode } from "../state/invite.js";
import { must } from "./dom.js";
import { isUsernameFormatValid, normalizeUsername as normalize } from "./entry.js";

/**
 * Normaliza o @ digitado (com ou sem arroba, maiúsculas viram minúsculas).
 * Só checa o formato: quem decide se a pessoa existe é o servidor.
 * @param {string} raw
 * @returns {string | null}
 */
export const readUsername = (raw) => {
    const value = normalize(raw);
    return isUsernameFormatValid(value) ? value : null;
};

/**
 * Tela de início: aparece quando nenhuma conversa está aberta (depois de
 * entrar sem convite, ou ao voltar pelo "Início"). Três caminhos, cada um
 * um formulário de verdade (Enter envia, rótulo visível, erro anunciado):
 * criar sala, entrar com código, conversa privada pelo @ exato.
 *
 * Validação aqui é só de formato, para responder rápido; permissão, limite
 * e existência são decididos pelo servidor.
 *
 * @param {{
 *   onCreate: (name: string) => void,
 *   onJoin: (code: string) => void,
 *   onDirect: (username: string) => void,
 * }} actions
 */
export const createHome = ({ onCreate, onJoin, onDirect }) => {
    const section = /** @type {HTMLElement} */ (must(".c-home"));
    const title = /** @type {HTMLElement} */ (must(".c-home__title", section));
    const feedback = /** @type {HTMLElement} */ (must(".c-home__feedback", section));
    const empty = /** @type {HTMLElement} */ (must(".c-home__empty", section));
    const forms = /** @type {HTMLFormElement[]} */ ([
        ...section.querySelectorAll("form[data-home-form]"),
    ]);

    /** @param {string} text @param {"error" | "info"} [kind] */
    const say = (text, kind = "error") => {
        feedback.textContent = text;
        feedback.dataset.kind = kind;
    };

    /** @param {HTMLFormElement} form @param {boolean} busy */
    const setBusy = (form, busy) => {
        const button = form.querySelector('button[type="submit"]');
        if (button instanceof HTMLButtonElement) button.disabled = busy;
        form.setAttribute("aria-busy", String(busy));
    };

    for (const form of forms) {
        const input = /** @type {HTMLInputElement} */ (must("input", form));
        input.addEventListener("input", () => {
            input.removeAttribute("aria-invalid");
            if (feedback.dataset.kind === "error") say("", "info");
        });
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const kind = form.dataset.homeForm;
            /** @param {string} message */
            const invalid = (message) => {
                input.setAttribute("aria-invalid", "true");
                say(message);
                input.focus();
            };
            if (kind === "create") {
                say(strings.conversations.homeWorking, "info");
                setBusy(form, true);
                onCreate(input.value.trim());
                return;
            }
            if (kind === "join") {
                const code = normalizeRoomCode(input.value);
                if (!code) return invalid(strings.conversations.homeInvalidCode);
                say(strings.conversations.homeWorking, "info");
                setBusy(form, true);
                onJoin(code);
                return;
            }
            const username = readUsername(input.value);
            if (!username) return invalid(strings.conversations.homeInvalidUser);
            say(strings.conversations.homeWorking, "info");
            setBusy(form, true);
            onDirect(username);
        });
    }

    return {
        /** @param {boolean} visible */
        setVisible(visible) {
            section.hidden = !visible;
        },

        /**
         * @param {{name: string} | null} me
         * @param {number} conversations quantas conversas abertas
         */
        render(me, conversations) {
            title.textContent = me?.name
                ? format(strings.conversations.homeGreeting, { name: me.name })
                : "Olá!";
            empty.hidden = conversations > 0;
        },

        /**
         * Resultado de um pedido feito daqui: libera os formulários e, se
         * deu errado, mostra o motivo (vindo do servidor).
         * @param {string} [error]
         */
        settle(error) {
            for (const form of forms) setBusy(form, false);
            if (error) say(error);
            else say("", "info");
        },

        /** Limpa campos e avisos (nova participação). */
        clear() {
            for (const form of forms) {
                form.reset();
                setBusy(form, false);
            }
            say("", "info");
        },

        /** Foco no título: mudança de contexto anunciada sem roubar um campo. */
        focus() {
            title.focus();
        },
    };
};
