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
    EMPTY_MESSAGE: "empty_message",
    ALREADY_LOGGED_IN: "already_logged_in",
    NOT_LOGGED_IN: "not_logged_in",
    RATE_LIMITED: "rate_limited",
    INTERNAL_ERROR: "internal_error",
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
        message: "Nome inválido. Use de 1 a 30 caracteres.",
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
    [ERROR_CODES.INTERNAL_ERROR]: { category: INTERNAL, message: "Erro interno do servidor" },
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
