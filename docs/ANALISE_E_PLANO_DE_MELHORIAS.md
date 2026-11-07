# Análise técnica e plano de melhorias · web-chat

> **Data da análise:** 2026-11-07 · **Branch analisada:** `claude/quirky-brown-37zb70`
> (commit `34b523c`) · **Escopo:** todo o repositório versionado, histórico do Git,
> dependências instaladas e comportamento do servidor em execução.
>
> **Regra de leitura.** Cada afirmação deste documento é marcada com a natureza da
> evidência:
>
> | Marca              | Significado                                                                                        |
> | ------------------ | -------------------------------------------------------------------------------------------------- |
> | **[CÓDIGO]**       | Lido diretamente no arquivo citado.                                                                |
> | **[TESTADO]**      | Reproduzido executando o projeto (servidor real, build real, `npm audit`, etc.) durante a análise. |
> | **[INFERIDO]**     | Dedução a partir do código ou do histórico, não reproduzida.                                       |
> | **[RECOMENDAÇÃO]** | Proposta deste documento; ainda não existe no projeto.                                             |
>
> Nenhum arquivo de código-fonte foi alterado nesta etapa. Os documentos produzidos
> são: este arquivo, [`ROADMAP_DE_IMPLEMENTACAO.md`](./ROADMAP_DE_IMPLEMENTACAO.md),
> [`INVENTARIO_TECNICO.md`](./INVENTARIO_TECNICO.md) e o [`README.md`](../README.md).

---

## Sumário

