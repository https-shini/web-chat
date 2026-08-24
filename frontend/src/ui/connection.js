// @ts-check

import { format, strings } from "../i18n/strings.js";
import { must } from "./dom.js";

/**
 * Indicador de estado da conexão e o fio da sessão.
 *
 * O fio é a assinatura da interface e não é decoração: ele carrega o mesmo
 * estado que o rótulo, por cor E por padrão de traço. O rótulo em texto é
 * quem responde pela informação; o fio e o ponto são reforço.
 */

/**
 * @typedef {import("../state/store.js").LinkState} LinkState
 */

/**
 * Estado do fio a partir do estado do enlace. "empty" não vem do enlace:
 * é a sala sem nenhuma mensagem, em que o fio nasce e termina num cap.
 * @param {LinkState} link
 * @param {boolean} empty
 * @returns {string}
 */
const threadState = (link, empty) => {
    if (link === "retrying") return "retrying";
    if (link === "offline") return "offline";
    if (link === "online") return empty ? "empty" : "live";
    return "connecting";
};

/**
 * @param {LinkState} link
 * @returns {string}
 */
const label = (link) => {
    switch (link) {
        case "online":
            return strings.conn.online;
        case "retrying":
            return strings.conn.retrying;
        case "offline":
            return strings.conn.offline;
        default:
            return strings.conn.connecting;
    }
};

export const createConnection = () => {
    const root = /** @type {HTMLElement} */ (must(".c-connection"));
    const text = /** @type {HTMLElement} */ (must(".c-connection__label", root));
    const thread = /** @type {HTMLElement} */ (must(".c-thread"));

    return {
        /**
         * @param {LinkState} link
         * @param {number} attempt
         * @param {boolean} empty
         */
        render(link, attempt, empty) {
            const state = link === "idle" ? "connecting" : link;
            root.dataset.state = state;
            text.textContent =
                link === "retrying" && attempt > 0
                    ? format(strings.conn.retryingNth, { n: attempt })
                    : label(link);
            thread.dataset.state = threadState(link, empty);
        },
    };
};
