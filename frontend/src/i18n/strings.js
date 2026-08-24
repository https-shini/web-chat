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
    people: {
        one: "1 pessoa",
        many: "{n} pessoas",
        unknown: "— pessoas",
    },
    system: {
        joined: "{name} entrou na sala",
        left: "{name} saiu da sala",
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
    count === 1 ? strings.people.one : format(strings.people.many, { n: count });
