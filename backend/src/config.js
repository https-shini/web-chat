/**
 * Configuração do servidor: carregamento dos arquivos `.env` e validação.
 *
 * `loadConfig` é pura (recebe o ambiente, devolve a configuração ou lança
 * `ConfigError`) para que cada regra seja testável sem subir processo.
 * Todos os padrões reproduzem o comportamento anterior à Fase 2.
 */

import path from "node:path";
import dotenv from "dotenv";

export class ConfigError extends Error {
    /** @param {string} variable @param {string} message */
    constructor(variable, message) {
        super(message);
        this.name = "ConfigError";
        this.variable = variable;
    }
}

/**
 * Carrega o `.env` da raiz do repositório e, depois, `backend/.env`.
 * O dotenv nunca sobrescreve o que já está definido, então a ordem das
 * chamadas É a precedência: ambiente do processo > raiz > `backend/.env`.
 * `backend/.env` continua aceito por compatibilidade (Fase 1, F1-02).
 * @param {string} backendDir diretório `backend/`
 */
export const loadEnvFiles = (backendDir) => {
    dotenv.config({ path: path.resolve(backendDir, "..", ".env") });
    dotenv.config({ path: path.resolve(backendDir, ".env") });
};

/** Valores padrão — os mesmos que o servidor usava fixos no código. */
export const DEFAULTS = Object.freeze({
    port: 8080,
    heartbeatMs: 30000,
    maxConnections: 500,
    maxPayloadBytes: 16 * 1024,
    rateMessagesCapacity: 40,
    rateMessagesPerSec: 8,
    rateSignalsCapacity: 40,
    rateSignalsPerSec: 8,
    // Por sala (Fase 2 da evolução: eram 1000 numa sala única). Com até
    // `maxRooms` salas, 200 mensagens de até 1000 caracteres por sala
    // limitam o pior caso de memória a cerca de 120 MB.
    historySize: 200,
    historyOnJoin: 50,
    heartbeatMaxMissed: 2,
    maxBufferedBytes: 1024 * 1024,
    loginTimeoutMs: 30000,
    metricsLogIntervalMs: 60000,
    leaveGraceMs: 10000,
    maxRooms: 500,
    maxRoomsPerUser: 10,
    maxRoomsCreatedPerUser: 5,
    roomEmptyTtlMs: 60000,
    maxDmsPerUser: 20,
    maxDms: 5000,
    dmHistorySize: 100,
});

const isBlank = (raw) => raw === undefined || raw === "";

/**
 * Inteiro dentro de um intervalo, ou o padrão quando ausente.
 * @param {string} variable
 * @param {string | undefined} raw
 * @param {{fallback: number, min: number, max?: number, unit?: string}} rule
 */
const readInteger = (
    variable,
    raw,
    { fallback, min, max = Number.MAX_SAFE_INTEGER, unit = "" },
) => {
    if (isBlank(raw)) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(String(raw)) || value < min || value > max) {
        const range =
            max === Number.MAX_SAFE_INTEGER ? `no mínimo ${min}` : `entre ${min} e ${max}`;
        throw new ConfigError(
            variable,
            `${variable} deve ser um inteiro ${range}${unit} (recebido: "${raw}").`,
        );
    }
    return value;
};

/** `true`/`false` (ou ausente = false). Qualquer outro valor é erro. */
const readBoolean = (variable, raw) => {
    if (isBlank(raw) || raw === "false") return false;
    if (raw === "true") return true;
    throw new ConfigError(variable, `${variable} deve ser "true" ou "false" (recebido: "${raw}").`);
};

/**
 * Chave de administrador: opcional. Se definida, precisa ser longa o
 * bastante para resistir a tentativa (16+ caracteres, sem espaços). O valor
 * nunca é incluído em mensagem de erro.
 * @param {string | undefined} raw
 */
const readAdminKey = (raw) => {
    if (isBlank(raw)) return null;
    if (/\s/.test(raw) || raw.length < 16 || raw.length > 200) {
        throw new ConfigError(
            "ADMIN_KEY",
            "ADMIN_KEY deve ter de 16 a 200 caracteres, sem espaços (ex.: gere com `openssl rand -base64 24`).",
        );
    }
    return raw;
};

/** 0 desliga; senão, no mínimo 1000 ms (log mais frequente seria ruído). */
const readMetricsInterval = (raw) => {
    if (raw === "0") return 0;
    return readInteger("METRICS_LOG_INTERVAL_MS", raw, {
        fallback: DEFAULTS.metricsLogIntervalMs,
        min: 1000,
        unit: " ms (ou 0 para desligar)",
    });
};

/**
 * Cada entrada vira a origem canônica que o navegador envia no cabeçalho
 * Origin (esquema + host minúsculo + porta, sem barra). Entrada que não é
 * uma origem impede a inicialização: antes, "https://x.com/" nunca casava e
 * bloqueava todo mundo sem aviso.
 * @param {string | undefined} raw
 * @returns {string[]}
 */
