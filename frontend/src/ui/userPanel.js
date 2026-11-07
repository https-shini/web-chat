// @ts-check

import { strings } from "../i18n/strings.js";
import { must } from "./dom.js";
import { renderIdentity } from "./identity.js";

/**
 * Painel "você" no pé da barra lateral: avatar, nome, presença e o botão de
 * ausência (que envia o comando real /afk). Mostra também, para
 * administradores, a seção de administração da barra.
 *
 * @typedef {import("../state/store.js").Person} Person
 */

/**
 * @param {{onToggleAway: () => void}} handlers
 */
export const createUserPanel = ({ onToggleAway }) => {
    const avatar = /** @type {HTMLElement} */ (must(".c-user-panel__avatar"));
    const name = /** @type {HTMLElement} */ (must(".c-user-panel__name"));
    const status = /** @type {HTMLElement} */ (must(".c-user-panel__status"));
    const away = /** @type {HTMLButtonElement} */ (must('[data-action="toggle-away"]'));
    const adminOnly = /** @type {HTMLElement[]} */ ([
        ...document.querySelectorAll("[data-admin-only]"),
    ]);

    away.addEventListener("click", onToggleAway);

    return {
        /**
         * @param {Person | null} me
         * @param {Person | undefined} listed  você na lista do servidor (presença real)
         * @param {"member" | "admin"} role
         * @param {boolean} online
         */
        render(me, listed, role, online) {
            for (const node of adminOnly) node.hidden = role !== "admin";
            if (!me) return;
            const isAway = listed?.status === "away";
            avatar.replaceChildren(
                renderIdentity({
                    id: me.id,
                    name: me.name,
                    own: true,
                    withName: false,
                    presence: online ? (isAway ? "away" : "online") : null,
                }),
            );
            name.textContent = me.name;
            const presence = !online
                ? strings.conn.offline
                : isAway
                  ? strings.userPanel.away
                  : strings.userPanel.online;
            status.textContent =
                role === "admin" ? `${strings.userPanel.admin} · ${presence}` : presence;

            // Nome fixo + aria-pressed: o estado é anunciado, o nome não muda.
            // Só a dica visual diz o que o próximo clique faz.
            away.setAttribute("aria-pressed", String(isAway));
            away.setAttribute("aria-label", strings.userPanel.goAway);
            away.dataset.tooltip = isAway ? strings.userPanel.comeBack : strings.userPanel.goAway;
            away.disabled = !online;
        },
    };
};
