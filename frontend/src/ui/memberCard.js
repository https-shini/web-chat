// @ts-check

import { format, strings } from "../i18n/strings.js";
import { el, must } from "./dom.js";
import { badge, hueFor, renderIdentity } from "./identity.js";
import { icon } from "./icons.js";
import { anchorTo } from "./primitives/position.js";
import { showMenu } from "./primitives/menu.js";

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
 *   items?: {label: string, run: () => void}[],
 *   group?: "moderation",
 * }} Action
 */

/**
 * @param {{
 *   getContext: () => {meId: string | null, role: "member" | "admin" | "host"},
 *   runCommand: (text: string) => void,
 *   prefill: (text: string) => void,
 *   confirm: (options: {title: string, body: string, confirmLabel: string}) => Promise<boolean>,
 *   notify: (text: string, kind?: "info" | "error") => void,
 *   openDirect?: (username: string) => void,
 * }} deps
 */
export const createMemberCard = ({
    getContext,
    runCommand,
    prefill,
    confirm,
    notify,
    openDirect,
}) => {
    const card = /** @type {HTMLElement} */ (must(".c-member-card"));
    const avatar = /** @type {HTMLElement} */ (must(".c-member-card__avatar", card));
    const name = /** @type {HTMLElement} */ (must(".c-member-card__name", card));
    const meta = /** @type {HTMLElement} */ (must(".c-member-card__meta", card));
    const actions = /** @type {HTMLElement} */ (must(".c-member-card__actions", card));

    /** @type {HTMLButtonElement | null} */
    let trigger = null;
    /** Para de acompanhar a posição (cartão fechado). */
    let unanchor = () => {};

    /** @param {{restoreFocus?: boolean}} [options] */
    const close = ({ restoreFocus = true } = {}) => {
        if (card.hidden) return;
        unanchor();
        unanchor = () => {};
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
        if (action.items) {
            // Escolha da duração num menu preso ao botão (o cartão continua aberto).
            button.setAttribute("aria-haspopup", "menu");
            button.setAttribute("aria-expanded", "false");
            button.addEventListener("click", () =>
                showMenu({
                    label: action.label,
                    anchor: button,
                    placement: "right-start",
                    items: (action.items ?? []).map((item) => ({
                        label: item.label,
                        run: item.run,
                    })),
                }),
            );
        } else {
            button.addEventListener("click", action.run);
        }
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

        // Comandos indicam a pessoa pelo @ (o id interno não chega ao navegador).
        const handle = `@${person.username ?? ""}`;

        /** @type {Action[]} */
        const list = [
            {
                label: strings.memberCard.profile,
                iconName: "user",
                run: run(`/profile ${handle}`),
            },
            {
                label: strings.memberCard.copyId,
                iconName: "copy",
                run: () => {
                    navigator.clipboard
                        ?.writeText(handle)
                        .then(() => notify(strings.memberCard.copied))
                        .catch(() => notify(strings.memberCard.copyFailed, "error"));
                    if (!navigator.clipboard) notify(strings.memberCard.copyFailed, "error");
                },
            },
        ];

        // Conversa privada pelo @ exato (nunca consigo mesmo). Bloqueio e
        // disponibilidade são decididos pelo servidor; se já existe uma
        // conversa com a pessoa, ela é reaberta, não duplicada.
        if (!own && openDirect && person.username) {
            const username = person.username;
            list.unshift({
                label: strings.memberCard.direct,
                iconName: "at",
                run: () => {
                    close({ restoreFocus: false });
                    openDirect(username);
                },
            });
        }

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
        } else if (
            // Quem modera: administrador (em qualquer sala) ou anfitrião (só
            // nesta). Administrador não é moderado; anfitrião, só por admin.
            (role === "admin" || role === "host") &&
            person.role !== "admin" &&
            !(role === "host" && person.role === "host")
        ) {
            list.push(
                {
                    // Duração à escolha (decisão D5): o servidor aceita de 1 a
                    // 1440 minutos, ou sem número (até /unmute).
                    label: strings.context.mute,
                    iconName: "ban",
                    group: "moderation",
                    run: () => {},
                    items: [
                        {
                            label: format(strings.context.minutes, { n: 5 }),
                            run: run(`/mute ${handle} 5`),
                        },
                        {
                            label: format(strings.context.minutes, { n: 10 }),
                            run: run(`/mute ${handle} 10`),
                        },
                        { label: strings.context.hour, run: run(`/mute ${handle} 60`) },
                        { label: strings.context.untilUnmute, run: run(`/mute ${handle}`) },
                    ],
                },
                {
                    label: strings.memberCard.unmute,
                    iconName: "check",
                    group: "moderation",
                    run: run(`/unmute ${handle}`),
                },
                {
                    label: `${strings.memberCard.kick}…`,
                    iconName: "logout",
                    danger: true,
                    group: "moderation",
                    run: () => {
                        close({ restoreFocus: false });
                        void confirm({
                            title: format(strings.dialogs.kickTitle, { name: person.name }),
                            body: strings.dialogs.kickBody,
                            confirmLabel: strings.dialogs.kickConfirm,
                        }).then((ok) => {
                            if (ok) runCommand(`/kick ${handle}`);
                        });
                    },
                },
            );
        }
        return list;
    };

    /**
     * Posiciona ao lado do botão com o @floating-ui/dom (vira para o outro
     * lado e desliza na tela quando falta espaço, e acompanha a rolagem).
     * Em tela estreita o CSS faz do cartão uma folha presa à base.
     */
    const place = () => {
        unanchor();
        unanchor = () => {};
        if (!trigger || window.matchMedia("(max-width: 47.99rem)").matches) {
            card.style.removeProperty("top");
            card.style.removeProperty("left");
            card.style.removeProperty("max-height");
            return;
        }
        unanchor = anchorTo(trigger, card, { placement: "left-start", gap: 12, minHeight: 200 });
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
    // Mudança de tamanho (inclusive o teclado virtual abrindo) só
    // reposiciona: o cartão não fecha mais sozinho.

    return {
        /**
         * As mesmas ações do cartão, como menu (clique direito, Shift+F10,
         * toque longo e o botão "⋯" de cada pessoa).
         * @param {Person} person
         * @returns {import("./primitives/menuModel.js").MenuItem[]}
         */
        menuFor(person) {
            const list = actionsFor(person);
            /** @param {Action} action @returns {import("./primitives/menuModel.js").MenuItem} */
            const toItem = (action) =>
                action.items
                    ? {
                          type: "submenu",
                          label: action.label,
                          icon: action.iconName,
                          items: action.items.map((item) => ({ label: item.label, run: item.run })),
                      }
                    : {
                          label: action.label,
                          icon: action.iconName,
                          danger: action.danger,
                          run: action.run,
                      };
            const plain = list.filter((action) => action.group !== "moderation").map(toItem);
            const moderation = list.filter((action) => action.group === "moderation").map(toItem);
            return moderation.length
                ? [
                      ...plain,
                      { type: "separator" },
                      { type: "label", label: strings.context.moderation },
                      ...moderation,
                  ]
                : plain;
        },

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
                    author: person.author ?? null,
                    name: person.name,
                    own,
                    withName: false,
                    size: "xl",
                    presence: away ? "away" : "online",
                }),
            );
            name.replaceChildren(document.createTextNode(person.name));
            if (own) name.appendChild(badge(strings.room.youBadge));
            if (person.role === "admin") name.appendChild(badge(strings.people.admin, "role"));
            if (person.role === "host") name.appendChild(badge(strings.people.host, "role"));

            const presence = away
                ? person.statusText
                    ? format(strings.memberCard.awayWith, { reason: person.statusText })
                    : strings.memberCard.away
                : strings.memberCard.online;
            meta.replaceChildren(
                ...(person.username
                    ? [el("span", { class: "c-member-card__handle", text: `@${person.username}` })]
                    : []),
                el("span", {
                    text: `${
                        person.role === "admin"
                            ? strings.memberCard.roleAdmin
                            : person.role === "host"
                              ? strings.memberCard.roleHost
                              : strings.memberCard.roleMember
                    } · ${presence}`,
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
