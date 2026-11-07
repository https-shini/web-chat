# Inventário técnico · web-chat

> Fotografia do repositório em 2026-11-07, **atualizada ao fim da Fase 2**. A
> fotografia original (commit `34b523c`) foi tirada antes das Fases 1 e 2. Todos os dados foram
> extraídos dos arquivos do projeto ou de comandos executados sobre ele
> (`npm outdated`, `npm audit`, `vite build`, `wc -l`). Para diagnóstico e
> recomendações, ver [`ANALISE_E_PLANO_DE_MELHORIAS.md`](./ANALISE_E_PLANO_DE_MELHORIAS.md).

---

## 1. Identificação

| Item              | Valor                                                         |
| ----------------- | ------------------------------------------------------------- |
| Nome              | `web-chat` (raiz) / `backend` (servidor)                      |
| Versão            | `1.0.0` em ambos os `package.json`                            |
| Descrição         | Chat em tempo real de sala única, efêmera e anônima           |
| Licença           | MIT (`LICENSE`; cópia histórica em `docs/historico/LICENSE`)  |
| Repositório       | `https-shini/web-chat` (GitHub)                               |
| Idioma do código  | JavaScript (ES2022), CSS, HTML; textos e comentários em pt-BR |
| Commits no branch | 50 na análise inicial                                         |

## 2. Linguagens e volume

| Tipo                      | Arquivos |  Linhas |
| ------------------------- | -------: | ------: |
| JavaScript — frontend     |       22 |   1.694 |
| JavaScript — backend      |        1 |     324 |
| JavaScript — scripts      |        2 |      99 |
| CSS                       |       23 |   1.281 |
| HTML                      |        1 |     217 |
| Markdown (docs)           |        8 |  ~1.900 |
| Imagens (`public/images`) |        8 | ~1,7 MB |

## 3. Estrutura de diretórios

```
web-chat/
├── .github/workflows/
│   ├── ci.yml                  format → lint → CSS → tipos → contraste → build → testes → auditoria
│   └── codeql.yml              CodeQL (security-extended), push/PR em main + semanal
├── backend/                    ESM ("type": "module")
│   ├── package.json            ws, dotenv; scripts start/dev/test
│   ├── src/
│   │   ├── server.js           ponto de entrada (bootstrap)
│   │   ├── config.js, logger.js, errors.js, protocol.js, validation.js, rateLimiter.js
│   │   ├── room/               room.js (regras da sala), sessions.js (identidades)
│   │   └── transport/          chatServer.js, connection.js, http.js
│   └── test/
│       ├── unit/               7 arquivos, 58 testes
│       └── integration/        helpers.js + 8 arquivos, 64 testes
├── docs/
│   ├── ANALISE_E_PLANO_DE_MELHORIAS.md, ROADMAP_DE_IMPLEMENTACAO.md, INVENTARIO_TECNICO.md
│   ├── FASE_1_RELATORIO_DE_IMPLEMENTACAO.md, FASE_2_RELATORIO_DE_IMPLEMENTACAO.md
│   ├── PROTOCOLO.md            contrato do WebSocket
│   ├── design-system.md, refactor-report.md, security-report.md
│   └── historico/              documentação anterior à refatoração (só registro)
├── frontend/
│   ├── index.html              raiz do Vite, CSP, bootstrap de tema
│   ├── public/images/          favicon.ico + 7 PNGs não referenciadas
│   ├── src/
│   │   ├── main.js, config.js, protocol.js, socketUrl.js
│   │   ├── a11y/, i18n/, state/, transport/, ui/ (14 componentes)
│   │   └── css/                index.css, tokens.css, base/ (4), components/ (17)
│   └── test/                   7 arquivos, 38 testes
├── read-model/README.md        aviso: conteúdo movido (F2-08)
├── scripts/                    dev.mjs, check-contrast.mjs, contrast.pairs.json
├── .env.example                variáveis do frontend e do backend (lido da raiz)
├── CONTRIBUTING.md
├── eslint.config.js, .stylelintrc.json, .prettierrc.json, .prettierignore
├── jsconfig.json               checagem de tipos (somente frontend/src)
├── vite.config.js              envDir na raiz; valida VITE_SOCKET_URL
├── package.json, package-lock.json
├── README.md, LICENSE
```

## 4. Dependências

### 4.1 Backend (`backend/package.json`) — produção

| Pacote   | Declarado | Instalado | Última | Uso                                  | `npm audit` |
| -------- | --------- | --------- | ------ | ------------------------------------ | ----------- |
| `ws`     | `^8.21.3` | 8.21.3    | 8.22.1 | Servidor WebSocket                   | 0           |
| `dotenv` | `^16.4.5` | 16.4.5    | 18.0.9 | Carrega `.env` do diretório corrente | 0           |

### 4.2 Raiz (`package.json`) — somente desenvolvimento

