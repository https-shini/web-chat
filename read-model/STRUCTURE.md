# Decisões arquiteturais e Estrutura do projeto

## Requisitos para rodar o projeto

- **Node.js 20 ou superior** e **npm** (o npm vem junto com o Node).
- Um navegador moderno com suporte a WebSocket, `100dvh` e `:focus-visible`.
- Conexão com a internet apenas para baixar as dependências e as fontes; depois
  disso o projeto roda inteiramente local.

## Setup de ambiente

```bash
git clone https://github.com/https-shini/web-chat
cd web-chat
npm install
npm --prefix backend install
```

## Como rodar na sua máquina

```bash
npm run dev
```

Esse comando sobe os dois processos de uma vez:

| Processo               | Endereço              |
| ---------------------- | --------------------- |
| Frontend (Vite)        | http://localhost:5173 |
| Servidor de tempo real | ws://localhost:8080   |

Abra `http://localhost:5173`. Sem nenhuma configuração o frontend já aponta para
o servidor local — não é preciso editar código. Para apontar para outro servidor,
copie `.env.example` para `.env` e ajuste `VITE_SOCKET_URL`.

Outros comandos: `npm run build`, `npm run lint`, `npm run check:contrast`,
`npm run format`.

<br>

## Decisões Arquiteturais:

- O Chat Web segue uma arquitetura cliente-servidor, onde o frontend é responsável pela interface do usuário e o backend gerencia a lógica de negócios e a comunicação com o servidor WebSocket. <br>
- WebSocket: O uso do protocolo WebSocket permite uma comunicação bidirecional em tempo real entre clientes e servidor, facilitando a troca instantânea de mensagens.

## Estrutura do projeto

- Frontend (`frontend/`): <br>
    - `index.html`: raiz do Vite. Estrutura semântica com landmarks, rótulos reais e o bootstrap de tema, que escreve `data-theme` no `<html>` antes da primeira pintura. <br>
    - `src/css/`: `tokens.css` (única fonte de cor, espaço, raio e tempo) → `base/` → `components/`, um arquivo por componente. <br>
    - `src/transport/`: conexão, backoff e fila de envio. Não toca no DOM. <br>
    - `src/state/`: estado observável. Não conhece o canal de tempo real. <br>
    - `src/ui/`: renderização e eventos, DOM puro, sem `innerHTML`. <br>
    - `src/main.js`: raiz de composição — o único lugar em que as três camadas se conhecem. <br>

<br>

- Backend: <br>
    - Node.js: Utilizado como plataforma de tempo de execução do JavaScript no servidor, permitindo a implementação do servidor WebSocket. <br>
    - WebSocket (ws): Criação de um servidor WebSocket para lidar com conexões de clientes, recebendo e transmitindo mensagens entre eles. <br>
    - dotenv: Utilizado para carregar variáveis de ambiente do arquivo .env, facilitando a configuração do ambiente de desenvolvimento. <br>

<br>

> **Informações Importantes sobre a Aplicação** <br>
> A aplicação suporta comunicação em tempo real entre os usuários através do protocolo WebSocket. <br>
> Os usuários podem ingressar na aplicação fornecendo um nome de usuário no formulário de login. <br>
> As mensagens enviadas por um usuário são instantaneamente exibidas para todos os outros participantes do chat. <br>
> O frontend é responsivo e foi projetado para ser compatível com diferentes dispositivos e tamanhos de tela. <br>
