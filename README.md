<h1 align="center">web-chat</h1>

<p align="center">
  Sala de conversa em tempo real: <strong>única, efêmera e anônima</strong>.<br>
  Sem framework no frontend.
</p>

<div align="center">

[![Licença](https://img.shields.io/badge/Licença-MIT-green?style=for-the-badge)](./LICENSE)
[![Código](https://img.shields.io/badge/Ver%20Código-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/https-shini/web-chat)

</div>

---

## O que este projeto é

Uma sala só. Você entra com um nome, conversa, e sai. Não há cadastro, não há
login, não há canais para escolher. Quando você fecha a aba, sua sessão acaba.

O valor técnico do projeto é o que ele **não** usa: comunicação em tempo real,
design system com acessibilidade verificada e dois temas, tudo em HTML, CSS e
JavaScript nativos. Nenhuma dependência de runtime no frontend.

## O que existe hoje

Cada item abaixo corresponde a código neste repositório.

- **Entrada com um nome** — sem senha, sem cadastro (`frontend/src/ui/entry.js`).
- **Mensagens em tempo real** para todos os conectados (`backend/src/server.js`).
- **Lista de quem está online**, com identidade visual estável por pessoa
  (`frontend/src/ui/people.js`).
- **Indicador de digitação** com expiração automática (`frontend/src/ui/typing.js`,
  `frontend/src/state/typing.js`).
- **Horário em cada mensagem** (`frontend/src/ui/message.js`).
- **Reconexão automática** com backoff exponencial, teto, jitter e caminho manual
  de volta quando o teto estoura (`frontend/src/transport/socket.js`).
- **Fila de envio**: mensagem escrita fora do ar é entregue quando a conexão volta,
  em vez de ser descartada em silêncio.
- **Quatro estados de conexão visíveis** — conectando, conectado, reconectando e
  offline (`frontend/src/ui/connection.js`).
- **Tema claro e escuro**, aplicados antes da primeira pintura e persistidos
  (`frontend/index.html`, `frontend/src/ui/themeToggle.js`).
- **Notificação do navegador** só com a aba oculta, e só depois de um gesto seu
  (`frontend/src/ui/notify.js`).
- **Acessibilidade WCAG 2.2 AA verificada** — ver a seção abaixo.

### Buffer de mensagens: o que o servidor guarda

O servidor mantém em memória as últimas **1000 mensagens** e envia as **50 mais
recentes** para quem entra, para que a sala não apareça vazia no meio de uma
conversa. Isso vive só na memória do processo: **reiniciar o servidor apaga
tudo**, e nada é gravado em disco ou banco.

Este parágrafo existe porque a versão anterior deste README dizia "mensagens não
são salvas no servidor" enquanto o código guardava esse buffer. A documentação
descreve o código; quando os dois divergirem, o código ganha.

## O que **não** existe

Nenhum destes itens está implementado. Estão aqui porque versões anteriores
desta documentação os anunciavam no presente.

| Recurso                                  | Situação                                               |
| ---------------------------------------- | ------------------------------------------------------ |
| Salas múltiplas                          | Não implementado. Há **uma** sala global.              |
| Papel de administrador e moderação       | Não implementado. Não há papéis.                       |
| Excluir mensagens                        | Não implementado.                                      |
| Fixar mensagens via `localStorage`       | Não implementado. `localStorage` guarda apenas o tema. |
| Autenticação e registro                  | Não implementado, e fora do escopo.                    |
| Upload de arquivos, voz, emojis, reações | Não implementado.                                      |
| Criptografia ponta a ponta               | Não implementado.                                      |

## Rodando na sua máquina

Requisitos: Node.js 20 ou superior.

```bash
git clone https://github.com/https-shini/web-chat
cd web-chat
npm install
npm --prefix backend install

npm run dev
```

`npm run dev` sobe os dois processos:

| Processo               | Endereço              |
| ---------------------- | --------------------- |
| Frontend (Vite)        | http://localhost:5173 |
| Servidor de tempo real | ws://localhost:8080   |

Sem nenhuma configuração, o frontend já aponta para o servidor local — não é
preciso editar código para rodar offline. Para apontar para outro servidor,
copie `.env.example` para `.env` e ajuste `VITE_SOCKET_URL`.

### Publicando

O projeto funciona de duas formas, e as duas foram verificadas em navegador:

| Forma                       | O que servir                    | Quando usar                                                                            |
| --------------------------- | ------------------------------- | -------------------------------------------------------------------------------------- |
| **Com build** (recomendado) | `npm run build` e sirva `dist/` | Produção: CSS e JavaScript minificados e reunidos em um arquivo cada, com hash no nome |
| **Sem build**               | Sirva `frontend/` direto        | Host estático simples, ou para abrir o projeto sem instalar nada                       |

Se o seu host estático aponta para `frontend/`, continua funcionando: o CSS é
carregado por `<link>` a partir de `src/css/index.css`, não importado de dentro
do JavaScript. Importar CSS de um módulo é recurso de bundler — servido cru, o
navegador tentaria carregar cada `.css` como módulo, recusaria por MIME type e
derrubaria a aplicação inteira junto.

A diferença prática entre as duas: sem build, o navegador resolve os `@import`
em cascata (uma requisição por arquivo de estilo). Com build, tudo isso vira um
arquivo só.

### Outros comandos

| Comando                  | O que faz                                                     |
| ------------------------ | ------------------------------------------------------------- |
| `npm run build`          | Gera o frontend de produção em `dist/`                        |
| `npm run lint`           | ESLint, Stylelint, checagem de tipos e contraste              |
| `npm run check:contrast` | Mede os pares de cor dos dois temas e falha se algum reprovar |
| `npm run format`         | Prettier                                                      |

## Acessibilidade

Verificada por comando, não por afirmação. `npm run check:contrast` mede **42
pares de cor** nos dois temas a partir de `frontend/src/css/tokens.css` e falha
o build se algum reprovar no critério que lhe cabe.

- **1.4.3** — todo texto ≥ 4.5:1. O menor par medido é 4.74:1.
- **1.4.11** — contorno de controle, preenchimento e anel de foco ≥ 3:1.
- **1.4.1** — a identidade de quem fala não depende só de cor: monograma
  preenchido para você, vazado para os outros, mais o rótulo "Você".
- **2.4.7 / 2.4.11** — anel de foco global visível em todo controle.
- **2.5.8** — todo alvo vai a 44px sob `pointer: coarse`.
- **4.1.3** — a lista de mensagens é `role="log"` e anuncia mensagem nova uma vez.
- **2.3.3** — `prefers-reduced-motion` desliga toda animação decorativa.

Os números e o método estão em [`docs/design-system.md`](./docs/design-system.md)
e o antes → depois em [`docs/refactor-report.md`](./docs/refactor-report.md).

## Estrutura

```
web-chat/
├── frontend/
│   ├── index.html              → raiz do Vite, landmarks e bootstrap de tema
│   ├── public/images/          → favicon e imagens
│   └── src/
│       ├── main.js             → raiz de composição: só aqui as camadas se conhecem
│       ├── config.js           → URL por ambiente, limites e tempos
│       ├── css/                → tokens.css → base/ → components/
│       ├── transport/socket.js → conexão, backoff e fila (não toca no DOM)
│       ├── state/              → estado observável (não conhece o transporte)
│       ├── ui/                 → renderização e eventos, DOM puro
│       ├── a11y/announce.js    → região live única, com fila e deduplicação
│       └── i18n/strings.js     → todo texto de interface
├── backend/src/server.js       → servidor WebSocket
├── scripts/                    → dev e checagem de contraste
└── docs/                       → design system e relatório de refatoração
```

Duas fronteiras valem mais que a árvore, e são verificáveis:

```bash
grep -rni 'websocket' frontend/src/ui frontend/src/state   # vazio
grep -rn 'document\.\|querySelector' frontend/src/transport # vazio
```

## Contribuindo

A regra que governa o CSS: **nenhuma cor, espaço, raio ou duração fora de
`frontend/src/css/tokens.css`.** Se faltar um token, crie o token — o lint
falha em hex, `rgba()`, `!important` e `px` de densidade nos componentes.

Detalhes em [`read-model/CONTRIBUTING.md`](./read-model/CONTRIBUTING.md).

## Licença

MIT — ver [LICENSE](./LICENSE).
