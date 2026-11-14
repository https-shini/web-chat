// @ts-check

import { must } from "./dom.js";
import { strings } from "../i18n/strings.js";

/**
 * Confirmação para ações destrutivas, sobre o `<dialog>` nativo: foco
 * preso, Escape e fundo vêm do navegador. Devolve o foco a quem chamou.
 */
export const createDialog = () => {
    const dialog = /** @type {HTMLDialogElement} */ (must(".c-dialog"));
    const title = /** @type {HTMLElement} */ (must(".c-dialog__title", dialog));
    const body = /** @type {HTMLElement} */ (must(".c-dialog__body", dialog));
    const confirmButton = /** @type {HTMLButtonElement} */ (must(".c-dialog__confirm", dialog));

    /** @type {((ok: boolean) => void) | null} */
    let settle = null;
    /** @type {HTMLElement | null} */
    let returnFocus = null;

    dialog.addEventListener("close", () => {
        settle?.(dialog.returnValue === "confirm");
        settle = null;
        if (returnFocus?.isConnected) returnFocus.focus();
        returnFocus = null;
    });

    // Clique no fundo (fora do painel) cancela, como Escape.
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close("cancel");
    });

    return {
        /**
         * @param {{title: string, body: string, confirmLabel: string, cancelLabel?: string}} options
         * @returns {Promise<boolean>}
         */
        confirm(options) {
            if (dialog.open) dialog.close("cancel");
            title.textContent = options.title;
            body.textContent = options.body;
            confirmButton.textContent = options.confirmLabel;
            const cancelButton = dialog.querySelector('button[value="cancel"]');
            if (cancelButton)
                cancelButton.textContent = options.cancelLabel ?? strings.dialog.cancel;
            returnFocus =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
            dialog.returnValue = "";
            return new Promise((resolve) => {
                settle = resolve;
                dialog.showModal();
                // Ação destrutiva: o foco começa no "Cancelar".
                const cancel = dialog.querySelector('button[value="cancel"]');
                if (cancel instanceof HTMLElement) cancel.focus();
            });
        },
    };
};