| Pacote                      | Declarado  | Instalado | Última  | Uso                         |
| --------------------------- | ---------- | --------- | ------- | --------------------------- |
| `vite`                      | `^5.4.21`  | 5.4.21    | 8.3.6   | Dev server e build          |
| `eslint`                    | `^9.13.0`  | 9.39.5    | 10.14.0 | Lint JS                     |
| `@eslint/js`                | `^9.13.0`  | 9.39.5    | 10.0.1  | Regras recomendadas         |
| `globals`                   | `^15.11.0` | 15.15.0   | 17.14.0 | Globais browser/node        |
| `stylelint`                 | `^16.10.0` | 16.26.1   | 18.0.0  | Lint CSS                    |
| `stylelint-config-standard` | `^36.0.1`  | 36.0.1    | 41.0.0  | Base do Stylelint           |
| `typescript`                | `^5.6.3`   | 5.9.3     | 7.0.2   | Checagem de tipos via JSDoc |
| `prettier`                  | `^3.3.3`   | 3.9.6     | 3.9.10  | Formatação                  |

**Frontend em produção: zero dependências de runtime.**

### 4.3 Vulnerabilidades (`npm audit`, raiz)

| Pacote                    | Severidade | Direta | Natureza                                      |
| ------------------------- | ---------- | :----: | --------------------------------------------- |
| `vite`                    | Alta       |  sim   | Path traversal / `launch-editor` (dev server) |
| `esbuild`                 | Moderada   |  não   | Dev server aceita requisições de outros sites |
| `brace-expansion`         | Alta       |  não   | DoS por expansão                              |
| `fast-uri`                | Alta       |  não   | Injeção de autoridade em URI                  |
| `js-yaml`                 | Alta       |  não   | Consumo de CPU                                |
| `source-map-js`           | Alta       |  não   | DoS do event loop                             |
| `postcss-selector-parser` | Moderada   |  não   | Complexidade quadrática                       |

Todas em ferramentas de desenvolvimento/build; nenhuma no artefato servido nem no
backend.

### 4.4 Recursos externos carregados em tempo de execução

| Recurso         | Origem                                      | Onde                  |
| --------------- | ------------------------------------------- | --------------------- |
| Fontes          | `fonts.googleapis.com`, `fonts.gstatic.com` | `frontend/index.html` |
| Badges (README) | `img.shields.io`                            | `README.md`           |

## 5. Variáveis de ambiente

Arquivo: `.env` na **raiz** (exemplo em `.env.example`). Backend: ambiente do
processo > `.env` da raiz > `backend/.env` (compatibilidade). Leitura e validação em
`backend/src/config.js`; frontend em `vite.config.js` e `frontend/src/config.js`.

| Variável                 | Lado     | Padrão                             | Validação                                        |
| ------------------------ | -------- | ---------------------------------- | ------------------------------------------------ |
| `VITE_SOCKET_URL`        | Frontend | `ws(s)://<host da página>:8080`    | `ws://` ou `wss://`, senão o build falha         |
| `ALLOWED_ORIGINS`        | Backend  | vazio (qualquer origem, com aviso) | Cada entrada é uma origem http(s) sem caminho    |
| `PORT`                   | Backend  | `8080`                             | Inteiro 0–65535                                  |
| `HEARTBEAT_MS`           | Backend  | `30000`                            | Inteiro ≥ 50                                     |
| `MAX_CONNECTIONS`        | Backend  | `500`                              | Inteiro ≥ 1                                      |
| `MAX_PAYLOAD_BYTES`      | Backend  | `16384`                            | 8192–1048576                                     |
| `RATE_MESSAGES_CAPACITY` | Backend  | `40`                               | Inteiro ≥ 1                                      |
| `RATE_MESSAGES_PER_SEC`  | Backend  | `8`                                | Inteiro ≥ 1                                      |
| `RATE_SIGNALS_CAPACITY`  | Backend  | `40`                               | Inteiro ≥ 1                                      |
| `RATE_SIGNALS_PER_SEC`   | Backend  | `8`                                | Inteiro ≥ 1                                      |
| `HISTORY_SIZE`           | Backend  | `1000`                             | 1–100000                                         |
| `HISTORY_ON_JOIN`        | Backend  | `50`                               | 0–1000 e ≤ `HISTORY_SIZE`                        |
| `NODE_ENV`               | Backend  | —                                  | `production` eleva o aviso de allowlist a `warn` |

Configuração inválida: linha `config_invalid` com a variável e saída com código 1.

## 6. Scripts

### Raiz

