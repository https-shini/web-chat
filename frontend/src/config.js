// @ts-check

/**
 * Configuração do cliente. Nenhuma URL fica gravada no código de aplicação:
 * o valor vem de `VITE_SOCKET_URL` e, na ausência dela, de um padrão local —
 * o projeto roda offline sem editar arquivo.
 */

/** Porta em que o backend deste repositório sobe por padrão. */
const LOCAL_PORT = 8080;

/**
 * Deriva um endereço local a partir do host que está servindo a página.
 * Mantém `ws://` em desenvolvimento e `wss://` sob HTTPS, evitando o
 * bloqueio de conteúdo misto.
 * @returns {string}
 */
const localFallback = () => {
    const secure = globalThis.location?.protocol === "https:";
    const host = globalThis.location?.hostname || "localhost";
    return `${secure ? "wss" : "ws"}://${host}:${LOCAL_PORT}`;
};

/**
 * Endereço do servidor de tempo real.
 *
 * O acesso é opcional porque `import.meta.env` só existe quando o código
 * passa por um bundler. Servido cru, sem build, `import.meta.env` é
 * `undefined` e o acesso direto lançaria TypeError, derrubando a aplicação
 * antes da primeira linha útil.
 * @type {string}
 */
export const SOCKET_URL = import.meta.env?.VITE_SOCKET_URL || localFallback();

/** Parâmetros de reconexão: exponencial, com teto e jitter. */
export const RECONNECT = {
    /** Atraso da primeira nova tentativa, em ms. */
    baseDelay: 500,
    /** Teto do atraso, em ms — o backoff nunca passa disso. */
    maxDelay: 15000,
    /** Tentativas automáticas antes de exigir ação manual. */
    maxAttempts: 6,
    /** Fração do atraso sorteada como jitter (0.3 = ±30%). */
    jitter: 0.3,
};

/** Limites do protocolo, espelhando o que o servidor aceita. */
export const LIMITS = {
    nameMaxLength: 30,
    messageMaxLength: 1000,
};

/** Tempos de interface, em ms. */
export const TIMING = {
    /** Silêncio no teclado que encerra o "está digitando". */
    typingIdle: 2000,
    /** Quanto um aviso fica na tela. */
    toastLife: 5000,
};

/** Chave de persistência do tema escolhido. */
export const THEME_STORAGE_KEY = "web-chat:theme";
