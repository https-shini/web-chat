// @ts-check

/**
 * Todo texto de interface do produto. Não é i18n — é o fim do texto
 * espalhado pelo DOM e pelo JS. Uma chave, um lugar.
 */
export const strings = {
    entry: {
        title: "Sala aberta.",
        subtitle: "Ninguém sabe quem você é.",
        nameLabel: "Como quer ser chamado",
        submit: "Entrar",
        submitting: "Entrando…",
        ephemeralNote: "A conversa some quando você sai.",
        nameRequired: "Escreva um nome para entrar.",
    },
    room: {
        composerLabel: "Mensagem",
        send: "Enviar",
        you: "Você",
    },
    empty: {
        title: "Silêncio por enquanto.",
        body: "Você é a primeira pessoa aqui. Escreva a primeira linha.",
    },
    conn: {
        connecting: "conectando…",
        online: "conectado",
        retrying: "reconectando…",
        offline: "sem conexão",
        retryingNth: "Tentando reconectar ({n}ª tentativa)…",
        lostTitle: "A conexão caiu.",
        lostBody: "Tentamos {n} vezes e paramos.",
        retryNow: "Tentar de novo",
        queued: "Sua mensagem fica na fila até a conexão voltar.",
        restored: "Conexão restabelecida.",
    },
    peopleCount: {
        one: "1 pessoa",
        many: "{n} pessoas",
        unknown: "— pessoas",
    },
    system: {
        joined: "{name} entrou na sala",
        left: "{name} saiu da sala",
        cleared: "A conversa foi apagada para todos por {name}",
        localCleared: "Conversa limpa só na sua tela. Ninguém mais foi afetado.",
    },
    delivery: {
        pending: "enviando…",
        failed: "não enviada",
        retry: "Tentar de novo",
        timeout: "O servidor não confirmou o recebimento.",
        announceFailed: "Sua mensagem não foi enviada: {reason}",
    },
    message: {
        announcement: "Aviso",
        spoilerShow: "Mostrar spoiler",
        spoilerHide: "Esconder spoiler",
    },
    commands: {
        helpTitle: "Comandos",
        helpIntro: "Digite / para ver sugestões enquanto escreve.",
        helpFooter:
            "Detalhes de um comando: /help nome (ex.: /help roll). 🔒 = só administradores.",
        timeNote: "Horário deste dispositivo.",
        ping: "pong — ida e volta até o servidor: {ms} ms",
        suggestionsLabel: "Comandos sugeridos",
        adminOnly: "só administradores",
        syntax: "Uso: {syntax}",
        removedTitle: "Você foi removido da sala.",
        removedBody:
            "Um administrador removeu você. Você pode entrar de novo, como uma nova pessoa.",
        rejoin: "Entrar de novo",
    },
    people: {
        admin: "admin",
        away: "ausente",
    },
    typing: {
        one: "{name} está digitando…",
        two: "{a} e {b} estão digitando…",
        many: "várias pessoas estão digitando…",
    },
    theme: {
        toLight: "Mudar para tema claro",
        toDark: "Mudar para tema escuro",
        nowLight: "Tema claro ativado.",
        nowDark: "Tema escuro ativado.",
    },
    a11y: {
        skipToRoom: "Ir para a conversa",
        enteredRoom: "Você entrou na sala. O campo de mensagem está em foco.",
        newMessageFrom: "{name} diz: {content}",
    },
    errors: {
        generic: "Algo deu errado. Tente de novo.",
        rateLimited:
            "Sua mensagem não foi enviada: você está escrevendo rápido demais. Aguarde um instante e envie de novo.",
        invalidName: "O servidor recusou esse nome. Escolha outro com letras ou números.",
    },
};

/**
 * Substitui marcadores `{chave}` por valores.
 * @param {string} template
 * @param {Record<string, string | number>} values
 * @returns {string}
 */
export const format = (template, values) =>
    template.replace(/\{(\w+)\}/g, (match, key) =>
        Object.hasOwn(values, key) ? String(values[key]) : match,
    );

/**
 * Contagem de pessoas com plural correto.
 * @param {number} count
 * @returns {string}
 */
export const peopleCount = (count) =>
    count === 1 ? strings.peopleCount.one : format(strings.peopleCount.many, { n: count });