| Script           | Comando                                                   |
| ---------------- | --------------------------------------------------------- |
| `dev`            | `node scripts/dev.mjs`                                    |
| `dev:front`      | `vite`                                                    |
| `dev:back`       | `npm --prefix backend run dev`                            |
| `build`          | `vite build`                                              |
| `preview`        | `vite preview`                                            |
| `check:types`    | `tsc -p jsconfig.json`                                    |
| `check:contrast` | `node scripts/check-contrast.mjs`                         |
| `lint:js`        | `eslint .`                                                |
| `lint:css`       | `stylelint "frontend/src/**/*.css"`                       |
| `lint`           | `lint:js` + `lint:css` + `check:types` + `check:contrast` |
| `format`         | `prettier --write .`                                      |
| `format:check`   | `prettier --check .`                                      |

Após a Fase 1: `test` (roda os dois abaixo), `test:front`
(`node --test frontend/test/*.test.js`) e `test:back` (`npm --prefix backend test`);
no backend, `test` = `node --test test/*.test.js`.

### Backend

| Script  | Comando                                                      |
| ------- | ------------------------------------------------------------ |
| `start` | `node src/server.js`                                         |
| `dev`   | `node --watch src/server.js`                                 |
| `test`  | `node --test test/unit/*.test.js test/integration/*.test.js` |

## 7. Módulos do frontend

| Arquivo               | Linhas | Exporta                                                            | Papel                                                                                              |
| --------------------- | -----: | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `main.js`             |    174 | —                                                                  | Composição, assinatura do store, anúncios                                                          |
| `config.js`           |     62 | `SOCKET_URL`, `RECONNECT`, `LIMITS`, `TIMING`, `THEME_STORAGE_KEY` | Configuração                                                                                       |
| `transport/socket.js` |    192 | `createTransport`                                                  | WebSocket, backoff (500 ms → 15 s, ±30 %, 6 tentativas), fila (50)                                 |
| `state/store.js`      |    150 | `createStore`                                                      | Estado: `screen`, `me`, `messages`, `people`, `typing`, `link`, `attempt`, `maxAttempts`, `queued` |
| `state/events.js`     |    154 | `createEventHandler`                                               | Protocolo → ações                                                                                  |
| `state/typing.js`     |     77 | `createTypingTracker`                                              | Expiração de digitação (6 s)                                                                       |
| `a11y/announce.js`    |     61 | `createAnnouncer`                                                  | Região live com fila (150 ms) e deduplicação                                                       |
| `i18n/strings.js`     |     85 | `strings`, `format`, `peopleCount`                                 | Textos                                                                                             |
| `ui/dom.js`           |     55 | `must`, `el`, `clear`, `toggle`                                    | Utilitários DOM sem HTML                                                                           |
| `ui/entry.js`         |     63 | `createEntry`                                                      | Tela de entrada e validação do nome                                                                |
| `ui/composer.js`      |     60 | `createComposer`                                                   | Campo de mensagem                                                                                  |
| `ui/connection.js`    |     70 | `createConnection`                                                 | Rótulo de estado + "fio"                                                                           |
| `ui/messageList.js`   |     57 | `createMessageList`                                                | Lista incremental, rolagem condicional                                                             |
| `ui/message.js`       |     82 | `renderMessage`                                                    | Item de mensagem (chat/sistema)                                                                    |
| `ui/identity.js`      |     70 | `hueFor`, `initialsFor`, `renderIdentity`                          | Monograma e cor por id (6 matizes)                                                                 |
| `ui/people.js`        |     44 | `createPeople`                                                     | Lista de pessoas                                                                                   |
| `ui/typing.js`        |     45 | `createTyping`                                                     | Indicador de digitação                                                                             |
| `ui/toast.js`         |     28 | `createToasts`                                                     | Avisos temporários (5 s)                                                                           |
| `ui/notify.js`        |     45 | `createNotifier`                                                   | Notificação do navegador                                                                           |
| `ui/failure.js`       |     36 | `createFailure`                                                    | Tela de falha + retry                                                                              |
| `ui/empty.js`         |     20 | `createEmpty`                                                      | Estado vazio                                                                                       |
| `ui/themeToggle.js`   |     64 | `createThemeToggle`                                                | Alternância de tema                                                                                |

## 8. Módulos do backend

