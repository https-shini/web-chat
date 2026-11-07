// @ts-check

import { strings } from "../i18n/strings.js";
import { el } from "./dom.js";
import { renderIdentity } from "./identity.js";

/**
 * Renderização de uma entrada da transcrição. Só `textContent` e
 * `createElement`: nenhum conteúdo vindo da rede vira HTML.
 *
 * @typedef {import("../state/store.js").Message} Message
 * @typedef {{onRetry?: (message: Message) => void}} MessageHandlers
 */

/**
 * Hora local curta. Se o carimbo do servidor for ilegível, some em vez de
 * exibir "Invalid Date".
 * @param {string} timestamp
 * @returns {string}
 */
const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

/**
 * @param {string} timestamp
 */
const timeElement = (timestamp) => {
    const time = formatTime(timestamp);
    if (!time) return null;
    const node = el("time", { class: "c-message__time", text: time });
    node.dateTime = timestamp;
    return node;
};

/**
 * Spoiler: o texto fica escondido até a pessoa pedir. É um botão — chega
 * por teclado e anuncia o estado com `aria-expanded`.
 * @param {string} content
 */
const spoiler = (content) => {
    const button = el("button", {
        class: "c-spoiler",
        attrs: {
            type: "button",
            "aria-expanded": "false",
            "aria-label": strings.message.spoilerShow,
        },
    });
    // Escondido também para leitores de tela até a pessoa pedir.
    const hidden = el("span", {
        class: "c-spoiler__text",
        text: content,
        attrs: { "aria-hidden": "true" },
    });
    button.appendChild(hidden);
    button.addEventListener("click", () => {
        const open = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute(
            "aria-label",
            open ? strings.message.spoilerHide : strings.message.spoilerShow,
        );
        hidden.setAttribute("aria-hidden", String(!open));
        // Aberto, o rótulo do botão não pode esconder o texto revelado.
        if (open) button.removeAttribute("aria-label");
    });
    return button;
};

/**
 * Conteúdo com a formatação aplicada pelo servidor (comandos /bold etc.).
 * @param {Message} message
 * @returns {HTMLElement}
 */
const renderContent = (message) => {
    const paragraph = el("p", { class: "c-message__text" });
    switch (message.format) {
        case "bold":
            paragraph.appendChild(el("strong", { text: message.content }));
            break;
        case "italic":
            paragraph.appendChild(el("em", { text: message.content }));
            break;
        case "code":
            paragraph.appendChild(el("code", { class: "c-message__code", text: message.content }));
            break;
        case "spoiler":
            paragraph.appendChild(spoiler(message.content));
            break;
        default:
            paragraph.textContent = message.content;
    }
    return paragraph;
};

/**
 * Estado de entrega da sua mensagem: "enviando…" ou "não enviada" com o
 * botão de tentar de novo. Vive num slot próprio para ser atualizado no
 * lugar (ver `patchDelivery`).
 * @param {HTMLElement} slot
 * @param {Message} message
 * @param {MessageHandlers} handlers
 */
const fillStatus = (slot, message, handlers) => {
    slot.replaceChildren();
    if (message.delivery === "pending") {
        slot.appendChild(
            el("span", { class: "c-message__status-text", text: strings.delivery.pending }),
        );
    } else if (message.delivery === "failed") {
        slot.appendChild(
            el("span", {
                class: "c-message__status-text",
                text: message.failReason
                    ? `${strings.delivery.failed}: ${message.failReason}`
                    : strings.delivery.failed,
            }),
        );
        const retry = el("button", {
            class: "c-button c-button--quiet c-message__retry",
            text: strings.delivery.retry,
            attrs: { type: "button" },
        });
        retry.addEventListener("click", () => handlers.onRetry?.(message));
        slot.appendChild(retry);
    }
    slot.hidden = message.delivery === "confirmed";
};

/**
 * Resposta de comando (visível só para você).
 * @param {HTMLLIElement} item
 * @param {Message} message
 */
const renderNotice = (item, message) => {
    item.classList.add("c-message--notice");
    item.dataset.tone = message.tone ?? "info";
    const body = el("div", { class: "c-message__body" });
    if (message.title)
        body.appendChild(el("p", { class: "c-message__title", text: message.title }));
    body.appendChild(el("p", { class: "c-message__text", text: message.content }));
    if (message.lines?.length) {
        const list = el("ul", { class: "c-message__lines" });
        for (const line of message.lines) list.appendChild(el("li", { text: line }));
        body.appendChild(list);
    }
    item.appendChild(body);
    return item;
};

/**
 * Renderiza uma entrada como item da transcrição.
 * @param {Message} message
 * @param {MessageHandlers} [handlers]
 * @returns {HTMLLIElement}
 */
export const renderMessage = (message, handlers = {}) => {
    const item = el("li", { class: "c-message" });
    item.dataset.messageId = message.id;

    if (message.kind === "notice") return renderNotice(item, message);

    if (message.kind === "system") {
        item.classList.add("c-message--system");
        if (message.tone) item.dataset.tone = message.tone;
        const body = el("div", { class: "c-message__body" });
        const time = formatTime(message.timestamp);
        body.appendChild(
            el("p", {
                class: "c-message__text",
                text: time ? `${message.content} · ${time}` : message.content,
            }),
        );
        item.appendChild(body);
        return item;
    }

    if (message.own) item.classList.add("c-message--self");
    item.dataset.delivery = message.delivery;
    const variant = message.variant ?? "text";

    const aside = el("div", { class: "c-message__aside" });
    aside.appendChild(
        renderIdentity({
            id: message.userId,
            name: message.userName,
            own: message.own,
            withName: false,
        }),
    );
    item.appendChild(aside);
    const body = el("div", { class: "c-message__body" });

    if (variant === "action" || variant === "roll") {
        // Ação em terceira pessoa: "Ana está estudando" — o nome faz parte
        // da frase, sem cabeçalho separado.
        item.classList.add("c-message--action");
        const line = el("p", { class: "c-message__text" });
        line.appendChild(el("span", { class: "c-message__actor", text: message.userName }));
        line.appendChild(document.createTextNode(` ${message.content}`));
        const head = el("div", { class: "c-message__head" });
        head.appendChild(line);
        const time = timeElement(message.timestamp);
        if (time) head.appendChild(time);
        body.appendChild(head);
    } else {
        if (variant === "announcement") item.classList.add("c-message--announcement");
        const head = el("div", { class: "c-message__head" });
        if (variant === "announcement") {
            head.appendChild(
                el("span", { class: "c-message__label", text: strings.message.announcement }),
            );
        }
        // Só o nome: o monograma já está no trilho.
        head.appendChild(
            renderIdentity({
                id: message.userId,
                name: message.userName,
                own: message.own,
                withMonogram: false,
            }),
        );
        const time = timeElement(message.timestamp);
        if (time) head.appendChild(time);
        body.appendChild(head);
        body.appendChild(renderContent(message));
    }

    const status = el("p", { class: "c-message__status" });
    fillStatus(status, message, handlers);
    body.appendChild(status);
    item.appendChild(body);
    return item;
};

/**
 * Atualiza no lugar o estado de entrega e o id de um item já na tela.
 * Substituir o elemento faria a região `role="log"` anunciá-lo de novo.
 * @param {HTMLElement} item
 * @param {Message} message
 * @param {MessageHandlers} [handlers]
 */
export const patchDelivery = (item, message, handlers = {}) => {
    item.dataset.messageId = message.id;
    item.dataset.delivery = message.delivery;
    const status = item.querySelector(".c-message__status");
    if (status instanceof HTMLElement) fillStatus(status, message, handlers);
};
