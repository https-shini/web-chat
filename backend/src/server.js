const { WebSocketServer } = require("ws");
const http = require("http");
const dotenv = require("dotenv");
const crypto = require("crypto");

dotenv.config();

// Origin allowlist: OPCIONAL, via variável de ambiente. Sem ela configurada,
// o comportamento de hoje é preservado (qualquer origem pode conectar) — é
// assim que este chat sempre funcionou, e travar a origem sem saber o
// domínio real de produção derrubaria o serviço para todo mundo. Configure
// ALLOWED_ORIGINS (lista separada por vírgula) no ambiente de produção para
// que só o frontend legítimo consiga abrir conexão.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

// Teto de conexões simultâneas: independe de proxy/IP (ver nota sobre
// limite por IP mais abaixo) e evita que o processo seja derrubado por
// exaustão de memória num flood de conexões.
const MAX_TOTAL_CONNECTIONS = 500;

// Servidor HTTP próprio, em vez de deixar o WebSocketServer criar o dele
// internamente. Motivo: sem um handler de requisição, um GET comum na porta
// (exatamente o que a checagem de saúde de uma plataforma de hospedagem
// faz) recebe 426 "Upgrade Required" do servidor HTTP interno do módulo ws
// — e a maioria das plataformas trata qualquer coisa fora de 2xx como
// "não saudável" e reinicia o processo, derrubando todo mundo conectado
// sem que o serviço tenha, de fato, parado de funcionar.
const httpServer = http.createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("ok");
});

const wss = new WebSocketServer({
    server: httpServer,
    // Ver comentário acima: 16 KiB é generoso para o maior payload legítimo
    // (mensagem de 1000 caracteres) e recusa qualquer frame muito maior
    // antes que ele seja bufferizado inteiro na memória do processo.
    maxPayload: 16 * 1024,
    verifyClient:
        allowedOrigins.length === 0
            ? undefined
            : (info, callback) => {
                  const ok = allowedOrigins.includes(info.origin);
                  callback(ok, ok ? undefined : 403, ok ? undefined : "Origem não permitida");
              },
});

httpServer.listen(process.env.PORT || 8080);

// Armazenamento em memória para usuários conectados e mensagens
const connectedUsers = new Map();
const messageHistory = [];
const typingUsers = new Set();

// Função para broadcast de mensagens
const broadcast = (message, excludeWs = null) => {
    const messageString = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client !== excludeWs && client.readyState === client.OPEN) {
            client.send(messageString);
        }
    });
};

// Função para enviar lista de usuários online
const broadcastUserList = () => {
    const userList = Array.from(connectedUsers.values()).map((user) => ({
        id: user.id,
        name: user.name,
        status: "online",
    }));

    broadcast({
        type: "user_list",
        payload: userList,
    });
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
    // de usuário ou mensagem de uma linha, e sem removê-los o texto do
    // usuário poderia forjar linhas nos logs do servidor. O regex é
    // deliberado — é a própria correção, não um descuido.
    // eslint-disable-next-line no-control-regex
    const withoutControlChars = value.replace(/[\x00-\x1f\x7f]/g, " ");
    return withoutControlChars.trim().slice(0, maxLength);
};

// Limitador de taxa por conexão (balde de fichas). Aplica-se a toda mensagem
// recebida, incluindo typing_start/typing_stop — o cliente dispara um sinal
// de digitação a CADA tecla, sem debounce, então a capacidade é generosa o
// bastante para nunca ser atingida por uso legítimo. O alvo real é o flood
// de chat_message, que cresce o histórico em memória e é retransmitido para
// todo mundo conectado a cada mensagem aceita.
const RATE_LIMIT_CAPACITY = 40;
const RATE_LIMIT_REFILL_PER_SECOND = 8;

const createRateLimiter = () => {
    let tokens = RATE_LIMIT_CAPACITY;
    let lastRefill = Date.now();
    return () => {
        const now = Date.now();
        tokens = Math.min(
            RATE_LIMIT_CAPACITY,
            tokens + ((now - lastRefill) / 1000) * RATE_LIMIT_REFILL_PER_SECOND,
        );
        lastRefill = now;
        if (tokens < 1) return false;
        tokens -= 1;
        return true;
    };
};

// Função para adicionar timestamp
const addTimestamp = () => {
    return new Date().toISOString();
};

