// @ts-check

import { format, strings } from "../i18n/strings.js";
import { el } from "./dom.js";
import { icon } from "./icons.js";
import { badge, renderIdentity } from "./identity.js";
import { authorKey } from "../state/store.js";
import { renderMarkdown, spoilerNode } from "../markdown/render.js";
import { excerptPlain, mentionsOf, parseMarkdown } from "../markdown/parse.js";

/**
 * Renderização de uma entrada da transcrição. Só `textContent` e
 * `createElement`: nenhum conteúdo vindo da rede vira HTML.
 *
 * @typedef {import("../state/store.js").Message} Message
 * @typedef {{
 *   onRetry?: (message: Message) => void,
 *   onDiscard?: (message: Message) => void,
 *   onDismiss?: (message: Message) => void,
 *   onReact?: (message: Message, emoji: string) => void,
 *   onReactMenu?: (message: Message, anchor: HTMLElement) => void,
 *   onJumpTo?: (id: string) => void,
 * }} MessageHandlers
 * @typedef {{compact?: boolean, me?: string | null, meKey?: string | null}} RenderOptions
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
 * Conteúdo da mensagem. Formatação aplicada pelo servidor (comandos /bold,
 * /italic, /code, /spoiler) vale para a mensagem inteira; texto comum passa
 * pelo Markdown (decisão C2), desenhado sem HTML.
 * @param {Message} message
 * @param {string | null} me
 * @returns {HTMLElement}
 */
const renderContent = (message, me) => {
    if (!message.format) return renderMarkdown(message.content, { me });
    const root = el("div", { class: "c-message__content" });
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
        default:
            paragraph.appendChild(spoilerNode([document.createTextNode(message.content)]));
    }
    root.appendChild(paragraph);
    return root;
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
        const attempt = message.attempt ?? 1;
        slot.appendChild(
            el("span", {
                class: "c-message__status-text",
                text:
                    attempt > 1
                        ? format(strings.delivery.retrying, { n: attempt })
                        : strings.delivery.pending,
            }),
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
        // "Apagar" (decisão C4): descarta a tentativa, só na sua tela.
        if (handlers.onDiscard && message.clientMsgId) {
            const discard = el("button", {
                class: "c-button c-button--ghost c-button--sm c-message__retry",
                text: strings.delivery.discard,
                attrs: { type: "button" },
            });
            discard.addEventListener("click", () => handlers.onDiscard?.(message));
            slot.appendChild(discard);
        }
    }
    slot.hidden = message.delivery === "confirmed";
    slot.dataset.state = message.delivery;
};

/**
 * "(editada)", com a hora da edição na dica.
 * @param {HTMLElement} slot
 * @param {Message} message
 */
const fillEdited = (slot, message) => {
    slot.replaceChildren();
    if (!message.editedAt) return;
    const date = new Date(message.editedAt);
    const time = Number.isNaN(date.getTime())
        ? ""
        : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const mark = el("span", { class: "c-message__edited", text: strings.message.edited });
    if (time) mark.title = format(strings.message.editedAt, { time });
    slot.appendChild(mark);
};

/**
 * Reações abaixo da mensagem: um botão por emoji (aperta = a sua), mais o
 * "+" para escolher outra. O rótulo diz o emoji, quantas e se é sua.
 * @param {Message} message
 * @param {MessageHandlers} handlers
 * @param {string | null} meKey
 */
