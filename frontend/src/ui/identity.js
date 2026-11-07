// @ts-check

import { el } from "./dom.js";

/** Quantidade de matizes de remetente disponíveis em tokens.css. */
const SENDER_HUES = 6;

/**
 * Índice de cor determinístico a partir do id. Precisa ser estável entre
 * clientes: a mesma pessoa tem a mesma cor na tela de todo mundo, sem que
 * a cor trafegue no protocolo nem fique sob controle de quem se conecta.
 * @param {string} id
 * @returns {number} de 1 a SENDER_HUES
 */
export const hueFor = (id) => {
    let hash = 0;
    for (let index = 0; index < id.length; index += 1) {
        hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
    return (hash % SENDER_HUES) + 1;
};

/**
 * Iniciais para o monograma: no máximo duas letras.
 * @param {string} name
 * @returns {string}
 */
export const initialsFor = (name) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    const first = parts[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
    return (first.charAt(0) + last.charAt(0)).toUpperCase() || "?";
};

/**
 * Bloco de identidade: avatar (iniciais sobre a cor da pessoa) + nome.
 *
 * A cor sai do id e é a mesma em toda tela. Ela nunca é o único sinal: o
 * nome está sempre escrito, e quem é você recebe o selo "você" em texto
 * (ver message.js e people.js), não uma cor diferente.
 *
 * @param {{
 *   id: string,
 *   name: string,
 *   own: boolean,
 *   withName?: boolean,
 *   withMonogram?: boolean,
 *   size?: "md" | "lg" | "xl",
 *   presence?: "online" | "away" | null,
 * }} person
 * @returns {HTMLElement}
 */
export const renderIdentity = ({
    id,
    name,
    own,
    withName = true,
    withMonogram = true,
    size = "md",
    presence = null,
}) => {
    const classes = ["c-identity", `c-identity--sender-${hueFor(id)}`];
    if (own) classes.push("c-identity--self");
    if (size !== "md") classes.push(`c-identity--${size}`);
    const root = el("span", { class: classes.join(" ") });

    if (withMonogram) {
        const monogram = el("span", {
            class: "c-identity__monogram",
            attrs: { "aria-hidden": "true" },
        });
        monogram.appendChild(document.createTextNode(initialsFor(name)));
        if (presence) {
            monogram.appendChild(
                el("span", { class: "c-identity__presence", attrs: { "data-status": presence } }),
            );
        }
        root.appendChild(monogram);
    }

    if (withName) {
        root.appendChild(el("span", { class: "c-identity__name", text: name }));
    }

    return root;
};

/**
 * Selo em texto ("você", "admin").
 * @param {string} text
 * @param {string} [modifier]
 */
export const badge = (text, modifier = "") =>
    el("span", { class: modifier ? `c-badge c-badge--${modifier}` : "c-badge", text });
