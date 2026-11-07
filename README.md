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

| Funcionalidade                                                                                                         | Onde                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Entrada com um nome (até 30 caracteres), sem senha                                                                     | `frontend/src/ui/entry.js`                                       |
| Mensagens em tempo real para todos os conectados (até 1000 caracteres)                                                 | `backend/src/server.js`, `frontend/src/state/events.js`          |
| Últimas 50 mensagens enviadas a quem entra                                                                             | `backend/src/server.js`                                          |
| Lista de pessoas online com monograma e cor estável por pessoa                                                         | `frontend/src/ui/people.js`, `frontend/src/ui/identity.js`       |
| Indicador "está digitando" com expiração automática                                                                    | `frontend/src/state/typing.js`, `frontend/src/ui/typing.js`      |
| Avisos de entrada e saída na conversa                                                                                  | `backend/src/server.js`                                          |
| Horário em cada mensagem (pt-BR)                                                                                       | `frontend/src/ui/message.js`                                     |
| Reconexão automática: backoff exponencial, teto, jitter e retry manual                                                 | `frontend/src/transport/socket.js`, `frontend/src/ui/failure.js` |
| Fila de envio enquanto a conexão está fora (até 50 mensagens)                                                          | `frontend/src/transport/socket.js`                               |
| Quatro estados de conexão visíveis: conectando, conectado, reconectando, offline                                       | `frontend/src/ui/connection.js`                                  |
| Tema claro e escuro, aplicado antes da primeira pintura e persistido                                                   | `frontend/index.html`, `frontend/src/ui/themeToggle.js`          |
| Notificação do navegador só com a aba oculta e após um gesto seu                                                       | `frontend/src/ui/notify.js`                                      |
| Proteções no servidor: payload máx. 16 KiB, rate limit por conexão, teto de 500 conexões, allowlist de origem opcional | `backend/src/server.js`                                          |
| Content-Security-Policy no HTML                                                                                        | `frontend/index.html`                                            |

### O que o servidor guarda

O servidor mantém em memória as últimas **1000 mensagens** e envia as **50 mais
recentes** para quem entra. Nada é gravado em disco ou banco: **reiniciar o
servidor apaga tudo**.

## O que não existe

Nenhum destes itens está implementado.

