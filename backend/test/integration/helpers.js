// Utilitários dos testes de integração do protocolo. O servidor sobe como
// processo filho (exatamente como em produção, via `node src/server.js`) numa
// porta efêmera, e os testes conversam com ele por clientes `ws` reais. Os
// logs do processo são capturados linha a linha para que os testes de
// segurança verifiquem o que de fato foi escrito, não o que o código "deveria"
// escrever.

import { after } from "node:test";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withUsername } from "../identity.js";
import WebSocket from "ws";

const BACKEND_DIR = fileURLToPath(new URL("../../", import.meta.url));
export const SERVER_SCRIPT = path.join(BACKEND_DIR, "src", "server.js");
const DEFAULT_TIMEOUT = 4000;

/**
 * Espera até `predicate` devolver algo verdadeiro, reavaliando a cada evento.
 * @template T
 * @param {(resolve: (value: T) => void, reject: (error: Error) => void) => (() => void) | void} setup
 * @param {number} timeout
 * @param {string} label
 * @returns {Promise<T>}
 */
const withTimeout = (setup, timeout, label) =>
    new Promise((resolve, reject) => {
        // `setup` pode resolver de forma síncrona (a mensagem já estava na
        // caixa). Nesse caso a limpeza só existe depois que `setup` retorna,
        // e precisa rodar ali — senão o observador fica registrado e passa a
        // consumir mensagens destinadas a esperas futuras.
        let settled = false;
        let cleanup = () => {};
        const timer = setTimeout(() => {
            settled = true;
            cleanup();
            reject(new Error(`Tempo esgotado esperando: ${label}`));
        }, timeout);
        const done = (fn) => (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            cleanup();
            fn(value);
        };
        cleanup = setup(done(resolve), done(reject)) || (() => {});
        if (settled) cleanup();
    });

/** Servidores ainda vivos, encerrados à força quando o teste termina. */
const children = new Set();
after(() => {
    for (const child of children) child.kill("SIGKILL");
});

/** Reserva uma porta livre do sistema e a devolve. */
const freePort = () =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", () => {
            const { port } = /** @type {import("node:net").AddressInfo} */ (probe.address());
            probe.close(() => resolve(port));
        });
    });

/** Tenta abrir uma conexão TCP; resolve true quando a porta aceita. */
const canConnect = (port) =>
    new Promise((resolve) => {
        const socket = net.connect(port, "127.0.0.1");
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("error", () => resolve(false));
    });

/**
 * Sobe o servidor e devolve controles sobre ele. A porta é reservada antes
 * e passada por PORT; a prontidão é detectada pela porta aceitando conexão,
 * sem depender do formato do log de inicialização.
 * @param {Record<string, string | undefined>} [env] sobrescreve variáveis
 * @param {{script?: string, baseEnv?: NodeJS.ProcessEnv, waitListening?: boolean}} [options]
 */
