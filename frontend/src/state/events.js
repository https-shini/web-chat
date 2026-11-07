// @ts-check

import { format, strings } from "../i18n/strings.js";

/**
 * Tradutor de eventos: recebe um fato já decodificado e o transforma em
 * ação de estado. Não sabe por onde o fato chegou — só o que ele significa.
 *
 * @typedef {import("./store.js").Message} Message
 * @typedef {import("./store.js").Store} Store
 */

/**
 * Converte uma mensagem de chat em fato de domínio. O `id` é o atribuído
 * pelo servidor — o mesmo nas mensagens ao vivo e no histórico. Só um
 * servidor antigo, que não o envia, faz cair no id local.
 * @param {any} raw `{ id, payload }`
 * @param {string | null} meId
 * @returns {import("./store.js").Message | null}
 */
const toMessage = (raw, meId) => {
    const payload = raw?.payload;
    if (!payload || typeof payload.content !== "string") return null;
    return {
        id: typeof raw.id === "string" && raw.id !== "" ? raw.id : crypto.randomUUID(),
        kind: "chat",
        userId: String(payload.userId ?? ""),
        userName: String(payload.userName ?? ""),
        content: payload.content,
        timestamp: String(payload.timestamp ?? new Date().toISOString()),
        own: Boolean(meId) && payload.userId === meId,
        pending: false,
    };
};

/**
 * @param {string} content
 * @param {string} timestamp
 * @returns {import("./store.js").Message}
 */
const systemMessage = (content, timestamp) => ({
    id: crypto.randomUUID(),
    kind: "system",
    userId: "",
    userName: "",
    content,
    timestamp,
    own: false,
    pending: false,
});

/**
 * @param {{
 *   store: Store,
 *   toasts: {show: (text: string, kind?: "info" | "error") => void},
 *   notifier: {show: (title: string, body: string) => void},
 *   typingTracker: {set: (id: string, name: string, isTyping: boolean) => void},
 *   onSession?: (resumeToken: string | null) => void,
 *   onRateLimited?: () => void,
 *   onLoginRejected?: (message: string) => void,
 * }} deps
 * @returns {(event: {type: string, payload: unknown, id?: string}) => void}
 */
export const createEventHandler =
    ({
        store,
        toasts,
        notifier,
        typingTracker,
        onSession = () => {},
        onRateLimited = () => {},
        onLoginRejected = () => {},
    }) =>
    (event) => {
        const state = store.getState();
        const meId = state.me?.id ?? null;

        switch (event.type) {
            case "session": {
                // Identidade atribuída pelo servidor (P01). Chega antes do
                // histórico, então as próprias mensagens já são reconhecidas.
                const payload = /** @type {any} */ (event.payload);
                if (typeof payload?.id !== "string" || payload.id === "") break;
                store.actions.setIdentity({
                    id: payload.id,
                    name: typeof payload.name === "string" ? payload.name : (state.me?.name ?? ""),
                });
                onSession(typeof payload.resumeToken === "string" ? payload.resumeToken : null);
                break;
            }

            case "chat_message": {
                const message = toMessage({ id: event.id, payload: event.payload }, meId);
                if (!message) break;
                // Quem envia para de "digitar" no instante em que a mensagem
                // chega, mesmo que o sinal de parada se perca no caminho.
                typingTracker.set(message.userId, message.userName, false);
                store.actions.addMessage(message);
                if (!message.own) {
                    notifier.show(message.userName, message.content);
                }
                break;
            }

            case "message_history": {
                const list = Array.isArray(event.payload) ? event.payload : [];
                const messages = list
                    .map((entry) => toMessage(entry, meId))
                    .filter(
                        /** @returns {item is import("./store.js").Message} */
                        (item) => item !== null,
                    );
                store.actions.mergeHistory(messages);
                break;
            }

            case "chat_cleared": {
                store.actions.replaceMessages([]);
                break;
            }

            case "user_list": {
                const list = Array.isArray(event.payload) ? event.payload : [];
                store.actions.setPeople(
                    list.map((person) => ({
                        id: String(person?.id ?? ""),
                        name: String(person?.name ?? ""),
                    })),
                );
                break;
            }

            case "user_typing": {
                const payload = /** @type {any} */ (event.payload);
                const id = String(payload?.userId ?? "");
                if (id && id !== meId) {
                    typingTracker.set(
                        id,
                        String(payload?.userName ?? ""),
                        Boolean(payload?.isTyping),
                    );
                }
                break;
            }

            case "user_joined": {
                const payload = /** @type {any} */ (event.payload);
                store.actions.addMessage(
                    systemMessage(
                        format(strings.system.joined, { name: String(payload?.userName ?? "") }),
                        String(payload?.timestamp ?? new Date().toISOString()),
                    ),
                );
                break;
            }

            case "user_left": {
                const payload = /** @type {any} */ (event.payload);
                store.actions.addMessage(
                    systemMessage(
                        format(strings.system.left, { name: String(payload?.userName ?? "") }),
                        String(payload?.timestamp ?? new Date().toISOString()),
                    ),
                );
                break;
            }

            case "error": {
                const payload = /** @type {any} */ (event.payload);
                const code = typeof payload?.code === "string" ? payload.code : null;
                const message = String(payload?.message ?? strings.errors.generic);
                if (code === "rate_limited") {
                    // A mensagem NÃO foi enviada: dizer isso e devolver o texto
                    // ao campo, em vez de deixar o usuário supor que foi.
                    toasts.show(strings.errors.rateLimited, "error");
                    onRateLimited();
                    break;
                }
                if (code === "invalid_name") {
                    onLoginRejected(strings.errors.invalidName);
                    break;
                }
                toasts.show(message, "error");
                break;
            }

            default: {
                // Tipo desconhecido: ignorar mantém o cliente compatível com
                // um servidor mais novo.
                break;
            }
        }
    };
