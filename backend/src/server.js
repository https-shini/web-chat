const { WebSocketServer } = require("ws");
const http = require("http");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("crypto");

// ─── Variáveis de ambiente ────────────────────────────────────────────────
//
// Fonte documentada: o `.env` da RAIZ do repositório (ver `.env.example`).
// Antes, `dotenv.config()` lia o `.env` do diretório corrente — que é
// `backend/` quando o servidor sobe por `npm --prefix backend` — e o `.env`
// da raiz era ignorado em silêncio (P03). O caminho agora é resolvido a
// partir deste arquivo, independente de onde o processo foi iniciado.
//
// Precedência: variável já definida no processo > `.env` da raiz >
// `backend/.env`. O dotenv nunca sobrescreve o que já está definido, então a
// ordem das chamadas É a precedência. `backend/.env` continua aceito para
// não quebrar quem seguiu a instrução anterior do README.
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

// ─── Log estruturado ──────────────────────────────────────────────────────
//
// Uma linha JSON por evento. JSON.stringify escapa \n, \r e todo caractere
// de controle, então nenhum valor vindo do cliente consegue forjar uma linha
// de log independente (P04). Regras: nunca registrar conteúdo de mensagem,
// nome de usuário ou token de sessão — só ids e metadados.
const log = (level, event, fields = {}) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
    if (level === "info") console.log(line);
    else console.error(line);
};

// ─── Configuração validada ────────────────────────────────────────────────

class ConfigError extends Error {
    constructor(variable, message) {
        super(message);
        this.variable = variable;
    }
}

const parsePort = (raw) => {
    if (raw === undefined || raw === "") return 8080;
    if (!/^\d+$/.test(raw) || Number(raw) > 65535) {
        throw new ConfigError(
            "PORT",
            `PORT deve ser um inteiro entre 0 e 65535 (recebido: "${raw}").`,
        );
    }
    return Number(raw);
};

// Cada entrada vira a origem canônica que o navegador envia no cabeçalho
// Origin (esquema + host minúsculo + porta, sem barra). Antes, uma entrada
// como "https://meuchat.com/" nunca casava com nada e bloqueava todo mundo
// sem nenhum aviso; agora ou é normalizada, ou o servidor se recusa a subir.
const parseOrigins = (raw) =>
    (raw ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            let url;
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

const parseInterval = (variable, raw, fallback) => {
    if (raw === undefined || raw === "") return fallback;
    if (!/^\d+$/.test(raw) || Number(raw) < 50) {
        throw new ConfigError(variable, `${variable} deve ser um inteiro em ms, mínimo 50.`);
    }
    return Number(raw);
};

let config;
try {
    config = {
        port: parsePort(process.env.PORT),
        allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
        heartbeatMs: parseInterval("HEARTBEAT_MS", process.env.HEARTBEAT_MS, 30000),
    };
} catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    log("error", "config_invalid", { variable: error.variable, message: error.message });
    process.exit(1);
}

// Sem allowlist o servidor aceita qualquer origem — comportamento histórico,
// preservado porque o domínio real de produção não está documentado (V03 da
// análise). Fica, porém, registrado em toda inicialização: em produção como
// aviso, para não passar despercebido.
if (config.allowedOrigins.length === 0) {
    log(process.env.NODE_ENV === "production" ? "warn" : "info", "allowed_origins_disabled", {
        message: "ALLOWED_ORIGINS vazia: conexões de qualquer origem serão aceitas.",
    });
}

// ─── Limites ──────────────────────────────────────────────────────────────

// Teto de conexões simultâneas: independe de proxy/IP e evita que o processo
// seja derrubado por exaustão de memória num flood de conexões.
const MAX_TOTAL_CONNECTIONS = 500;

const NAME_MAX_LENGTH = 30;
const MESSAGE_MAX_LENGTH = 1000;
const HISTORY_MAX = 1000;
const HISTORY_ON_JOIN = 50;
const RESUME_TOKEN_MAX_LENGTH = 100;

// Identidade liberada (pessoa desconectada) continua retomável por este
// tempo. Teto de registros liberados guardados, para que ciclos de
// conectar/desconectar não cresçam a memória sem limite.
const RESUME_TTL_MS = 10 * 60 * 1000;
const MAX_RELEASED_SESSIONS = 2000;

