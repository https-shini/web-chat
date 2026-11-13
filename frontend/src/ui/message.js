// @ts-check

import { strings } from "../i18n/strings.js";
import { el } from "./dom.js";
import { icon } from "./icons.js";
import { badge, renderIdentity } from "./identity.js";
import { authorKey } from "../state/store.js";

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
            class: "c-button c-button--ghost c-button--sm c-message__retry",
            text: strings.delivery.retry,
            attrs: { type: "button" },
        });
        retry.addEventListener("click", () => handlers.onRetry?.(message));
        slot.appendChild(retry);
    }
    slot.hidden = message.delivery === "confirmed";
};

/**
 * Calha da esquerda com um ícone (sistema e respostas de comando).
 * @param {string} name
 */
const iconAside = (name) => {
    const aside = el("div", { class: "c-message__aside", attrs: { "aria-hidden": "true" } });
    aside.appendChild(icon(name));
    return aside;
};

/**
 * Resposta de comando (visível só para você): cartão com o selo
 * "Só você vê isto", em texto.
 * @param {HTMLLIElement} item
 * @param {Message} message
 */
const renderNotice = (item, message) => {
    item.classList.add("c-message--notice");
    item.dataset.tone = message.tone ?? "info";
    item.appendChild(iconAside(message.tone === "error" ? "alert" : "terminal"));
    const body = el("div", { class: "c-message__body" });
    const card = el("div", { class: "c-message__card" });
    card.appendChild(el("p", { class: "c-message__private", text: strings.message.private }));
    if (message.title)
        card.appendChild(el("p", { class: "c-message__title", text: message.title }));
    card.appendChild(el("p", { class: "c-message__text", text: message.content }));
    if (message.lines?.length) {
        const list = el("ul", { class: "c-message__lines" });
        for (const line of message.lines) list.appendChild(el("li", { text: line }));
        card.appendChild(list);
    }
    body.appendChild(card);
    item.appendChild(body);
    return item;
};

/**
 * Entrada de sistema: entrou, saiu, conversa apagada, avisos da sala.
 * @param {HTMLLIElement} item
 * @param {Message} message
 */
const renderSystem = (item, message) => {
    item.classList.add("c-message--system");
    if (message.tone) item.dataset.tone = message.tone;
    if (message.event) item.dataset.event = message.event;
    const name =
        message.event === "join"
            ? "arrow-in"
            : message.event === "leave"
              ? "arrow-out"
              : message.tone === "admin"
                ? "shield"
                : "info";
    item.appendChild(iconAside(name));
    const body = el("div", { class: "c-message__body" });
    const text = el("p", { class: "c-message__text", text: message.content });
    const time = timeElement(message.timestamp);
    if (time) text.appendChild(time);
    body.appendChild(text);
    item.appendChild(body);
    return item;
};

/**
 * Renderiza uma entrada como item da transcrição.
 *
 * `compact`: continuação de quem acabou de falar (mesma pessoa, poucos
 * minutos). Sem avatar nem cabeçalho na tela — mas o nome continua lá
 * para leitor de tela, que lê cada item isoladamente.
 *
 * @param {Message} message
 * @param {MessageHandlers} [handlers]
 * @param {{compact?: boolean}} [options]
 * @returns {HTMLLIElement}
 */
export const renderMessage = (message, handlers = {}, { compact = false } = {}) => {
    const item = el("li", { class: "c-message" });
    item.dataset.messageId = message.id;

    if (message.kind === "notice") return renderNotice(item, message);
    if (message.kind === "system") return renderSystem(item, message);

    if (message.own) item.classList.add("c-message--self");
    item.dataset.delivery = message.delivery;
    // Chave de autor (@ + número na conversa): a lista marca "saiu" por ela.
    const key = message.own ? null : authorKey(message.username, message.author);
    if (key) item.dataset.authorKey = key;
    const variant = message.variant ?? "text";
    const isAction = variant === "action" || variant === "roll";
    const isCompact = compact && !isAction && variant !== "announcement";
    if (isCompact) item.classList.add("c-message--compact");

    const aside = el("div", { class: "c-message__aside" });
    if (isCompact) {
        const time = timeElement(message.timestamp);
        if (time) aside.appendChild(time);
    } else {
        aside.appendChild(
            renderIdentity({
                id: message.userId,
                name: message.userName,
                own: message.own,
                author: message.author ?? null,
                withName: false,
            }),
        );
    }
    item.appendChild(aside);
    const body = el("div", { class: "c-message__body" });

    if (isAction) {
        // Ação em terceira pessoa: "Ana está estudando" — o nome faz parte
        // da frase, sem cabeçalho separado.
        item.classList.add("c-message--action");
        const line = el("p", { class: "c-message__text" });
        line.appendChild(el("span", { class: "c-message__actor", text: message.userName }));
        line.appendChild(document.createTextNode(` ${message.content} `));
        const time = timeElement(message.timestamp);
        if (time) line.appendChild(time);
        body.appendChild(line);
    } else if (isCompact) {
        body.appendChild(el("span", { class: "sr-only", text: `${message.userName}:` }));
        body.appendChild(renderContent(message));
    } else {
        if (variant === "announcement") {
            item.classList.add("c-message--announcement");
            const label = el("p", { class: "c-message__label" });
            label.appendChild(icon("megaphone"));
            label.appendChild(document.createTextNode(strings.message.announcement));
            body.appendChild(label);
        }
        const head = el("div", { class: "c-message__head" });
        head.appendChild(
            renderIdentity({
                id: message.userId,
                name: message.userName,
                own: message.own,
                author: message.author ?? null,
                withMonogram: false,
            }),
        );
        if (message.username) {
            head.appendChild(
                el("span", { class: "c-message__handle", text: `@${message.username}` }),
            );
        }
        if (message.own) head.appendChild(badge(strings.room.youBadge));
        if (key) {
            // Escondido até a pessoa sair; em texto, não só no tom.
            const departed = badge(strings.message.departed, "departed");
            departed.hidden = true;
            head.appendChild(departed);
        }
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
