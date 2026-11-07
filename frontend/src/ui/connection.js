// @ts-check

import { format, strings } from "../i18n/strings.js";
import { must } from "./dom.js";

/**
 * Estado da conexão em dois lugares: a linha da barra lateral (região de
 * status, é ela que leitores de tela ouvem) e a pílula do cabeçalho
 * (repetição visual, `aria-hidden`, some quando está tudo bem).
 *
 * O texto é quem informa; o ponto colorido é só reforço.
 *
 * @typedef {import("../state/store.js").LinkState} LinkState
 */

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
    const row = /** @type {HTMLElement} */ (must(".c-connection"));
    const rowText = /** @type {HTMLElement} */ (must(".c-connection__label", row));
    const pill = /** @type {HTMLElement} */ (must(".c-status-pill"));
    const pillText = /** @type {HTMLElement} */ (must(".c-status-pill__label", pill));

    return {
        /**
         * @param {LinkState} link
         * @param {number} attempt
         */
        render(link, attempt) {
            const state = link === "idle" ? "connecting" : link;
            const text =
                link === "retrying" && attempt > 0
                    ? format(strings.conn.retryingNth, { n: attempt })
                    : label(link);
            row.dataset.state = state;
            pill.dataset.state = state;
            rowText.textContent = text;
            pillText.textContent = label(link);
        },
    };
};
