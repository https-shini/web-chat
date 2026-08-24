// @ts-check

import { el } from "./dom.js";
import { renderIdentity } from "./identity.js";

/**
 * @typedef {import("../state/store.js").Message} Message
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
 * Renderiza uma mensagem como item da transcrição.
 * @param {Message} message
 * @returns {HTMLLIElement}
 */
export const renderMessage = (message) => {
    const item = el("li", { class: "c-message" });
    item.dataset.messageId = message.id;

    if (message.kind === "system") {
        item.classList.add("c-message--system");
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
    if (message.pending) item.dataset.pending = "true";

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

    const head = el("div", { class: "c-message__head" });
    // Só o nome: o monograma já está no trilho, e repeti-lo faria a mesma
    // identidade aparecer duas vezes na mesma linha.
    head.appendChild(
        renderIdentity({
            id: message.userId,
            name: message.userName,
            own: message.own,
            withMonogram: false,
        }),
    );
    const time = formatTime(message.timestamp);
    if (time) {
        head.appendChild(el("time", { class: "c-message__time", text: time }));
    }
    body.appendChild(head);

    body.appendChild(el("p", { class: "c-message__text", text: message.content }));
    item.appendChild(body);

    return item;
};
