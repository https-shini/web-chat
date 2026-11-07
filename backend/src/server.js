/**
 * Ponto de entrada do servidor (`npm start` = `node src/server.js`).
 *
 * Só inicialização e ciclo de vida do processo: carrega o ambiente, valida a
 * configuração, cria o servidor e trata sinais de término. Toda a lógica
 * vive nos módulos:
 *
 *   config.js            .env e validação da configuração
 *   logger.js            log estruturado (uma linha JSON por evento)
 *   errors.js            catálogo de erros enviados ao cliente
 *   protocol.js          contrato do protocolo WebSocket
 *   validation.js        normalização de nome, mensagem e token
 *   rateLimiter.js       balde de fichas
 *   metrics.js           métricas operacionais em memória
 *   room/sessions.js     identidades emitidas pelo servidor
 *   room/room.js         regras da sala (entrada, saída, mensagens, digitação)
 *   transport/           HTTP, WebSocket, conexão, heartbeat, desligamento
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConfigError, loadConfig, loadEnvFiles } from "./config.js";
import { createLogger } from "./logger.js";
import { createChatServer, SHUTDOWN_TIMEOUT_MS } from "./transport/chatServer.js";

const log = createLogger();

loadEnvFiles(fileURLToPath(new URL("..", import.meta.url)));

let config;
try {
    config = loadConfig(process.env);
} catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    log("error", "config_invalid", { variable: error.variable, message: error.message });
    process.exit(1);
}

// Sem allowlist o servidor aceita qualquer origem — comportamento histórico,
// preservado porque o domínio de produção não está definido (V03). Fica
// registrado em toda inicialização; em produção, como aviso.
if (config.allowedOrigins.length === 0) {
    log(config.production ? "warn" : "info", "allowed_origins_disabled", {
        message: "ALLOWED_ORIGINS vazia: conexões de qualquer origem serão aceitas.",
    });
}

// Versão exibida por /version, lida do package.json do backend.
const { version } = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);

// A chave nunca vai para o log: só se a administração está ligada.
log("info", "admin_status", { enabled: config.adminKey !== null });

const server = createChatServer({ config, log, version });

let shuttingDown = false;

/**
 * Encerramento controlado: para de aceitar conexões, avisa os clientes
 * (1001), cancela timers e sai. Se algo travar, sai à força após
 * SHUTDOWN_TIMEOUT_MS. Nunca reentra.
 * @param {string} reason
 * @param {number} exitCode
 */
const shutdown = (reason, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(exitCode === 0 ? "info" : "error", "shutdown_started", {
        reason,
        connections: server.connections,
    });
    setTimeout(() => {
        log("warn", "shutdown_forced", { connections: server.connections });
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    // Métricas finais: o que aconteceu desde a última linha periódica.
    log("info", "metrics", server.metricsSnapshot());
    server.close().then(() => {
        log("info", "shutdown_complete", {});
        process.exit(exitCode);
    });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Exceção ou promessa rejeitada sem tratamento: o estado do processo deixou
// de ser confiável. Registra a origem (com stack) e encerra de forma
// controlada com código 1 — a plataforma reinicia o processo. Nada de seguir
// em frente como se nada tivesse acontecido.
process.on("uncaughtException", (error) => {
    log("error", "fatal_error", { kind: "uncaughtException", stack: error.stack ?? String(error) });
    shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (reason) => {
    log("error", "fatal_error", {
        kind: "unhandledRejection",
        stack: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason),
    });
    shutdown("unhandledRejection", 1);
});

server.listen(config.port).then(
    (port) => {
        log("info", "server_listening", {
            port,
            allowedOrigins: config.allowedOrigins,
            heartbeatMs: config.heartbeatMs,
        });
    },
    (error) => {
        // Falha de infraestrutura (porta em uso, permissão): erro, com causa.
        log("error", "listen_failed", {
            port: config.port,
            code: error.code,
            message: error.message,
        });
        process.exit(1);
    },
);