const renderReactions = (message, handlers, meKey) => {
    const row = el("div", { class: "c-reactions" });
    const reactions = message.reactions ?? [];
    row.hidden = reactions.length === 0;
    for (const reaction of reactions) {
        const mine = meKey !== null && reaction.authors.includes(meKey);
        const button = el("button", {
            class: "c-reaction",
            attrs: {
                type: "button",
                "aria-pressed": String(mine),
                "aria-label": format(strings.message.reactionLabel, {
                    emoji: reaction.emoji,
                    count: reaction.count,
                    you: mine ? strings.message.reactionYou : "",
                    action: mine ? strings.message.reactionRemove : strings.message.reactionAdd,
                }),
            },
        });
        button.append(
            el("span", {
                class: "c-reaction__emoji",
                text: reaction.emoji,
                attrs: { "aria-hidden": "true" },
            }),
            el("span", {
                class: "c-reaction__count",
                text: String(reaction.count),
                attrs: { "aria-hidden": "true" },
            }),
        );
        button.addEventListener("click", () => handlers.onReact?.(message, reaction.emoji));
        row.appendChild(button);
    }
    if (reactions.length && handlers.onReactMenu) {
        const add = el("button", {
            class: "c-reaction c-reaction--add",
            attrs: { type: "button", "aria-label": strings.message.react, "aria-haspopup": "menu" },
        });
        add.appendChild(icon("smile"));
        add.addEventListener("click", () => handlers.onReactMenu?.(message, add));
        row.appendChild(add);
    }
    return row;
};

/**
 * Citação da mensagem respondida (cópia feita pelo servidor). O clique leva
 * até a original, se ela ainda estiver na tela.
 * @param {NonNullable<Message["reference"]>} reference
 * @param {MessageHandlers} handlers
 */
const renderReference = (reference, handlers) => {
    const button = el("button", {
        class: "c-message__reference",
        attrs: {
            type: "button",
            "aria-label": format(strings.message.replyingTo, {
                name: reference.userName || `@${reference.username}`,
                excerpt: excerptPlain(reference.excerpt),
            }),
        },
    });
    const glyph = el("span", { class: "c-message__reference-icon" });
    glyph.appendChild(icon("reply"));
    glyph.setAttribute("aria-hidden", "true");
    button.append(
        glyph,
        el("span", {
            class: "c-message__reference-who",
            text: `@${reference.username}`,
            attrs: { "aria-hidden": "true" },
        }),
        el("span", {
            class: "c-message__reference-text",
            text: excerptPlain(reference.excerpt),
            attrs: { "aria-hidden": "true" },
        }),
    );
    button.addEventListener("click", () => handlers.onJumpTo?.(reference.id));
    return button;
};

/**
 * Enviada: a sua mensagem confirmada pelo servidor ganha um ✓ discreto
 * logo depois do texto, com o estado em texto para o leitor de tela.
 * @param {HTMLElement} slot
 * @param {Message} message
 */
