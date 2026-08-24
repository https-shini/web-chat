// @ts-check

/**
 * Notificação do navegador.
 *
 * Duas regras, e as duas são correções do comportamento anterior, que pedia
 * permissão no login — padrão que os navegadores penalizam e que os usuários
 * negam por reflexo:
 *
 * 1. a permissão só é pedida em resposta a um gesto do usuário (o primeiro
 *    envio de mensagem), nunca ao carregar ou ao entrar;
 * 2. a notificação só é exibida com a aba oculta — com a aba à vista, a
 *    própria conversa já é o aviso.
 */
export const createNotifier = () => {
    const supported = "Notification" in globalThis;
    let asked = false;

    return {
        /** Chamar apenas de dentro de um manipulador de gesto do usuário. */
        requestOnGesture() {
            if (!supported || asked) return;
            asked = true;
            if (Notification.permission === "default") {
                void Notification.requestPermission();
            }
        },

        /**
         * @param {string} title
         * @param {string} body
         */
        show(title, body) {
            if (!supported) return;
            if (!document.hidden) return;
            if (Notification.permission !== "granted") return;
            try {
                new Notification(title, { body });
            } catch {
                // Alguns navegadores exigem service worker: falhar aqui não
                // pode derrubar o recebimento da mensagem.
            }
        },
    };
};
