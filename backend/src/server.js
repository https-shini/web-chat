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
 *   room/sessions.js     identidades emitidas pelo servidor
 *   room/room.js         regras da sala (entrada, saída, mensagens, digitação)
 *   transport/           HTTP, WebSocket, conexão, heartbeat, desligamento
 */

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

const server = createChatServer({ config, log });

let shuttingDown = false;
const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("info", "shutdown_started", { signal, connections: server.connections });
    setTimeout(() => {
        log("warn", "shutdown_forced", { connections: server.connections });
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    server.close().then(() => {
        log("info", "shutdown_complete", {});
        process.exit(0);
    });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

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