const readOrigins = (raw) =>
    (raw ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            let url = null;
            try {
                url = new URL(entry);
            } catch {
                url = null;
            }
            const valid =
                url !== null &&
                (url.protocol === "http:" || url.protocol === "https:") &&
                url.pathname === "/" &&
                // Curinga não existe: "https://*.x.com" seria aceito pelo
                // parser como host literal e nunca casaria — melhor recusar.
                !url.hostname.includes("*") &&
                !url.search &&
                !url.hash &&
                !url.username &&
                !url.password;
            if (!valid) {
                throw new ConfigError(
                    "ALLOWED_ORIGINS",
                    `"${entry}" não é uma origem válida. Use esquema e host, sem caminho, ` +
                        "separando por vírgula (ex.: https://meuchat.com,http://localhost:5173).",
                );
            }
            return url.origin;
        });

/**
 * @typedef {object} Config
 * @property {number} port
 * @property {string[]} allowedOrigins  vazio = qualquer origem (só fora de produção)
 * @property {number} heartbeatMs
 * @property {number} maxConnections
 * @property {number} maxPayloadBytes
 * @property {{capacity: number, refillPerSecond: number}} messageRate
 * @property {{capacity: number, refillPerSecond: number}} signalRate
 * @property {number} historySize   mensagens guardadas por sala
 * @property {number} historyOnJoin  mensagens entregues a quem entra numa sala
 * @property {number} heartbeatMaxMissed  pings seguidos sem resposta tolerados
 * @property {number} maxBufferedBytes    fila de envio máxima por conexão
 * @property {number} loginTimeoutMs      prazo para a conexão começar a sessão
 * @property {boolean} metricsEnabled     expõe GET /metrics
 * @property {number} metricsLogIntervalMs  0 desliga o log periódico de métricas
 * @property {number} leaveGraceMs   janela em que uma reconexão não gera avisos de saída/entrada
 * @property {{maxRooms: number, maxRoomsPerIdentity: number, maxCreatedPerIdentity: number, emptyTtlMs: number}} rooms
 * @property {{maxPerIdentity: number, maxTotal: number, historySize: number}} dms
 * @property {string | null} adminKey chave secreta de administrador (null = administração desativada)
 * @property {boolean} production
 */

/**
 * @param {Record<string, string | undefined>} env
 * @returns {Config}
 */