// Rate limit por conexão, em DOIS baldes (P02). Antes, sinais de digitação
// (um por tecla nos clientes antigos) e mensagens dividiam o mesmo balde, e
// uma rajada de digitação fazia a mensagem seguinte ser descartada em
// silêncio. A capacidade e a taxa de cada balde são as mesmas de antes —
// a proteção contra flood de mensagens não foi afrouxada, só separada.
const MESSAGE_BUCKET = { capacity: 40, refillPerSecond: 8 };
const SIGNAL_BUCKET = { capacity: 40, refillPerSecond: 8 };
// Um aviso de "rápido demais" por segundo, no máximo: responder a cada
// mensagem recusada amplificaria o tráfego de volta para quem inunda.
const RATE_LIMIT_NOTICE_INTERVAL_MS = 1000;

// ─── Protocolo ────────────────────────────────────────────────────────────

const SIGNAL_TYPES = new Set(["typing_start", "typing_stop"]);
const KNOWN_TYPES = new Set(["user_login", "chat_message", ...SIGNAL_TYPES]);

// Códigos de erro estáveis para máquinas; `message` continua existindo
// porque é o que o cliente atual exibe. Textos já existentes foram mantidos.
const ERROR_MESSAGES = {
    invalid_message: "Mensagem com formato inválido.",
    unknown_type: "Tipo de mensagem desconhecido.",
    invalid_name: "Nome inválido. Use de 1 a 30 caracteres.",
    already_logged_in: "Esta conexão já entrou na sala.",
    not_logged_in: "Usuário não autenticado",
    empty_message: "Mensagem vazia.",
    rate_limited: "Você está enviando mensagens rápido demais. Aguarde um instante.",
    internal_error: "Erro interno do servidor",
};

const isPlainObject = (value) =>
    typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Valida o envelope `{ type, payload }` de um quadro recebido. Erro do
 * cliente não é exceção: volta como `{ ok: false, reason }`, sem stack.
 */
const parseEnvelope = (data, isBinary) => {
    if (isBinary) return { ok: false, reason: "binary_frame" };
    let value;
    try {
        value = JSON.parse(data.toString("utf8"));
    } catch {
        return { ok: false, reason: "invalid_json" };
    }
    if (!isPlainObject(value)) return { ok: false, reason: "not_an_object" };
    if (typeof value.type !== "string") return { ok: false, reason: "missing_type" };
    if (!KNOWN_TYPES.has(value.type)) {
        // Prévia curta só para diagnóstico; o log a escapa (ver `log`).
        return { ok: false, reason: "unknown_type", type: value.type.slice(0, 40) };
    }
    const payload = value.payload === undefined ? {} : value.payload;
    if (!isPlainObject(payload)) return { ok: false, reason: "invalid_payload", type: value.type };
    return { ok: true, type: value.type, payload };
};

// Normaliza texto recebido do cliente.
//
// O escape de entidades HTML que existia aqui foi removido de propósito: o
// cliente renderiza com textContent, que já neutraliza qualquer marcação,
// então escapar no servidor não somava segurança — só fazia o usuário ler
// literalmente &#x27; no lugar do apóstrofo e &amp; no lugar do &.
// Sanitização pertence a quem renderiza; o servidor só apara e limita.
const normalizeText = (value, maxLength) => {
    if (typeof value !== "string") return "";
    // Caracteres de controle (inclui \r e \n) não têm uso legítimo em nome
    // de usuário ou mensagem de uma linha. O regex é deliberado.
    // eslint-disable-next-line no-control-regex
    const withoutControlChars = value.replace(/[\x00-\x1f\x7f]/g, " ");
    return withoutControlChars.trim().slice(0, maxLength);
};

const createRateLimiter = ({ capacity, refillPerSecond }) => {
    let tokens = capacity;
    let lastRefill = Date.now();
    return () => {
        const now = Date.now();
        tokens = Math.min(capacity, tokens + ((now - lastRefill) / 1000) * refillPerSecond);
        lastRefill = now;
        if (tokens < 1) return false;
        tokens -= 1;
        return true;
    };
};

const addTimestamp = () => new Date().toISOString();

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// ─── Servidor ─────────────────────────────────────────────────────────────

// Servidor HTTP próprio: um GET comum na porta (checagem de saúde de
// plataforma) recebe 200 em vez do 426 do servidor interno do `ws`.
const httpServer = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok");
});

