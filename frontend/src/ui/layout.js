// @ts-check

import { must } from "./dom.js";

/**
 * Painéis e gavetas.
 *
 * ≥ 64rem  barra lateral e pessoas lado a lado com a conversa; o botão de
 *          pessoas só mostra/esconde o painel.
 * < 64rem  pessoas vira gaveta à direita.
 * < 48rem  a barra lateral também vira gaveta, à esquerda.
 *
 * Gaveta aberta: o resto da tela fica `inert` (foco e leitor de tela não
 * escapam para trás do fundo escurecido), Escape ou clique no fundo fecham,
 * e o foco volta para quem abriu.
 *
 * @typedef {"sidebar" | "members"} Panel
 */

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex="0"]';

export const createLayout = () => {
    const sidebar = /** @type {HTMLElement} */ (must(".c-sidebar"));
    const members = /** @type {HTMLElement} */ (must(".c-members"));
    const main = /** @type {HTMLElement} */ (must(".c-main"));
    const scrim = /** @type {HTMLElement} */ (must("[data-scrim]"));
    /** Link "Ir para a conversa": fora do app, também fica inerte com a gaveta aberta. */
    const skipLink = /** @type {HTMLElement | null} */ (document.querySelector(".c-skip-link"));
    const openers = /** @type {HTMLButtonElement[]} */ ([
        ...document.querySelectorAll("[data-drawer-open]"),
    ]);

    const wide = window.matchMedia("(min-width: 64rem)");
    const medium = window.matchMedia("(min-width: 48rem)");

    let inRoom = false;
    /** O painel de pessoas faz sentido aqui? (Não no início nem numa privada.) */
    let membersAvailable = false;
    /** Gaveta aberta agora (só existe em telas estreitas). @type {Panel | null} */
    let drawer = null;
    /** Preferência no desktop: painel de pessoas visível. */
    let membersPinned = true;
    /** @type {HTMLElement | null} */
    let returnFocus = null;
    /** Avisados a cada mudança de painel (ex.: bordas de redimensionar). @type {(() => void)[]} */
    const listeners = [];

    /** @param {Panel} panel */
    const isDrawer = (panel) => (panel === "sidebar" ? !medium.matches : !wide.matches);
    /** @param {Panel} panel */
    const node = (panel) => (panel === "sidebar" ? sidebar : members);

    const sync = () => {
        if (drawer && !isDrawer(drawer)) drawer = null;
        if (drawer === "members" && !membersAvailable) drawer = null;

        sidebar.hidden = !inRoom || (isDrawer("sidebar") && drawer !== "sidebar");
        members.hidden =
            !inRoom ||
            !membersAvailable ||
            (isDrawer("members") ? drawer !== "members" : !membersPinned);

        const open = inRoom && drawer !== null;
        scrim.hidden = !open;
        // Atrás da gaveta, nada é alcançável.
        main.inert = open;
        if (skipLink) skipLink.inert = open;
        sidebar.inert = open && drawer !== "sidebar";
        members.inert = open && drawer !== "members";

        for (const button of openers) {
            const panel = /** @type {Panel} */ (button.dataset.drawerOpen);
            button.setAttribute("aria-expanded", String(!node(panel).hidden));
            if (panel === "members") button.hidden = !membersAvailable;
        }
        for (const listener of listeners) listener();
    };

    /** @param {Panel} panel @param {HTMLElement | null} opener */
    const open = (panel, opener) => {
        drawer = panel;
        returnFocus = opener;
        sync();
        const target = node(panel).querySelector(FOCUSABLE);
        if (target instanceof HTMLElement) target.focus();
    };

    const close = () => {
        if (!drawer) return;
        drawer = null;
        sync();
        if (returnFocus?.isConnected) returnFocus.focus();
        returnFocus = null;
    };

    for (const button of openers) {
        button.addEventListener("click", () => {
            const panel = /** @type {Panel} */ (button.dataset.drawerOpen);
            if (!isDrawer(panel)) {
                // Desktop: pessoas só aparece/some; nada de gaveta.
                if (panel === "members") membersPinned = !membersPinned;
                sync();
                return;
            }
            if (drawer === panel) close();
            else open(panel, button);
        });
    }

    for (const button of document.querySelectorAll("[data-drawer-close]")) {
        button.addEventListener("click", close);
    }
    scrim.addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && drawer && !event.defaultPrevented) {
            event.preventDefault();
            close();
            return;
        }
        // Gaveta aberta é modal: Tab e Shift+Tab circulam dentro dela, como
        // num diálogo, em vez de sair para a página escurecida (inerte) ou
        // para fora do documento.
        if (event.key === "Tab" && drawer) {
            const items = /** @type {HTMLElement[]} */ ([
                ...node(drawer).querySelectorAll(FOCUSABLE),
            ]).filter((item) => item.offsetParent !== null || item === document.activeElement);
            if (items.length === 0) return;
            const first = /** @type {HTMLElement} */ (items[0]);
            const last = /** @type {HTMLElement} */ (items[items.length - 1]);
            const inside = node(drawer).contains(document.activeElement);
            if (event.shiftKey && (document.activeElement === first || !inside)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
                event.preventDefault();
                first.focus();
            }
        }
    });
    wide.addEventListener("change", sync);
    medium.addEventListener("change", sync);

    return {
        /**
         * @param {boolean} value  dentro do chat (início ou conversa): há barra lateral
         * @param {boolean} [members]  há painel de pessoas (sala aberta)
         */
        setInRoom(value, members = value) {
            inRoom = value;
            membersAvailable = value && members;
            if (!value) drawer = null;
            sync();
        },

        /** Fecha a gaveta aberta (ex.: depois de escolher um atalho nela). */
        closeDrawer: close,

        /** Há gaveta aberta? */
        hasDrawer: () => drawer !== null,

        /**
         * O painel está visível e encaixado ao lado da conversa (não é gaveta)?
         * Só nesse caso a largura dele é ajustável.
         * @param {Panel} panel
         */
        isDocked: (panel) => inRoom && !node(panel).hidden && !isDrawer(panel),

        /** @param {() => void} listener chamado depois de cada mudança de painel */
        onChange(listener) {
            listeners.push(listener);
        },
    };
};