export const loadConfig = (env) => {
    const historySize = readInteger("HISTORY_SIZE", env.HISTORY_SIZE, {
        fallback: DEFAULTS.historySize,
        min: 1,
        max: 100000,
    });
    const historyOnJoin = readInteger("HISTORY_ON_JOIN", env.HISTORY_ON_JOIN, {
        fallback: DEFAULTS.historyOnJoin,
        min: 0,
        max: 1000,
    });
    if (historyOnJoin > historySize) {
        throw new ConfigError(
            "HISTORY_ON_JOIN",
            `HISTORY_ON_JOIN (${historyOnJoin}) não pode ser maior que HISTORY_SIZE (${historySize}).`,
        );
    }

    const production = env.NODE_ENV === "production";
    const allowedOrigins = readOrigins(env.ALLOWED_ORIGINS);
    // Em produção a lista é obrigatória: sem ela, qualquer site poderia abrir
    // um WebSocket em nome de quem o visita (CSWSH). Sem a variável o servidor
    // nem sobe — o Render mantém a versão anterior no ar e o erro aparece no
    // log, em vez de um backend aberto passar despercebido. Curinga (`*`) não
    // existe: não é uma origem válida e já é recusado acima.
    if (production && allowedOrigins.length === 0) {
        throw new ConfigError(
            "ALLOWED_ORIGINS",
            "ALLOWED_ORIGINS é obrigatória em produção (NODE_ENV=production): informe a origem " +
                "do frontend, ex.: https://chat-frontend-g42t.onrender.com.",
        );
    }

    return {
        port: readInteger("PORT", env.PORT, { fallback: DEFAULTS.port, min: 0, max: 65535 }),
        allowedOrigins,
        heartbeatMs: readInteger("HEARTBEAT_MS", env.HEARTBEAT_MS, {
            fallback: DEFAULTS.heartbeatMs,
            min: 50,
            unit: " ms",
        }),
        maxConnections: readInteger("MAX_CONNECTIONS", env.MAX_CONNECTIONS, {
            fallback: DEFAULTS.maxConnections,
            min: 1,
        }),
        // Abaixo de 8 KiB uma mensagem legítima de 1000 caracteres multibyte
        // poderia ser recusada pelo próprio limite de quadro.
        maxPayloadBytes: readInteger("MAX_PAYLOAD_BYTES", env.MAX_PAYLOAD_BYTES, {
            fallback: DEFAULTS.maxPayloadBytes,
            min: 8192,
            max: 1024 * 1024,
            unit: " bytes",
        }),
        messageRate: {
            capacity: readInteger("RATE_MESSAGES_CAPACITY", env.RATE_MESSAGES_CAPACITY, {
                fallback: DEFAULTS.rateMessagesCapacity,
                min: 1,
            }),
            refillPerSecond: readInteger("RATE_MESSAGES_PER_SEC", env.RATE_MESSAGES_PER_SEC, {
                fallback: DEFAULTS.rateMessagesPerSec,
                min: 1,
            }),
        },
        signalRate: {
            capacity: readInteger("RATE_SIGNALS_CAPACITY", env.RATE_SIGNALS_CAPACITY, {
                fallback: DEFAULTS.rateSignalsCapacity,
                min: 1,
            }),
            refillPerSecond: readInteger("RATE_SIGNALS_PER_SEC", env.RATE_SIGNALS_PER_SEC, {
                fallback: DEFAULTS.rateSignalsPerSec,
                min: 1,
            }),
        },
        historySize,
        historyOnJoin,
        // Heartbeat tolerante: uma conexão lenta que perde um ping não cai;
        // só é encerrada após `heartbeatMaxMissed` pings seguidos sem
        // resposta nem qualquer outro quadro recebido.
        heartbeatMaxMissed: readInteger("HEARTBEAT_MAX_MISSED", env.HEARTBEAT_MAX_MISSED, {
            fallback: DEFAULTS.heartbeatMaxMissed,
            min: 1,
            max: 10,
        }),
        // Cliente que para de ler o socket faz o servidor bufferizar sem
        // limite; acima disto a conexão é encerrada.
        maxBufferedBytes: readInteger("MAX_BUFFERED_BYTES", env.MAX_BUFFERED_BYTES, {
            fallback: DEFAULTS.maxBufferedBytes,
            min: 64 * 1024,
            unit: " bytes",
        }),
        // Conexão que não entra na sala não pode ocupar vaga para sempre.
        loginTimeoutMs: readInteger("LOGIN_TIMEOUT_MS", env.LOGIN_TIMEOUT_MS, {
            fallback: DEFAULTS.loginTimeoutMs,
            min: 100,
            unit: " ms",
        }),
        metricsEnabled: readBoolean("METRICS_ENABLED", env.METRICS_ENABLED),
        metricsLogIntervalMs: readMetricsInterval(env.METRICS_LOG_INTERVAL_MS),
        // Reconexão dentro da janela não anuncia "saiu"/"entrou" (F4-01).
        leaveGraceMs: readInteger("LEAVE_GRACE_MS", env.LEAVE_GRACE_MS, {
            fallback: DEFAULTS.leaveGraceMs,
            min: 0,
            max: 60000,
            unit: " ms",
        }),
        rooms: {
            // Salas ativas no servidor inteiro: protege a memória.
            maxRooms: readInteger("MAX_ROOMS", env.MAX_ROOMS, {
                fallback: DEFAULTS.maxRooms,
                min: 1,
                max: 100000,
            }),
            maxRoomsPerIdentity: readInteger("MAX_ROOMS_PER_USER", env.MAX_ROOMS_PER_USER, {
                fallback: DEFAULTS.maxRoomsPerUser,
                min: 1,
                max: 100,
            }),
            maxCreatedPerIdentity: readInteger(
                "MAX_ROOMS_CREATED_PER_USER",
                env.MAX_ROOMS_CREATED_PER_USER,
                { fallback: DEFAULTS.maxRoomsCreatedPerUser, min: 1, max: 100 },
            ),
            // Sala sem ninguém espera isto antes de ser destruída com o histórico.
            emptyTtlMs: readInteger("ROOM_EMPTY_TTL_MS", env.ROOM_EMPTY_TTL_MS, {
                fallback: DEFAULTS.roomEmptyTtlMs,
                min: 0,
                max: 30 * 60 * 1000,
                unit: " ms",
            }),
        },
        dms: {
            // Conversas privadas abertas por identidade ao mesmo tempo.
            maxPerIdentity: readInteger("MAX_DMS_PER_USER", env.MAX_DMS_PER_USER, {
                fallback: DEFAULTS.maxDmsPerUser,
                min: 1,
                max: 1000,
            }),
            // Conversas privadas no servidor inteiro: protege a memória.
            maxTotal: readInteger("MAX_DMS", env.MAX_DMS, {
                fallback: DEFAULTS.maxDms,
                min: 1,
                max: 1000000,
            }),
            historySize: readInteger("DM_HISTORY_SIZE", env.DM_HISTORY_SIZE, {
                fallback: DEFAULTS.dmHistorySize,
                min: 1,
                max: 10000,
            }),
        },
        adminKey: readAdminKey(env.ADMIN_KEY),
        production,
    };
};
