// @ts-check

/**
 * Organização da lista de conversas: fixadas, ordem escolhida pela pessoa,
 * seções recolhidas, lista mista e filtro de não lidas. Funções puras.
 *
 * Regras (decisões D1 e D4 do plano):
 * - Tudo vive em memória, pela vida da identidade. Não há conta para guardar
 *   entre sessões, e gravar ids de conversas no navegador deixaria rastro.
 * - Fixar leva a conversa para "Fixadas" e a tira da lista de origem (sem
 *   aparecer duas vezes); desafixar a devolve ao lugar em que estava.
 * - Conversa nova entra no topo da sua lista. Mensagem nova NÃO reordena: a
 *   ordem é da pessoa.
 * - Conversa que deixa de existir some das fixadas e da ordem.
 *
 * O padrão de seções e de reordenar pelo teclado (pegar, mover, soltar)
 * segue o que o Fluxer faz na lista de privadas e favoritos — implementação
 * própria, sem código dele.
 *
 * @typedef {import("./store.js").ConversationEntry} ConversationEntry
 * @typedef {"pinned" | "rooms" | "dms" | "all"} SectionId
 * @typedef {{
 *   pinned: string[],
 *   order: string[],
 *   collapsed: Record<SectionId, boolean>,
 *   mixed: boolean,
 *   unreadOnly: boolean,
 * }} NavPrefs
 * @typedef {{id: SectionId, items: ConversationEntry[], unread: number, total: number, collapsed: boolean}} Section
 */

/** @returns {NavPrefs} */
export const initialNav = () => ({
    pinned: [],
    order: [],
    collapsed: { pinned: false, rooms: false, dms: false, all: false },
    mixed: false,
    unreadOnly: false,
});

/** @param {ConversationEntry} entry */
const isDm = (entry) => entry.kind === "dm";

/**
 * Garante que toda conversa existente está na ordem (as novas no topo) e
 * que nada aponta para conversa que acabou.
 * @param {NavPrefs} nav
 * @param {ConversationEntry[]} conversations
 * @returns {NavPrefs}
 */
export const reconcile = (nav, conversations) => {
    const ids = new Set(conversations.map((entry) => entry.conversationId));
    const known = nav.order.filter((id) => ids.has(id));
    const knownSet = new Set(known);
    // As que ainda não estão na ordem: a mais recente primeiro.
    const fresh = conversations
        .map((entry) => entry.conversationId)
        .filter((id) => !knownSet.has(id))
        .reverse();
    const order = [...fresh, ...known];
    const pinned = nav.pinned.filter((id) => ids.has(id));
    const same =
        order.length === nav.order.length &&
        order.every((id, i) => id === nav.order[i]) &&
        pinned.length === nav.pinned.length;
    return same ? nav : { ...nav, order, pinned };
};

/**
 * As conversas na ordem da pessoa.
 * @param {NavPrefs} nav
 * @param {ConversationEntry[]} conversations
 */
const ordered = (nav, conversations) => {
    const byId = new Map(conversations.map((entry) => [entry.conversationId, entry]));
    return reconcile(nav, conversations)
        .order.map((id) => byId.get(id))
        .filter(/** @returns {entry is ConversationEntry} */ (entry) => entry !== undefined);
};

/**
 * Seções na ordem obrigatória: Fixadas, Salas, Privadas (ou, com a lista
 * mista, Fixadas e Conversas). Fixadas vazia não aparece. Com o filtro de
 * não lidas, só ficam as que têm não lidas — e a aberta, para a pessoa não
 * perder onde está.
 * @param {NavPrefs} nav
 * @param {ConversationEntry[]} conversations
 * @param {string | null} currentId
 * @returns {Section[]}
 */
export const sectionsOf = (nav, conversations, currentId = null) => {
    const byId = new Map(conversations.map((entry) => [entry.conversationId, entry]));
    const pinnedSet = new Set(nav.pinned);
    /** @param {ConversationEntry[]} list */
    const visible = (list) =>
        nav.unreadOnly
            ? list.filter((entry) => entry.unread > 0 || entry.conversationId === currentId)
            : list;
    /** @param {SectionId} id @param {ConversationEntry[]} list @returns {Section} */
    const section = (id, list) => ({
        id,
        items: visible(list),
        unread: list.reduce((sum, entry) => sum + entry.unread, 0),
        total: list.length,
        collapsed: nav.collapsed[id],
    });
    const pinned = nav.pinned
        .map((id) => byId.get(id))
        .filter(/** @returns {entry is ConversationEntry} */ (entry) => entry !== undefined);
    const rest = ordered(nav, conversations).filter(
        (entry) => !pinnedSet.has(entry.conversationId),
    );
    /** @type {Section[]} */
    const sections = [];
    if (pinned.length) sections.push(section("pinned", pinned));
    if (nav.mixed) {
        sections.push(section("all", rest));
    } else {
        sections.push(
            section(
                "rooms",
                rest.filter((entry) => !isDm(entry)),
            ),
        );
        sections.push(section("dms", rest.filter(isDm)));
    }
    return sections;
};

/**
 * Conversas na ordem em que aparecem na tela (para Alt+↑/↓), sem as de
 * seções recolhidas — exceto a aberta.
 * @param {NavPrefs} nav
 * @param {ConversationEntry[]} conversations
 * @param {string | null} currentId
 */
