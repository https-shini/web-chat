// @ts-check

/**
 * Todo texto de interface do produto. Não é i18n — é o fim do texto
 * espalhado pelo DOM e pelo JS. Uma chave, um lugar.
 */
export const strings = {
    entry: {
        submit: "Entrar na sala",
        submitting: "Entrando…",
        nameRequired: "Escreva seu nome completo para entrar.",
        usernameRequired: "Escolha um nome de usuário para entrar.",
        usernameHint: "Único na sala. Letras minúsculas, números, ponto ou _.",
        usernameSuggested: "Sugerido a partir do seu nome. Você pode trocar.",
        usernameValid: "Formato válido. A disponibilidade é conferida ao entrar.",
        usernameChars: "Use só letras minúsculas sem acento, números, ponto ou _.",
        usernameDots: "Não comece nem termine com ponto, nem use dois pontos seguidos.",
        usernameTooShort: "Use pelo menos 3 caracteres.",
        usernameTooLong: "Use no máximo 20 caracteres.",
        slowTitle: "Conectando ao servidor…",
        slowBody:
            "Se ele estava parado, acordar pode levar até um minuto. Você entra assim que ele responder.",
        failedTitle: "Não foi possível conectar.",
        failedBody: "Verifique sua internet ou tente de novo em instantes.",
    },
    room: {
        composerLabel: "Mensagem",
        send: "Enviar",
        you: "Você",
        youBadge: "você",
        /** Sem nome ainda (antes de o servidor confirmar a sala). */
        untitled: "sala",
        topic: "Código {code} · efêmera e anônima",
        topicPending: "Sala efêmera e anônima",
        welcome: "Boas-vindas à {name}!",
        placeholder: "Conversar em {name} — digite / para comandos",
        inviteFailed: "Não foi possível entrar pelo convite ({reason})",
        removed: "Você foi removido da sala por quem a modera.",
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
        private: "Só você vê isto",
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
        host: "anfitrião",
        away: "ausente",
        groupAdmins: "Administradores — {n}",
        groupOnline: "Online — {n}",
        groupAway: "Ausentes — {n}",
        unknown: "A lista volta junto com a conexão.",
        openCard: "{name}: abrir cartão",
    },
    memberCard: {
        roleAdmin: "Administrador",
        roleHost: "Anfitrião da sala",
        roleMember: "Participante",
        online: "Online",
        away: "Ausente",
        awayWith: "Ausente: {reason}",
        profile: "Ver perfil completo",
        copyId: "Copiar @",
        copied: "@ copiado para a área de transferência.",
        copyFailed: "Não foi possível copiar o @.",
        nick: "Trocar meu nome",
        goAway: "Ficar ausente",
        comeBack: "Voltar a ficar presente",
        mute: "Silenciar por 10 minutos",
        unmute: "Liberar mensagens",
        kick: "Remover da sala",
    },
    dialogs: {
        clearAllTitle: "Apagar a conversa para todos?",
        clearAllBody:
            "Todas as mensagens da sala somem da tela de todas as pessoas conectadas. Não dá para desfazer.",
        clearAllConfirm: "Apagar para todos",
        kickTitle: "Remover {name} da sala?",
        kickBody:
            "A pessoa é desconectada agora. Se quiser voltar, entra de novo como uma pessoa nova.",
        kickConfirm: "Remover",
    },
    layout: {
        openSidebar: "Abrir barra lateral",
        closeSidebar: "Fechar barra lateral",
        members: "Pessoas",
        /** @param {number} px */
        width: (px) => `${px} pixels`,
    },
    logout: {
        button: "Sair do chat",
        title: "Sair do chat?",
        body: "Você sai de todas as salas e conversas privadas, elas somem da sua tela e o seu nome de usuário fica livre para outra pessoa. Para voltar, você entra de novo, como uma participação nova.",
        confirm: "Sair",
        done: "Você saiu do chat.",
    },
    conversations: {
        rooms: "Salas",
        dms: "Privadas",
        unread: "{n} não lidas",
        unreadOne: "1 não lida",
        online: "online",
        offline: "offline",
        dmTopic: "@{username} · {presence} · conversa privada",
        dmWelcome: "Início da conversa privada com {name}. Só vocês dois leem.",
        dmPlaceholder: "Mensagem para {name}",
        leaveRoom: "Sair da sala",
        closeDm: "Encerrar conversa",
        block: "Bloquear {name}",
        inviteCopied: "Link de convite copiado.",
        inviteCopyFailed: "Não foi possível copiar. Código da sala: {code}",
        leaveRoomTitle: "Sair de {name}?",
        leaveRoomBody: "A sala some da sua lista. Para voltar, use o código ou o link de convite.",
        leaveRoomConfirm: "Sair da sala",
        closeDmTitle: "Encerrar a conversa com {name}?",
        closeDmBody: "A conversa e todo o histórico somem para vocês dois.",
        closeDmConfirm: "Encerrar",
        blockTitle: "Bloquear {name}?",
        blockBody:
            "A conversa é encerrada e vocês não conseguem abrir outra enquanto você estiver no chat. A pessoa não é avisada.",
        blockConfirm: "Bloquear",
        blocked: "{name} foi bloqueado.",
        leftRoom: "Você saiu de {name}.",
        dmClosedByPeer: "{name} encerrou a conversa privada.",
        dmEnded: "A conversa com {name} terminou: a pessoa saiu do chat.",
        dmClosedSelf: "Conversa com {name} encerrada.",
        dmIncoming: "{name} começou uma conversa privada com você.",
        homeGreeting: "Olá, {name}!",
        homeInvalidCode: "Código inválido. Use o formato abc-defg-hij ou cole o link do convite.",
        homeInvalidUser: "Digite o @ exato da pessoa (3 a 20 letras, números, . ou _).",
        homeSelf: "Esse @ é o seu.",
        homeWorking: "Um instante…",
        newMessageIn: "Nova mensagem em {name}",
    },
    userPanel: {
        online: "Online",
        away: "Ausente",
        admin: "Admin",
        host: "Anfitrião",
        goAway: "Ficar ausente",
        comeBack: "Voltar a ficar presente",
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
        openedConversation: "Conversa {name} aberta. O campo de mensagem está em foco.",
        home: "Início. Crie uma sala, entre com um código ou abra uma conversa privada.",
        newMessageFrom: "{name} diz: {content}",
    },
    errors: {
        generic: "Algo deu errado. Tente de novo.",
        rateLimited:
            "Sua mensagem não foi enviada: você está escrevendo rápido demais. Aguarde um instante e envie de novo.",
        invalidName: "O servidor recusou esse nome. Use de 1 a 60 caracteres.",
        invalidUsername:
            "Nome de usuário recusado: formato inválido ou reservado (como admin ou sistema). Escolha outro.",
        usernameTaken: "Este nome de usuário já está em uso. Escolha outro.",
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