1. [Resumo executivo](#1-resumo-executivo)
2. [Visão geral do projeto](#2-visão-geral-do-projeto)
3. [Arquitetura atual](#3-arquitetura-atual)
4. [Stack tecnológica](#4-stack-tecnológica)
5. [Mapeamento dos módulos](#5-mapeamento-dos-módulos)
6. [Funcionalidades identificadas](#6-funcionalidades-identificadas)
7. [Diagnóstico técnico](#7-diagnóstico-técnico)
8. [Problemas encontrados](#8-problemas-encontrados)
9. [Débitos técnicos](#9-débitos-técnicos)
10. [Melhorias recomendadas](#10-melhorias-recomendadas)
11. [Novas funcionalidades sugeridas](#11-novas-funcionalidades-sugeridas)
12. [Atualizações tecnológicas](#12-atualizações-tecnológicas)
13. [Riscos identificados](#13-riscos-identificados)
14. [Dependências entre melhorias](#14-dependências-entre-melhorias)
15. [Recomendações estratégicas](#15-recomendações-estratégicas)
16. [Conclusão técnica](#16-conclusão-técnica)
17. [Pontos que dependem de validação humana](#17-pontos-que-dependem-de-validação-humana)

---

## 1. Resumo executivo

O **web-chat** é uma sala de conversa em tempo real **única, efêmera e anônima**:
frontend em JavaScript nativo (sem framework, empacotado com Vite) e backend Node.js
com WebSocket (`ws`). Não há banco de dados, autenticação nem persistência — o
estado vive na memória do processo. São ~2.100 linhas de JavaScript e ~1.300 de CSS.

**Estado geral: bom no frontend, frágil no protocolo.** O frontend passou por uma
refatoração recente de qualidade notável — camadas com fronteiras verificáveis,
design system tokenizado com contraste medido em CI, acessibilidade cuidadosa,
proibição de `innerHTML` por lint. O backend recebeu uma rodada de endurecimento de
segurança (limite de payload, rate limit, teto de conexões, CSP, allowlist de
origem). Lint, tipos, contraste, formatação e build passam **[TESTADO]**.

Os problemas que restam estão concentrados em **três áreas**:

| Área                          | Achado mais grave                                                                                                                                                                                   | Evidência |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **Integridade do protocolo**  | Qualquer cliente pode enviar o `userId` de outra pessoa e suas mensagens aparecem na tela da vítima rotuladas como **"Você"**.                                                                      | [TESTADO] |
| **Confiabilidade de entrega** | O rate limit é compartilhado entre sinais de digitação (um por tecla) e mensagens; após uma rajada de digitação, a mensagem seguinte é **descartada em silêncio** e o usuário não é avisado.        | [TESTADO] |
| **Configuração**              | O `.env` documentado na raiz **é ignorado** pelo Vite (lê de `frontend/`) e pelo backend (lê de `backend/`): `VITE_SOCKET_URL` e `ALLOWED_ORIGINS` configurados como o README manda não têm efeito. | [TESTADO] |

Além disso: **não existe nenhum teste automatizado** no repositório; não há heartbeat
(conexões mortas permanecem na lista de pessoas); o build publica ~1,7 MB de imagens
não referenciadas; e há 7 vulnerabilidades em dependências de desenvolvimento.

**Recomendação central:** antes de qualquer funcionalidade nova, (1) criar um harness
de teste do protocolo, (2) corrigir identidade, rate limit e configuração de ambiente,
(3) modularizar o backend para torná-lo testável. O roadmap propõe **49 tarefas em 8
fases**; as fases 1 e 2 (20 tarefas) eliminam todos os achados críticos e altos.

---

## 2. Visão geral do projeto

| Item              | Descrição                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| Propósito         | Chat de sala única, sem cadastro; o usuário entra com um nome e conversa com todos os conectados.                     |
| Proposta de valor | Simplicidade e anonimato ("Ninguém sabe quem você é"), interface acessível, zero dependência de runtime no front.     |
| Escopo declarado  | `README.md` e `read-model/evolucao.md` declaram explicitamente o que **não** existe (salas, moderação, auth…).        |
| Persistência      | Nenhuma. Buffer de 1000 mensagens em memória; 50 últimas enviadas a quem entra **[CÓDIGO]** `server.js:174,235`.      |
| Usuários-alvo     | Público anônimo; uma única sala global.                                                                               |
| Maturidade        | Protótipo bem acabado / projeto de portfólio. Sem testes, sem observabilidade, sem pipeline de deploy.                |
| Hospedagem        | Não há configuração de deploy no repositório. O histórico do Git referencia `*.onrender.com` (Render) **[INFERIDO]**. |
| Licença           | MIT.                                                                                                                  |

---

## 3. Arquitetura atual

### 3.1 Visão de contexto

```
┌──────────────────────────── Navegador ────────────────────────────┐
│ index.html (CSP em <meta>, bootstrap de tema inline)              │
│   main.js  ── raiz de composição                                  │
│     ├─ transport/socket.js   WebSocket, backoff, fila (sem DOM)   │
│     ├─ state/store.js        estado observável (sem transporte)   │
│     ├─ state/events.js       evento de protocolo → ação de estado │
│     ├─ state/typing.js       quem está digitando (com expiração)  │
│     ├─ ui/*.js               renderização DOM (sem innerHTML)     │
│     ├─ a11y/announce.js      região live única                    │
│     └─ i18n/strings.js       textos de interface                  │
└───────────────────────────────┬───────────────────────────────────┘
                                │ WebSocket (JSON {type, payload})
┌───────────────────────────────▼───────────────────────────────────┐
│ backend/src/server.js (Node, CommonJS, processo único)            │
│   http.createServer → 200 "ok" para qualquer requisição           │
│   WebSocketServer (maxPayload 16 KiB, verifyClient por Origin)    │
│   Estado em memória: connectedUsers (Map), messageHistory (Array) │
│   Rate limit por conexão (token bucket 40 / 8 por s)              │
└───────────────────────────────────────────────────────────────────┘
```

### 3.2 Padrões identificados

| Padrão                                | Onde                                               | Avaliação                                                                 |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Composition root                      | `frontend/src/main.js`                             | Bem aplicado; único ponto que conhece todas as camadas **[CÓDIGO]**.      |
| Store observável (pub/sub, imutável)  | `frontend/src/state/store.js`                      | Simples e adequado ao tamanho; notifica todos os ouvintes a cada patch.   |
| Factory functions + closures          | Todos os módulos do frontend                       | Consistente; facilita teste com dependências injetadas.                   |
| Tradutor de eventos (anti-corruption) | `frontend/src/state/events.js`                     | Bom: normaliza payloads não confiáveis com `String(...)`/`Array.isArray`. |
| Token bucket                          | `backend/src/server.js:109`                        | Correto, mas um único balde para todos os tipos de mensagem (ver P02).    |
| Script monolítico com estado global   | `backend/src/server.js`                            | Não testável isoladamente; sem fronteiras (ver P13).                      |
| Design tokens em 3 camadas + BEM      | `frontend/src/css/tokens.css`, `.stylelintrc.json` | Excelente; imposto por lint e verificado por script de contraste.         |

### 3.3 Protocolo WebSocket (contrato implícito)

Não há especificação formal do protocolo; o contrato abaixo foi reconstruído a
partir do código **[CÓDIGO]**.

| Direção | `type`            | `payload`                                                 | Observações                                                           |
| ------- | ----------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| C → S   | `user_login`      | `{ userId, userName }`                                    | `userId` escolhido pelo cliente; pode ser enviado várias vezes.       |
| C → S   | `chat_message`    | `{ content }`                                             | ≤ 1000 caracteres após normalização.                                  |
| C → S   | `typing_start`    | `{}`                                                      | Enviado **a cada tecla** (`composer.js:31`, `main.js:307`).           |
| C → S   | `typing_stop`     | `{}`                                                      | Após 2 s de inatividade ou no envio.                                  |
| S → C   | `message_history` | `Array<{ id, type, payload }>`                            | Só se houver histórico; últimas 50.                                   |
| S → C   | `chat_message`    | `{ userId, userName, content, timestamp }` + `id` no topo | O `id` do topo é **descartado** pelo transporte do cliente (P09).     |
| S → C   | `user_joined`     | `{ userName, timestamp }`                                 | Sem `userId`.                                                         |
| S → C   | `user_left`       | `{ userName, timestamp }`                                 | Sem `userId` → cliente não limpa "digitando" de quem saiu.            |
| S → C   | `user_list`       | `Array<{ id, name, status: "online" }>`                   | `status` não é consumido.                                             |
| S → C   | `user_typing`     | `{ userId, userName, isTyping }`                          |                                                                       |
| S → C   | `error`           | `{ message }`                                             | Mensagens em texto livre, sem código de erro.                         |
| S → C   | `chat_cleared`    | —                                                         | **Tratado pelo cliente, nunca emitido pelo servidor** (código morto). |

### 3.4 Banco de dados e armazenamento

**Não há banco de dados** **[CÓDIGO]**. O armazenamento é:

| Dado                 | Onde                                   | Ciclo de vida               |
| -------------------- | -------------------------------------- | --------------------------- |
| Usuários conectados  | `connectedUsers: Map<WebSocket, User>` | Enquanto a conexão existir. |
| Histórico            | `messageHistory: Array` (máx. 1000)    | Até o processo reiniciar.   |
| Digitando (servidor) | `typingUsers: Set` — **nunca lido**    | Estado morto (P23).         |
| Tema (cliente)       | `localStorage["web-chat:theme"]`       | Persistente no navegador.   |

Consequências: sem migrações, sem índices, sem backup — **e isso é coerente com o
produto "efêmero"**. A auditoria de banco de dados pedida se reduz a: (a) memória
desperdiçada (guarda 1000, serve 50 — P35); (b) estado preso ao processo, o que
impede escalar horizontalmente (P34). Persistência **não** é recomendada sem
decisão de produto (ver §17).

### 3.5 Autenticação e autorização

Inexistentes por design. A identidade é **autodeclarada**: o cliente gera um UUID
(`main.js:320`) e o envia em `user_login`; o servidor aceita qualquer string de até
100 caracteres (`server.js:160-162`). Não há sessão, cookie nem token. Isso torna a
identidade **forjável** (P01).

### 3.6 Build, execução e deploy

| Etapa            | Mecanismo                                                                              | Evidência                 |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------- |
| Desenvolvimento  | `npm run dev` → `scripts/dev.mjs` sobe `node --watch` (backend) e `vite` (frontend)    | [CÓDIGO]                  |
| Build            | `vite build` com `root: "frontend"` → `dist/` (HTML, 1 JS, 1 CSS, favicon, imagens)    | [TESTADO] 1,9 MB no total |
| Backend produção | `npm --prefix backend start` (`node src/server.js`), porta `PORT` ou 8080              | [CÓDIGO]                  |
| CI               | `ci.yml`: format, lint JS/CSS, tipos, contraste, build (Node 22). `codeql.yml` semanal | [CÓDIGO]                  |
| Deploy           | **Nenhum** arquivo de deploy (Dockerfile, Procfile, render.yaml…)                      | [CÓDIGO]                  |

---

## 4. Stack tecnológica

| Camada       | Tecnologia                                 | Versão instalada | Última disponível | Observação                                              |
| ------------ | ------------------------------------------ | ---------------- | ----------------- | ------------------------------------------------------- |
| Runtime      | Node.js                                    | 22.x (CI)        | —                 | README diz "20 ou superior"; sem `engines`/`.nvmrc`.    |
| Backend      | `ws`                                       | 8.21.3           | 8.22.1            | `npm audit` backend: 0 vulnerabilidades [TESTADO].      |
| Backend      | `dotenv`                                   | 16.4.5           | 18.0.9            | Carrega `.env` do diretório `backend/` (P03).           |
| Frontend     | JavaScript ES2022 nativo + JSDoc           | —                | —                 | Checado por `tsc` (`jsconfig.json`, `strict`).          |
| Build        | `vite`                                     | 5.4.21           | 8.3.6             | 7 vulnerabilidades transitivas/diretas (dev) [TESTADO]. |
| Lint         | `eslint` / `@eslint/js`                    | 9.39.5           | 10.x              | Flat config.                                            |
| Lint CSS     | `stylelint` + `config-standard`            | 16.26.1 / 36.0.1 | 18.0.0 / 41.0.0   | Regras customizadas de tokens/BEM.                      |
| Tipos        | `typescript` (só checagem)                 | 5.9.3            | 7.0.2             |                                                         |
| Formatação   | `prettier`                                 | 3.9.6            | 3.9.10            |                                                         |
| Fontes       | Google Fonts (Atkinson Hyperlegible, Syne) | CDN              | —                 | Requisição externa a cada visita (P17).                 |
| CI/Segurança | GitHub Actions, CodeQL                     | v4               | —                 |                                                         |

Inventário completo em [`INVENTARIO_TECNICO.md`](./INVENTARIO_TECNICO.md).

---

## 5. Mapeamento dos módulos

| Módulo                             | Linhas | Responsabilidade                                                 | Depende de                          | Acoplamento / observações                                         |
| ---------------------------------- | -----: | ---------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `backend/src/server.js`            |    324 | HTTP, WS, config, validação, estado, rate limit, broadcast, logs | `ws`, `dotenv`, `http`, `crypto`    | **Alto**: tudo num arquivo, estado global, efeitos no `require`.  |
| `frontend/src/main.js`             |    174 | Composição, ciclo de renderização, anúncios de conexão           | Todos os módulos                    | Esperado (composition root). Renderiza tudo a cada mudança (P19). |
| `frontend/src/transport/socket.js` |    192 | Conexão, backoff com jitter, fila, decodificação                 | `config.js`                         | Baixo. Descarta o `id` do envelope (P09).                         |
| `frontend/src/state/store.js`      |    150 | Estado e ações                                                   | —                                   | Baixo. Mensagens sem limite (P20).                                |
| `frontend/src/state/events.js`     |    154 | Protocolo → ações de estado                                      | `strings.js`                        | Baixo. Trata `chat_cleared` que não existe (P23).                 |
| `frontend/src/state/typing.js`     |     77 | Expiração de "digitando"                                         | —                                   | Baixo. `remove()` nunca chamado (P23).                            |
| `frontend/src/ui/*.js` (14)        |    739 | Renderização DOM por componente                                  | `dom.js`, `strings.js`, `config.js` | Baixo; cada um consulta seu próprio seletor via `must()`.         |
| `frontend/src/a11y/announce.js`    |     61 | Região live com fila e deduplicação                              | —                                   | Baixo.                                                            |
| `frontend/src/i18n/strings.js`     |     85 | Textos de interface                                              | —                                   | 14 chaves sem uso; textos duplicados no HTML (P23).               |
| `frontend/src/config.js`           |     62 | URL do WS, limites, tempos                                       | `import.meta.env`                   | `LIMITS` duplica constantes do servidor sem fonte única.          |
| `frontend/src/css/` (23 arq.)      |  1.281 | Tokens → base → componentes                                      | —                                   | Muito bem organizado; imposto por Stylelint.                      |
| `scripts/dev.mjs`                  |     32 | Orquestra backend + frontend em dev                              | `child_process`                     | —                                                                 |
| `scripts/check-contrast.mjs`       |     67 | Mede 42 pares de contraste a partir de `tokens.css`              | `contrast.pairs.json`               | Ativo valioso de qualidade.                                       |

**Duplicações relevantes:**

- Limites do protocolo (`30`, `1000`) existem em `config.js:LIMITS`, em `index.html`
  (`maxlength`) e em `server.js` (literais) — três fontes para o mesmo contrato.
- Textos da tela de entrada/estado vazio/falha estão no HTML **e** em `strings.js`;
  o JS nunca lê as versões de `strings.js`.
- `read-model/STRUCTURE.md` e `read-model/MODEL.md` duplicam (e contradizem) o README.

---

## 6. Funcionalidades identificadas

Todas confirmadas no código **[CÓDIGO]**; as marcadas com † também foram exercitadas
contra o servidor real **[TESTADO]**.

| #   | Funcionalidade                                                    | Implementação                                   |
| --- | ----------------------------------------------------------------- | ----------------------------------------------- |
| F1  | Entrada com nome (1–30 caracteres) †                              | `ui/entry.js`, `server.js:155`                  |
| F2  | Mensagens em tempo real para todos †                              | `server.js:196`, `state/events.js:711`          |
| F3  | Histórico das últimas 50 mensagens ao entrar †                    | `server.js:170`                                 |
| F4  | Lista de pessoas online com monograma e cor estável por id        | `ui/people.js`, `ui/identity.js`                |
| F5  | Indicador "está digitando" com expiração de 6 s                   | `state/typing.js`, `ui/typing.js`               |
| F6  | Avisos de entrada/saída na conversa †                             | `server.js:180,307`                             |
| F7  | Reconexão exponencial com jitter, 6 tentativas, retry manual      | `transport/socket.js`, `ui/failure.js`          |
| F8  | Fila de envio offline (máx. 50)                                   | `transport/socket.js:607`                       |
| F9  | Quatro estados de conexão visíveis + "fio" visual                 | `ui/connection.js`, `css/components/thread.css` |
| F10 | Tema claro/escuro sem flash, persistido                           | `index.html:37`, `ui/themeToggle.js`            |
| F11 | Notificação do navegador com aba oculta, permissão sob gesto      | `ui/notify.js`                                  |
| F12 | Acessibilidade: skip link, `role="log"`, região live, foco gerido | `index.html`, `a11y/announce.js`, `main.js:372` |
| F13 | Endurecimento: payload 16 KiB, rate limit, 500 conexões, Origin   | `server.js:22,41,106,42`                        |
| F14 | CSP por `<meta>` com hash do script inline                        | `index.html:20`                                 |
| F15 | Endpoint HTTP 200 para checagem de saúde †                        | `server.js:31`                                  |

**Regras de negócio implícitas:** nome obrigatório (só no cliente — P06); mensagem
de uma linha, sem caracteres de controle, ≤ 1000 caracteres; cor do remetente
derivada do id; a própria mensagem é identificada por `userId === me.id`.

---

## 7. Diagnóstico técnico

Notas de 1 (crítico) a 5 (excelente).

| Dimensão                      | Nota | Síntese                                                                                                                |
| ----------------------------- | :--: | ---------------------------------------------------------------------------------------------------------------------- |
| Organização do frontend       |  5   | Camadas com fronteiras verificáveis por `grep`, JSDoc tipado em modo estrito, sem `innerHTML`.                         |
| Organização do backend        |  2   | Arquivo único, estado global, sem export, efeito colateral no carregamento; não testável.                              |
| Design system / CSS           |  5   | Tokens em 3 camadas, Stylelint impondo tokens e BEM, contraste medido em CI.                                           |
| Acessibilidade                |  4   | Muito acima da média; lacunas em toasts não anunciados e repintura da lista em reconexão.                              |
| Segurança                     |  3   | Endurecimento de DoS bem feito; identidade forjável, allowlist de origem desligada por padrão, log injection residual. |
| Integridade do protocolo      |  2   | Sem esquema, sem ack, sem id emitido pelo servidor, login repetível.                                                   |
| Performance                   |  4   | Adequada para a escala atual; renderização global e lista ilimitada só pesam em sessões longas.                        |
| Confiabilidade / estabilidade |  2   | Sem heartbeat, sem shutdown gracioso, perda silenciosa de mensagens sob rate limit.                                    |
| Testes                        |  1   | Nenhum teste automatizado.                                                                                             |
| Observabilidade               |  1   | `console.log` sem estrutura, stack trace para erro de cliente, sem métricas.                                           |
| Documentação                  |  3   | README honesto e relatórios detalhados; porém `read-model/` desatualizado e instrução de `.env` incorreta.             |
| CI/CD                         |  3   | Boa verificação estática; sem testes, sem backend, sem `npm audit`, sem deploy.                                        |

### 7.1 Arquitetura e código

- **Pontos fortes:** separação transporte/estado/UI; utilitário `must()` que falha alto
  em divergência HTML↔JS; normalização defensiva de payload no cliente; comentários
  que explicam o _porquê_.
- **Fraquezas:** backend sem modularização; contrato de protocolo implícito e
  espalhado; constantes mágicas no servidor (`500`, `16 * 1024`, `40`, `8`, `1000`,
  `50`, `30`, `100`) sem configuração.

### 7.2 Performance

| Ponto                                                                                                                 | Evidência                         | Impacto atual      | Impacto em escala                         |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------ | ----------------------------------------- |
| Re-render global a cada patch do store (inclui reconstruir a lista de pessoas a cada sinal de digitação de terceiros) | `main.js:351-382`, `people.js:28` | Baixo              | Médio                                     |
| `messageList.render` filtra todo o array a cada patch                                                                 | `messageList.js:38`               | Baixo              | Médio (sessão longa)                      |
| Mensagens e nós DOM crescem sem limite no cliente                                                                     | `store.js:902`                    | Baixo              | Médio                                     |
| Um `typing_start` por tecla → broadcast para N clientes                                                               | `main.js:307`, `server.js:248`    | Médio              | **Alto** (O(N) por tecla de cada usuário) |
| `messageHistory.shift()` em array de 1000                                                                             | `server.js:236`                   | Desprezível        | Baixo                                     |
| ~1,7 MB de PNGs não usados publicados                                                                                 | `dist/images/` [TESTADO]          | Médio (deploy/CDN) | —                                         |
| Fontes de terceiros bloqueando renderização de texto                                                                  | `index.html:54-59`                | Baixo/Médio        | —                                         |

### 7.3 Segurança

Ver P01, P04, P05, P07, P17, P29, P30. Pontos já tratados com sucesso pela
auditoria anterior (`docs/security-report.md`) e **reconfirmados**: `maxPayload`,
rate limit, teto de conexões, `permissions` no CI, ausência de segredos no
histórico, `npm audit` limpo no backend.

### 7.4 Interface e experiência do usuário

Consistência visual e responsividade (breakpoint 480 px, alvos de 44 px em
`pointer: coarse`) são fortes. Lacunas: toasts de erro sem região live (P18);
nenhum feedback quando a mensagem é descartada pelo servidor (P02/P22); campo de
mensagem de uma linha sem contador e com truncamento silencioso (P31); avisos de
"entrou/saiu" repetidos a cada reconexão (P08).

### 7.5 Qualidade e confiabilidade

Sem testes (P12); sem heartbeat (P10); sem shutdown gracioso (P11); logs não
estruturados (P27); CI sem backend e sem auditoria de dependências (P14).

---

## 8. Problemas encontrados

Prioridade: **Crítica / Alta / Média / Baixa**. Complexidade: **Baixa / Média / Alta**.

### P01 — Identidade forjável: `userId` escolhido pelo cliente — **Crítica**

| Campo        | Conteúdo                                                                                                                                                                                                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Localização  | `backend/src/server.js:160-167`; `frontend/src/state/events.js:674`; `frontend/src/main.js:320`                                                                                                                                                                               |
| Evidência    | **[TESTADO]** Conexão B fez login com o mesmo `userId` da conexão A. A recebeu a mensagem de B com `userId` igual ao seu — o cliente de A a marca como `own: true` e a exibe rotulada **"Você"**, alinhada como mensagem própria. `user_list` passou a conter o id duplicado. |
| Impacto      | Integridade: personificação e engano social; a garantia visual "isso foi você" deixa de ser confiável. O `userId` de todos é público (vai em `user_list`), então o ataque é trivial.                                                                                          |
| Solução      | O servidor gera o id (`crypto.randomUUID()`), ignora `userId` do cliente e responde com um evento novo `session` / `welcome` `{ id }`; o cliente passa a usar o id recebido para `me.id`. Retrocompatível: o campo pode continuar sendo enviado e é ignorado.                 |
| Complexidade | Média (mudança coordenada cliente + servidor).                                                                                                                                                                                                                                |

### P02 — Mensagens descartadas em silêncio pelo rate limit compartilhado — **Alta**

| Campo        | Conteúdo                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Localização  | `backend/src/server.js:106-149`; `frontend/src/ui/composer.js:31`; `frontend/src/main.js:307-311`                                                                                                                                                                                                                                                                                                                   |
| Evidência    | **[TESTADO]** Após 45 `typing_start` em rajada, um `chat_message` válido **não foi entregue** aos demais e o remetente não recebeu erro. O cliente envia `typing_start` a cada evento `input` (inclusive colar e autorepetição de tecla); o balde é de 40 fichas com reposição de 8/s, compartilhado com mensagens. O teste citado em `docs/security-report.md` §2.4 durou 1,5 s e não cobriu digitação sustentada. |
| Impacto      | Perda de dados percebida como "o chat não funciona"; o servidor descarta sem resposta (decisão deliberada para tráfego abusivo, mas que atinge também uso legítimo).                                                                                                                                                                                                                                                |
| Solução      | (a) Cliente: throttle de `typing_start` (no máx. 1 a cada ~2 s enquanto digita). (b) Servidor: baldes separados para sinais efêmeros e para `chat_message`. (c) Servidor: ao recusar `chat_message`, responder `error` com código `rate_limited` (sinais efêmeros continuam descartados em silêncio).                                                                                                               |
| Complexidade | Baixa.                                                                                                                                                                                                                                                                                                                                                                                                              |

### P03 — Variáveis de ambiente lidas de diretórios diferentes do documentado — **Alta**

| Campo        | Conteúdo                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Localização  | `vite.config.js` (`root: "frontend"`, sem `envDir`); `backend/src/server.js:6` (`dotenv.config()` sem `path`); `.env.example` e `README.md` (instruem `.env` na raiz)                                                                                                                                                                                                                              |
| Evidência    | **[TESTADO]** Build com `VITE_SOCKET_URL` em `./.env`: o valor **não** aparece no bundle. Com o mesmo valor em `frontend/.env`: aparece. O Vite usa `envDir = root` por padrão. O backend roda com `cwd = backend/` (via `npm --prefix backend`), logo o `dotenv` procura `backend/.env` — **[TESTADO]** `PORT` em `./.env` foi ignorada (servidor subiu na 8080); em `backend/.env` foi aplicada. |
| Impacto      | Em produção, quem seguir o README publica um frontend que tenta `ws://<host>:8080` e não conecta; e acredita ter ativado `ALLOWED_ORIGINS` sem que o servidor a leia — falsa sensação de segurança.                                                                                                                                                                                                |
| Solução      | `envDir: ".."` em `vite.config.js` (ou mover `.env.example` para `frontend/` e `backend/`); `dotenv.config({ path: <raiz>/.env })` ou documentar `backend/.env`. Adicionar log de inicialização informando se a allowlist está ativa.                                                                                                                                                              |
| Complexidade | Baixa.                                                                                                                                                                                                                                                                                                                                                                                             |

### P04 — Log injection residual pelo campo `type` — **Média**

| Campo        | Conteúdo                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Localização  | `backend/src/server.js:283`                                                                                                                                                      |
| Evidência    | **[TESTADO]** `{"type":"x\n[FORJADO] linha falsa"}` produziu duas linhas no log, a segunda forjada. A correção de `normalizeText` (security-report §2.7) não cobre este caminho. |
| Impacto      | Integridade dos logs.                                                                                                                                                            |
| Solução      | Validar `type` contra allowlist antes de qualquer log; registrar apenas `typeof` / tamanho, ou `JSON.stringify` do valor truncado.                                               |
| Complexidade | Baixa.                                                                                                                                                                           |

### P05 — Ausência de validação de envelope/esquema — **Média**

| Campo        | Conteúdo                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Localização  | `backend/src/server.js:152-209`                                                                                                                                                         |
| Evidência    | **[TESTADO]** `chat_message` sem `payload` → `TypeError` com stack trace completo no log e resposta "Erro interno do servidor". Frame `null` → mesmo resultado.                         |
| Impacto      | Erro de cliente tratado como erro de servidor; logs inundáveis com stack traces (até 8/s por conexão × 500 conexões); mensagens de erro enganosas.                                      |
| Solução      | Função `parseEnvelope(data)` que exige objeto, `type` em allowlist e `payload` objeto; erros de validação respondidos com código (`invalid_message`) e logados em uma linha, sem stack. |
| Complexidade | Baixa.                                                                                                                                                                                  |

### P06 — Servidor aceita nome vazio — **Média**

`server.js:163` normaliza mas não rejeita nome vazio. **[TESTADO]** login com `"   "`
gerou `user_joined` com `userName: ""` ("entrou na sala" sem nome). O cliente valida,
mas o servidor é a fronteira de confiança. **Solução:** rejeitar com `error`
`invalid_name` e não registrar o usuário. Complexidade baixa.

### P07 — `user_login` repetível na mesma conexão — **Média**

`server.js:155-194`. **[TESTADO]** 5 logins na mesma conexão geraram 5
`user_joined` para todos — spam de avisos de sistema sem passar por mensagem de
chat, e troca de nome a qualquer momento. **Solução:** aceitar um login por conexão
(ignorar ou responder erro nos seguintes); se renomear for desejado, criar evento
explícito. Complexidade baixa.

### P08 — Avisos de "entrou/saiu" a cada reconexão — **Média**

`main.js:285-289` reenvia `user_login` em todo `open`; o servidor trata como pessoa
nova **[CÓDIGO]**. Uma rede instável gera pares "saiu/entrou" repetidos para todos
**[INFERIDO]**. **Solução:** com id emitido pelo servidor (P01), permitir retomada
de sessão por token de curta duração e suprimir avisos dentro de uma janela de
graça (ex.: 10 s). Complexidade média.

### P09 — `id` das mensagens ao vivo descartado no cliente — **Alta**

| Campo        | Conteúdo                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Localização  | `frontend/src/transport/socket.js:545` (repassa só `type` e `payload`); `frontend/src/state/events.js:712` (`id: undefined` → `crypto.randomUUID()`); `frontend/src/ui/messageList.js:38-42`                       |
| Evidência    | **[CÓDIGO]** Mensagens ao vivo recebem UUID aleatório local; as do `message_history` têm o id real do servidor. Na reconexão, nenhum id coincide → `messageList` limpa e repinta tudo; os avisos de sistema somem. |
| Impacto      | A11y: repintar uma `role="log"` com `aria-relevant="additions"` pode fazer leitores de tela reanunciarem dezenas de mensagens **[INFERIDO]**; UX: perda de contexto; impede deduplicação e confirmação de entrega. |
| Solução      | Incluir `id` no `DomainEvent` do transporte e usá-lo em `toMessage`; na chegada do histórico, mesclar por id em vez de substituir.                                                                                 |
| Complexidade | Baixa.                                                                                                                                                                                                             |

### P10 — Sem heartbeat (ping/pong) — **Alta**

`server.js` não usa `ws.ping()` nem detecta conexões mortas **[CÓDIGO]**. Conexões
meio-abertas (rede móvel, NAT, notebook suspenso) permanecem em `connectedUsers`,
aparecem em `user_list` e contam no teto de 500 **[INFERIDO]**. Proxies de
plataformas (o histórico indica Render) costumam fechar conexões ociosas, o que o
cliente só percebe tarde **[INFERIDO]**. **Solução:** ping a cada 30 s, `terminate()`
sem pong; opcionalmente o cliente detecta silêncio. Complexidade baixa.

### P11 — Sem desligamento gracioso — **Baixa**

Sem tratamento de `SIGTERM`/`SIGINT` no servidor **[CÓDIGO]**. Em deploy, os clientes
recebem queda abrupta (código 1006) em vez de `1001 Going Away`. **Solução:** fechar
o `wss` com 1001 e encerrar o `httpServer` com timeout. Complexidade baixa.

### P12 — Nenhum teste automatizado — **Alta**

Não há arquivos de teste, script `test` nem framework de testes **[CÓDIGO]**. Toda
validação de comportamento até hoje foi manual (os scripts `sec-test*.mjs` citados
no security-report foram descartados). Qualquer mudança no protocolo — e várias
acima exigem uma — não tem rede de proteção. **Solução:** `node:test` (nativo, sem
dependência) para backend e módulos puros do frontend; Playwright para fumaça E2E.
Complexidade média.

### P13 — Backend monolítico e não testável — **Média**

`server.js` faz `listen()` no carregamento, não exporta nada, mistura configuração,
transporte, validação, domínio e logging **[CÓDIGO]**. **Solução:** extrair
`config.js`, `protocol.js` (validação/serialização), `room.js` (estado e regras),
`rateLimiter.js`, `logger.js` e uma `createServer(options)` que devolve
`{ listen, close }`; `server.js` vira só o ponto de entrada. Complexidade média.

### P14 — CI não cobre backend, testes nem dependências — **Média**

`ci.yml` instala só a raiz; não roda `npm --prefix backend ci`, nem `npm audit`,
nem testes **[CÓDIGO]**. **Solução:** jobs para backend, `npm audit --omit=dev
--audit-level=high` (bloqueante para produção) e auditoria completa (informativa).
Complexidade baixa.

### P15 — Vulnerabilidades em dependências de desenvolvimento — **Média**

**[TESTADO]** `npm audit` na raiz: 7 (5 altas, 2 moderadas) — `vite` (direta),
`esbuild`, `brace-expansion`, `fast-uri`, `js-yaml`, `postcss-selector-parser`,
`source-map-js`. Afetam servidor de desenvolvimento e ferramentas de build, não o
artefato servido. **Solução:** `npm audit fix` para transitivas; Vite para major
corrente após testes (P12). Complexidade média.

### P16 — Imagens órfãs publicadas no build — **Média**

`frontend/public/images/` contém 8 arquivos (~1,7 MB); só `favicon.ico` é
referenciado, e mesmo ele é emitido duas vezes (`dist/assets/favicon-*.ico` e
`dist/images/favicon.ico`) **[TESTADO]**. As PNGs eram capturas de tela usadas no
README antigo (removidas na refatoração `c941777`) **[CÓDIGO: histórico]**.
**Solução:** mover capturas para `docs/assets/` (fora do build) ou removê-las;
manter apenas o favicon. Complexidade baixa. _Requer validação humana._

### P17 — Fontes do Google carregadas em toda visita — **Média**

`index.html:54-59`. Cada visita envia IP e user-agent ao Google, o que contradiz a
promessa de interface "Ninguém sabe quem você é" e tem implicação de LGPD
**[INFERIDO]**; também amplia a CSP e cria dependência externa. **Solução:**
auto-hospedar os `woff2` (subset latino) em `frontend/public/fonts/`, remover
`fonts.googleapis.com`/`fonts.gstatic.com` da CSP. Complexidade baixa.

### P18 — Toasts não são anunciados a tecnologias assistivas — **Média**

`.c-toasts` (`index.html:210`) não tem `role`/`aria-live`, e `toast.js` não usa o
anunciador **[CÓDIGO]**. Erros do servidor (`event.type === "error"`) só aparecem
visualmente. **Solução:** encaminhar toasts de erro ao `announcer` (ou
`role="alert"` para erro, `role="status"` para info). Complexidade baixa.

### P19 — Renderização global a cada mudança de estado — **Baixa**

`main.js:351` renderiza todos os componentes em todo `patch`; `people.render`
reconstrói a lista inteira **[CÓDIGO]**. **Solução:** comparar fatias (`prev.people
!== state.people`) antes de renderizar cada componente. Complexidade baixa.

### P20 — Lista de mensagens sem limite no cliente — **Baixa**

`store.addMessage` acumula indefinidamente **[CÓDIGO]**. **Solução:** limite (ex.: 500) com remoção dos nós mais antigos. Complexidade baixa.

### P21 — Fila offline descarta mensagens sem aviso acima de 50 — **Baixa**

`socket.js:614` **[CÓDIGO]**. **Solução:** informar via `onQueueChange` que houve
descarte, ou bloquear o envio ao atingir o teto. Complexidade baixa.

### P22 — Sem confirmação de entrega — **Média**

O tipo `Message.pending` existe mas nunca é `true` (`store.js:827`) **[CÓDIGO]**. O
remetente não sabe se a mensagem chegou ao servidor (relevante em P02, P21).
**Solução:** `clientMsgId` no envio, eco com o mesmo id no broadcast, exibição
otimista com estado "enviando"/"falhou". Complexidade média.

### P23 — Código e estado mortos — **Baixa**

**[CÓDIGO]** `typingUsers` (servidor, nunca lido); `status: "online"` em `user_list`;
`chat_cleared` (cliente); `Message.pending`; `typingTracker.remove()`; `dom.toggle()`;
14 chaves de `strings.js` sem uso (`entry.title`, `entry.subtitle`, `entry.nameLabel`,
`entry.submit`, `entry.ephemeralNote`, `empty.*`, `conn.lostTitle`, `conn.retryNow`,
`people.unknown` — `people.js:26` usa o literal `"— pessoas"` —, `a11y.skipToRoom`,
`a11y.newMessageFrom`, `room.composerLabel`). **Solução:** remover ou passar a usar,
um item por vez. Complexidade baixa.

### P24 — Documentação desatualizada ou contraditória — **Baixa**

**[CÓDIGO]** `read-model/MODEL.md` descreve `style.css`/`script.js` inexistentes;
`read-model/STRUCTURE.md` duplica o README; `docs/design-system.md` abre com
"Nada aqui foi codado ainda"; `read-model/evolucao.md` lista como pendentes itens já
implementados (Origin, rate limit, teto de conexões). **Solução:** consolidar em
`docs/`, arquivar `read-model/`. Complexidade baixa.

### P25 — Versão do Node não fixada — **Baixa**

README diz Node ≥ 20, CI usa 22, sem `engines` nem `.nvmrc` **[CÓDIGO]**.
**Solução:** `engines.node` em ambos os `package.json` e `.nvmrc`. Complexidade baixa.

### P26 — Endpoint de saúde indiscriminado — **Baixa**

`server.js:31` responde `200 ok` a qualquer método e rota **[CÓDIGO]**. **Solução:**
`GET /healthz` com `{ status, uptime, connections }`; `404` para o resto.
Complexidade baixa.

### P27 — Logs não estruturados — **Baixa**

`console.log`/`console.error` com texto livre e stack traces de erros de cliente
**[CÓDIGO]**. **Solução:** logger mínimo em JSON por linha com nível, evento e
campos (sem conteúdo de mensagem). Complexidade baixa.

### P28 — Parâmetros operacionais fixos no código — **Baixa**

`MAX_TOTAL_CONNECTIONS`, `maxPayload`, balde, tamanhos de histórico **[CÓDIGO]**.
Além disso, o teto de conexões é verificado depois do handshake (a conexão é aceita e
fechada com 1013) — aceitável, mas custa um upgrade por tentativa. **Solução:** ler de
variáveis de ambiente com defaults atuais. Complexidade baixa.

### P29 — CSP apenas por `<meta>` e `connect-src` amplo — **Baixa**

Limitação já documentada (`index.html:14-18`): sem `frame-ancestors`, HSTS;
`connect-src ws: wss:` aceita qualquer host **[CÓDIGO]**. **Solução:** cabeçalhos na
hospedagem; gerar a CSP no build com o host de `VITE_SOCKET_URL`. Complexidade
média (depende da plataforma).

### P30 — Allowlist de origem desligada por padrão — **Média (operacional)**

Risco residual conhecido (security-report §4), agravado por P03 **[CÓDIGO]**.
**Solução:** após P03, exigir `ALLOWED_ORIGINS` quando `NODE_ENV=production` (falhar
na inicialização se ausente) e registrar no log o estado da allowlist. Complexidade
baixa.

### P31 — Campo de mensagem limitado e truncamento silencioso — **Baixa (UX)**

`<input type="text" maxlength="1000">` (`index.html:193`) e `slice(0, 1000)`
(`composer.js:25`) **[CÓDIGO]**: sem multilinha, sem contador, colagem longa é cortada
sem aviso. **Solução:** contador visível a partir de 80 % do limite; avaliar
`<textarea>` (Shift+Enter) — exige alinhar servidor, que hoje remove `\n`.

### P32 — `<time>` sem atributo `datetime` — **Baixa (a11y/semântica)**

`message.js:74` **[CÓDIGO]**. **Solução:** `datetime` com o ISO original e `title` com
data completa.

### P33 — Nomes duplicados permitidos — **Baixa**

Nada impede duas pessoas chamadas "Ana" **[CÓDIGO]**; só a cor (derivada do id) as
diferencia. **Solução:** sufixo automático (`Ana (2)`) ou recusa com mensagem.
_Decisão de produto._

### P34 — Estado preso ao processo: sem escala horizontal — **Baixa (futuro)**

Duas instâncias formariam duas salas distintas **[INFERIDO]**. Só relevante se a
carga exigir. **Solução futura:** pub/sub (Redis) para broadcast e histórico.

### P35 — Histórico guarda 1000, serve 50 — **Baixa**

`server.js:174,235` **[CÓDIGO]**: 95 % do buffer nunca é lido. **Solução:** alinhar
os dois números (configuráveis) — ou documentar o motivo.

### P36 — Backend fora da checagem de tipos e em CommonJS — **Baixa**

`jsconfig.json` inclui só `frontend/src`; backend é CJS enquanto a raiz é ESM
**[CÓDIGO]**. **Solução:** migrar backend para ESM com `// @ts-check` e incluir em
`check:types` (feito junto com P13).

### Tabela consolidada

| ID  | Problema                               | Prioridade | Complexidade | Tipo de evidência |
| --- | -------------------------------------- | ---------- | ------------ | ----------------- |
| P01 | Identidade forjável                    | Crítica    | Média        | TESTADO           |
| P02 | Mensagens descartadas pelo rate limit  | Alta       | Baixa        | TESTADO           |
| P03 | `.env` lido do diretório errado        | Alta       | Baixa        | TESTADO           |
| P09 | `id` de mensagem descartado no cliente | Alta       | Baixa        | CÓDIGO            |
| P10 | Sem heartbeat                          | Alta       | Baixa        | CÓDIGO/INFERIDO   |
| P12 | Sem testes                             | Alta       | Média        | CÓDIGO            |
| P04 | Log injection via `type`               | Média      | Baixa        | TESTADO           |
| P05 | Sem validação de envelope              | Média      | Baixa        | TESTADO           |
| P06 | Nome vazio aceito                      | Média      | Baixa        | TESTADO           |
| P07 | Login repetível                        | Média      | Baixa        | TESTADO           |
| P08 | "Entrou/saiu" em reconexão             | Média      | Média        | INFERIDO          |
| P13 | Backend monolítico                     | Média      | Média        | CÓDIGO            |
| P14 | CI incompleta                          | Média      | Baixa        | CÓDIGO            |
| P15 | Vulnerabilidades dev                   | Média      | Média        | TESTADO           |
| P16 | Imagens órfãs no build                 | Média      | Baixa        | TESTADO           |
| P17 | Google Fonts / privacidade             | Média      | Baixa        | CÓDIGO            |
| P18 | Toasts sem anúncio                     | Média      | Baixa        | CÓDIGO            |
| P22 | Sem confirmação de entrega             | Média      | Média        | CÓDIGO            |
| P30 | Allowlist desligada por padrão         | Média      | Baixa        | CÓDIGO            |
| P11 | Sem shutdown gracioso                  | Baixa      | Baixa        | CÓDIGO            |
| P19 | Render global                          | Baixa      | Baixa        | CÓDIGO            |
| P20 | Lista ilimitada                        | Baixa      | Baixa        | CÓDIGO            |
| P21 | Fila descarta sem aviso                | Baixa      | Baixa        | CÓDIGO            |
| P23 | Código morto                           | Baixa      | Baixa        | CÓDIGO            |
| P24 | Docs desatualizadas                    | Baixa      | Baixa        | CÓDIGO            |
| P25 | Node não fixado                        | Baixa      | Baixa        | CÓDIGO            |
| P26 | Healthcheck indiscriminado             | Baixa      | Baixa        | CÓDIGO            |
| P27 | Logs não estruturados                  | Baixa      | Baixa        | CÓDIGO            |
| P28 | Parâmetros fixos                       | Baixa      | Baixa        | CÓDIGO            |
| P29 | CSP só por meta                        | Baixa      | Média        | CÓDIGO            |
| P31 | Composer limitado                      | Baixa      | Média        | CÓDIGO            |
| P32 | `<time>` sem `datetime`                | Baixa      | Baixa        | CÓDIGO            |
| P33 | Nomes duplicados                       | Baixa      | Baixa        | CÓDIGO            |
| P34 | Sem escala horizontal                  | Baixa      | Alta         | INFERIDO          |
| P35 | Histórico 1000 vs 50                   | Baixa      | Baixa        | CÓDIGO            |
| P36 | Backend sem tipos / CJS                | Baixa      | Baixa        | CÓDIGO            |

---

## 9. Débitos técnicos

| ID   | Débito                                                | Origem                              | Custo de carregar                              | Problemas relacionados |
| ---- | ----------------------------------------------------- | ----------------------------------- | ---------------------------------------------- | ---------------------- |
| DT01 | Ausência de testes automatizados                      | Projeto nasceu sem testes           | Toda mudança de protocolo é arriscada          | P12                    |
| DT02 | Protocolo implícito, sem esquema nem versão           | Evolução incremental                | Bugs de contrato (P09), validação ad hoc (P05) | P05, P09, P23          |
| DT03 | Backend monolítico com estado global                  | Arquivo único original              | Impede testes unitários e reuso                | P13, P36               |
| DT04 | Constantes do protocolo duplicadas em 3 lugares       | Cliente e servidor separados        | Divergência silenciosa de limites              | P28                    |
| DT05 | Textos duplicados HTML ↔ `strings.js`                 | Refatoração parcial                 | Edição em dois lugares; chaves mortas          | P23                    |
| DT06 | Documentação histórica em `read-model/` contraditória | Documentação anterior à refatoração | Confunde novos contribuidores                  | P24                    |
| DT07 | Vite em major antiga                                  | Adiado na auditoria de segurança    | Vulnerabilidades dev acumuladas                | P15                    |
| DT08 | Observabilidade inexistente                           | Escopo de protótipo                 | Incidentes em produção sem diagnóstico         | P26, P27               |

---

## 10. Melhorias recomendadas

Formato compacto: cada melhoria tem ID, categoria, problema, situação atual,
resultado esperado, solução, arquivos, dependências, complexidade, prioridade,
riscos e critérios de aceite **verificáveis**. Os IDs são referenciados no roadmap.

### 10.1 Melhorias críticas

#### M01 — Identidade emitida pelo servidor

- **Categoria:** Crítica · **Prioridade:** Crítica · **Complexidade:** Média
- **Problema:** P01. **Situação atual:** o servidor aceita `userId` do cliente.
- **Resultado esperado:** nenhum cliente consegue assumir o id de outro.
- **Solução:** servidor gera `id`; após `user_login` responde `{ type: "session", payload: { id, name } }`; cliente atualiza `me.id` com o valor recebido; `userId` do cliente é ignorado.
- **Arquivos:** `backend/src/server.js` (ou `room.js` após M10), `frontend/src/main.js`, `frontend/src/state/events.js`, `frontend/src/state/store.js`.
- **Dependências:** M09 (harness de testes).
- **Riscos:** clientes antigos em cache não tratam `session` e marcariam "Você" errado até recarregar — mitigação: o cliente novo continua funcionando com servidor antigo (fallback para id local enquanto `session` não chega).
- **Critérios de aceite:** (1) teste de integração: duas conexões enviando o mesmo `userId` recebem ids distintos; (2) mensagem de B nunca chega a A com `userId === idDeA`; (3) `user_list` sem ids duplicados; (4) teste E2E: "Você" aparece só nas mensagens próprias.

#### M02 — Rate limit separado e com feedback

- **Categoria:** Crítica · **Prioridade:** Alta · **Complexidade:** Baixa
- **Problema:** P02. **Resultado esperado:** digitação nunca causa perda de mensagem; mensagem recusada gera aviso.
- **Solução:** throttle de `typing_start` no cliente (≤ 1 por 2 s); baldes distintos (`signals`, `messages`) no servidor; `error { code: "rate_limited" }` para `chat_message` recusado; o cliente exibe toast e devolve o texto ao campo.
- **Arquivos:** `backend/src/server.js`, `frontend/src/main.js`, `frontend/src/state/events.js`, `frontend/src/ui/composer.js`.
- **Dependências:** M09. **Riscos:** calibragem — manter limites por variável de ambiente (M15).
- **Critérios de aceite:** (1) teste: 200 `typing_start` seguidos de 1 `chat_message` → mensagem entregue; (2) teste: 60 `chat_message` em rajada → os excedentes recebem `rate_limited`; (3) cliente envia no máximo 1 `typing_start` por janela de 2 s (teste unitário com relógio falso).

#### M03 — Configuração de ambiente coerente

- **Categoria:** Crítica · **Prioridade:** Alta · **Complexidade:** Baixa
- **Problema:** P03, P30.
- **Solução:** `envDir: ".."` em `vite.config.js`; `dotenv.config({ path: path.resolve(__dirname, "../../.env") })` com fallback para variáveis do processo; log de inicialização `allowlist: ativa (n origens) | desativada`; em `NODE_ENV=production` sem `ALLOWED_ORIGINS`, emitir aviso (ou falhar, conforme decisão §17).
- **Arquivos:** `vite.config.js`, `backend/src/server.js`, `.env.example`, `README.md`.
- **Riscos:** quem já criou `frontend/.env` por tentativa e erro — documentar a precedência.
- **Critérios de aceite:** (1) `VITE_SOCKET_URL` em `./.env` aparece no bundle de `npm run build`; (2) `ALLOWED_ORIGINS` em `./.env` faz o servidor recusar origem não listada com 403 ao rodar `npm run dev`; (3) log de inicialização mostra o estado da allowlist.

#### M04 — Validação de envelope e de login

- **Categoria:** Crítica · **Prioridade:** Alta · **Complexidade:** Baixa
- **Problema:** P04, P05, P06, P07.
- **Solução:** `parseEnvelope()` com allowlist de tipos; erros com `code` (`invalid_message`, `invalid_name`, `already_logged_in`, `not_logged_in`); log de uma linha sem stack para erro de cliente; um login por conexão; nome vazio recusado.
- **Arquivos:** `backend/src/server.js` (→ `backend/src/protocol.js`).
- **Dependências:** M09.
- **Critérios de aceite:** testes de integração para cada caso já reproduzido nesta análise (payload ausente, frame `null`, `type` com `\n`, nome em branco, 5 logins na mesma conexão) com a resposta e o log esperados; nenhum stack trace no log para entrada de cliente.

#### M05 — Heartbeat e desligamento gracioso

- **Categoria:** Crítica (estabilidade) · **Prioridade:** Alta · **Complexidade:** Baixa
- **Problema:** P10, P11.
- **Solução:** `setInterval` de 30 s com `ws.ping()`; `isAlive` por conexão; `terminate()` sem pong; `SIGTERM` → fechar clientes com 1001 e `httpServer.close()` com timeout de 5 s.
- **Arquivos:** `backend/src/server.js`.
- **Critérios de aceite:** teste com cliente que não responde ping → removido de `user_list` em ≤ 2 intervalos (intervalo configurável no teste); `SIGTERM` → clientes recebem código 1001 e o processo sai com código 0.

### 10.2 Melhorias de alta prioridade

#### M06 — Preservar `id` das mensagens e mesclar histórico

- **Prioridade:** Alta · **Complexidade:** Baixa · **Problema:** P09
- **Solução:** `DomainEvent` passa a ter `id?: string`; `events.js` usa `event.id`; `message_history` é mesclado por id preservando mensagens de sistema locais.
- **Arquivos:** `frontend/src/transport/socket.js`, `frontend/src/state/events.js`, `frontend/src/state/store.js`, `frontend/src/ui/messageList.js`.
- **Critérios de aceite:** teste unitário: evento ao vivo + histórico contendo a mesma mensagem → 1 item; após reconexão simulada, `messageList` não chama `clear()` (contador de nós preservado).

#### M07 — Toasts acessíveis

- **Prioridade:** Alta (a11y) · **Complexidade:** Baixa · **Problema:** P18
- **Solução:** `toasts.show` também chama `announcer.say(text, { force: true })` para erros, ou `role="alert"` no toast de erro.
- **Critérios de aceite:** ao receber `error`, o texto aparece na região `[data-announcer]` (teste DOM) e é lido por NVDA/VoiceOver (verificação manual registrada).

#### M08 — Sessão retomável na reconexão

- **Prioridade:** Média · **Complexidade:** Média · **Problema:** P08 · **Dependências:** M01
- **Solução:** `session` inclui `resumeToken` aleatório; ao reconectar, o cliente envia `resume { token }`; o servidor mantém a identidade por uma janela de graça (10 s) e não emite `user_left`/`user_joined` se a sessão for retomada.
- **Critérios de aceite:** teste: queda e reconexão em < 10 s → nenhum `user_left`/`user_joined` para terceiros; > 10 s → os dois eventos ocorrem.

### 10.3 Melhorias estruturais

#### M09 — Harness de testes

- **Prioridade:** Alta · **Complexidade:** Média · **Problema:** P12
- **Solução:** `node --test` (nativo do Node 22) sem dependência nova para: backend (integração com cliente `ws` real em porta efêmera), `store`, `typing`, `events`, `format`, `transport` (com `WebSocket` falso). Script `npm test` na raiz executando as duas árvores. Para DOM: avaliar `happy-dom`/`jsdom` como devDependency **[RECOMENDAÇÃO]**.
- **Arquivos novos:** `backend/test/*.test.js`, `frontend/test/*.test.js`, `package.json` (script `test`).
- **Critérios de aceite:** `npm test` roda localmente e na CI; reproduz como testes os 6 cenários [TESTADO] desta análise (falhando antes das correções correspondentes, passando depois).

#### M10 — Modularizar o backend

- **Prioridade:** Média · **Complexidade:** Média · **Problemas:** P13, P36, P28 · **Dependências:** M09 (testes de integração como rede de proteção)
- **Estrutura proposta:**
    ```
    backend/src/
    ├── index.js         ponto de entrada: lê config, createServer().listen(), sinais
    ├── config.js        variáveis de ambiente com defaults e validação
    ├── server.js        createServer({ config, logger }) → { listen, close }
    ├── protocol.js      parseEnvelope, tipos, códigos de erro, serialização
    ├── room.js          usuários, histórico, regras (login, mensagem, digitação)
    ├── rateLimiter.js   token bucket
    └── logger.js        JSON por linha
    ```
- **Riscos:** regressão de comportamento — mitigado executando a suíte de M09 antes/depois sem alterar testes.
- **Critérios de aceite:** suíte de integração inalterada passa; `server.js` não tem efeito colateral ao ser importado; `check:types` cobre o backend.

#### M11 — Contrato de protocolo compartilhado

- **Prioridade:** Média · **Complexidade:** Média · **Problemas:** DT02, DT04
- **Solução:** `shared/protocol.js` (ESM, sem dependências) com nomes de tipos, códigos de erro e limites (`NAME_MAX`, `MESSAGE_MAX`) importado por frontend e backend; documento `docs/PROTOCOLO.md`; campo opcional `v` no envelope.
- **Critérios de aceite:** nenhum literal `30`/`1000`/nome de tipo duplicado fora de `shared/`; `grep` documentado no PR.

#### M12 — CI completa

- **Prioridade:** Média · **Complexidade:** Baixa · **Problema:** P14
- **Solução:** passos `npm --prefix backend ci`, `npm test`, `npm audit --omit=dev --audit-level=high` (raiz e backend, bloqueante), `npm audit` completo (informativo); matriz Node 20/22 se o suporte a 20 for mantido.
- **Critérios de aceite:** PR com teste quebrado falha a CI; PR que introduz dependência de produção vulnerável falha a CI.

#### M13 — Limpeza de código morto e textos

- **Prioridade:** Baixa · **Complexidade:** Baixa · **Problema:** P23, DT05
- **Critérios de aceite:** itens listados em P23 removidos ou usados; `people.js` usa `strings.people.unknown`; lint/tipos/build verdes.

#### M14 — Consolidar documentação

- **Prioridade:** Baixa · **Complexidade:** Baixa · **Problema:** P24
- **Solução:** mover `CONTRIBUTING.md` para a raiz; arquivar `read-model/` em `docs/historico/` com aviso; atualizar cabeçalho de `docs/design-system.md`.
- **Critérios de aceite:** nenhum documento cita `script.js`/`style.css` como atuais; links do README válidos.

#### M15 — Parâmetros operacionais por ambiente

- **Prioridade:** Baixa · **Complexidade:** Baixa · **Problemas:** P28, P35 · **Dependências:** M10
- **Variáveis propostas:** `MAX_CONNECTIONS`, `MAX_PAYLOAD_BYTES`, `RATE_MESSAGES_CAPACITY`, `RATE_MESSAGES_PER_SEC`, `RATE_SIGNALS_CAPACITY`, `RATE_SIGNALS_PER_SEC`, `HISTORY_SIZE`, `HISTORY_ON_JOIN`, `HEARTBEAT_MS`.
- **Critérios de aceite:** defaults idênticos ao comportamento atual (teste); valores inválidos falham na inicialização com mensagem clara.

#### M16 — Observabilidade mínima

- **Prioridade:** Baixa · **Complexidade:** Baixa · **Problemas:** P26, P27
- **Solução:** logger JSON (`level`, `event`, `ts`, campos), sem conteúdo de mensagem; `GET /healthz` → `{ status, uptimeSec, connections, users }`; `404` para outras rotas.
- **Critérios de aceite:** cada linha de log é JSON válido; `/healthz` responde 200 com o formato; `/qualquer` responde 404.

### 10.4 Melhorias de performance

#### M17 — Renderização seletiva e limite de mensagens

- **Prioridade:** Baixa · **Complexidade:** Baixa · **Problemas:** P19, P20
- **Solução:** em `main.js`, renderizar cada componente só quando sua fatia de estado mudou (comparação por referência); limite de 500 mensagens no store com remoção dos nós mais antigos em `messageList`.
- **Critérios de aceite:** teste: 100 eventos `user_typing` não chamam `people.render`; após 600 mensagens o DOM tem ≤ 500 itens.

#### M18 — Build enxuto

- **Prioridade:** Média · **Complexidade:** Baixa · **Problema:** P16
- **Critérios de aceite:** `du -sh dist` < 150 KB; favicon emitido uma vez; nenhum arquivo em `dist/` sem referência.

#### M19 — Fontes auto-hospedadas

- **Prioridade:** Média · **Complexidade:** Baixa · **Problema:** P17
- **Solução:** `woff2` subset latino em `frontend/public/fonts/`, `@font-face` em `base/typography.css` com `font-display: swap` e `<link rel="preload">` para a fonte do corpo; CSP sem domínios do Google.
- **Critérios de aceite:** aba Rede sem requisições a `*.googleapis.com`/`*.gstatic.com`; tipografia visualmente idêntica (captura antes/depois); `check:contrast` inalterado.

### 10.5 Melhorias funcionais

#### M20 — Confirmação de entrega (otimista)

- **Prioridade:** Média · **Complexidade:** Média · **Problemas:** P22, P21 · **Dependências:** M01, M06
- **Solução:** cliente envia `clientMsgId`; servidor ecoa no broadcast; cliente exibe a mensagem imediatamente como `pending` e a confirma pelo eco; falha (`rate_limited`, timeout) marca "não enviada — tentar de novo".
- **Critérios de aceite:** teste: mensagem aparece antes do eco com `data-pending="true"`; eco remove o estado; sem duplicação.

#### M21 — Composer melhorado

- **Prioridade:** Baixa · **Complexidade:** Média · **Problema:** P31
- **Solução:** contador de caracteres acessível (`aria-describedby`) a partir de 800; aviso ao colar texto acima do limite; `<textarea>` com Enter para enviar e Shift+Enter para nova linha **somente** se o servidor passar a preservar `\n` (ajustar `normalizeText` para permitir `\n` mas não `\r` e demais controles).
- **Critérios de aceite:** colagem de 1200 caracteres mostra aviso e não descarta o excedente sem informar.

#### M22 — Nomes distinguíveis

- **Prioridade:** Baixa · **Complexidade:** Baixa · **Problema:** P33 · _Decisão de produto (§17)._

### 10.6 Melhorias visuais / UX

#### M23 — Ajustes de semântica e feedback

- **Prioridade:** Baixa · **Complexidade:** Baixa · **Problema:** P32
- **Solução:** `<time datetime>`; separador de data quando a conversa cruza o dia; botão "ir para mensagens novas" quando o usuário rolou para cima e chegam mensagens (hoje a lista simplesmente não rola — `messageList.js:52`).
- **Critérios de aceite:** validação HTML sem avisos de `<time>`; botão aparece ao receber mensagem com rolagem afastada do fim e some ao clicar.

### 10.7 Melhorias tecnológicas

Ver §12 — M24 (dependências transitivas), M25 (Vite major), M26 (ESLint/Stylelint/TS majors), M27 (Node fixado), M28 (backend em ESM).

### 10.8 Melhorias futuras

M29 (escala horizontal com Redis), M30 (moderação mínima/anti-abuso), M31 (múltiplas salas efêmeras), M32 (PWA), M33 (CSP por cabeçalho e deploy declarativo) — detalhadas em §11 e no roadmap, fase 8.

---

## 11. Novas funcionalidades sugeridas

Todas **[RECOMENDAÇÃO]**, avaliadas contra o escopo declarado ("uma sala, efêmera,
anônima"). As que conflitam com o escopo estão marcadas.

| ID  | Funcionalidade                                                          | Valor                                         | Compatível com o escopo?                                           | Complexidade |
| --- | ----------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ | ------------ |
| N01 | Confirmação de entrega e reenvio (M20)                                  | Confiança no envio                            | Sim                                                                | Média        |
| N02 | Botão "mensagens novas" (M23)                                           | Não perder mensagens ao rolar                 | Sim                                                                | Baixa        |
| N03 | Menções `@nome` com destaque e notificação                              | Conversas em sala movimentada                 | Sim                                                                | Média        |
| N04 | Silenciar uma pessoa localmente (só no meu navegador)                   | Autodefesa contra abuso sem moderação central | Sim                                                                | Baixa        |
| N05 | Limite de mensagens repetidas / anti-flood de conteúdo                  | Reduz spam                                    | Sim                                                                | Baixa        |
| N06 | Links clicáveis (`rel="noopener noreferrer nofollow"`), criados via DOM | Usabilidade                                   | Sim (sem `innerHTML`)                                              | Média        |
| N07 | Salas efêmeras por link (`/#sala`)                                      | Conversas privadas sem cadastro               | **Expande o escopo**                                               | Alta         |
| N08 | PWA instalável (manifest + service worker)                              | Notificações confiáveis em mobile             | Sim                                                                | Média        |
| N09 | Reações rápidas                                                         | Engajamento                                   | Declarado como não implementado no README — **decisão de produto** | Média        |

---

## 12. Atualizações tecnológicas

Critério: atualizar quando houver **vulnerabilidade, fim de suporte ou ganho
concreto**; nunca só por ser mais recente.

| ID  | Item                                                                                                     | De → Para                                                                                                                                            | Justificativa                                                                                     | Risco | Pré-requisito       |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----- | ------------------- |
| M24 | Transitivas vulneráveis                                                                                  | `npm audit fix` (sem `--force`)                                                                                                                      | 6 avisos em transitivas com correção compatível                                                   | Baixo | Build/lint verdes   |
| M25 | `vite`                                                                                                   | 5.4.21 → major corrente estável                                                                                                                      | Avisos de segurança só corrigidos em majors novas; Vite 5 fora de manutenção ativa **[INFERIDO]** | Médio | M09 + E2E de fumaça |
| M26 | `eslint` 9→10, `stylelint` 16→18, `stylelint-config-standard` 36→41, `globals` 15→17, `typescript` 5.9→7 | Manutenção; nenhuma vulnerabilidade associada. **Baixa prioridade**: atualizar uma ferramenta por PR, só se o custo de ajuste de regras for pequeno. | Baixo/Médio (novas regras podem quebrar lint)                                                     | M12   |
| —   | `ws` 8.21.3 → 8.22.1                                                                                     | Patch                                                                                                                                                | Correções menores; mesma major                                                                    | Baixo | M09                 |
| —   | `dotenv` 16 → 18                                                                                         | **Não recomendado agora**                                                                                                                            | Sem ganho funcional; Node 22 tem `--env-file` nativo — avaliar remover `dotenv` em M03            | —     | —                   |
| M27 | Node                                                                                                     | Fixar `>=20` (ou `>=22`) em `engines` + `.nvmrc`                                                                                                     | Reprodutibilidade                                                                                 | Baixo | Decisão §17         |
| M28 | Backend CJS → ESM                                                                                        | Consistência com a raiz e checagem de tipos                                                                                                          | Junto com M10                                                                                     | Baixo | M10                 |

**O que não recomendar:** introduzir framework de UI (React/Vue/Svelte) — o
frontend nativo é um diferencial declarado do projeto, está bem estruturado e não
apresenta dor que justifique a troca; trocar `ws` por Socket.IO — adicionaria peso
e protocolo próprio sem necessidade; adotar banco de dados — contraria "efêmero".

---

## 13. Riscos identificados

| ID  | Risco                                                                                           | Probabilidade | Impacto     | Mitigação                                                                              |
| --- | ----------------------------------------------------------------------------------------------- | ------------- | ----------- | -------------------------------------------------------------------------------------- |
| R01 | Personificação usada para assédio/engano na sala pública                                        | Alta          | Alto        | M01 (Fase 1)                                                                           |
| R02 | Deploy configurado pelo README sem efeito (`.env`), quebrando conexão ou deixando Origin aberta | Alta          | Alto        | M03 (Fase 1)                                                                           |
| R03 | Regressão ao alterar protocolo sem testes                                                       | Alta          | Médio       | M09 antes de qualquer correção de protocolo                                            |
| R04 | Cliente antigo em cache incompatível com protocolo novo                                         | Média         | Médio       | Mudanças aditivas; servidor tolera campos antigos; cliente novo tolera servidor antigo |
| R05 | Spam/flood de conteúdo dentro do rate limit (sem moderação)                                     | Média         | Médio       | N04, N05; allowlist de Origin; limites por ambiente                                    |
| R06 | Conexões fantasmas esgotando o teto de 500                                                      | Média         | Médio       | M05                                                                                    |
| R07 | Upgrade de Vite quebrar o modo "servido cru" (`frontend/` sem build) documentado no README      | Média         | Médio       | Teste E2E nos 3 modos de servir (refactor-report §10)                                  |
| R08 | Plataforma gratuita hibernar o backend (cold start, quedas)                                     | Média         | Baixo       | Documentar; heartbeat; mensagem de "acordando o servidor" **[INFERIDO]**               |
| R09 | Exposição de IP a terceiros (Google Fonts) contra a promessa de anonimato                       | Alta          | Baixo/Médio | M19                                                                                    |
| R10 | Ausência de logs úteis em incidente                                                             | Média         | Médio       | M16                                                                                    |

---

## 14. Dependências entre melhorias

```
M09 Harness de testes ───┬──► M01 Identidade ──┬──► M08 Sessão retomável
                         │                     └──► M20 Confirmação de entrega ◄── M06 ids preservados
                         ├──► M02 Rate limit
                         ├──► M04 Validação de envelope
                         ├──► M05 Heartbeat / shutdown
                         └──► M10 Modularização ──┬──► M15 Parâmetros por ambiente
                                                  ├──► M16 Observabilidade
                                                  ├──► M28 Backend ESM ──► M11 Protocolo compartilhado
                                                  └──► M12 CI completa (testes do backend)
M03 Configuração de ambiente (independente; pode ir primeiro)
M12 CI completa ──► M24/M25/M26 Atualizações de dependências
M18 Build enxuto, M19 Fontes, M07 Toasts, M13 Limpeza, M14 Docs (independentes)
```

| Melhoria | Depende de    | Bloqueia                |
| -------- | ------------- | ----------------------- |
| M09      | —             | M01, M02, M04, M05, M10 |
| M03      | —             | —                       |
| M01      | M09           | M08, M20                |
| M06      | —             | M20                     |
| M10      | M09           | M11, M15, M16, M28      |
| M12      | M09           | M24, M25, M26           |
| M25      | M09, M12, E2E | —                       |

---

## 15. Recomendações estratégicas

1. **Proteger o contrato antes de mudá-lo.** Escrever os testes de integração do
   protocolo (M09) reproduzindo os cenários desta análise é o investimento de maior
   retorno: transforma cada achado em teste vermelho e cada correção em teste verde.
2. **Tornar o servidor a fonte de verdade.** Identidade (M01), validação (M04) e
   limites (M11) devem ser decididos no servidor; o cliente só exibe.
3. **Mudanças de protocolo aditivas.** Novos tipos (`session`, `resume`), campos
   opcionais (`clientMsgId`, `code`, `v`); nenhum campo existente muda de significado
   — clientes em cache continuam funcionando.
4. **Preservar o que é diferencial.** JavaScript nativo, design system tokenizado,
   acessibilidade verificada e o modo "servido sem build" são decisões explícitas;
   nenhuma melhoria deste plano os remove.
5. **Manter o produto efêmero.** Persistência, contas e moderação central mudam a
   natureza do produto e exigem decisão explícita (§17), não evolução técnica.
6. **Documentação como código.** Cada PR que muda comportamento atualiza README,
   `docs/PROTOCOLO.md` (a criar) e este plano (status das melhorias).

---

## 16. Conclusão técnica

O web-chat tem um frontend de qualidade acima da média para o seu porte, com
decisões bem fundamentadas e verificadas por ferramenta. O backend, por outro lado,
cresceu como um script e recebeu endurecimento pontual sem ganhar estrutura, testes
nem um contrato explícito — e é justamente no contrato entre os dois que estão os
defeitos mais sérios encontrados: identidade forjável, perda silenciosa de
mensagens, ids divergentes e configuração de ambiente que não é lida.

Nenhum desses problemas exige reescrita. Todos têm correção localizada, de baixa ou
média complexidade, e retrocompatível. Executadas as fases 1 e 2 do roadmap
(20 tarefas), o projeto passa a ter: identidade confiável, entrega previsível,
configuração que funciona como documentada, backend modular e coberto por testes, e
CI que impede regressões — uma base sobre a qual as fases seguintes (performance,
UX, atualização de ferramentas e evolução) podem avançar com risco baixo.

---

## 17. Pontos que dependem de validação humana

| #   | Questão                                                                                                    | Por que importa                                          | Melhorias afetadas |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------ |
| V01 | Qual é a hospedagem atual de produção (o histórico indica Render) e os domínios reais do frontend/backend? | Define `ALLOWED_ORIGINS`, CSP por cabeçalho, healthcheck | M03, M16, M33      |
| V02 | O modo "servir `frontend/` sem build" continua sendo requisito?                                            | Restringe ferramentas e o upgrade do Vite                | M19, M25           |
| V03 | Em produção, a ausência de `ALLOWED_ORIGINS` deve **falhar** a inicialização ou só avisar?                 | Segurança vs. disponibilidade                            | M03                |
| V04 | As PNGs em `frontend/public/images/` podem ser removidas ou devem ir para `docs/assets/`?                  | Tamanho do build                                         | M18                |
| V05 | Versão mínima de Node a suportar (20 ou 22)?                                                               | `engines`, matriz de CI, uso de `--env-file`             | M12, M27           |
| V06 | Mensagens multilinha são desejadas?                                                                        | Exige mudar a normalização no servidor                   | M21                |
| V07 | Nomes duplicados devem ser permitidos?                                                                     | Regra de produto                                         | M22                |
| V08 | Há intenção de algum dia ter persistência, salas múltiplas ou moderação?                                   | Muda a arquitetura (Fase 8)                              | M29–M31            |
| V09 | Os valores atuais de rate limit (40/8 por s) e teto (500) refletem a carga real?                           | Calibragem sem dados de produção                         | M02, M15           |
| V10 | Requisitos de LGPD/política de privacidade para a versão pública?                                          | Fontes externas, logs com nomes                          | M16, M19           |
