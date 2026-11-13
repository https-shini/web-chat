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
 *    própria conversa já é o aviso;
 * 3. privacidade: a central de notificações do sistema guarda histórico e
 *    aparece na tela bloqueada. Por isso a notificação nunca leva o texto
 *    da mensagem nem quem a escreveu — numa privada, nem o nome da
 *    conversa. Só "nova mensagem" e onde. Uma por conversa (`tag`).
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
         * @param {string} title  onde (nome da sala ou "Conversa privada")
         * @param {string} body   genérico: nunca o texto da mensagem
         * @param {string} [tag]  uma notificação por conversa: a nova substitui a anterior
         */
        show(title, body, tag) {
            if (!supported) return;
            if (!document.hidden) return;
            if (Notification.permission !== "granted") return;
            try {
                new Notification(title, { body, ...(tag ? { tag } : {}), silent: false });
            } catch {
                // Alguns navegadores exigem service worker: falhar aqui não
                // pode derrubar o recebimento da mensagem.
            }
        },
    };
};
