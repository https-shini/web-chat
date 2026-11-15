// @ts-check

import { format, strings } from "../i18n/strings.js";
import { must } from "./dom.js";
import { renderIdentity } from "./identity.js";

/**
 * Painel "você", fixo no pé da navegação (padrão do painel de usuário do
 * Discord e do Fluxer): avatar com presença, nome e @ por inteiro, e dois
 * botões (notificações e preferências). O próprio nome é o botão do menu
 * rápido: status, notificações, tema, perfil e sair.
 *
 * @typedef {import("../state/store.js").Person} Person
 */

/**
 * @param {{onMenu: (button: HTMLButtonElement) => void}} handlers
 */
export const createUserPanel = ({ onMenu }) => {
    const who = /** @type {HTMLButtonElement} */ (must("[data-profile-menu]"));
    const avatar = /** @type {HTMLElement} */ (must(".c-user-panel__avatar"));
    const name = /** @type {HTMLElement} */ (must(".c-user-panel__name"));
    const status = /** @type {HTMLElement} */ (must(".c-user-panel__status"));
    const adminOnly = /** @type {HTMLElement[]} */ ([
        ...document.querySelectorAll("[data-admin-only]"),
    ]);

    who.addEventListener("click", () => onMenu(who));

    return {
        /**
         * @param {Person | null} me
         * @param {Person | undefined} listed  você na lista do servidor (presença real)
         * @param {"member" | "admin" | "host"} role
         * @param {boolean} online
         */
        render(me, listed, role, online) {
            // Moderação da sala: administrador ou anfitrião dela.
            for (const node of adminOnly) node.hidden = role !== "admin" && role !== "host";
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
            // Nome e @username podem ser cortados com reticências: a dica
            // nativa mostra o texto inteiro (leitores de tela já leem tudo).
            name.title = me.name;
            const presence = !online
                ? strings.conn.offline
                : isAway
                  ? strings.userPanel.away
                  : strings.userPanel.online;
            // Só @ e presença: o papel (anfitrião) é de cada sala e aparece no
            // painel da conversa; aqui ele cortava o nome.
            const parts = [me.username ? `@${me.username}` : "", presence].filter(Boolean);
            status.textContent = parts.join(" · ");
            status.title = status.textContent;
            who.setAttribute(
                "aria-label",
                `${format(strings.profile.menu, { name: me.name })}, ${status.textContent}`,
            );
        },
    };
};
