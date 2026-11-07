# Inventário técnico · web-chat

> Fotografia do repositório em 2026-11-07 (commit `34b523c`). Todos os dados foram
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
| Licença           | MIT (`LICENSE`; cópia em `read-model/LICENSE`)                |
| Repositório       | `https-shini/web-chat` (GitHub)                               |
| Idioma do código  | JavaScript (ES2022), CSS, HTML; textos e comentários em pt-BR |
| Commits no branch | 50                                                            |

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
│   ├── ci.yml                  format → lint JS → lint CSS → tipos → contraste → build
│   └── codeql.yml              CodeQL (security-extended), push/PR em main + semanal
├── backend/
│   ├── package.json            ws, dotenv; scripts start/dev
│   ├── package-lock.json
│   └── src/server.js           servidor HTTP + WebSocket (CommonJS)
├── docs/
│   ├── ANALISE_E_PLANO_DE_MELHORIAS.md
│   ├── ROADMAP_DE_IMPLEMENTACAO.md
│   ├── INVENTARIO_TECNICO.md   (este arquivo)
│   ├── design-system.md        plano do design system (tokens, contraste)
│   ├── refactor-report.md      antes → depois da refatoração do frontend
│   └── security-report.md      auditoria de segurança (2 rodadas)
├── frontend/
│   ├── index.html              raiz do Vite, CSP, bootstrap de tema
│   ├── public/images/          favicon.ico + 7 PNGs não referenciadas
│   └── src/
│       ├── main.js             raiz de composição
│       ├── config.js           URL do WS, reconexão, limites, tempos
│       ├── a11y/announce.js
│       ├── i18n/strings.js
│       ├── state/              store.js, events.js, typing.js
│       ├── transport/socket.js
│       ├── ui/                 14 componentes
│       └── css/                index.css, tokens.css, base/ (4), components/ (17)
├── read-model/                 documentação histórica (MODEL, STRUCTURE, evolucao, CONTRIBUTING, LICENSE)
├── scripts/
│   ├── dev.mjs                 sobe backend + frontend
│   ├── check-contrast.mjs      mede pares de contraste de tokens.css
│   └── contrast.pairs.json     42 pares declarados
├── .env.example                VITE_SOCKET_URL, ALLOWED_ORIGINS
├── eslint.config.js, .stylelintrc.json, .prettierrc.json, .prettierignore
├── jsconfig.json               checagem de tipos (somente frontend/src)
├── vite.config.js
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

| Variável          | Lida por                   | Momento          | Default                             | Onde é lida de fato                     |
| ----------------- | -------------------------- | ---------------- | ----------------------------------- | --------------------------------------- |
| `VITE_SOCKET_URL` | `frontend/src/config.js`   | Build/dev (Vite) | `ws(s)://<hostname da página>:8080` | `frontend/.env*` (envDir = `frontend/`) |
| `ALLOWED_ORIGINS` | `backend/src/server.js:14` | Inicialização    | vazio → qualquer origem aceita      | Ambiente do processo ou `backend/.env`  |
| `PORT`            | `backend/src/server.js:51` | Inicialização    | `8080`                              | Ambiente do processo ou `backend/.env`  |

> **Atualizado após a Fase 1:** frontend e backend leem o `.env` da **raiz**
> (backend: ambiente do processo > raiz > `backend/.env`). Nova variável
> `HEARTBEAT_MS` (padrão 30000). `PORT`, `ALLOWED_ORIGINS` e `VITE_SOCKET_URL` são
> validadas. A coluna "Onde é lida de fato" acima descreve o estado anterior.

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

| Script  | Comando                      |
| ------- | ---------------------------- |
| `start` | `node src/server.js`         |
| `dev`   | `node --watch src/server.js` |

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

## 8. Backend — elementos de `server.js`

| Elemento                | Linha | Valor / descrição                            |
| ----------------------- | ----: | -------------------------------------------- |
| `allowedOrigins`        |    14 | De `ALLOWED_ORIGINS`, separado por vírgula   |
| `MAX_TOTAL_CONNECTIONS` |    22 | 500 (fecha com 1013 acima disso)             |
| `httpServer`            |    31 | 200 `ok` para qualquer requisição            |
| `maxPayload`            |    41 | 16 KiB (fecha com 1009 acima disso)          |
| `verifyClient`          |    42 | Só ativo se houver allowlist; recusa com 403 |
| `connectedUsers`        |    54 | `Map<WebSocket, {id, name, ws}>`             |
| `messageHistory`        |    55 | Array, máx. 1000; envia 50 no login          |
| `typingUsers`           |    56 | `Set` — escrito, nunca lido                  |
| `normalizeText`         |    89 | Remove `\x00-\x1f\x7f`, `trim`, `slice`      |
| `RATE_LIMIT_*`          |   106 | Capacidade 40, reposição 8/s, por conexão    |
| Limites de texto        |  160+ | `userId` 100, `userName` 30, `content` 1000  |

## 9. Protocolo WebSocket

Formato: JSON `{ "type": string, "payload": any }` (mensagens de chat do servidor
têm também `id` no topo). Tabela completa em
[`ANALISE_E_PLANO_DE_MELHORIAS.md` §3.3](./ANALISE_E_PLANO_DE_MELHORIAS.md#33-protocolo-websocket-contrato-implícito).

| Cliente → servidor                                          | Servidor → cliente                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `user_login`, `chat_message`, `typing_start`, `typing_stop` | `message_history`, `chat_message`, `user_joined`, `user_left`, `user_list`, `user_typing`, `error` |

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

| Verificação                   | Ferramenta                                                       | Resultado em 2026-11-07                                                  |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Formatação                    | Prettier                                                         | ✅ passa                                                                 |
| Lint JS                       | ESLint (proíbe `innerHTML`, `outerHTML`, `insertAdjacentHTML`)   | ✅ passa                                                                 |
| Lint CSS                      | Stylelint (BEM, tokens, sem hex/rgb/`!important` em componentes) | ✅ passa                                                                 |
| Tipos                         | `tsc` (JSDoc, `strict`, `noUncheckedIndexedAccess`)              | ✅ passa                                                                 |
| Contraste                     | `scripts/check-contrast.mjs` (42 pares, 2 temas)                 | ✅ todos passam                                                          |
| Build                         | Vite                                                             | ✅ `dist/` 1,9 MB (HTML 10 KB, JS 13,9 KB, CSS 17,6 KB, imagens ~1,8 MB) |
| Testes automatizados          | `node:test`                                                      | ✅ 78 após a Fase 1 (55 backend + 23 frontend)                           |
| `npm audit` backend           | npm                                                              | ✅ 0                                                                     |
| `npm audit` raiz              | npm                                                              | ⚠️ 7 (dev)                                                               |
| Análise estática de segurança | CodeQL                                                           | Configurada (resultado não acessível nesta análise)                      |

## 12. Navegadores e plataforma

| Requisito                                                        | Origem                                |
| ---------------------------------------------------------------- | ------------------------------------- |
| Build target `es2022`                                            | `vite.config.js`                      |
| `100dvh`, `:focus-visible`, `Object.hasOwn`, `crypto.randomUUID` | CSS e JS do frontend                  |
| Node.js ≥ 20 (documentado), 22 na CI                             | `README.md`, `ci.yml` — sem `engines` |