| Módulo                    | Exporta                                                                                                          | Depende de                           | Papel                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| `server.js`               | —                                                                                                                | config, logger, transport/chatServer | Bootstrap: `.env`, configuração, sinais, `listen`   |
| `config.js`               | `loadEnvFiles`, `loadConfig`, `ConfigError`, `DEFAULTS`                                                          | `dotenv`                             | Configuração validada (função pura)                 |
| `logger.js`               | `createLogger`                                                                                                   | —                                    | JSON por linha; omite campos sensíveis              |
| `errors.js`               | `ERROR_CODES`, `ERROR_CATEGORIES`, `describeError`, `logLevelFor`                                                | —                                    | Catálogo de erros                                   |
| `protocol.js`             | `LIMITS`, `CLIENT_EVENTS`, `SERVER_EVENTS`, `isSignal`, `parseEnvelope`, `errorCodeForEnvelope`, `serverMessage` | errors                               | Contrato do protocolo                               |
| `validation.js`           | `normalizeText`, `readName`, `readContent`, `readResumeToken`                                                    | errors, protocol                     | Validação de campos                                 |
| `rateLimiter.js`          | `createRateLimiter`                                                                                              | —                                    | Balde de fichas (relógio injetável)                 |
| `room/sessions.js`        | `createIdentityStore`, `RESUME_TTL_MS`, `MAX_RELEASED_IDENTITIES`                                                | `node:crypto`                        | Identidades e tokens de retomada (só hash guardado) |
| `room/room.js`            | `createRoom`                                                                                                     | errors, protocol, validation         | Regras da sala; sem rede                            |
| `transport/connection.js` | `createConnectionHandler`, `RATE_LIMIT_NOTICE_INTERVAL_MS`                                                       | errors, protocol, rateLimiter        | Limites, envelope, encaminhamento, erros            |
| `transport/http.js`       | `createHttpHandler`                                                                                              | —                                    | `/`, `/healthz`, 404, 405                           |
| `transport/chatServer.js` | `createChatServer`, `SHUTDOWN_TIMEOUT_MS`                                                                        | `ws`, room/_, transport/_            | Composição, heartbeat, desligamento                 |

Constantes fixas (não configuráveis): `LIMITS` (nome 30, mensagem 1000, token 100),
`RESUME_TTL_MS` (10 min), `MAX_RELEASED_IDENTITIES` (2000),
`RATE_LIMIT_NOTICE_INTERVAL_MS` (1000), `SHUTDOWN_TIMEOUT_MS` (5000).

## 9. Protocolo WebSocket

Documentado em [`PROTOCOLO.md`](./PROTOCOLO.md). Fontes: `backend/src/protocol.js` +
`errors.js` e o espelho `frontend/src/protocol.js`, comparados por
`backend/test/unit/contract.test.js`.

| Cliente → servidor                                          | Servidor → cliente                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `user_login`, `chat_message`, `typing_start`, `typing_stop` | `session`, `message_history`, `chat_message`, `user_joined`, `user_left`, `user_list`, `user_typing`, `error` |

## 10. Integrações e infraestrutura

| Integração        | Situação                                                                |
| ----------------- | ----------------------------------------------------------------------- |
| Banco de dados    | Nenhum                                                                  |
| Autenticação      | Nenhuma (identidade autodeclarada)                                      |
| APIs externas     | Nenhuma                                                                 |
| Google Fonts      | Sim (CSS + fontes)                                                      |
| Notifications API | Sim (navegador)                                                         |
| `localStorage`    | Apenas `web-chat:theme`                                                 |
| GitHub Actions    | CI (`ci.yml`), CodeQL (`codeql.yml`)                                    |
| Hospedagem        | Sem configuração no repositório; histórico do Git cita `*.onrender.com` |

## 11. Qualidade e verificação existentes

| Verificação                   | Ferramenta                                                       | Resultado em 2026-11-07                                                       |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Formatação                    | Prettier                                                         | ✅ passa                                                                      |
| Lint JS                       | ESLint (proíbe `innerHTML`, `outerHTML`, `insertAdjacentHTML`)   | ✅ passa                                                                      |
| Lint CSS                      | Stylelint (BEM, tokens, sem hex/rgb/`!important` em componentes) | ✅ passa                                                                      |
| Tipos                         | `tsc` (JSDoc, `strict`, `noUncheckedIndexedAccess`)              | ✅ passa                                                                      |
| Contraste                     | `scripts/check-contrast.mjs` (42 pares, 2 temas)                 | ✅ todos passam                                                               |
| Build                         | Vite                                                             | ✅ `dist/` 1,9 MB (HTML 10 KB, JS 13,9 KB, CSS 17,6 KB, imagens ~1,8 MB)      |
| Testes automatizados          | `node:test`                                                      | ✅ 160 após a Fase 2 (backend 58 unidade + 64 integração; frontend 38), na CI |
| `npm audit` backend           | npm                                                              | ✅ 0                                                                          |
| `npm audit` raiz              | npm                                                              | ⚠️ 7 (dev)                                                                    |
| Análise estática de segurança | CodeQL                                                           | Configurada (resultado não acessível nesta análise)                           |

## 12. Navegadores e plataforma

| Requisito                                                        | Origem                                |
| ---------------------------------------------------------------- | ------------------------------------- |
| Build target `es2022`                                            | `vite.config.js`                      |
| `100dvh`, `:focus-visible`, `Object.hasOwn`, `crypto.randomUUID` | CSS e JS do frontend                  |
| Node.js ≥ 20 (documentado), 22 na CI                             | `README.md`, `ci.yml` — sem `engines` |
