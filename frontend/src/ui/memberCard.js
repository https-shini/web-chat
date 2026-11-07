// @ts-check

import { format, strings } from "../i18n/strings.js";
import { el, must } from "./dom.js";
import { badge, hueFor, renderIdentity } from "./identity.js";
import { icon } from "./icons.js";

/**
 * Cartão de pessoa: popover não modal aberto a partir do painel de pessoas.
 *
 * Mostra só o que o servidor mandou em `user_list` (nome, papel, presença,
 * id). Toda ação é um comando de chat de verdade, enviado pelo mesmo
 * caminho do campo de mensagem — quem valida e autoriza é o servidor. O
 * cartão só não oferece ações de moderação a quem não é administrador,
 * para não mostrar botão que vai ser recusado.
 *
 * @typedef {import("../state/store.js").Person} Person
 * @typedef {{
 *   label: string,
 *   iconName: string,
 *   danger?: boolean,
 *   run: () => void,
 * }} Action
 */

/**
 * @param {{
 *   getContext: () => {meId: string | null, role: "member" | "admin"},
 *   runCommand: (text: string) => void,
 *   prefill: (text: string) => void,
 *   confirm: (options: {title: string, body: string, confirmLabel: string}) => Promise<boolean>,
 *   notify: (text: string, kind?: "info" | "error") => void,
 * }} deps
 */
