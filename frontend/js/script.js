// Elementos do DOM
const login = document.querySelector(".login");
const loginForm = login.querySelector(".login__form");
const loginInput = login.querySelector(".login__input");

const chat = document.querySelector(".chat");
const chatForm = chat.querySelector(".chat__form");
const chatInput = chat.querySelector(".chat__input");
const chatMessages = chat.querySelector(".chat__messages");
const chatStatus = chat.querySelector(".chat__status");
const usersCount = chat.querySelector(".users__count");
const usersList = chat.querySelector(".users__list");
const typingIndicator = document.querySelector(".typing__indicator");
const typingText = document.querySelector(".typing__text");

// Configurações
const colors = [
    "cadetblue", "darkgoldenrod", "cornflowerblue",
    "darkkhaki", "hotpink", "gold", "mediumpurple",
    "lightcoral", "lightseagreen", "sandybrown"
];

// Estado do usuário
const user = { id: "", name: "", color: "" };
let websocket;
let typingTimer;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Funções utilitárias
const getRandomColor = () => {
    const randomIndex = Math.floor(Math.random() * colors.length);
    return colors[randomIndex];
};

const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const scrollToBottom = () => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

const showNotification = (message, type = 'success') => {
    const notificationsContainer = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification notification--${type}`;
    notification.textContent = message;

    notificationsContainer.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000);
};

// Funções de criação de elementos de mensagem
const createMessageElement = (content, sender, senderColor, timestamp, isOwn = false) => {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${isOwn ? 'message--self' : 'message--other'}`;

    if (!isOwn && sender) {
        const senderSpan = document.createElement("span");
        senderSpan.className = "message--sender";
        senderSpan.style.color = senderColor;
        senderSpan.textContent = sender;
        messageDiv.appendChild(senderSpan);
    }

    const contentDiv = document.createElement("div");
    contentDiv.textContent = content;
    messageDiv.appendChild(contentDiv);

    if (timestamp) {
        const timestampSpan = document.createElement("span");
        timestampSpan.className = "message--timestamp";
        timestampSpan.textContent = formatTimestamp(timestamp);
        messageDiv.appendChild(timestampSpan);
    }

    return messageDiv;
};

const createSystemMessage = (content, timestamp) => {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message message--system";
    messageDiv.textContent = content;

    if (timestamp) {
        const timestampSpan = document.createElement("span");
        timestampSpan.className = "message--timestamp";
        timestampSpan.textContent = formatTimestamp(timestamp);
        messageDiv.appendChild(timestampSpan);
    }

    return messageDiv;
};

// Funções de gerenciamento de usuários
const updateUsersList = (users) => {
    usersCount.textContent = `${users.length} usuário${users.length !== 1 ? 's' : ''} online`;

    usersList.innerHTML = '';
    users.forEach(user => {
        const userElement = document.createElement('div');
        userElement.className = 'user__item';
        userElement.style.color = user.color;
        userElement.textContent = user.name;
        usersList.appendChild(userElement);
    });
};

// Funções de indicador de digitação
const updateTypingIndicator = (userName, isTyping) => {
    // ... (a lógica do indicador de digitação, se implementada, deve estar aqui)
};

// Funções de WebSocket
const connectWebSocket = () => {
    try {
        // CORREÇÃO: Altere a URL abaixo para o endereço do seu servidor de produção com 'wss://'
        // Exemplo: new WebSocket("wss://chat-backend-3sxv.onrender.com");
        websocket = new WebSocket("wss://chat-frontend-g42t.onrender.com/");

        websocket.onopen = () => {
            console.log("Conectado ao servidor");
            chatStatus.textContent = "Conectado";
            reconnectAttempts = 0;

            websocket.send(JSON.stringify({
                type: 'user_login',
                payload: {
                    userId: user.id,
                    userName: user.name,
                    userColor: user.color
                }
            }));
        };

        websocket.onmessage = processMessage;

        websocket.onclose = () => {
            console.log("Conexão fechada");
            chatStatus.textContent = "Desconectado";

            if (reconnectAttempts < maxReconnectAttempts) {
                setTimeout(() => {
                    reconnectAttempts++;
                    console.log(`Tentativa de reconexão ${reconnectAttempts}/${maxReconnectAttempts}`);
                    connectWebSocket();
                }, 2000 * reconnectAttempts);
            } else {
                showNotification("Não foi possível reconectar ao servidor", "error");
            }
        };

        websocket.onerror = (error) => {
            console.error("Erro no WebSocket:", error);
            showNotification("Erro de conexão", "error");
        };

    } catch (error) {
        console.error("Erro ao conectar:", error);
        showNotification("Erro ao conectar ao servidor", "error");
    }
};

