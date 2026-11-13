// @ts-check

import { authorKey } from "./store.js";

/**
 * Quem saiu da conversa aberta, pela chave de autor (@ + número): quem
 * saiu enquanto você estava, mais quem escreveu no histórico e não está nem
 * esteve na sala desde que você entrou. Numa privada, a outra pessoa sair
 * encerra a conversa — não há o que marcar.
 * @param {Pick<import("./store.js").State, "room" | "authorsLeft" | "authorsSeen" | "messages">} state
 * @returns {Set<string>}
 */
export const departedAuthors = (state) => {
    if (state.room?.kind === "dm") return new Set();
    const gone = new Set(state.authorsLeft);
    const seen = new Set(state.authorsSeen);
    // Lista de pessoas ainda não chegou: não dá para afirmar quem saiu.
    if (seen.size === 0) return gone;
    for (const message of state.messages) {
        if (message.kind !== "chat" || message.own) continue;
        const key = authorKey(message.username, message.author);
        if (key && !seen.has(key)) gone.add(key);
    }
    return gone;
};