const startServer = async (env = {}, options = {}) => {
    const port = await freePort();
    const baseEnv = options.baseEnv ?? {
        ...process.env,
        PORT: String(port),
        ALLOWED_ORIGINS: "",
        HEARTBEAT_MS: "30000",
        // Testes anteriores à Fase 4 esperam o aviso de saída na hora; a
        // janela de retomada (padrão 10 s) tem testes próprios.
        LEAVE_GRACE_MS: "0",
        NODE_ENV: "test",
    };
    const child = spawn(process.execPath, [options.script ?? SERVER_SCRIPT], {
        env: { ...baseEnv, ...env },
        stdio: ["ignore", "pipe", "pipe"],
    });
    // Um teste que falha antes de chamar stop() não pode deixar o servidor
    // vivo segurando o runner: o hook `after` abaixo o encerra.
    children.add(child);

    /** Linhas cruas, na ordem em que saíram (stdout e stderr). */
    const lines = [];
    /** @type {Set<() => void>} */
    const watchers = new Set();
    const notify = () => {
        for (const watcher of [...watchers]) watcher();
    };

    const attach = (stream) => {
        let buffer = "";
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
            buffer += chunk;
            let index;
            while ((index = buffer.indexOf("\n")) !== -1) {
                lines.push(buffer.slice(0, index));
                buffer = buffer.slice(index + 1);
            }
            notify();
        });
    };
    attach(child.stdout);
    attach(child.stderr);

    let exitCode = null;
    const exited = new Promise((resolve) => {
        child.on("exit", (code) => {
            children.delete(child);
            exitCode = code;
            notify();
            resolve(code);
        });
    });

    /** Linhas que são JSON válido, já decodificadas. */
    const entries = () =>
        lines.flatMap((line) => {
            try {
                return [JSON.parse(line)];
            } catch {
                return [];
            }
        });

    const waitForLog = (predicate, timeout = DEFAULT_TIMEOUT, label = "linha de log") =>
        withTimeout(
            (resolve, reject) => {
                const check = () => {
                    const found = entries().find(predicate);
                    if (found) resolve(found);
                    else if (exitCode !== null)
                        reject(new Error(`Servidor saiu (${exitCode}) antes de: ${label}`));
                };
                watchers.add(check);
                check();
                return () => watchers.delete(check);
            },
            timeout,
            label,
        );

    const server = {
        child,
        lines,
        entries,
        waitForLog,
        exited,
        get exitCode() {
            return exitCode;
        },
        port: 0,
        url: "",
        async stop() {
            if (exitCode === null) {
                child.kill("SIGKILL");
                await exited;
            }
        },
    };

    if (options.waitListening !== false) {
        const deadline = Date.now() + DEFAULT_TIMEOUT;
        for (;;) {
            if (exitCode !== null) throw new Error(`Servidor saiu com código ${exitCode}`);
            if (await canConnect(port)) break;
            if (Date.now() > deadline) throw new Error("Servidor não abriu a porta a tempo");
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        server.port = port;
        server.url = `ws://127.0.0.1:${port}`;
    }
    return server;
};

/**
 * Cliente de teste. Mensagens recebidas ficam numa caixa de entrada; `take`
 * retira a primeira que casa, e espera se ainda não chegou.
 * @param {string} url
 * @param {import("ws").ClientOptions} [options]
 */
const connect = (url, options = {}) =>
    withTimeout(
        (resolve, reject) => {
            const ws = new WebSocket(url, options);
            const inbox = [];
            /** @type {Set<() => void>} */
            const watchers = new Set();
            let closeInfo = null;

            ws.on("message", (data) => {
                inbox.push(JSON.parse(data.toString()));
                for (const watcher of [...watchers]) watcher();
            });
            ws.on("close", (code, reason) => {
                closeInfo = { code, reason: reason.toString() };
                for (const watcher of [...watchers]) watcher();
            });

            const client = {
                ws,
                inbox,
                /**
                 * Conversa padrão deste cliente (a sala em que `join` o pôs).
                 * Quadros de conversa sem `conversationId` declarado a recebem.
                 * @type {string | null}
                 */
                conversationId: null,
                get closed() {
                    return closeInfo;
                },
                send(type, payload) {
                    // Login sem username declarado ganha um automático (ver identity.js).
                    let body = type === "user_login" ? withUsername(payload) : payload;
                    // Desde a Fase 2 da evolução toda mensagem, sinal e comando
                    // diz a conversa. Teste que não trata disso fala na sala
                    // padrão; quem testa a conversa declara a chave (mesmo
                    // `conversationId: undefined`, para testar a ausência).
                    if (
                        CONVERSATION_EVENTS.has(type) &&
                        client.conversationId !== null &&
                        (body === undefined ||
                            (typeof body === "object" &&
                                body !== null &&
                                !Array.isArray(body) &&
                                !Object.hasOwn(body, "conversationId")))
                    ) {
                        body = { ...(body ?? {}), conversationId: client.conversationId };
                    }
                    ws.send(
                        JSON.stringify(body === undefined ? { type } : { type, payload: body }),
                    );
                },
                sendRaw(data, sendOptions) {
                    ws.send(data, sendOptions);
                },
                take(predicateOrType, timeout = DEFAULT_TIMEOUT) {
                    const predicate =
                        typeof predicateOrType === "string"
                            ? (message) => message.type === predicateOrType
                            : predicateOrType;
                    return withTimeout(
                        (done, fail) => {
                            const check = () => {
                                const index = inbox.findIndex(predicate);
                                if (index !== -1) {
                                    done(inbox.splice(index, 1)[0]);
                                } else if (closeInfo) {
                                    fail(
                                        new Error(
                                            `Conexão fechada (${closeInfo.code}) antes da mensagem`,
                                        ),
                                    );
                                }
                            };
                            watchers.add(check);
                            check();
                            return () => watchers.delete(check);
                        },
                        timeout,
                        `mensagem ${String(predicateOrType)} (caixa: ${JSON.stringify(inbox).slice(0, 300)})`,
                    );
                },
                count(predicateOrType) {
                    const predicate =
                        typeof predicateOrType === "string"
                            ? (message) => message.type === predicateOrType
                            : predicateOrType;
                    return inbox.filter(predicate).length;
                },
                waitClose(timeout = DEFAULT_TIMEOUT) {
                    return withTimeout(
                        (done) => {
                            const check = () => {
                                if (closeInfo) done(closeInfo);
                            };
                            watchers.add(check);
                            check();
                            return () => watchers.delete(check);
                        },
                        timeout,
                        "fechamento da conexão",
                    );
                },
                close() {
                    ws.close();
                },
            };

            ws.on("open", () => resolve(client));
            ws.on("unexpected-response", (_request, response) => {
                reject(
                    Object.assign(new Error("handshake recusado"), { status: response.statusCode }),
                );
            });
            ws.on("error", (error) => {
                if (ws.readyState !== WebSocket.OPEN) reject(error);
            });
            return undefined;
        },
        DEFAULT_TIMEOUT,
        `conexão com ${url}`,
    );