const fillSent = (slot, message) => {
    slot.replaceChildren();
    if (message.delivery === "confirmed" && message.own && message.kind === "chat") {
        const mark = el("span", { class: "c-message__sent" });
        mark.appendChild(icon("check"));
        mark.appendChild(el("span", { class: "sr-only", text: strings.delivery.sent }));
        slot.appendChild(mark);
    }
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
 * "Só você vê isto", em texto, e o botão "Dispensar".
 * @param {HTMLLIElement} item
 * @param {Message} message
 * @param {MessageHandlers} handlers
 */
const renderNotice = (item, message, handlers) => {
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
    if (handlers.onDismiss) {
        const dismiss = el("button", {
            class: "c-button c-button--ghost c-button--sm c-message__dismiss",
            text: strings.message.dismiss,
            attrs: { type: "button" },
        });
        dismiss.addEventListener("click", () => handlers.onDismiss?.(message));
        card.appendChild(dismiss);
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
 * @param {RenderOptions} [options]
 * @returns {HTMLLIElement}
 */
export const renderMessage = (
    message,
    handlers = {},
    { compact = false, me = null, meKey = null } = {},
) => {
    const item = el("li", { class: "c-message" });
    item.dataset.messageId = message.id;
    item.dataset.kind = message.kind;

    if (message.kind === "notice") return renderNotice(item, message, handlers);
    if (message.kind === "system") return renderSystem(item, message);

    if (message.own) item.classList.add("c-message--self");
    item.dataset.delivery = message.delivery;
    // Alcançável pelas setas dentro da lista (foco itinerante da lista).
    item.tabIndex = -1;
    if (message.username) item.dataset.username = message.username;
    // Menção a você: destaque (forma e cor) e aviso em texto para o leitor.
    const mentionsMe =
        !message.own &&
        me !== null &&
        !message.format &&
        mentionsOf(parseMarkdown(message.content)).includes(me);
    if (mentionsMe) item.classList.add("c-message--mention");
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
        const content = el("div", { class: "c-message__content" });
        content.appendChild(line);
        body.appendChild(content);
    } else if (isCompact) {
        body.appendChild(
            el("span", {
                class: "sr-only",
                text: `${message.userName}${message.own ? ` (${strings.room.youBadge})` : ""}:`,
            }),
        );
        body.appendChild(renderContent(message, me));
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
        // "você" não aparece em toda mensagem própria (decisão Q5): o nome
        // já diz, e o leitor de tela continua ouvindo.
        if (message.own)
            head.appendChild(el("span", { class: "sr-only", text: `(${strings.room.youBadge})` }));
        if (key) {
            // Escondido até a pessoa sair; em texto, não só no tom.
            const departed = badge(strings.message.departed, "departed");
            departed.hidden = true;
            head.appendChild(departed);
        }
        const time = timeElement(message.timestamp);
        if (time) head.appendChild(time);
        body.appendChild(head);
        body.appendChild(renderContent(message, me));
    }
    if (mentionsMe)
        body.appendChild(el("span", { class: "sr-only", text: strings.message.mentionsYou }));

    if (message.reference) {
        body.insertBefore(renderReference(message.reference, handlers), body.firstChild);
    }
    placeMarks(body, message);
    // Marca de fixada (escondida até a lista dizer que é).
    const pin = el("span", { class: "c-message__pinned", attrs: { hidden: "" } });
    pin.appendChild(icon("pin"));
    pin.appendChild(el("span", { text: strings.message.pinnedMark }));
    body.querySelector(".c-message__head")?.appendChild(pin);
    if (!body.querySelector(".c-message__head")) body.insertBefore(pin, body.firstChild);
    body.appendChild(renderReactions(message, handlers, meKey));

    const status = el("p", { class: "c-message__status" });
    fillStatus(status, message, handlers);
    body.appendChild(status);
    item.appendChild(body);
    return item;
};

/**
 * "(editada)" e ✓ logo depois do texto (no último parágrafo).
 * @param {HTMLElement} body
 * @param {Message} message
 */
const placeMarks = (body, message) => {
    const marks = el("span", { class: "c-message__marks" });
    const edited = el("span", { class: "c-message__edited-slot" });
    fillEdited(edited, message);
    const sent = el("span", { class: "c-message__sent-slot" });
    fillSent(sent, message);
    marks.append(edited, sent);
    const blocks = body.querySelectorAll(".c-message__content > *");
    const last = blocks[blocks.length - 1];
    if (last && last.tagName === "P") last.appendChild(marks);
    else body.querySelector(".c-message__content")?.appendChild(marks);
};

/**
 * Atualiza no lugar o que mudou numa mensagem já na tela: texto editado e
 * reações. Só a parte que mudou é trocada.
 * @param {HTMLElement} item
 * @param {Message} message
 * @param {Message} previous
 * @param {MessageHandlers} handlers
 * @param {{me?: string | null, meKey?: string | null}} options
 */
export const patchMessage = (
    item,
    message,
    previous,
    handlers,
    { me = null, meKey = null } = {},
) => {
    if (message.kind !== "chat") return;
    if (message.content !== previous.content || message.editedAt !== previous.editedAt) {
        const content = item.querySelector(".c-message__content");
        if (content instanceof HTMLElement && (message.variant ?? "text") === "text") {
            const fresh = renderContent(message, me);
            content.replaceWith(fresh);
            const body = /** @type {HTMLElement} */ (fresh.parentElement);
            placeMarks(body, message);
        }
    }
    if (message.reactions !== previous.reactions) {
        const row = item.querySelector(".c-reactions");
        if (row instanceof HTMLElement) row.replaceWith(renderReactions(message, handlers, meKey));
    }
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
    const sent = item.querySelector(".c-message__sent-slot");
    if (sent instanceof HTMLElement) fillSent(sent, message);
    const edited = item.querySelector(".c-message__edited-slot");
    if (edited instanceof HTMLElement) fillEdited(edited, message);
};
