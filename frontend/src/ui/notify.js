// @ts-check

/**
 * Notificação do navegador — só por escolha explícita da pessoa.
 *
 * 1. Nada é pedido sozinho: a permissão do navegador só é solicitada quando
 *    a pessoa aperta "Ativar notificações". Começa desligado.
 * 2. Ligar e desligar é dela, a qualquer momento (botão no painel "você").
 *    A preferência vale para esta participação e fica só em memória, como
 *    todo o resto: sair do chat desliga.
 * 3. Permissão negada no navegador: nada de insistir. O botão explica uma
 *    vez como liberar nas configurações do site e continua desligado.
 * 4. Só com a aba oculta — com a aba à vista, a própria conversa é o aviso.
 * 5. Privacidade: a central de notificações do sistema guarda histórico e
 *    aparece na tela bloqueada. A notificação nunca leva o texto nem quem
 *    escreveu; numa privada, nem o nome da conversa. Uma por conversa
 *    (`tag`): a nova substitui a anterior.
 *
 * @typedef {"on" | "off" | "denied" | "unsupported"} NotifyState
 */
export const createNotifier = () => {
    const supported = "Notification" in globalThis;
    let enabled = false;

    /** @returns {NotifyState} */
    const state = () => {
        if (!supported) return "unsupported";
        if (Notification.permission === "denied") return "denied";
        return enabled && Notification.permission === "granted" ? "on" : "off";
    };

    return {
        state,

        /**
         * Liga (pede a permissão ao navegador se ainda não foi dada). Chamar
         * só de dentro do clique da pessoa.
         * @returns {Promise<NotifyState>}
         */
        async enable() {
            if (!supported) return "unsupported";
            if (Notification.permission === "default") {
                try {
                    await Notification.requestPermission();
                } catch {
                    // Navegador antigo sem a versão com Promise: fica desligado.
                }
            }
            enabled = Notification.permission === "granted";
            return state();
        },

        /** Desliga (a permissão do navegador continua como a pessoa deixou). */
        disable() {
            enabled = false;
        },

        /**
         * @param {string} title  onde (nome da sala ou "Conversa privada")
         * @param {string} body   genérico: nunca o texto da mensagem
         * @param {string} [tag]  uma notificação por conversa
         */
        show(title, body, tag) {
            if (state() !== "on" || !document.hidden) return;
            try {
                new Notification(title, { body, ...(tag ? { tag } : {}) });
            } catch {
                // Alguns navegadores exigem service worker: falhar aqui não
                // pode derrubar o recebimento da mensagem.
            }
        },
    };
};
