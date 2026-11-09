/**
 * Catálogo de erros que o servidor envia ao cliente.
 *
 * Cada código pertence a uma categoria. A categoria decide o nível do log
 * (erro do cliente é `warn`; defeito do servidor é `error`) e documenta de
 * quem é a culpa — mas nunca vai para o cliente: ele só recebe `code`
 * (estável, para máquinas) e `message` (texto exibível). Nenhum detalhe
 * interno, stack trace ou dado de outra pessoa sai por aqui.
 */

export const ERROR_CATEGORIES = Object.freeze({
    /** O cliente mandou algo fora do formato do protocolo. */
    PROTOCOL: "protocol",
    /** Formato certo, conteúdo inválido. */
    VALIDATION: "validation",
    /** Operação não permitida no estado atual da conexão. */
    AUTHORIZATION: "authorization",
    /** Limite de taxa atingido. */
    RATE_LIMIT: "rate_limit",
    /** Defeito do servidor. */
    INTERNAL: "internal",
});

export const ERROR_CODES = Object.freeze({
    INVALID_MESSAGE: "invalid_message",
    UNKNOWN_TYPE: "unknown_type",
    INVALID_NAME: "invalid_name",
    INVALID_USERNAME: "invalid_username",
    USERNAME_TAKEN: "username_taken",
    USER_NOT_FOUND: "user_not_found",
    EMPTY_MESSAGE: "empty_message",
    ALREADY_LOGGED_IN: "already_logged_in",
    NOT_LOGGED_IN: "not_logged_in",
    RATE_LIMITED: "rate_limited",
    MUTED: "muted",
    INTERNAL_ERROR: "internal_error",
    // Salas (Fase 2 da evolução)
    INVALID_ROOM_CODE: "invalid_room_code",
    INVALID_ROOM_NAME: "invalid_room_name",
    ROOM_NOT_FOUND: "room_not_found",
    CONVERSATION_NOT_FOUND: "conversation_not_found",
    REMOVED_FROM_ROOM: "removed_from_room",
    ROOM_JOIN_LIMIT: "room_join_limit",
    ROOM_CREATE_LIMIT: "room_create_limit",
    ROOMS_FULL: "rooms_full",
    ROOM_JOIN_LOCKED: "room_join_locked",
});

const { PROTOCOL, VALIDATION, AUTHORIZATION, RATE_LIMIT, INTERNAL } = ERROR_CATEGORIES;

/** Textos já existentes antes da Fase 2 foram mantidos literalmente. */
const CATALOG = Object.freeze({
    [ERROR_CODES.INVALID_MESSAGE]: {
        category: PROTOCOL,
        message: "Mensagem com formato inválido.",
    },
    [ERROR_CODES.UNKNOWN_TYPE]: { category: PROTOCOL, message: "Tipo de mensagem desconhecido." },
    [ERROR_CODES.INVALID_NAME]: {
        category: VALIDATION,
        message: "Nome inválido. Use de 1 a 60 caracteres.",
    },
    [ERROR_CODES.INVALID_USERNAME]: {
        category: VALIDATION,
        message:
            "Username inválido ou reservado. Use de 3 a 20 caracteres: letras minúsculas sem acento, números, ponto ou _.",
    },
    [ERROR_CODES.USER_NOT_FOUND]: {
        category: VALIDATION,
        message: "Usuário indisponível para conversar no momento.",
    },
    [ERROR_CODES.USERNAME_TAKEN]: {
        category: VALIDATION,
        message: "Este username já está em uso. Escolha outro.",
    },
    [ERROR_CODES.EMPTY_MESSAGE]: { category: VALIDATION, message: "Mensagem vazia." },
    [ERROR_CODES.ALREADY_LOGGED_IN]: {
        category: AUTHORIZATION,
        message: "Esta conexão já entrou na sala.",
    },
    [ERROR_CODES.NOT_LOGGED_IN]: { category: AUTHORIZATION, message: "Usuário não autenticado" },
    [ERROR_CODES.RATE_LIMITED]: {
        category: RATE_LIMIT,
        message: "Você está enviando mensagens rápido demais. Aguarde um instante.",
    },
    [ERROR_CODES.MUTED]: {
        category: AUTHORIZATION,
        message: "Você foi silenciado por um administrador e não pode enviar mensagens agora.",
    },
    [ERROR_CODES.INTERNAL_ERROR]: { category: INTERNAL, message: "Erro interno do servidor" },
    [ERROR_CODES.INVALID_ROOM_CODE]: {
        category: VALIDATION,
        message: "Código de sala inválido. O formato é abc-defg-hij.",
    },
    [ERROR_CODES.INVALID_ROOM_NAME]: {
        category: VALIDATION,
        message: "Nome de sala inválido. Use até 40 caracteres.",
    },
    // Mesmo texto para "não existe" e "existe mas você não pode ver": quem
    // tenta adivinhar códigos não aprende nada com a resposta.
    [ERROR_CODES.ROOM_NOT_FOUND]: {
        category: VALIDATION,
        message: "Nenhuma sala ativa com este código. Confira o código ou peça um convite novo.",
    },
    [ERROR_CODES.CONVERSATION_NOT_FOUND]: {
        category: AUTHORIZATION,
        message: "Você não participa desta conversa.",
    },
    [ERROR_CODES.REMOVED_FROM_ROOM]: {
        category: AUTHORIZATION,
        message: "Você foi removido desta sala e não pode voltar a ela nesta sessão.",
    },
    [ERROR_CODES.ROOM_JOIN_LIMIT]: {
        category: AUTHORIZATION,
        message: "Você já está no número máximo de salas. Saia de uma para entrar em outra.",
    },
    [ERROR_CODES.ROOM_CREATE_LIMIT]: {
        category: AUTHORIZATION,
        message: "Você já criou o número máximo de salas ativas. Aguarde uma delas acabar.",
    },
    [ERROR_CODES.ROOMS_FULL]: {
        category: RATE_LIMIT,
        message: "O servidor está no limite de salas agora. Tente de novo em instantes.",
    },
    [ERROR_CODES.ROOM_JOIN_LOCKED]: {
        category: RATE_LIMIT,
        message: "Tentativas demais com códigos inválidos. Aguarde um pouco para tentar de novo.",
    },
});

/**
 * @param {string} code um dos `ERROR_CODES`
 * @returns {{category: string, message: string}}
 */
export const describeError = (code) => {
    const entry = CATALOG[code];
    if (!entry) throw new Error(`Código de erro desconhecido: ${code}`);
    return entry;
};

/** Nível de log para um código: só defeito do servidor é `error`. */
export const logLevelFor = (code) => (describeError(code).category === INTERNAL ? "error" : "warn");
