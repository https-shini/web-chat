<h1 align="center"> Documentação aprofundada </h1>

<p align="center">
  <a href="#decisões-arquiteturais">Decisões Arquiteturais</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#estrutura-do-projeto">Estrutura do projeto</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#funcionamento">Funcionamento</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/https-shini/web-chat">Voltar</a>
</p>

<br>

## Decisões Arquiteturais:

- O Chat Web segue uma arquitetura cliente-servidor, onde o frontend é responsável pela interface do usuário e o backend gerencia a lógica de negócios e a comunicação com o servidor WebSocket. <br>
- WebSocket: O uso do protocolo WebSocket permite uma comunicação bidirecional em tempo real entre clientes e servidor, facilitando a troca instantânea de mensagens.

<br>

## Estrutura do projeto

➜ **Frontend:**

1. **HTML (index.html):**
   - O arquivo HTML é responsável pela estruturação do conteúdo da página. Ele define os elementos como formulários de entrada de usuário, área de exibição de mensagens e botões de envio de mensagens.

2. **CSS (style.css):**
   - O arquivo CSS é responsável pela estilização e design da interface do usuário. Ele define as cores, fontes, layouts e estilos visuais que tornam a aplicação atraente e fácil de usar.

3. **JavaScript (script.js):**
   - O arquivo JavaScript é responsável por adicionar interatividade à página. Ele manipula eventos do usuário, como cliques e submissões de formulários, e se comunica com o servidor para enviar e receber mensagens em tempo real. Além disso, o JavaScript também é responsável por atualizar dinamicamente a interface do usuário para refletir novas mensagens recebidas.

<br>

➜ **Backend:**

1. **Node.js (server.js):**
   - O arquivo `server.js` é o principal arquivo do backend, que utiliza o Node.js como plataforma de tempo de execução do JavaScript no servidor. Ele inicializa e configura o servidor WebSocket para lidar com conexões de clientes, recebe e envia mensagens entre os clientes conectados e gerencia a lógica de negócios da aplicação.

2. **WebSocket (ws):**
   - O WebSocket é um protocolo de comunicação bidirecional que permite a troca de mensagens em tempo real entre o cliente e o servidor. No contexto deste projeto, o servidor WebSocket é responsável por receber mensagens dos clientes e retransmiti-las para todos os outros clientes conectados, garantindo que todas as mensagens sejam distribuídas em tempo real para todos os participantes do chat.

<br>

## **Funcionamento:**

- Quando um usuário acessa a aplicação, ele é apresentado com um formulário de login onde pode inserir seu nome.
- Após inserir o nome e clicar em "Entrar", o usuário é redirecionado para a área de chat.
- No chat, o usuário pode digitar mensagens no campo de entrada e enviar.
- Quando uma mensagem é enviada, o JavaScript no frontend envia a mensagem para o servidor WebSocket no backend.
- O servidor WebSocket recebe a mensagem e a retransmite para todos os outros clientes conectados.
- As mensagens recebidas são exibidas dinamicamente na área de chat de todos os clientes, permitindo uma conversa em tempo real entre os usuários.

<br>

> **Informações Importantes sobre a Aplicação** <br>
A aplicação suporta comunicação em tempo real entre os usuários através do protocolo WebSocket. <br>
Os usuários podem ingressar na aplicação fornecendo um nome de usuário no formulário de login. <br>
As mensagens enviadas por um usuário são instantaneamente exibidas para todos os outros participantes do chat. <br>
O frontend é responsivo e foi projetado para ser compatível com diferentes dispositivos e tamanhos de tela. <br>