export const visualOrder = (nav, conversations, currentId = null) =>
    sectionsOf({ ...nav, unreadOnly: false }, conversations, currentId).flatMap((section) =>
        section.collapsed
            ? section.items.filter((entry) => entry.conversationId === currentId)
            : section.items,
    );

/**
 * Seção em que a conversa está agora.
 * @param {NavPrefs} nav
 * @param {ConversationEntry | undefined} entry
 * @returns {SectionId}
 */
export const sectionOf = (nav, entry) => {
    if (!entry) return "rooms";
    if (nav.pinned.includes(entry.conversationId)) return "pinned";
    if (nav.mixed) return "all";
    return isDm(entry) ? "dms" : "rooms";
};

/**
 * Fixa ou desafixa.
 * @param {NavPrefs} nav
 * @param {string} id
 * @param {boolean} [value]  padrão: inverte
 * @param {number} [at]  posição em Fixadas (padrão: no fim)
 * @returns {NavPrefs}
 */
export const setPinned = (nav, id, value = !nav.pinned.includes(id), at = -1) => {
    const without = nav.pinned.filter((item) => item !== id);
    if (!value) return { ...nav, pinned: without };
    const index = at < 0 || at > without.length ? without.length : at;
    return { ...nav, pinned: [...without.slice(0, index), id, ...without.slice(index)] };
};

/**
 * Coloca `ids` (na nova ordem relativa) nos mesmos lugares que ocupavam em
 * `order`, sem mexer nos outros.
 * @param {string[]} order
 * @param {string[]} ids
 */
const reslot = (order, ids) => {
    const set = new Set(ids);
    let next = 0;
    return order.map((id) => (set.has(id) ? /** @type {string} */ (ids[next++]) : id));
};

/**
 * Move uma conversa para `to` (índice dentro da própria seção).
 * @param {NavPrefs} nav
 * @param {ConversationEntry[]} conversations
 * @param {string} id
 * @param {number} to
 * @returns {{nav: NavPrefs, position: number, total: number, section: SectionId} | null}
 */
export const moveTo = (nav, conversations, id, to) => {
    const synced = reconcile(nav, conversations);
    const entry = conversations.find((item) => item.conversationId === id);
    if (!entry) return null;
    const section = sectionOf(synced, entry);
    const list =
        sectionsOf({ ...synced, unreadOnly: false }, conversations)
            .find((item) => item.id === section)
            ?.items.map((item) => item.conversationId) ?? [];
    const from = list.indexOf(id);
    if (from < 0) return null;
    const target = Math.max(0, Math.min(list.length - 1, to));
    const moved = list.filter((item) => item !== id);
    moved.splice(target, 0, id);
    const next =
        section === "pinned"
            ? { ...synced, pinned: moved }
            : { ...synced, order: reslot(synced.order, moved) };
    return { nav: next, position: target + 1, total: list.length, section };
};

/**
 * Move uma posição para cima (-1) ou para baixo (+1).
 * @param {NavPrefs} nav
 * @param {ConversationEntry[]} conversations
 * @param {string} id
 * @param {-1 | 1} delta
 */
export const moveBy = (nav, conversations, id, delta) => {
    const synced = reconcile(nav, conversations);
    const entry = conversations.find((item) => item.conversationId === id);
    if (!entry) return null;
    const section = sectionOf(synced, entry);
    const list =
        sectionsOf({ ...synced, unreadOnly: false }, conversations)
            .find((item) => item.id === section)
            ?.items.map((item) => item.conversationId) ?? [];
    const from = list.indexOf(id);
    if (from < 0) return null;
    const to = from + delta;
    if (to < 0 || to >= list.length) return null;
    return moveTo(synced, conversations, id, to);
};

/**
 * Posição da conversa dentro da seção (para habilitar "Mover para cima/baixo").
 * @param {NavPrefs} nav
 * @param {ConversationEntry[]} conversations
 * @param {string} id
 * @returns {{index: number, total: number, section: SectionId}}
 */
export const positionOf = (nav, conversations, id) => {
    const entry = conversations.find((item) => item.conversationId === id);
    const section = sectionOf(nav, entry);
    const list =
        sectionsOf({ ...nav, unreadOnly: false }, conversations)
            .find((item) => item.id === section)
            ?.items.map((item) => item.conversationId) ?? [];
    return { index: list.indexOf(id), total: list.length, section };
};

/**
 * Próxima conversa (com volta) a partir da aberta, na ordem da tela.
 * @param {NavPrefs} nav
 * @param {ConversationEntry[]} conversations
 * @param {string | null} currentId
 * @param {1 | -1} delta
 * @param {{unreadOnly?: boolean}} [options]
 * @returns {string | null}
 */
export const neighbor = (nav, conversations, currentId, delta, { unreadOnly = false } = {}) => {
    const list = visualOrder(nav, conversations, currentId);
    if (list.length === 0) return null;
    const start = list.findIndex((entry) => entry.conversationId === currentId);
    for (let i = 1; i <= list.length; i += 1) {
        const index =
            ((((start === -1 ? (delta > 0 ? -1 : 0) : start) + delta * i) % list.length) +
                list.length) %
            list.length;
        const entry = list[index];
        if (!entry || entry.conversationId === currentId) continue;
        if (unreadOnly && entry.unread === 0) continue;
        return entry.conversationId;
    }
    return null;
};