wss.on("connection", (ws) => {
    if (wss.clients.size > MAX_TOTAL_CONNECTIONS) {
        ws.close(1013, "Servidor cheio, tente novamente em instantes");
        return;
    }

    console.log("Cliente conectado");

    const consumeToken = createRateLimiter();

    ws.on("error", (error) => {
        console.error("Erro no WebSocket:", error);
    });

    ws.on("message", (data) => {
        // Excedeu a taxa: descarta em silêncio. Nenhuma resposta de erro é
        // enviada de propósito — responder amplificaria tráfego de volta
        // para quem está inundando o servidor, e para o caso legítimo
        // (digitação muito rápida) um "erro" na tela seria só ruído.
        if (!consumeToken()) return;

        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case "user_login": {
                    // Registrar novo usuário. userColor não é lido: o campo
                    // não tem consumidor no cliente (a cor de exibição é
                    // derivada do id, no navegador) e aceitar um valor
                    // arbitrário sem uso é só superfície de ataque à toa.
                    const requestedId = normalizeText(message.payload?.userId, 100);
                    const userData = {
                        id: requestedId || crypto.randomUUID(),
                        name: normalizeText(message.payload?.userName, 30),
                        ws: ws,
                    };

                    connectedUsers.set(ws, userData);

                    // Enviar histórico de mensagens para o novo usuário
                    if (messageHistory.length > 0) {
                        ws.send(
                            JSON.stringify({
                                type: "message_history",
                                payload: messageHistory.slice(-50), // Últimas 50 mensagens
                            }),
                        );
                    }

                    // Notificar outros usuários sobre novo usuário
                    broadcast(
                        {
                            type: "user_joined",
                            payload: {
                                userName: userData.name,
                                timestamp: addTimestamp(),
                            },
                        },
                        ws,
                    );

                    // Enviar lista atualizada de usuários
                    broadcastUserList();
                    break;
                }

                case "chat_message": {
                    const user = connectedUsers.get(ws);
                    if (!user) {
                        ws.send(
                            JSON.stringify({
                                type: "error",
                                payload: { message: "Usuário não autenticado" },
                            }),
                        );
                        return;
                    }

                    // Validar conteúdo da mensagem
                    const content = normalizeText(message.payload.content, 1000);
                    if (!content) {
                        ws.send(
                            JSON.stringify({
                                type: "error",
                                payload: { message: "Mensagem inválida ou muito longa" },
                            }),
                        );
                        return;
                    }

                    const chatMessage = {
                        id: crypto.randomUUID(),
                        type: "chat_message",
                        payload: {
                            userId: user.id,
                            userName: user.name,
                            content: content,
                            timestamp: addTimestamp(),
                        },
                    };

                    // Adicionar ao histórico
                    messageHistory.push(chatMessage);

                    // Limitar histórico a 1000 mensagens
                    if (messageHistory.length > 1000) {
                        messageHistory.shift();
                    }

                    // Broadcast da mensagem
                    broadcast(chatMessage);
                    break;
                }

                case "typing_start": {
                    const typingUser = connectedUsers.get(ws);
                    if (typingUser) {
                        typingUsers.add(typingUser.id);
                        broadcast(
                            {
                                type: "user_typing",
                                payload: {
                                    userId: typingUser.id,
                                    userName: typingUser.name,
                                    isTyping: true,
                                },
                            },
                            ws,
                        );
                    }
                    break;
                }

                case "typing_stop": {
                    const stoppedTypingUser = connectedUsers.get(ws);
                    if (stoppedTypingUser) {
                        typingUsers.delete(stoppedTypingUser.id);
                        broadcast(
                            {
                                type: "user_typing",
                                payload: {
                                    userId: stoppedTypingUser.id,
                                    userName: stoppedTypingUser.name,
                                    isTyping: false,
                                },
                            },
                            ws,
                        );
                    }
                    break;
                }

                default: {
                    console.log("Tipo de mensagem desconhecido:", message.type);
                    break;
                }
            }
        } catch (error) {
            console.error("Erro ao processar mensagem:", error);
            ws.send(
                JSON.stringify({
                    type: "error",
                    payload: { message: "Erro interno do servidor" },
                }),
            );
        }
    });

    ws.on("close", () => {
        const user = connectedUsers.get(ws);
        if (user) {
            console.log(`Cliente desconectado: ${user.name}`);

            // Remover usuário da lista de digitando
            typingUsers.delete(user.id);

            // Notificar outros usuários sobre saída
            broadcast({
                type: "user_left",
                payload: {
                    userName: user.name,
                    timestamp: addTimestamp(),
                },
            });

            // Remover usuário da lista
            connectedUsers.delete(ws);

            // Enviar lista atualizada de usuários
            broadcastUserList();
        }
    });
});

console.log(`Servidor WebSocket rodando na porta ${process.env.PORT || 8080}`);
