<h1 align="center">web-chat</h1>

<p align="center">
  Sala de conversa em tempo real: <strong>única, efêmera e anônima</strong>.<br>
  Frontend em JavaScript nativo, sem framework · Backend Node.js com WebSocket.
</p>

<div align="center">

[![Licença](https://img.shields.io/badge/Licença-MIT-green?style=for-the-badge)](./LICENSE)
[![Código](https://img.shields.io/badge/Ver%20Código-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/https-shini/web-chat)

</div>

---

## Sumário

- [Sobre o projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [O que não existe](#o-que-não-existe)
- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Estrutura de diretórios](#estrutura-de-diretórios)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração do ambiente](#configuração-do-ambiente)
- [Executando localmente](#executando-localmente)
- [Qualidade e testes](#qualidade-e-testes)
- [Build](#build)
- [Deploy](#deploy)
- [Integrações](#integrações)
- [Acessibilidade](#acessibilidade)
- [Documentação complementar](#documentação-complementar)
- [Roadmap](#roadmap)
- [Status do projeto](#status-do-projeto)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

---

## Sobre o projeto

Uma sala só. Você entra com um nome, conversa com quem estiver conectado e sai.
Não há cadastro, login, canais ou banco de dados. Quando você fecha a aba, sua
sessão acaba.

O objetivo técnico é mostrar comunicação em tempo real, um design system com
acessibilidade verificada e dois temas usando apenas HTML, CSS e JavaScript
nativos no navegador — **nenhuma dependência de runtime no frontend**.

## Funcionalidades

Cada item corresponde a código neste repositório.

| Funcionalidade                                                                                                                                                                                                                       | Onde                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Entrada com nome completo (até 60 caracteres) e nome de usuário único na sala (`@username`), sem conta nem senha; botão Sair libera a identidade na hora                                                                             | `frontend/src/ui/entry.js`                                                        |
| Mensagens em tempo real para todos os conectados (até 1000 caracteres)                                                                                                                                                               | `backend/src/server.js`, `frontend/src/state/events.js`                           |
| Últimas 50 mensagens enviadas a quem entra                                                                                                                                                                                           | `backend/src/server.js`                                                           |
| Interface em painéis: barra lateral (sala, atalhos, conexão, você), conversa com mensagens agrupadas e painel de pessoas; gavetas em tablet e celular                                                                                | `frontend/index.html`, `frontend/src/ui/layout.js`                                |
| Indicador "está digitando" com expiração automática                                                                                                                                                                                  | `frontend/src/state/typing.js`, `frontend/src/ui/typing.js`                       |
| Avisos de entrada e saída na conversa                                                                                                                                                                                                | `backend/src/server.js`                                                           |
| Horário em cada mensagem (pt-BR)                                                                                                                                                                                                     | `frontend/src/ui/message.js`                                                      |
| Reconexão automática: backoff exponencial, teto, jitter e retry manual                                                                                                                                                               | `frontend/src/transport/socket.js`, `frontend/src/ui/failure.js`                  |
| Fila de envio enquanto a conexão está fora (até 50 mensagens)                                                                                                                                                                        | `frontend/src/transport/socket.js`                                                |
| Quatro estados de conexão visíveis: conectando, conectado, reconectando, offline                                                                                                                                                     | `frontend/src/ui/connection.js`                                                   |
| Tema claro e escuro, aplicado antes da primeira pintura e persistido                                                                                                                                                                 | `frontend/index.html`, `frontend/src/ui/themeToggle.js`                           |
| Notificação do navegador só com a aba oculta e após um gesto seu                                                                                                                                                                     | `frontend/src/ui/notify.js`                                                       |
| Identidade atribuída pelo servidor e mantida na reconexão por token secreto de sessão                                                                                                                                                | `backend/src/server.js`, `frontend/src/state/events.js`                           |
| Confirmação de entrega: sua mensagem aparece como "enviando…" até o servidor confirmar; recusada ou sem confirmação, fica "não enviada" com o botão Tentar de novo (sem duplicar)                                                    | `frontend/src/main.js`, `frontend/src/state/store.js`, `backend/src/room/room.js` |
| Proteções no servidor: payload máx. 16 KiB, limites de taxa separados para mensagens e digitação, teto de 500 conexões, allowlist de origem, validação de cada quadro recebido, heartbeat e desligamento gracioso                    | `backend/src/server.js`                                                           |
| **Comandos no chat** (28): digite `/` para ver sugestões; `/help`, `/nick`, `/me`, `/roll`, `/flip`, `/afk`, `/users`, `/profile`, formatação (`/bold`, `/spoiler`…) e mais — ver [`docs/CHAT_COMMANDS.md`](./docs/CHAT_COMMANDS.md) | `backend/src/commands/`, `frontend/src/commands/`                                 |
| Pessoas agrupadas (administradores, online, ausentes) com cartão de cada uma: ver perfil, copiar id e, para admins, silenciar, liberar e remover (com confirmação) — tudo por comandos verificados no servidor                       | `frontend/src/ui/people.js`, `frontend/src/ui/memberCard.js`                      |
| Administração por chave do operador (`ADMIN_KEY`): `/clearall`, `/announce`, `/mute`, `/unmute`, `/kick`, com permissões verificadas no servidor                                                                                     | `backend/src/commands/handlers/admin.js`, `backend/src/room/policy.js`            |
| Reconexão sem avisos repetidos: queda e volta em até 10 s não geram "saiu"/"entrou" para os outros                                                                                                                                   | `backend/src/room/room.js`                                                        |
| Content-Security-Policy no HTML                                                                                                                                                                                                      | `frontend/index.html`                                                             |

### O que o servidor guarda

O servidor mantém em memória as últimas **1000 mensagens** e envia as **50 mais
recentes** para quem entra. Nada é gravado em disco ou banco: **reiniciar o
servidor apaga tudo**.

## O que não existe

Nenhum destes itens está implementado.

| Recurso                                  | Situação                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Salas múltiplas                          | Não implementado. Há **uma** sala global.                                                                                         |
| Banimento e avisos de moderação          | Não implementado: a sala é anônima; `/kick` e `/mute` valem para a identidade atual (quem abre outra aba entra como pessoa nova). |
| Excluir, editar ou responder mensagens   | Não implementado (só a limpeza da sala inteira por administrador).                                                                |
| Fixar mensagens                          | Não implementado. `localStorage` guarda apenas o tema.                                                                            |
| Autenticação e registro                  | Não implementado, e fora do escopo.                                                                                               |
| Upload de arquivos, voz, emojis, reações | Não implementado.                                                                                                                 |
| Mensagens com várias linhas              | Não implementado (o servidor remove quebras de linha).                                                                            |
| Criptografia ponta a ponta               | Não implementado.                                                                                                                 |

## Tecnologias

| Camada         | Tecnologia                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Frontend       | HTML, CSS (custom properties, BEM), JavaScript ES2022 com JSDoc                                    |
| Build / dev    | [Vite](https://vitejs.dev/) 5                                                                      |
| Backend        | Node.js, [`ws`](https://github.com/websockets/ws) 8, `dotenv`                                      |
| Qualidade      | ESLint 9, Stylelint 16, TypeScript (só checagem de tipos), Prettier 3, script próprio de contraste |
| CI / segurança | GitHub Actions, CodeQL                                                                             |
| Fontes         | Inter (Google Fonts), com pilha de sistema de reserva                                              |

Versões exatas e estado das dependências em
[`docs/INVENTARIO_TECNICO.md`](./docs/INVENTARIO_TECNICO.md).

## Arquitetura

Cliente-servidor sobre WebSocket, com mensagens JSON `{ type, payload }`.

```
Navegador                                         Servidor (Node.js)
┌─────────────────────────────────────┐           ┌──────────────────────────────┐
│ main.js (raiz de composição)        │           │ backend/src/server.js        │
│  ├─ transport/  conexão, backoff,   │  WebSocket│  HTTP 200 "ok" + WebSocket   │
│  │              fila — sem DOM      │◄─────────►│  estado em memória:          │
│  ├─ state/      estado observável — │   JSON    │   pessoas conectadas         │
│  │              sem transporte      │           │   histórico (1000)           │
│  └─ ui/         DOM puro, sem       │           │  rate limit, teto, Origin    │
│                 innerHTML           │           └──────────────────────────────┘
└─────────────────────────────────────┘
```

Duas fronteiras do frontend são verificáveis por comando (ambos devem retornar vazio):

```bash
grep -rni 'websocket' frontend/src/ui frontend/src/state
```

```bash
grep -rn 'document\.\|querySelector' frontend/src/transport
```

O contrato de mensagens está descrito
de forma completa em [`docs/PROTOCOLO.md`](./docs/PROTOCOLO.md). As constantes do
protocolo vivem em `backend/src/protocol.js` e `frontend/src/protocol.js`, e um
teste de contrato falha se os dois lados divergirem.

## Estrutura de diretórios

```
web-chat/
├── frontend/
│   ├── index.html              raiz do Vite: landmarks, CSP e bootstrap de tema
│   ├── public/images/          favicon e imagens
│   └── src/
│       ├── main.js             raiz de composição: só aqui as camadas se conhecem
│       ├── config.js           URL por ambiente, reconexão, limites e tempos
│       ├── transport/socket.js conexão, backoff e fila (não toca no DOM)
│       ├── state/              estado observável e tradução de eventos
│       ├── ui/                 componentes de interface, DOM puro
│       ├── a11y/announce.js    região live única, com fila e deduplicação
│       ├── i18n/strings.js     textos de interface
│       ├── protocol.js         espelho do contrato do protocolo (eventos, limites)
│       └── css/                tokens.css → base/ → components/
│   └── test/                   testes de unidade do cliente (node:test)
├── backend/                    ESM, Node.js
│   ├── package.json            dependências e scripts do servidor
│   ├── src/
│   │   ├── server.js           ponto de entrada: ambiente, configuração, sinais
│   │   ├── config.js           .env e validação da configuração
│   │   ├── logger.js           log estruturado (JSON por linha)
│   │   ├── errors.js           catálogo de erros enviados ao cliente
│   │   ├── protocol.js         contrato do protocolo (fonte no servidor)
│   │   ├── validation.js       normalização de nome, mensagem e token
│   │   ├── rateLimiter.js      balde de fichas
│   │   ├── room/               regras da sala e identidades (sem rede)
│   │   └── transport/          HTTP, WebSocket, ciclo da conexão, heartbeat
│   └── test/
│       ├── unit/               módulos isolados e contrato cliente ↔ servidor
│       └── integration/        servidor real + clientes WebSocket
├── scripts/                    dev.mjs (sobe tudo) e checagem de contraste
├── docs/                       análise, roadmap, inventário, design system, relatórios
├── docs/historico/             documentação anterior à refatoração (só registro)
└── .github/workflows/          CI e CodeQL
```

## Pré-requisitos

- **Node.js 20 ou superior** (a CI usa Node 22) e **npm**.
- Navegador moderno com suporte a WebSocket, `100dvh` e `:focus-visible`.
- Internet para instalar dependências e carregar as fontes.

## Instalação

```bash
git clone https://github.com/https-shini/web-chat
```

```bash
cd web-chat
```

```bash
npm install
```

```bash
npm --prefix backend install
```

O frontend e o backend têm `package.json` separados: o primeiro comando instala as
ferramentas de desenvolvimento (raiz) e o segundo as dependências do servidor.

## Configuração do ambiente

Nenhuma configuração é necessária para rodar localmente: sem variáveis, o frontend
conecta em `ws://<host da página>:8080` (ou `wss://` sob HTTPS) e o servidor escuta
na porta 8080.

Para configurar, copie o exemplo para a **raiz** do repositório — frontend e backend
leem o mesmo arquivo:

```bash
cp .env.example .env
```

| Variável          | Usada por                    | Para quê                                                                                                                 | Padrão                          |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `VITE_SOCKET_URL` | Frontend (embutida no build) | Endereço do servidor WebSocket; precisa ser `ws://` ou `wss://`                                                          | `ws(s)://<host da página>:8080` |
| `ALLOWED_ORIGINS` | Backend                      | Origens autorizadas a conectar, separadas por vírgula. **Configure em produção.**                                        | vazio = qualquer origem         |
| `PORT`            | Backend                      | Porta HTTP/WebSocket                                                                                                     | `8080`                          |
| `HEARTBEAT_MS`    | Backend                      | Intervalo do ping que detecta conexões mortas (mínimo 50)                                                                | `30000`                         |
| `ADMIN_KEY`       | Backend                      | Chave secreta para `/admin` (16–200 caracteres, sem espaços). Vazia: administração desativada. Nunca use prefixo `VITE_` | vazio                           |
| `LEAVE_GRACE_MS`  | Backend                      | Janela em que uma reconexão não anuncia saída/entrada (0 desliga)                                                        | `10000`                         |

Parâmetros operacionais opcionais do backend — limite de conexões, tamanho de quadro,
limites de taxa e tamanho do histórico — estão documentados, com os valores padrão,
no [`.env.example`](./.env.example): `MAX_CONNECTIONS`, `MAX_PAYLOAD_BYTES`,
`RATE_MESSAGES_CAPACITY`, `RATE_MESSAGES_PER_SEC`, `RATE_SIGNALS_CAPACITY`,
`RATE_SIGNALS_PER_SEC`, `HISTORY_SIZE`, `HISTORY_ON_JOIN`, `HEARTBEAT_MAX_MISSED`,
`MAX_BUFFERED_BYTES`, `LOGIN_TIMEOUT_MS`, `METRICS_ENABLED` e `METRICS_LOG_INTERVAL_MS`.

Comportamento previsível quando algo está errado:

- `VITE_SOCKET_URL` inválida faz `npm run build` (e `npm run dev:front`) falhar com
  a explicação, em vez de gerar um bundle que nunca conecta.
- `ALLOWED_ORIGINS` ou `PORT` inválidas impedem o servidor de subir, com uma linha
  de log `config_invalid` dizendo qual variável corrigir.
- Sem `ALLOWED_ORIGINS`, o servidor sobe e registra `allowed_origins_disabled`
  (como aviso quando `NODE_ENV=production`).
- Só variáveis com prefixo `VITE_` chegam ao navegador; as do backend no mesmo
  arquivo nunca são expostas.

No backend, a precedência é: variável do ambiente do processo (ex.: painel da
plataforma) > `.env` da raiz > `backend/.env`. O `backend/.env` continua aceito por
compatibilidade. Um `frontend/.env` **não é mais lido** — o build avisa se encontrar
um; mova as variáveis para o `.env` da raiz.

Nunca versione arquivos `.env` (o `.gitignore` já os exclui).

### Administração

Para moderar a sala, defina `ADMIN_KEY` no `.env` da raiz e entregue a chave a quem
vai moderar. No chat, a pessoa digita `/admin <chave>` e passa a poder usar
`/clearall`, `/announce`, `/mute`, `/unmute` e `/kick`. A chave nunca aparece em log
nem na tela; tentativas erradas são bloqueadas após 5 erros. Sem `ADMIN_KEY`, a
administração fica desativada.

## Executando localmente

```bash
npm run dev
```

O comando sobe os dois processos:

| Processo               | Endereço              |
| ---------------------- | --------------------- |
| Frontend (Vite)        | http://localhost:5173 |
| Servidor de tempo real | ws://localhost:8080   |

Para subir cada parte separadamente:

```bash
npm run dev:back
```

```bash
npm run dev:front
```

Abra duas abas em `http://localhost:5173` com nomes diferentes para conversar
consigo mesmo.

## Qualidade e testes

```bash
npm test
```

Roda as duas suítes, ambas com o executor de testes nativo do Node (`node:test`, sem
dependência extra). Pré-requisito: dependências do backend instaladas
(`npm --prefix backend install`).

| Comando              | O que cobre                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:back`  | Backend: unidade (sala, identidades, validação, limites, protocolo, configuração, HTTP, contrato com o cliente) e integração com o servidor real e clientes WebSocket (identidade, personificação, mensagens, limites, logs, `.env`, heartbeat, desligamento) |
| `npm run test:front` | Unidade: tradutor de eventos, estado, transporte, sinal de digitação e validações do cliente                                                                                                                                                                  |

Análise estática, executada também na CI:

| Comando                  | O que faz                                                                 |
| ------------------------ | ------------------------------------------------------------------------- |
| `npm run lint`           | Executa os quatro abaixo em sequência                                     |
| `npm run lint:js`        | ESLint (inclui proibição de `innerHTML`/`outerHTML`/`insertAdjacentHTML`) |
| `npm run lint:css`       | Stylelint (BEM e uso obrigatório de tokens nos componentes)               |
| `npm run check:types`    | Checagem de tipos do frontend via JSDoc (`tsc`, modo estrito)             |
| `npm run check:contrast` | Mede 42 pares de cor nos dois temas e falha se algum reprovar             |
| `npm run format:check`   | Verifica formatação (Prettier)                                            |
| `npm run format`         | Formata o projeto                                                         |

A CI executa `npm test` e também a auditoria de dependências de produção (bloqueante).

### Teste de carga

```bash
npm run load-test
```

Sobe uma instância própria do backend numa porta livre (nunca usa um servidor
externo) e executa cinco cenários: uso normal (A), entradas simultâneas (B),
estabilidade prolongada (C), oscilação de rede (D) e sobrecarga controlada (E).
Mede latência de entrega, volume, erros e CPU/memória do servidor. Leva cerca de
1 minuto; para rodar só alguns cenários e gravar o resultado:

```bash
npm run load-test -- B D --json resultado.json
```

Não roda na CI (é lento e os números dependem da máquina). Os resultados de
referência estão em [`docs/FASE_3_RELATORIO_DE_IMPLEMENTACAO.md`](./docs/FASE_3_RELATORIO_DE_IMPLEMENTACAO.md).

## Build

```bash
npm run build
```

Gera o frontend de produção em `dist/` (HTML, um CSS e um JS minificados com hash
no nome, mais os arquivos de `frontend/public/`). Para inspecionar o resultado:

```bash
npm run preview
```

O backend não tem etapa de build: roda direto com Node.

## Deploy

A hospedagem é no **Render**, descrita em [`render.yaml`](./render.yaml) (Blueprint
com os dois serviços, health check e cabeçalhos de segurança do site estático).
Como aplicar, variáveis e verificação: [`docs/DEPLOY_RENDER.md`](./docs/DEPLOY_RENDER.md).
O projeto é composto de duas partes publicadas separadamente:

**Frontend (estático)** — duas formas, ambas verificadas no
[`docs/refactor-report.md`](./docs/refactor-report.md) §10:

| Forma                       | O que servir                 | Quando usar                                                      |
| --------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| **Com build** (recomendado) | `dist/` após `npm run build` | Produção: arquivos minificados e reunidos                        |
| **Sem build**               | o diretório `frontend/`      | Host estático simples; sem `VITE_SOCKET_URL`, usa o padrão local |

Defina `VITE_SOCKET_URL` (com `wss://`) **antes** do build — o valor é embutido no
JavaScript gerado.

**Backend (processo Node)** — no servidor de hospedagem:

```bash
npm --prefix backend ci --omit=dev
```

```bash
npm --prefix backend start
```

Defina `PORT` (normalmente fornecida pela plataforma) e `ALLOWED_ORIGINS` com o
domínio do frontend. Rotas HTTP na mesma porta:

| Rota           | Uso                                       | Resposta                                                                        |
| -------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /`        | Checagem de saúde simples                 | `200 ok`                                                                        |
| `GET /healthz` | **Liveness**: o processo responde         | `200` JSON `{ status, uptimeSec, connections, users }`                          |
| `GET /readyz`  | **Readiness**: pronto para novas conexões | `200 {"status":"ready"}`; `503` com `draining` (desligando) ou `full` (no teto) |
| `GET /metrics` | Métricas operacionais                     | Só com `METRICS_ENABLED=true`; senão `404`                                      |

Outros caminhos respondem 404. Termine TLS na plataforma ou num proxy reverso para
servir `wss://`.

O servidor escreve **uma linha JSON por evento** (`ts`, `level`, `event` e campos
como `connection` e `user`), sem conteúdo de mensagem, nomes ou tokens. A cada
`METRICS_LOG_INTERVAL_MS` (padrão 60 s) sai uma linha `metrics` com conexões,
pessoas, mensagens aceitas e recusadas, erros por categoria, tempo de processamento,
atraso do event loop, CPU e memória — basta filtrar os logs por `"event":"metrics"`. Ao receber
`SIGTERM`, fecha as conexões com o código 1001 e encerra em até 5 s — os clientes
reconectam sozinhos quando o novo processo sobe. O ponto de entrada continua sendo
`backend/src/server.js` (`npm start`).

Recomendações de produção (detalhes em [`docs/security-report.md`](./docs/security-report.md) §5):
configure `frame-ancestors` e HSTS como cabeçalhos HTTP na hospedagem, e limite de
conexões por IP no proxy.

## Integrações

| Integração              | Uso                                                    |
| ----------------------- | ------------------------------------------------------ |
| WebSocket (`ws`)        | Comunicação em tempo real                              |
| Google Fonts            | Fontes da interface (requisição externa a cada visita) |
| Notifications API       | Aviso de mensagem nova com a aba oculta                |
| `localStorage`          | Apenas a preferência de tema (`web-chat:theme`)        |
| GitHub Actions + CodeQL | CI e análise de segurança                              |

Não há banco de dados, APIs de terceiros ou serviços de autenticação.

## Acessibilidade

Verificada por comando, não por afirmação: `npm run check:contrast` mede 71 pares
de cor nos dois temas (142 verificações) a partir de `frontend/src/css/tokens.css`.
Na Fase 5, uma auditoria com axe-core (WCAG 2.0/2.1/2.2 A e AA) não encontrou
violações em 16 telas e estados, nos dois temas.

- **1.4.3** — todo texto ≥ 4.5:1 (menor par medido: 4.52:1).
- **1.4.11** — contorno de controle, preenchimento e anel de foco ≥ 3:1.
- **1.4.1** — cor nunca é o único sinal: selo "você", selo "admin", presença em
  texto ("Ausente"), estado da conexão com rótulo.
- **1.4.13** — dicas dos botões aparecem no foco e somem com Escape.
- **2.4.3** — gavetas, cartão de pessoa e modal recebem e devolvem o foco; com
  gaveta aberta o resto da tela fica inerte.
- **2.4.7 / 2.4.11** — anel de foco visível em todo controle.
- **2.5.8** — alvos de 24 px no mínimo e 44 px sob `pointer: coarse`.
- **4.1.3** — a conversa é `role="log"` e anuncia mensagem nova uma vez; avisos
  temporários saem numa região `role="status"`, sem repetir o que já foi anunciado.
- **2.3.3** — `prefers-reduced-motion` desliga animações decorativas.

Falta a verificação manual com leitores de tela (NVDA, VoiceOver, TalkBack),
prevista no roadmap (F5-06).

## Documentação complementar

| Documento                                                                                  | Conteúdo                                                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [`docs/ANALISE_E_PLANO_DE_MELHORIAS.md`](./docs/ANALISE_E_PLANO_DE_MELHORIAS.md)           | Diagnóstico técnico, problemas, melhorias e riscos                 |
| [`docs/ROADMAP_DE_IMPLEMENTACAO.md`](./docs/ROADMAP_DE_IMPLEMENTACAO.md)                   | 49 tarefas em 8 fases, estratégia e plano de testes                |
| [`docs/INVENTARIO_TECNICO.md`](./docs/INVENTARIO_TECNICO.md)                               | Tecnologias, dependências, módulos, variáveis e scripts            |
| [`docs/PROTOCOLO.md`](./docs/PROTOCOLO.md)                                                 | Contrato do WebSocket: eventos, erros, identidade, limites         |
| [`docs/DEPLOY_RENDER.md`](./docs/DEPLOY_RENDER.md)                                         | Deploy no Render: Blueprint, variáveis, origens, cabeçalhos        |
| [`docs/FASE_1_RELATORIO_DE_IMPLEMENTACAO.md`](./docs/FASE_1_RELATORIO_DE_IMPLEMENTACAO.md) | Correções da Fase 1: decisões, testes e compatibilidade            |
| [`docs/FASE_2_RELATORIO_DE_IMPLEMENTACAO.md`](./docs/FASE_2_RELATORIO_DE_IMPLEMENTACAO.md) | Fase 2: arquitetura modular do backend, testes e CI                |
| [`docs/FASE_3_RELATORIO_DE_IMPLEMENTACAO.md`](./docs/FASE_3_RELATORIO_DE_IMPLEMENTACAO.md) | Fase 3: heartbeat, conexões, métricas, carga e otimizações medidas |
| [`docs/CHAT_COMMANDS.md`](./docs/CHAT_COMMANDS.md)                                         | Comandos do chat: lista, permissões, respostas, como criar         |
| [`docs/FASE_4_RELATORIO_DE_IMPLEMENTACAO.md`](./docs/FASE_4_RELATORIO_DE_IMPLEMENTACAO.md) | Fase 4: evolução funcional, comandos e administração               |
| [`docs/FASE_5_RELATORIO_DE_IMPLEMENTACAO.md`](./docs/FASE_5_RELATORIO_DE_IMPLEMENTACAO.md) | Fase 5: redesign de UI/UX, componentes, testes e acessibilidade    |
| [`docs/design-system.md`](./docs/design-system.md)                                         | Design system v2: tokens, componentes, layout, contraste medido    |
| [`docs/refactor-report.md`](./docs/refactor-report.md)                                     | Antes → depois da refatoração do frontend                          |
| [`docs/security-report.md`](./docs/security-report.md)                                     | Auditoria de segurança e riscos residuais                          |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md)                                                     | Como contribuir                                                    |

## Roadmap

Resumo — detalhes, dependências e critérios de aceite em
[`docs/ROADMAP_DE_IMPLEMENTACAO.md`](./docs/ROADMAP_DE_IMPLEMENTACAO.md).

| Fase | Foco                           | Destaques                                                                                                            |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1    | Correções críticas (concluída) | Testes do protocolo, identidade emitida pelo servidor, rate limit sem perda de mensagem, `.env` funcional, heartbeat |
| 2    | Fundação técnica (concluída)   | Testes do frontend, CI completa, backend modular em ESM, contrato do protocolo verificado                            |
| 3    | Performance (concluída)        | Heartbeat tolerante, conexões e memória sob controle, métricas, carga medida, renderização seletiva                  |
| 4    | Funcionalidades (concluída)    | Comandos no chat, administração por chave, confirmação de entrega, presença, reconexão sem avisos repetidos          |
| 5    | UX e acessibilidade (em curso) | Redesign em painéis entregue; avisos anunciados; faltam mensagens novas, contador e auditoria manual                 |
| 6    | Atualizações                   | `npm audit` limpo, Vite atual, versão do Node fixada                                                                 |
| 7    | Testes e validação             | E2E com Playwright, carga, acessibilidade automatizada                                                               |
| 8    | Evolução                       | Deploy declarativo com cabeçalhos de segurança, anti-abuso, PWA                                                      |

## Status do projeto

**Em desenvolvimento ativo.** As Fases 1 a 4 do roadmap estão concluídas e a 5 está em curso: correções de
segurança, fundação modular, performance e monitoramento, e a **Fase 4**, que trouxe
28 comandos no chat com autocomplete, administração por chave do operador
(`ADMIN_KEY`), confirmação de entrega com "tentar de novo", presença, troca de nome e
reconexão sem avisos repetidos. A **Fase 5** refez a interface inteira (layout em
painéis, design system v2, gavetas em telas estreitas, cartão de pessoa, auditoria
de acessibilidade automática sem violações); o projeto tem 271 testes automatizados.
Próximo passo: concluir a Fase 5 (indicador de mensagens novas, contador no composer,
auditoria manual com leitores de tela). Antes de expor o chat publicamente, configure
`ALLOWED_ORIGINS` e, se quiser moderação, `ADMIN_KEY`.

## Contribuindo

A regra que governa o CSS: **nenhuma cor, espaço, raio ou duração fora de
`frontend/src/css/tokens.css`.** Se faltar um token, crie o token — o lint falha em
hex, `rgba()`, `!important` e `px` de densidade nos componentes. No JavaScript,
nenhum HTML injetado: use `textContent` e `createElement`.

Antes de abrir um PR, rode `npm test`, `npm run lint` e `npm run format:check`. Detalhes em
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Licença

MIT — ver [LICENSE](./LICENSE).