// Processamento de mensagens
const processMessage = ({ data }) => {
    try {
        const message = JSON.parse(data);

        switch (message.type) {
            case 'chat_message':
                const { userId, userName, userColor, content, timestamp } = message.payload;
                const isOwn = userId === user.id;
                const messageElement = createMessageElement(content, userName, userColor, timestamp, isOwn);

                const welcomeMessage = chatMessages.querySelector('.welcome__message');
                if (welcomeMessage) {
                    welcomeMessage.remove();
                }

                chatMessages.appendChild(messageElement);
                scrollToBottom();
                break;

            case 'message_history':
                chatMessages.innerHTML = '';
                message.payload.forEach(msg => {
                    const { userId, userName, userColor, content, timestamp } = msg.payload;
                    const isOwn = userId === user.id;
                    const messageElement = createMessageElement(content, userName, userColor, timestamp, isOwn);
                    chatMessages.appendChild(messageElement);
                });
                scrollToBottom();
                break;

            case 'chat_cleared':
                chatMessages.innerHTML = '';
                showNotification(message.payload, 'info');
                break;

            case 'user_list':
                updateUsersList(message.payload);
                break;

            case 'user_joined':
                const joinMessage = createSystemMessage(`${message.payload.userName} entrou no chat`, message.payload.timestamp);
                chatMessages.appendChild(joinMessage);
                scrollToBottom();
                break;

            case 'user_left':
                const leftMessage = createSystemMessage(`${message.payload.userName} saiu do chat`, message.payload.timestamp);
                chatMessages.appendChild(leftMessage);
                scrollToBottom();
                break;

            case 'user_typing':
                updateTypingIndicator(message.payload.userName, message.payload.isTyping);
                break;

            case 'error':
                showNotification(message.payload.message, 'error');
                break;

            default:
                console.log("Tipo de mensagem desconhecido:", message.type);
        }
    } catch (error) {
        console.error("Erro ao processar mensagem:", error);
    }
};

// Handlers de eventos
const handleLogin = (event) => {
    event.preventDefault();

    const name = loginInput.value.trim();
    if (!name) {
        showNotification("Por favor, digite seu nome", "error");
        return;
    }

    user.id = crypto.randomUUID();
    user.name = name;
    user.color = getRandomColor();

    login.style.display = "none";
    chat.style.display = "flex";

    connectWebSocket();

    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
};

const sendMessage = (event) => {
    event.preventDefault();

    const content = chatInput.value.trim();
    if (!content || !websocket || websocket.readyState !== WebSocket.OPEN) {
        return;
    }

    websocket.send(JSON.stringify({
        type: 'chat_message',
        payload: {
            content: content
        }
    }));

    chatInput.value = "";

    if (typingTimer) {
        clearTimeout(typingTimer);
    }
    websocket.send(JSON.stringify({ type: 'typing_stop' }));
};

const handleTyping = () => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) return;

    websocket.send(JSON.stringify({ type: 'typing_start' }));

    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        websocket.send(JSON.stringify({ type: 'typing_stop' }));
    }, 2000);
};

// Event listeners
loginForm.addEventListener("submit", handleLogin);
chatForm.addEventListener("submit", sendMessage);
chatInput.addEventListener("input", handleTyping);

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        // Aba ficou visível, limpar notificações pendentes
    }
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(e);
    }
});