const wss = new WebSocketServer({
    server: httpServer,
    // 16 KiB é generoso para o maior payload legítimo (mensagem de 1000
    // caracteres) e recusa frames maiores antes de bufferizá-los.
    maxPayload: 16 * 1024,
    verifyClient:
        config.allowedOrigins.length === 0
            ? undefined
            : (info, callback) => {
                  const ok = config.allowedOrigins.includes(info.origin);
                  callback(ok, ok ? undefined : 403, ok ? undefined : "Origem não permitida");
              },
});

// Estado em memória.
/** Conexão → pessoa que entrou na sala por ela. */
const connectedUsers = new Map();
const messageHistory = [];
const typingUsers = new Set();

/**
 * Identidades emitidas pelo servidor, indexadas pelo hash do token de
 * retomada (o token em si nunca é guardado nem registrado).
 * @type {Map<string, {id: string, name: string, ws: import("ws").WebSocket | null, releasedAt: number | null}>}
 */
const sessions = new Map();

/** Conexão → ainda respondeu ao último ping. */
const alive = new WeakMap();

let shuttingDown = false;

const send = (ws, message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
};

const sendError = (ws, code) => {
    send(ws, { type: "error", payload: { code, message: ERROR_MESSAGES[code] } });
};

// Só quem entrou na sala recebe o que acontece nela. Antes, o envio ia para
// toda conexão aberta: uma conexão que nunca fez login lia mensagens,
// digitação e a lista de pessoas sem aparecer nessa lista — um espectador
// invisível. A associação conexão → pessoa → sala é `connectedUsers`.
const broadcast = (message, excludeWs = null) => {
    const messageString = JSON.stringify(message);
    for (const client of connectedUsers.keys()) {
        if (client !== excludeWs && client.readyState === client.OPEN) {
            client.send(messageString);
        }
    }
};

const broadcastUserList = () => {
    const userList = Array.from(connectedUsers.values()).map((user) => ({
        id: user.id,
        name: user.name,
        status: "online",
    }));
    broadcast({ type: "user_list", payload: userList });
};

/** Emite um token novo para `record` e devolve o token em claro. */
const issueToken = (record) => {
    const token = crypto.randomBytes(32).toString("base64url");
    sessions.set(hashToken(token), record);
    return token;
};

/** Remove identidades liberadas há mais que o TTL, e o excesso acima do teto. */
const sweepSessions = (now = Date.now()) => {
    let released = 0;
    for (const [hash, record] of sessions) {
        if (record.ws !== null) continue;
        if (now - record.releasedAt > RESUME_TTL_MS) sessions.delete(hash);
        else released += 1;
    }
    // Map preserva ordem de inserção: os primeiros são os mais antigos.
    for (const [hash, record] of sessions) {
        if (released <= MAX_RELEASED_SESSIONS) break;
        if (record.ws === null) {
            sessions.delete(hash);
            released -= 1;
        }
    }
};

/**
 * Tira a pessoa da sala. `announce` falso quando a mesma identidade continua
 * presente por outra conexão (retomada com a antiga ainda aberta).
 */
const leave = (ws, { announce = true, reason = "closed" } = {}) => {
    const user = connectedUsers.get(ws);
    if (!user) return;
    connectedUsers.delete(ws);
    typingUsers.delete(user.id);
    if (user.session.ws === ws) {
        user.session.ws = null;
        user.session.releasedAt = Date.now();
    }
    log("info", "user_left", { connection: user.connection, user: user.id, reason });
    if (!announce || shuttingDown) return;
    broadcast({ type: "user_left", payload: { userName: user.name, timestamp: addTimestamp() } });
    broadcastUserList();
};

/**
 * Encontra a identidade associada a um token de retomada, se válida. Um
 * token desconhecido, expirado ou de formato errado não é erro: a pessoa
 * apenas entra com uma identidade nova.
 */
const findResumable = (token) => {
    if (typeof token !== "string" || token.length === 0 || token.length > RESUME_TOKEN_MAX_LENGTH) {
        return null;
    }
    const hash = hashToken(token);
    const record = sessions.get(hash);
    if (!record) return null;
    if (record.ws === null && Date.now() - record.releasedAt > RESUME_TTL_MS) {
        sessions.delete(hash);
        return null;
    }
    return { hash, record };
};

