# Decisões arquiteturais e Estrutura do projeto

## Requisitos para rodar o projeto

- Node.js: É necessário ter o Node.js instalado no ambiente de desenvolvimento.
- npm: O npm é utilizado para instalar as dependências do projeto.
- Conexão com a Internet: Para utilizar o Chat Web, é necessário uma conexão ativa com a internet.
- Navegador Web Moderno: O Chat Web é acessado através de um navegador web moderno que suporte as tecnologias HTML5, CSS3 e WebSocket.

## Setup de ambiente:

Para configurar o ambiente de desenvolvimento e executar o projeto, siga estas etapas:

1. Instalação do Node.js:
   - Certifique-se de ter o Node.js instalado em sua máquina. É recomendado usar a versão LTS (Long-Term Support). Você pode baixá-lo em [Node.js LTS](https://nodejs.org/en).

2. Instalação do Yarn:
   - Utilize o Yarn como gerenciador de pacotes. Se ainda não tiver o Yarn instalado, você pode instalá-lo seguindo as instruções em [Yarn 1.x](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable).

3. Clone do Projeto:
   - Abra o terminal e clone o projeto para o seu ambiente local executando o seguinte comando:
     ```
     git clone https://github.com/https-shini/web-chat
     ```

4. Instalação de Dependências:
   - Navegue até o diretório do projeto clonado e instale as dependências executando o comando:
     ```
     yarn
     ```

## Como rodar na sua máquina?

Após configurar o ambiente, execute o projeto da seguinte maneira:

1. Inicie o Servidor de Desenvolvimento:
   - No terminal, execute o comando:
     ```
     yarn dev
     ```

2. Acesse o Projeto:
   - Abra o navegador e acesse o projeto localmente. Por padrão, o servidor de desenvolvimento geralmente é executado em `http://localhost:3000`.

3. Pronto 🎉
   - Agora você pode explorar e interagir com o projeto em sua máquina localmente.

Essas instruções garantem que você tenha o ambiente configurado corretamente e possa executar o projeto sem problemas em sua máquina local.

<br>

## Decisões Arquiteturais:

- O Chat Web segue uma arquitetura cliente-servidor, onde o frontend é responsável pela interface do usuário e o backend gerencia a lógica de negócios e a comunicação com o servidor WebSocket. <br>
- WebSocket: O uso do protocolo WebSocket permite uma comunicação bidirecional em tempo real entre clientes e servidor, facilitando a troca instantânea de mensagens.

## Estrutura do projeto

- Frontend: <br>
   - HTML: Responsável pela estruturação do conteúdo da página, incluindo formulários de entrada e exibição de mensagens. <br>
   - CSS: Estilização e design responsivo da interface do usuário para garantir uma experiência visualmente agradável e consistente em diferentes dispositivos. <br>
   - JavaScript: Adição de interatividade à página, manipulando eventos do usuário e interagindo com o backend para enviar e receber mensagens em tempo real. <br>

<br>

- Backend: <br> 
   - Node.js: Utilizado como plataforma de tempo de execução do JavaScript no servidor, permitindo a implementação do servidor WebSocket. <br> 
   - WebSocket (ws): Criação de um servidor WebSocket para lidar com conexões de clientes, recebendo e transmitindo mensagens entre eles. <br> 
   - dotenv: Utilizado para carregar variáveis de ambiente do arquivo .env, facilitando a configuração do ambiente de desenvolvimento. <br>

<br>

> **Informações Importantes sobre a Aplicação** <br>
A aplicação suporta comunicação em tempo real entre os usuários através do protocolo WebSocket. <br>
Os usuários podem ingressar na aplicação fornecendo um nome de usuário no formulário de login. <br>
As mensagens enviadas por um usuário são instantaneamente exibidas para todos os outros participantes do chat. <br>
O frontend é responsivo e foi projetado para ser compatível com diferentes dispositivos e tamanhos de tela. <br>
