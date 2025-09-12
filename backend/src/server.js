const { WebSocketServer } = require("ws");
const dotenv = require("dotenv");
const crypto = require("crypto");

dotenv.config();

const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

// Armazenamento em memória para usuários conectados e mensagens
const connectedUsers = new Map();
const messageHistory = [];
const typingUsers = new Set();
const maxMessages = 1000;
const inactiveTime = 60 * 60 * 1000; // 1 hora em milissegundos
let cleanupTimer;

const resetCleanupTimer = () => {
    clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(() => {
        console.log("Chat limpo por inatividade.");
        messageHistory.length = 0; // Limpa o histórico em memória
        wss.clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(JSON.stringify({
                    type: "chat_cleared",
                    payload: "O chat foi limpo por inatividade."
                }));
            }
        });
    }, inactiveTime);
};

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
    const userList = Array.from(connectedUsers.values()).map(user => ({
        id: user.id,
        name: user.name,
        color: user.color,
        status: 'online'
    }));
    
    broadcast({
        type: 'user_list',
        payload: userList
    });
};

// Função para sanitizar conteúdo (prevenção básica de XSS)
const sanitizeContent = (content) => {
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .trim();
};

// Função para adicionar timestamp
const addTimestamp = () => {
    return new Date().toISOString();
};

wss.on("connection", (ws) => {
    console.log("Cliente conectado");
    
    ws.on("error", (error) => {
        console.error("Erro no WebSocket:", error);
    });

    // Enviar histórico de mensagens para o novo usuário
    if (messageHistory.length > 0) {
        ws.send(JSON.stringify({
            type: 'message_history',
            payload: messageHistory
        }));
    }
    
    ws.on("message", (data) => {
        resetCleanupTimer(); // Reinicia o timer a cada nova mensagem
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'user_login':
                    const userData = {
                        id: message.payload.userId,
                        name: sanitizeContent(message.payload.userName),
                        color: message.payload.userColor,
                        ws: ws
                    };
                    
                    connectedUsers.set(ws, userData);
                    
                    broadcast({
                        type: 'user_joined',
                        payload: {
                            userName: userData.name,
                            userColor: userData.color,
                            timestamp: addTimestamp()
                        }
                    }, ws);
                    
                    broadcastUserList();
                    break;
                    
                case 'chat_message':
                    const user = connectedUsers.get(ws);
                    if (!user) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            payload: { message: 'Usuário não autenticado' }
                        }));
                        return;
                    }
                    
                    const content = sanitizeContent(message.payload.content);
                    if (!content || content.length > 1000) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            payload: { message: 'Mensagem inválida ou muito longa' }
                        }));
                        return;
                    }
                    
                    const chatMessage = {
                        id: crypto.randomUUID(),
                        type: 'chat_message',
                        payload: {
                            userId: user.id,
                            userName: user.name,
                            userColor: user.color,
                            content: content,
                            timestamp: addTimestamp()
                        }
                    };
                    
                    messageHistory.push(chatMessage);
                    if (messageHistory.length > maxMessages) {
                        messageHistory.shift();
                    }
                    
                    broadcast(chatMessage);
                    break;
                    
                case 'typing_start':
                    const typingUser = connectedUsers.get(ws);
                    if (typingUser) {
                        typingUsers.add(typingUser.id);
                        broadcast({
                            type: 'user_typing',
                            payload: {
                                userId: typingUser.id,
                                userName: typingUser.name,
                                isTyping: true
                            }
                        }, ws);
                    }
                    break;
                    
                case 'typing_stop':
                    const stoppedTypingUser = connectedUsers.get(ws);
                    if (stoppedTypingUser) {
                        typingUsers.delete(stoppedTypingUser.id);
                        broadcast({
                            type: 'user_typing',
                            payload: {
                                userId: stoppedTypingUser.id,
                                userName: stoppedTypingUser.name,
                                isTyping: false
                            }
                        }, ws);
                    }
                    break;
                    
                default:
                    console.log("Tipo de mensagem desconhecido:", message.type);
            }
        } catch (error) {
            console.error("Erro ao processar mensagem:", error);
            ws.send(JSON.stringify({
                type: 'error',
                payload: { message: 'Erro interno do servidor' }
            }));
        }
    });

    ws.on("close", () => {
        const user = connectedUsers.get(ws);
        if (user) {
            console.log(`Cliente desconectado: ${user.name}`);
            typingUsers.delete(user.id);
            
            broadcast({
                type: 'user_left',
                payload: {
                    userName: user.name,
                    userColor: user.color,
                    timestamp: addTimestamp()
                }
            });
            
            connectedUsers.delete(ws);
            broadcastUserList();
        }
    });
});

console.log(`Servidor WebSocket rodando na porta ${process.env.PORT || 8080}`);
resetCleanupTimer();