const handleLogin = (ws, connection, payload) => {
    // Uma entrada por conexão (P07). Repetir o login não troca nome nem
    // identidade e não gera "entrou na sala" de novo.
    if (connectedUsers.has(ws)) {
        log("warn", "login_rejected", { connection, reason: "already_logged_in" });
        sendError(ws, "already_logged_in");
        return;
    }

    if (payload.userName !== undefined && typeof payload.userName !== "string") {
        sendError(ws, "invalid_name");
        return;
    }
    const requestedName = normalizeText(payload.userName, NAME_MAX_LENGTH);

    // Identidade emitida pelo servidor (P01). `payload.userId` é ignorado:
    // o cliente não escolhe quem é. A única forma de reaver um id é provar
    // posse do token secreto que o servidor entregou àquela sessão.
    const resumable = findResumable(payload.resumeToken);
    let record;
    let resumed = false;
    let replacedLiveConnection = false;

    if (resumable) {
        record = resumable.record;
        resumed = true;
        sessions.delete(resumable.hash); // o token é de uso único: rotaciona
        if (record.ws !== null && record.ws !== ws) {
            replacedLiveConnection = true;
            // A conexão antiga ainda consta (queda não detectada). A pessoa é
            // a mesma, então sai em silêncio e a nova assume.
            const stale = record.ws;
            leave(stale, { announce: false, reason: "replaced" });
            stale.terminate();
        }
    } else {
        // Nome obrigatório (P06): vazio, só espaços ou só controle → recusa.
        // A recusa é recuperável: a conexão segue aberta e pode tentar de novo.
        if (!requestedName) {
            log("warn", "login_rejected", { connection, reason: "invalid_name" });
            sendError(ws, "invalid_name");
            return;
        }
        record = { id: crypto.randomUUID(), name: requestedName, ws: null, releasedAt: null };
    }

    record.ws = ws;
    record.releasedAt = null;
    const resumeToken = issueToken(record);
    const user = { id: record.id, name: record.name, connection, session: record };
    connectedUsers.set(ws, user);
    log("info", "user_joined", { connection, user: user.id, resumed });

    // A sessão chega antes de qualquer outra coisa: o cliente precisa do
    // próprio id para reconhecer as próprias mensagens no histórico.
    send(ws, { type: "session", payload: { id: user.id, name: user.name, resumeToken } });

    if (messageHistory.length > 0) {
        send(ws, { type: "message_history", payload: messageHistory.slice(-HISTORY_ON_JOIN) });
    }

    // Retomada com a conexão antiga ainda presente: para os outros, a pessoa
    // nunca saiu — não há "entrou" a anunciar.
    if (!replacedLiveConnection) {
        broadcast(
            { type: "user_joined", payload: { userName: user.name, timestamp: addTimestamp() } },
            ws,
        );
    }
    broadcastUserList();
};

const handleChatMessage = (ws, connection, payload) => {
    const user = connectedUsers.get(ws);
    if (!user) {
        sendError(ws, "not_logged_in");
        return;
    }
    if (typeof payload.content !== "string") {
        log("warn", "invalid_message", { connection, reason: "invalid_content" });
        sendError(ws, "invalid_message");
        return;
    }
    const content = normalizeText(payload.content, MESSAGE_MAX_LENGTH);
    if (!content) {
        sendError(ws, "empty_message");
        return;
    }

    // Autor vem SEMPRE da conexão; campos de identidade no payload são ignorados.
    const chatMessage = {
        id: crypto.randomUUID(),
        type: "chat_message",
        payload: { userId: user.id, userName: user.name, content, timestamp: addTimestamp() },
    };
    messageHistory.push(chatMessage);
    if (messageHistory.length > HISTORY_MAX) messageHistory.shift();
    broadcast(chatMessage);
};

const handleTyping = (ws, isTyping) => {
    const user = connectedUsers.get(ws);
    if (!user) return;
    if (isTyping) typingUsers.add(user.id);
    else typingUsers.delete(user.id);
    broadcast(
        { type: "user_typing", payload: { userId: user.id, userName: user.name, isTyping } },
        ws,
    );
};

