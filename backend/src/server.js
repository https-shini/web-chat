const { WebSocketServer } = require("ws");
const dotenv = require("dotenv");
const crypto = require("crypto");

dotenv.config();

const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

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

    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'user_login':
                    // Registrar novo usuário
                    const userData = {
                        id: message.payload.userId,
                        name: sanitizeContent(message.payload.userName),
                        color: message.payload.userColor,
                        ws: ws
                    };
                    
                    connectedUsers.set(ws, userData);
                    
                    // Enviar histórico de mensagens para o novo usuário
                    if (messageHistory.length > 0) {
                        ws.send(JSON.stringify({
                            type: 'message_history',
                            payload: messageHistory.slice(-50) // Últimas 50 mensagens
                        }));
                    }
                    
                    // Notificar outros usuários sobre novo usuário
                    broadcast({
                        type: 'user_joined',
                        payload: {
                            userName: userData.name,
                            userColor: userData.color,
                            timestamp: addTimestamp()
                        }
                    }, ws);
                    
                    // Enviar lista atualizada de usuários
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
                    
                    // Validar conteúdo da mensagem
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
                    
                    // Adicionar ao histórico
                    messageHistory.push(chatMessage);
                    
                    // Limitar histórico a 1000 mensagens
                    if (messageHistory.length > 1000) {
                        messageHistory.shift();
                    }
                    
                    // Broadcast da mensagem
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
            
            // Remover usuário da lista de digitando
            typingUsers.delete(user.id);
            
            // Notificar outros usuários sobre saída
            broadcast({
                type: 'user_left',
                payload: {
                    userName: user.name,
                    userColor: user.color,
                    timestamp: addTimestamp()
                }
            });
            
            // Remover usuário da lista
            connectedUsers.delete(ws);
            
            // Enviar lista atualizada de usuários
            broadcastUserList();
        }
    });
});

console.log(`Servidor WebSocket rodando na porta ${process.env.PORT || 8080}`);