/** Quadros do cliente que pertencem a uma conversa. */
const CONVERSATION_EVENTS = new Set(["chat_message", "typing_start", "typing_stop", "command"]);

/** Sala padrão de cada servidor de teste (url → código). @type {Map<string, string>} */
const sharedRooms = new Map();

/**
 * Põe o cliente (já com sessão) na sala padrão do servidor: a primeira
 * pessoa a cria, as seguintes entram pelo código. Devolve o `room_joined`.
 * @param {string} url
 * @param {Awaited<ReturnType<typeof connect>>} client
 */
const enterSharedRoom = async (url, client) => {
    const code = sharedRooms.get(url);
    if (code) {
        client.send("room_join", { code });
        const reply = await client.take(
            (message) =>
                message.type === "room_joined" ||
                (message.type === "error" && message.payload.code === "room_not_found"),
        );
        if (reply.type === "room_joined") {
            client.conversationId = reply.conversationId;
            return reply;
        }
    }
    client.send("room_create", {});
    const joined = await client.take("room_joined");
    sharedRooms.set(url, joined.payload.code);
    client.conversationId = joined.conversationId;
    return joined;
};

/**
 * Conecta, começa a sessão e (por padrão) entra na sala padrão do servidor;
 * devolve o cliente, a sessão e o resumo da sala. `{room: false}` deixa o
 * cliente só com a sessão.
 * @param {string} url
 * @param {Record<string, unknown>} payload
 * @param {import("ws").ClientOptions} [options]
 * @param {{room?: boolean}} [behavior]
 */
const join = async (url, payload, options, { room = true } = {}) => {
    const client = await connect(url, options);
    client.send("user_login", payload);
    const session = await client.take("session");
    const joined = room ? await enterSharedRoom(url, client) : null;
    return { client, session: session.payload, room: joined?.payload ?? null };
};

/**
 * Barreira de ordenação. O servidor processa os quadros de uma conexão em
 * ordem e o TCP entrega em ordem: se `observer` recebe o marcador enviado por
 * `sender` depois de uma ação, qualquer broadcast que a ação tivesse gerado
 * já teria chegado antes dele. Substitui "esperar N ms e torcer".
 */
const barrier = async (sender, observer) => {
    const marker = `barreira-${Math.random().toString(36).slice(2)}`;
    sender.send("chat_message", { content: marker });
    await observer.take(
        (message) => message.type === "chat_message" && message.payload.content === marker,
    );
};

export { startServer, connect, join, enterSharedRoom, barrier, freePort, BACKEND_DIR };