| Recurso                                  | Situação                                               |
| ---------------------------------------- | ------------------------------------------------------ |
| Salas múltiplas                          | Não implementado. Há **uma** sala global.              |
| Administração e moderação                | Não implementado. Não há papéis.                       |
| Excluir ou editar mensagens              | Não implementado.                                      |
| Fixar mensagens                          | Não implementado. `localStorage` guarda apenas o tema. |
| Autenticação e registro                  | Não implementado, e fora do escopo.                    |
| Upload de arquivos, voz, emojis, reações | Não implementado.                                      |
| Mensagens com várias linhas              | Não implementado (o servidor remove quebras de linha). |
| Criptografia ponta a ponta               | Não implementado.                                      |
| Testes automatizados                     | Ainda não existem — ver [Roadmap](#roadmap).           |

## Tecnologias

| Camada         | Tecnologia                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Frontend       | HTML, CSS (custom properties, BEM), JavaScript ES2022 com JSDoc                                    |
| Build / dev    | [Vite](https://vitejs.dev/) 5                                                                      |
| Backend        | Node.js, [`ws`](https://github.com/websockets/ws) 8, `dotenv`                                      |
| Qualidade      | ESLint 9, Stylelint 16, TypeScript (só checagem de tipos), Prettier 3, script próprio de contraste |
| CI / segurança | GitHub Actions, CodeQL                                                                             |
| Fontes         | Atkinson Hyperlegible e Syne (Google Fonts)                                                        |

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

O contrato de mensagens está descrito em
[`docs/ANALISE_E_PLANO_DE_MELHORIAS.md` §3.3](./docs/ANALISE_E_PLANO_DE_MELHORIAS.md#33-protocolo-websocket-contrato-implícito).

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
│       └── css/                tokens.css → base/ → components/
├── backend/
│   ├── package.json            dependências e scripts do servidor
│   └── src/server.js           servidor HTTP + WebSocket
├── scripts/                    dev.mjs (sobe tudo) e checagem de contraste
├── docs/                       análise, roadmap, inventário, design system, relatórios
├── read-model/                 documentação histórica (parcialmente desatualizada)
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

| Variável          | Usada por                    | Para quê                                                                          | Padrão                          |
| ----------------- | ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------- |
| `VITE_SOCKET_URL` | Frontend (embutida no build) | Endereço do servidor WebSocket                                                    | `ws(s)://<host da página>:8080` |
| `ALLOWED_ORIGINS` | Backend                      | Origens autorizadas a conectar, separadas por vírgula. **Configure em produção.** | vazio = qualquer origem         |
| `PORT`            | Backend                      | Porta HTTP/WebSocket                                                              | `8080`                          |

> **Atenção — onde colocar o `.env` hoje.** O `.env.example` está na raiz, mas, com
> a configuração atual:
>
> - o **Vite** lê variáveis de `frontend/.env` (a raiz do Vite é `frontend/`);
> - o **backend** lê `backend/.env` (o `dotenv` usa o diretório de onde o processo
>   roda) ou, preferencialmente, as variáveis do próprio ambiente.
>
> Um `.env` apenas na raiz **não tem efeito**. A correção está planejada
> (tarefa F1-02 do [roadmap](./docs/ROADMAP_DE_IMPLEMENTACAO.md)). Até lá:

```bash
cp .env.example frontend/.env
```

```bash
cp .env.example backend/.env
```

Nunca versione arquivos `.env` (o `.gitignore` já os exclui).

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

**Ainda não há testes automatizados** (não existe script `npm test`). A qualidade
é verificada por análise estática, executada também na CI:

| Comando                  | O que faz                                                                 |
| ------------------------ | ------------------------------------------------------------------------- |
| `npm run lint`           | Executa os quatro abaixo em sequência                                     |
| `npm run lint:js`        | ESLint (inclui proibição de `innerHTML`/`outerHTML`/`insertAdjacentHTML`) |
| `npm run lint:css`       | Stylelint (BEM e uso obrigatório de tokens nos componentes)               |
| `npm run check:types`    | Checagem de tipos do frontend via JSDoc (`tsc`, modo estrito)             |
| `npm run check:contrast` | Mede 42 pares de cor nos dois temas e falha se algum reprovar             |
| `npm run format:check`   | Verifica formatação (Prettier)                                            |
| `npm run format`         | Formata o projeto                                                         |

A criação da suíte de testes (protocolo, unidade e E2E) é a primeira tarefa do
roadmap.

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

O repositório **não contém configuração de deploy** (Dockerfile, Procfile ou
arquivo de plataforma). O projeto é composto de duas partes publicadas
separadamente:

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
domínio do frontend. O servidor responde `200 ok` a requisições HTTP comuns, o que
serve como checagem de saúde. Termine TLS na plataforma ou num proxy reverso para
servir `wss://`.

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

Verificada por comando, não por afirmação: `npm run check:contrast` mede 42 pares
de cor nos dois temas a partir de `frontend/src/css/tokens.css`.

- **1.4.3** — todo texto ≥ 4.5:1 (menor par medido: 4.74:1).
- **1.4.11** — contorno de controle, preenchimento e anel de foco ≥ 3:1.
- **1.4.1** — a identidade de quem fala não depende só de cor: monograma preenchido
  para você, vazado para os outros, mais o rótulo "Você".
- **2.4.7 / 2.4.11** — anel de foco visível em todo controle.
- **2.5.8** — alvos de 44 px sob `pointer: coarse`.
- **4.1.3** — a lista de mensagens é `role="log"` e anuncia mensagem nova uma vez.
- **2.3.3** — `prefers-reduced-motion` desliga animações decorativas.

Lacunas conhecidas (avisos temporários não anunciados a leitores de tela, repintura
da lista na reconexão) estão no plano de melhorias.

## Documentação complementar

| Documento                                                                        | Conteúdo                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`docs/ANALISE_E_PLANO_DE_MELHORIAS.md`](./docs/ANALISE_E_PLANO_DE_MELHORIAS.md) | Diagnóstico técnico, problemas, melhorias e riscos      |
| [`docs/ROADMAP_DE_IMPLEMENTACAO.md`](./docs/ROADMAP_DE_IMPLEMENTACAO.md)         | 49 tarefas em 8 fases, estratégia e plano de testes     |
| [`docs/INVENTARIO_TECNICO.md`](./docs/INVENTARIO_TECNICO.md)                     | Tecnologias, dependências, módulos, variáveis e scripts |
| [`docs/design-system.md`](./docs/design-system.md)                               | Tokens, paleta, contraste medido                        |
| [`docs/refactor-report.md`](./docs/refactor-report.md)                           | Antes → depois da refatoração do frontend               |
| [`docs/security-report.md`](./docs/security-report.md)                           | Auditoria de segurança e riscos residuais               |
| [`read-model/CONTRIBUTING.md`](./read-model/CONTRIBUTING.md)                     | Como contribuir                                         |

## Roadmap

Resumo — detalhes, dependências e critérios de aceite em
[`docs/ROADMAP_DE_IMPLEMENTACAO.md`](./docs/ROADMAP_DE_IMPLEMENTACAO.md).

| Fase | Foco                | Destaques                                                                                                            |
| ---- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | Correções críticas  | Testes do protocolo, identidade emitida pelo servidor, rate limit sem perda de mensagem, `.env` funcional, heartbeat |
| 2    | Fundação técnica    | Testes do frontend, CI completa, backend modular e tipado, protocolo compartilhado                                   |
| 3    | Performance         | Build enxuto, fontes auto-hospedadas, renderização seletiva                                                          |
| 4    | Funcionalidades     | Reconexão sem avisos repetidos, confirmação de entrega                                                               |
| 5    | UX e acessibilidade | Erros anunciados, indicador de mensagens novas, composer melhorado                                                   |
| 6    | Atualizações        | `npm audit` limpo, Vite atual, versão do Node fixada                                                                 |
| 7    | Testes e validação  | E2E com Playwright, carga, acessibilidade automatizada                                                               |
| 8    | Evolução            | Deploy declarativo com cabeçalhos de segurança, anti-abuso, PWA                                                      |

## Status do projeto

**Em desenvolvimento ativo — protótipo funcional.** O frontend está estável e
verificado (lint, tipos, contraste e build passam na CI). O backend funciona, mas
ainda não tem testes automatizados e possui problemas conhecidos de integridade de
protocolo — o principal: a identidade de cada pessoa é declarada pelo próprio
cliente e pode ser imitada. Esses pontos são a Fase 1 do roadmap. Antes de expor o
chat publicamente, configure `ALLOWED_ORIGINS`.

## Contribuindo

A regra que governa o CSS: **nenhuma cor, espaço, raio ou duração fora de
`frontend/src/css/tokens.css`.** Se faltar um token, crie o token — o lint falha em
hex, `rgba()`, `!important` e `px` de densidade nos componentes. No JavaScript,
nenhum HTML injetado: use `textContent` e `createElement`.

Antes de abrir um PR, rode `npm run lint` e `npm run format:check`. Detalhes em
[`read-model/CONTRIBUTING.md`](./read-model/CONTRIBUTING.md).

## Licença

MIT — ver [LICENSE](./LICENSE).
