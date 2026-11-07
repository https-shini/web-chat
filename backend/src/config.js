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
    historySize: 1000,
    historyOnJoin: 50,
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
 * @property {string[]} allowedOrigins  vazio = qualquer origem
 * @property {number} heartbeatMs
 * @property {number} maxConnections
 * @property {number} maxPayloadBytes
 * @property {{capacity: number, refillPerSecond: number}} messageRate
 * @property {{capacity: number, refillPerSecond: number}} signalRate
 * @property {number} historySize
 * @property {number} historyOnJoin
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

    return {
        port: readInteger("PORT", env.PORT, { fallback: DEFAULTS.port, min: 0, max: 65535 }),
        allowedOrigins: readOrigins(env.ALLOWED_ORIGINS),
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
        production: env.NODE_ENV === "production",
    };
};
