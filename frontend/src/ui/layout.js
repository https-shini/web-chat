// @ts-check

import { must } from "./dom.js";
import { setIcon } from "./icons.js";
import { strings } from "../i18n/strings.js";

/**
 * Painéis e gavetas.
 *
 * ≥ 80rem  navegação, conversa e painel de contexto lado a lado; o botão
 *          "Dados da conversa" só mostra/esconde o painel.
 * < 80rem  o painel de contexto vira folha sobre a conversa (gaveta à direita).
 * < 48rem  celular, em pilha de telas (decisão D2): a lista de conversas é a
 *          tela de base, a conversa fica por cima e os dados da conversa por
 *          cima dela, cada uma ocupando a tela toda. O botão do cabeçalho vira
 *          "Voltar", e cada nível ganha uma entrada no histórico do navegador
 *          (sem mudar o endereço), então o "voltar" do Android e do navegador
 *          desce um nível em vez de sair do chat.
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

    const wide = window.matchMedia("(min-width: 80rem)");
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

    const membersClosers = /** @type {HTMLButtonElement[]} */ ([
        ...document.querySelectorAll('[data-drawer-close="members"]'),
    ]);
    /**
     * No celular o botão é "Voltar" (seta); no resto, o original.
     * @param {HTMLElement} button
     * @param {string} back
     * @param {string} label
     * @param {string} iconName
     */
    const backOrMenu = (button, back, label, iconName) => {
        const name = stacked() ? "chevron-left" : iconName;
        const host = button.querySelector("[data-icon]");
        if (host && host.getAttribute("data-icon") !== name) setIcon(host, name);
        button.setAttribute("aria-label", stacked() ? back : label);
    };

    /** @param {Panel} panel */
    const isDrawer = (panel) => (panel === "sidebar" ? !medium.matches : !wide.matches);
    /** @param {Panel} panel */
    const node = (panel) => (panel === "sidebar" ? sidebar : members);

    /** Níveis da pilha no celular, de baixo para cima. */
    const LAYERS = /** @type {const} */ (["list", "content", "members"]);
    /** @param {unknown} state @returns {number} -1: entrada que não é nossa */
    const depthOf = (state) =>
        LAYERS.indexOf(
            /** @type {any} */ (
                state && typeof state === "object" && "layer" in state ? state.layer : ""
            ),
        );
    /** Celular (pilha de telas)? */
    const stacked = () => !medium.matches;

    /**
     * Acerta o histórico com a tela visível: empilha uma entrada por nível que
     * subiu, ou volta as que desceram (o `popstate` que vem depois encontra
     * tudo no lugar e não faz nada). O endereço (o convite) não muda.
     */
    const syncHistory = () => {
        if (!inRoom || !stacked()) return;
        const target = drawer === "sidebar" ? 0 : drawer === "members" ? 2 : 1;
        let current = depthOf(history.state);
        if (current === -1) {
            // Primeira vez (ou entrada criada fora daqui, como um convite
            // colado na barra): ela vira a base, a lista.
            history.replaceState({ layer: LAYERS[0] }, "", location.href);
            current = 0;
        }
        if (target > current) {
            for (let depth = current + 1; depth <= target; depth += 1) {
                history.pushState({ layer: LAYERS[depth] }, "", location.href);
            }
        } else if (target < current) {
            history.go(target - current);
        }
    };

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
            else backOrMenu(button, strings.layout.backToList, strings.layout.openSidebar, "menu");
        }
        for (const button of membersClosers) {
            backOrMenu(button, strings.layout.backToChat, strings.layout.closeDetails, "close");
        }
        syncHistory();
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
        if (returnFocus?.isConnected && returnFocus.offsetParent !== null) returnFocus.focus();
        else if (!main.hidden) main.focus({ preventScroll: true });
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
    // "Voltar" do navegador ou do Android no celular: a tela segue o nível da
    // entrada do histórico. Entrada que não é nossa (convite colado na barra)
    // fica com o tratamento do `hashchange`.
    window.addEventListener("popstate", (event) => {
        if (!inRoom || !stacked()) return;
        const depth = depthOf(event.state);
        if (depth === 0 && drawer !== "sidebar") open("sidebar", null);
        else if (depth === 1 && drawer) close();
        else if (depth === 2 && membersAvailable && drawer !== "members") open("members", null);
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