wss.on("connection", (ws) => {
    if (shuttingDown) {
        ws.close(1001, "Servidor reiniciando");
        return;
    }
    if (wss.clients.size > MAX_TOTAL_CONNECTIONS) {
        ws.close(1013, "Servidor cheio, tente novamente em instantes");
        return;
    }

    // Id curto e aleatório da conexão, só para correlacionar linhas de log.
    const connection = crypto.randomBytes(4).toString("hex");
    log("info", "client_connected", { connection });

    const consumeMessage = createRateLimiter(MESSAGE_BUCKET);
    const consumeSignal = createRateLimiter(SIGNAL_BUCKET);
    let lastRateLimitNotice = 0;

    alive.set(ws, true);
    ws.on("pong", () => alive.set(ws, true));

    ws.on("error", (error) => {
        log("warn", "socket_error", { connection, message: error.message });
    });

    ws.on("message", (data, isBinary) => {
        const envelope = parseEnvelope(data, isBinary);

        // Sinais efêmeros: balde próprio; excesso descartado em silêncio
        // (um "digitando" perdido não é dado perdido).
        if (envelope.ok && SIGNAL_TYPES.has(envelope.type)) {
            if (consumeSignal()) handleTyping(ws, envelope.type === "typing_start");
            return;
        }

        // Todo o resto — mensagens, login e quadros inválidos — consome o
        // balde de mensagens.
        if (!consumeMessage()) {
            const now = Date.now();
            if (
                envelope.ok &&
                envelope.type === "chat_message" &&
                now - lastRateLimitNotice >= RATE_LIMIT_NOTICE_INTERVAL_MS
            ) {
                lastRateLimitNotice = now;
                log("warn", "rate_limited", { connection });
                sendError(ws, "rate_limited");
            }
            return;
        }

        if (!envelope.ok) {
            log("warn", "invalid_message", {
                connection,
                reason: envelope.reason,
                ...(envelope.type === undefined ? {} : { type: envelope.type }),
            });
            sendError(ws, envelope.reason === "unknown_type" ? "unknown_type" : "invalid_message");
            return;
        }

        try {
            if (envelope.type === "user_login") handleLogin(ws, connection, envelope.payload);
            else handleChatMessage(ws, connection, envelope.payload);
        } catch (error) {
            // Só chega aqui o que é defeito do servidor: entrada inválida já
            // foi tratada acima. Este, sim, merece stack trace.
            log("error", "handler_failed", { connection, type: envelope.type, stack: error.stack });
            sendError(ws, "internal_error");
        }
    });

    ws.on("close", () => leave(ws));
});

// ─── Heartbeat ────────────────────────────────────────────────────────────
//
// Conexões meio-abertas (rede móvel, notebook suspenso) nunca disparam
// `close` sozinhas: ficavam na lista de pessoas e contavam no teto (P10).
// Quem não responde a um ping até o ciclo seguinte é encerrado, o que
// dispara a limpeza normal. Navegadores respondem ping automaticamente.
const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
        if (alive.get(client) === false) {
            const user = connectedUsers.get(client);
            log("info", "heartbeat_timeout", user ? { user: user.id } : {});
            client.terminate();
            continue;
        }
        alive.set(client, false);
        try {
            client.ping();
        } catch {
            // Conexão já fechando: o `close` cuidará dela.
        }
    }
    sweepSessions();
}, config.heartbeatMs);

// ─── Desligamento gracioso ────────────────────────────────────────────────
//
// Em deploy/restart a plataforma envia SIGTERM. Fechar com 1001 ("indo
// embora") em vez de cair com 1006 deixa o cliente reconectar de forma
// limpa (P11). Se algo travar, sai à força depois de 5 s.
const SHUTDOWN_TIMEOUT_MS = 5000;

const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("info", "shutdown_started", { signal, connections: wss.clients.size });
    clearInterval(heartbeat);
    for (const client of wss.clients) client.close(1001, "Servidor reiniciando");
    wss.close();
    httpServer.close(() => {
        log("info", "shutdown_complete", {});
        process.exit(0);
    });
    setTimeout(() => {
        log("warn", "shutdown_forced", { connections: wss.clients.size });
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

httpServer.listen(config.port, () => {
    const address = httpServer.address();
    log("info", "server_listening", {
        port: typeof address === "object" && address ? address.port : config.port,
        allowedOrigins: config.allowedOrigins,
        heartbeatMs: config.heartbeatMs,
    });
});
