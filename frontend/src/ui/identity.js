// @ts-check

import { strings } from "../i18n/strings.js";
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
 * Bloco de identidade: monograma + nome.
 *
 * A cor sozinha reprova 1.4.1, então a posse tem reforço não cromático —
 * o monograma é preenchido para você e vazado para as outras pessoas, e o
 * nome vira o rótulo "Você".
 * @param {{id: string, name: string, own: boolean, withName?: boolean, withMonogram?: boolean}} person
 * @returns {HTMLElement}
 */
export const renderIdentity = ({ id, name, own, withName = true, withMonogram = true }) => {
    const modifier = own ? "c-identity--self" : `c-identity--sender-${hueFor(id)}`;
    const root = el("span", { class: `c-identity ${modifier}` });

    if (withMonogram) {
        root.appendChild(
            el("span", {
                class: "c-identity__monogram",
                text: initialsFor(name),
                attrs: { "aria-hidden": "true" },
            }),
        );
    }

    if (withName) {
        root.appendChild(
            el("span", {
                class: "c-identity__name",
                text: own ? strings.room.you : name,
            }),
        );
    }

    return root;
};