export const createMemberCard = ({ getContext, runCommand, prefill, confirm, notify }) => {
    const card = /** @type {HTMLElement} */ (must(".c-member-card"));
    const avatar = /** @type {HTMLElement} */ (must(".c-member-card__avatar", card));
    const name = /** @type {HTMLElement} */ (must(".c-member-card__name", card));
    const meta = /** @type {HTMLElement} */ (must(".c-member-card__meta", card));
    const actions = /** @type {HTMLElement} */ (must(".c-member-card__actions", card));

    /** @type {HTMLButtonElement | null} */
    let trigger = null;

    /** @param {{restoreFocus?: boolean}} [options] */
    const close = ({ restoreFocus = true } = {}) => {
        if (card.hidden) return;
        card.hidden = true;
        trigger?.setAttribute("aria-expanded", "false");
        if (restoreFocus && trigger?.isConnected) trigger.focus();
        trigger = null;
    };

    /** @param {Action} action */
    const actionButton = (action) => {
        const button = el("button", {
            class: action.danger
                ? "c-member-card__action c-member-card__action--danger"
                : "c-member-card__action",
            attrs: { type: "button" },
        });
        button.appendChild(icon(action.iconName));
        button.appendChild(document.createTextNode(action.label));
        button.addEventListener("click", action.run);
        return button;
    };

    /**
     * Ações reais disponíveis para esta pessoa, vistas por quem abriu.
     * @param {Person} person
     * @returns {Action[]}
     */
    const actionsFor = (person) => {
        const { meId, role } = getContext();
        const own = person.id === meId;
        const away = person.status === "away";
        /** Executa e fecha (sem devolver o foco: o comando leva ao composer). */
        const run = (/** @type {string} */ text) => () => {
            close({ restoreFocus: false });
            runCommand(text);
        };

        /** @type {Action[]} */
        const list = [
            {
                label: strings.memberCard.profile,
                iconName: "user",
                run: run(`/profile ${person.id}`),
            },
            {
                label: strings.memberCard.copyId,
                iconName: "copy",
                run: () => {
                    navigator.clipboard
                        ?.writeText(person.id)
                        .then(() => notify(strings.memberCard.copied))
                        .catch(() => notify(strings.memberCard.copyFailed, "error"));
                    if (!navigator.clipboard) notify(strings.memberCard.copyFailed, "error");
                },
            },
        ];

        if (own) {
            list.push(
                {
                    label: away ? strings.memberCard.comeBack : strings.memberCard.goAway,
                    iconName: "clock",
                    run: run("/afk"),
                },
                {
                    label: strings.memberCard.nick,
                    iconName: "pencil",
                    run: () => {
                        close({ restoreFocus: false });
                        prefill("/nick ");
                    },
                },
            );
        } else if (role === "admin" && person.role !== "admin") {
            list.push(
                {
                    label: strings.memberCard.mute,
                    iconName: "ban",
                    run: run(`/mute ${person.id} 10`),
                },
                {
                    label: strings.memberCard.unmute,
                    iconName: "check",
                    run: run(`/unmute ${person.id}`),
                },
                {
                    label: strings.memberCard.kick,
                    iconName: "logout",
                    danger: true,
                    run: () => {
                        close({ restoreFocus: false });
                        void confirm({
                            title: format(strings.dialogs.kickTitle, { name: person.name }),
                            body: strings.dialogs.kickBody,
                            confirmLabel: strings.dialogs.kickConfirm,
                        }).then((ok) => {
                            if (ok) runCommand(`/kick ${person.id}`);
                        });
                    },
                },
            );
        }
        return list;
    };

    /** Posiciona ao lado do botão; em tela estreita o CSS vira folha. */
    const place = () => {
        if (!trigger || window.matchMedia("(max-width: 47.99rem)").matches) {
            card.style.removeProperty("top");
            card.style.removeProperty("left");
            return;
        }
        const box = trigger.getBoundingClientRect();
        const size = card.getBoundingClientRect();
        const gap = 12;
        let left = box.left - size.width - gap;
        if (left < gap) left = Math.min(box.right + gap, window.innerWidth - size.width - gap);
        const top = Math.min(Math.max(gap, box.top), window.innerHeight - size.height - gap);
        card.style.left = `${Math.round(left)}px`;
        card.style.top = `${Math.round(top)}px`;
    };

    // Captura: o Escape fecha o cartão antes de chegar à gaveta embaixo dele.
    document.addEventListener(
        "keydown",
        (event) => {
            if (event.key === "Escape" && !card.hidden) {
                event.preventDefault();
                close();
            }
        },
        true,
    );
    document.addEventListener("pointerdown", (event) => {
        if (card.hidden || !(event.target instanceof Node)) return;
        if (card.contains(event.target) || trigger?.contains(event.target)) return;
        close({ restoreFocus: false });
    });
    window.addEventListener("resize", () => close({ restoreFocus: false }));

    return {
        /**
         * @param {Person} person
         * @param {HTMLButtonElement} button
         */
        open(person, button) {
            if (trigger === button && !card.hidden) {
                close();
                return;
            }
            close({ restoreFocus: false });
            const { meId } = getContext();
            const own = person.id === meId;
            const away = person.status === "away";
            trigger = button;
            button.setAttribute("aria-expanded", "true");

            card.style.setProperty("--card-color", `var(--color-sender-${hueFor(person.id)})`);

            avatar.replaceChildren(
                renderIdentity({
                    id: person.id,
                    name: person.name,
                    own,
                    withName: false,
                    size: "xl",
                    presence: away ? "away" : "online",
                }),
            );
            name.replaceChildren(document.createTextNode(person.name));
            if (own) name.appendChild(badge(strings.room.youBadge));
            if (person.role === "admin") name.appendChild(badge(strings.people.admin, "brand"));

            const presence = away
                ? person.statusText
                    ? format(strings.memberCard.awayWith, { reason: person.statusText })
                    : strings.memberCard.away
                : strings.memberCard.online;
            meta.replaceChildren(
                el("span", {
                    text: `${person.role === "admin" ? strings.memberCard.roleAdmin : strings.memberCard.roleMember} · ${presence}`,
                }),
                el("span", {
                    class: "c-member-card__id",
                    text: format(strings.memberCard.id, { id: person.id }),
                }),
            );

            actions.replaceChildren(...actionsFor(person).map(actionButton));

            card.hidden = false;
            place();
            const first = actions.querySelector("button");
            if (first) first.focus();
        },

        close,
    };
};
