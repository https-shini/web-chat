# Fase 2 · Relatório de implementação

> **Data:** 2026-11-07 · **Branch:** `claude/quirky-brown-37zb70` · **Base:** commit
> `538d74c` (fim da Fase 1).
> Referências: [`ROADMAP_DE_IMPLEMENTACAO.md`](./ROADMAP_DE_IMPLEMENTACAO.md) (F2-01 a
> F2-08), [`FASE_1_RELATORIO_DE_IMPLEMENTACAO.md`](./FASE_1_RELATORIO_DE_IMPLEMENTACAO.md),
> [`PROTOCOLO.md`](./PROTOCOLO.md).

## 1. Resumo executivo

**Objetivo:** dar ao projeto uma fundação técnica organizada e testável — backend
modular, contrato de protocolo único e verificado, configuração completa,
observabilidade mínima e CI que executa os testes — sem enfraquecer nenhuma
proteção da Fase 1 e sem mudar a interface.

**Resultado:** o `server.js` de 603 linhas, que concentrava 15 responsabilidades,
virou 12 módulos com fronteiras explícitas. As regras de negócio (sala e
identidades) não importam `ws` nem `http` e são testadas sem rede. Os 55 testes de
integração da Fase 1 passaram **sem nenhuma asserção alterada** depois da
refatoração, e a suíte cresceu de 78 para 160 testes, todos executados na CI.

| Tarefa                                       | Situação                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| F2-01 Testes unitários do frontend           | Concluída — 38 testes; linhas de `state/` e `transport/` ≥ 95 %                             |
| F2-02 CI completa                            | Concluída — backend, `npm test`, auditoria de produção bloqueante                           |
| F2-03 Modularizar o backend                  | Concluída                                                                                   |
| F2-04 Backend em ESM e com checagem de tipos | **Parcial** — ESM concluído; checagem de tipos depende de aprovação para `@types/node` (§9) |
| F2-05 Contrato de protocolo compartilhado    | Concluída — com desvio justificado (§4.3)                                                   |
| F2-06 Parâmetros operacionais por ambiente   | Concluída                                                                                   |
| F2-07 Logger estruturado e `/healthz`        | Concluída                                                                                   |
| F2-08 Consolidar documentação                | Concluída                                                                                   |

## 2. Preservação da Fase 1

Antes de começar: árvore limpa, os 4 commits da Fase 1 presentes e 78/78 testes
verdes. Cada proteção obrigatória foi conferida depois da refatoração:

| Proteção                                          | Onde vive agora                                            | Como foi verificada                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Identidade controlada pelo servidor               | `room/sessions.js`, `room/room.js` (`join`)                | Integração (security) + unidade (room, sessions) + navegador (impostor com WebSocket cru) |
| Associação conexão ↔ identidade                   | `room/room.js` (`members`)                                 | Integração + unidade (`post` usa a identidade da conexão)                                 |
| Participação na sala (só membros recebem eventos) | `room/room.js` (`broadcast` itera `members`)               | Integração ("espectador invisível") + unidade                                             |
| Limites separados de digitação e mensagens        | `transport/connection.js`                                  | Integração + unidade (FakeSocket, relógio controlado)                                     |
| Feedback de mensagem recusada                     | `transport/connection.js` (`rate_limited`, 1/s)            | Integração + unidade + navegador (Fase 1)                                                 |
| Validação de payloads                             | `protocol.js` (`parseEnvelope`), `validation.js`           | Integração + unidade (9 formatos inválidos)                                               |
| Sanitização de logs / log injection               | `logger.js` (JSON por linha + omissão de campos sensíveis) | Integração (logs) + unidade (logger)                                                      |
| Validação de nomes                                | `validation.js` (`readName`), `room.js`                    | Integração + unidade                                                                      |
| Prevenção de login repetido                       | `room/room.js` (`join`)                                    | Integração + unidade                                                                      |
| Preservação dos ids de mensagem                   | `protocol.js` (`serverMessage.chat`), `room.js`            | Integração + unidade + navegador (mesmo id nos dois navegadores)                          |
| Tratamento controlado de erros                    | `errors.js` (catálogo), `transport/connection.js`          | Unidade (defeito interno não vaza detalhe) + integração                                   |

Nenhuma proteção foi removida, enfraquecida ou contornada. Os valores de limite
continuam os mesmos (agora configuráveis, com os mesmos padrões).

## 3. Arquitetura anterior

Um arquivo, `backend/src/server.js` (603 linhas, CommonJS), com estado global e efeito
colateral no carregamento (abria a porta ao ser importado).

| Responsabilidade                                                 | Situação                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- |
| Carregar `.env`, validar configuração                            | Misturado no topo do arquivo                                        |
| Logger                                                           | Função local                                                        |
| Catálogo de erros, protocolo, validação de texto                 | Constantes e funções soltas                                         |
| Rate limit                                                       | Função local                                                        |
| Identidade (tokens de retomada)                                  | `Map` global + 4 funções                                            |
| Regras da sala (entrada, saída, mensagens, digitação, histórico) | `handleLogin` e cia., chamando `ws.send`/`ws.terminate` diretamente |
| Broadcast                                                        | Função sobre estado global                                          |
| Ciclo de vida da conexão, heartbeat, desligamento, HTTP          | Corpo do arquivo                                                    |

Problemas: regras de negócio acopladas ao transporte (impossível testar `handleLogin`
sem um WebSocket real); estado global (impossível subir dois servidores no mesmo
processo); nenhuma parte testável isoladamente — a única forma de testar era subir o
processo inteiro.

## 4. Arquitetura atual

### 4.1 Estrutura

```
backend/src/
├── server.js              ponto de entrada (bootstrap)                 83 linhas
├── config.js              .env + validação da configuração            191
├── logger.js              log estruturado                              46
├── errors.js              catálogo de erros (código, categoria, texto)  72
├── protocol.js            contrato: eventos, limites, envelope, quadros 140
├── validation.js          nome, conteúdo, token                         64
├── rateLimiter.js         balde de fichas                               20
├── room/
│   ├── sessions.js        identidades emitidas pelo servidor           132
│   └── room.js            regras da sala                               187
└── transport/
    ├── chatServer.js      HTTP + WebSocket + heartbeat + desligamento  157
    ├── connection.js      ciclo de uma conexão: limites, envelope, encaminhamento 138
    └── http.js            rotas HTTP                                    57
```

A estrutura é deliberadamente mais rasa que a referência conceitual do pedido: com
uma única sala e ~1.300 linhas, diretórios como `modules/users`, `security/` e
`shared/` seriam pastas de um arquivo só. Os módulos de segurança (`validation`,
`rateLimiter`, `room/sessions`) e de infraestrutura compartilhada (`logger`, `errors`)
ficam na raiz de `src/`. Não há gerenciamento de várias salas porque o produto tem
uma sala só (decisão de escopo documentada no README).

### 4.2 Camadas e responsabilidades

| Camada        | Módulos                                                                         | Responsabilidade                                                                       | Não faz                                                                            |
| ------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Inicialização | `server.js`, `config.js`                                                        | Carrega `.env`, valida configuração, cria o servidor, trata sinais                     | Nenhuma regra de protocolo ou negócio                                              |
| Comunicação   | `transport/*`, `protocol.js`                                                    | Recebe conexões, aplica limites, valida envelope, encaminha, responde, heartbeat, HTTP | Não decide se login/mensagem é válido                                              |
| Negócio       | `room/room.js`, `room/sessions.js`                                              | Entrada, saída, retomada, mensagens, histórico, digitação, lista                       | Não importa `ws`/`http`; recebe a conexão como valor opaco e entrega por `deliver` |
| Segurança     | `validation.js`, `rateLimiter.js`, `room/sessions.js`, `protocol.parseEnvelope` | Validação, limites, identidade                                                         | —                                                                                  |
| Compartilhada | `logger.js`, `errors.js`                                                        | Logs, erros                                                                            | —                                                                                  |

### 4.3 Dependências entre módulos

Verificado por script (37 módulos de backend e frontend): **0 imports quebrados, 0
ciclos**. A direção é única — `transport → room → protocol/validation → errors`:

```
server.js ──► config.js
          ──► logger.js
          ──► transport/chatServer.js ──► room/sessions.js
                                      ──► room/room.js ──► protocol.js ──► errors.js
                                      │                ──► validation.js ──► protocol.js, errors.js
                                      ──► transport/connection.js ──► protocol.js, errors.js, rateLimiter.js
                                      ──► transport/http.js
```

**Contrato do protocolo (F2-05) — desvio do plano.** O roadmap previa um
`shared/protocol.js` importado pelos dois lados. Isso quebraria dois requisitos
vigentes: o frontend servido sem build (o navegador não alcança `../shared/`) e o
backend publicável sozinho. Adotado: uma fonte em cada lado
(`backend/src/protocol.js` + `errors.js`, `frontend/src/protocol.js`) e
`backend/test/unit/contract.test.js`, que compara eventos, códigos de erro e limites
— incluindo os `maxlength` do `index.html`. Verificado por mutação: alterar um evento
no cliente faz o teste falhar.

### 4.4 Ciclo de vida da conexão

| Etapa                     | Onde                                                       | Garantia                                                                   |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Estabelecimento           | `chatServer` (`connection`)                                | Recusa com 1001 em desligamento e 1013 acima do teto                       |
| Registro                  | `connection.js`                                            | Um handler por socket; id curto para logs; baldes próprios                 |
| Associação com identidade | `room.join`                                                | Uma vez por conexão (`already_logged_in`)                                  |
| Entrada na sala           | `room.join`                                                | `session` → histórico → `user_joined` (outros) → `user_list`               |
| Saída / desconexão        | `ws.on("close") → room.leave`                              | Toda forma de término passa por aqui; `leave` é idempotente                |
| Limpeza                   | `room.leave` + `identities.release` + `sweep` no heartbeat | Membro removido, identidade liberada e expirada após 10 min                |
| Reconexão                 | `room.join` com `resumeToken`                              | Mesmo id; conexão antiga ainda presente é substituída sem duplicar a lista |
| Falhas                    | `connection.js` (`try/catch` por quadro)                   | Defeito numa conexão não afeta as outras (teste dedicado)                  |

O heartbeat foi apenas realocado (já existia desde a Fase 1); nenhum mecanismo novo.

### 4.5 Protocolo, erros e logs

- **Eventos** centralizados em `CLIENT_EVENTS`/`SERVER_EVENTS`; todo quadro do
  servidor sai de um construtor em `serverMessage` — nenhum literal de evento solto
  no backend nem no frontend.
- **Formato de resposta mantido:** erros continuam `{ type: "error", payload: { code,
message } }`. O formato `{ success, error }` sugerido no pedido exigiria mudar o
  cliente e quebraria clientes em cache, sem ganho funcional; não foi adotado.
- **Erros** têm categoria (`protocol`, `validation`, `authorization`, `rate_limit`,
  `internal`). A categoria decide o nível do log e nunca vai para o cliente. Toda
  recusa gera `request_rejected` com `connection`, `operation`, `code`, `category` e,
  se houver, `user`. Defeito do servidor gera `handler_failed` (nível `error`, com
  stack) e o cliente recebe só `internal_error`.
- **Falha de infraestrutura:** porta ocupada passou a gerar `listen_failed` (uma
  linha, sem stack, saída 1). Antes o processo caía com exceção não tratada — o `ws`
  reemitia o erro do HTTP sem ouvinte. Corrigido e coberto por teste.
- **Logger** com defesa em profundidade: campos chamados `content`, `name`,
  `userName`, `token`, `resumeToken`, `password` ou `secret` são omitidos mesmo se
  passados por engano.

### 4.6 Configuração (F2-06)

Novas variáveis, com padrões idênticos aos valores antes fixos no código:
`MAX_CONNECTIONS`, `MAX_PAYLOAD_BYTES` (mín. 8192, para não recusar mensagem
legítima), `RATE_MESSAGES_CAPACITY`, `RATE_MESSAGES_PER_SEC`, `RATE_SIGNALS_CAPACITY`,
`RATE_SIGNALS_PER_SEC`, `HISTORY_SIZE`, `HISTORY_ON_JOIN` (≤ `HISTORY_SIZE`). Valor
inválido → `config_invalid` com a variável e saída 1. `loadConfig` é pura e testada
sem processo.

**Dependências do backend:** `ws` (transporte) e `dotenv` (só em `config.js`). Nenhuma
redundante; nenhuma adicionada, removida ou atualizada.

### 4.7 HTTP (F2-07)

`GET /` continua `200 ok` (checagens de saúde já configuradas seguem funcionando);
novo `GET /healthz` com `{ status, uptimeSec, connections, users }`; outros caminhos
`404`, outros métodos `405`. **Mudança observável:** antes, qualquer caminho e
método respondia 200 — ver riscos (§8).

## 5. Arquivos

### Criados

| Arquivo                                                                              | Conteúdo                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `backend/src/{config,logger,errors,protocol,validation,rateLimiter}.js`              | Módulos extraídos                               |
| `backend/src/room/{room,sessions}.js`                                                | Regras de negócio                               |
| `backend/src/transport/{chatServer,connection,http}.js`                              | Comunicação                                     |
| `backend/test/unit/{room,sessions,security,config,http,connection,contract}.test.js` | 58 testes de unidade                            |
| `backend/test/integration/http.test.js`                                              | Rotas HTTP com servidor real                    |
| `frontend/src/protocol.js`                                                           | Espelho do contrato                             |
| `frontend/test/{reconnect,typing}.test.js`                                           | Backoff, fila, retry, expiração de digitação    |
| `docs/PROTOCOLO.md`                                                                  | Contrato completo do WebSocket                  |
| `docs/FASE_2_RELATORIO_DE_IMPLEMENTACAO.md`                                          | Este relatório                                  |
| `docs/historico/README.md`, `read-model/README.md`                                   | Aviso e redirecionamento da documentação movida |

### Modificados

| Arquivo                                                                                                                                                                          | Mudança                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `backend/src/server.js`                                                                                                                                                          | De 603 linhas com tudo a 83 linhas de bootstrap                                                         |
| `backend/package.json`                                                                                                                                                           | `"type": "module"`; script `test` com `unit/` e `integration/`                                          |
| `backend/test/integration/*` (movidos de `backend/test/`)                                                                                                                        | ESM; sandbox de config copia `src/` e liga `node_modules` — **nenhuma asserção alterada**               |
| `backend/test/integration/config.test.js`                                                                                                                                        | + parâmetros por ambiente e porta ocupada                                                               |
| `frontend/src/state/events.js`, `main.js`, `state/typingSignal.js`, `config.js`                                                                                                  | Constantes do contrato no lugar de literais; `LIMITS` vem do contrato                                   |
| `frontend/src/state/events.js`, `state/store.js`                                                                                                                                 | Removidos o caso `chat_cleared` e `replaceMessages` (código morto: o servidor nunca emitiu esse evento) |
| `frontend/test/events.test.js`                                                                                                                                                   | + presença, digitação, notificação, tipo desconhecido                                                   |
| `eslint.config.js`                                                                                                                                                               | Backend e testes como ESM                                                                               |
| `.github/workflows/ci.yml`                                                                                                                                                       | Backend, `npm test`, auditorias                                                                         |
| `.env.example`, `README.md`, `CONTRIBUTING.md` (movido para a raiz), `docs/design-system.md`, `docs/historico/evolucao.md`, `docs/ROADMAP…`, `docs/ANALISE…`, `docs/INVENTARIO…` | Documentação                                                                                            |

Movidos: `read-model/{MODEL,STRUCTURE,evolucao}.md` e `LICENSE` → `docs/historico/`;
`read-model/CONTRIBUTING.md` → `CONTRIBUTING.md`.

## 6. Testabilidade e testes

| Suíte                |  Antes |   Agora | O que passou a ser possível                                                                                                           |
| -------------------- | -----: | ------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| Backend — unidade    |      0 |      58 | Sala com membros falsos e relógio controlado; identidades com expiração simulada; conexão com `FakeSocket`; configuração sem processo |
| Backend — integração |     55 |      64 | + HTTP, parâmetros por ambiente, porta ocupada                                                                                        |
| Frontend — unidade   |     23 |      38 | Backoff, jitter, teto de tentativas, retry, fila, expiração de digitação                                                              |
| **Total**            | **78** | **160** |                                                                                                                                       |

Cobertura de linhas no frontend: `state/events.js` 100 %, `state/typing.js` 100 %,
`state/typingSignal.js` 100 %, `state/store.js` 96 %, `transport/socket.js` 96 %.

Os testes de integração tratam o servidor como caixa-preta (processo real + clientes
`ws`), por isso sobreviveram à refatoração. Os de unidade validam comportamento
observável de cada módulo (quadros entregues, resultados, logs), não a estrutura
interna.

## 7. Validações executadas

| Verificação                                                                | Resultado                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `npm test` (160 testes)                                                    | Verde; integração do backend repetida 3× sem falha      |
| Testes de segurança da Fase 1 (55, inalterados)                            | Verdes                                                  |
| `npm run lint` (ESLint, Stylelint, `tsc` do frontend, contraste)           | Verde                                                   |
| `npm run format:check`                                                     | Verde                                                   |
| `npm run build`                                                            | Verde                                                   |
| Imports e ciclos (script sobre 37 módulos)                                 | 0 quebrados, 0 ciclos; `room/` sem `ws`/`http`          |
| Backend com configuração válida (`npm start`)                              | Sobe; `server_listening`; SIGTERM → `shutdown_complete` |
| Configuração inválida (`ALLOWED_ORIGINS=meuchat.com`, `MAX_CONNECTIONS=0`) | `config_invalid` com a variável, saída 1                |
| Porta ocupada                                                              | `listen_failed` (`EADDRINUSE`), sem stack, saída 1      |
| `npm audit --omit=dev` (raiz e backend)                                    | 0 vulnerabilidades                                      |
| Teste de contrato sob mutação                                              | Falha ao divergir; volta a passar ao restaurar          |

**Teste funcional no navegador** (Chromium via Playwright, backend refatorado e
`vite`, proteções ativas), executado 2×, 16/16 verificações nas duas:

- **(1–3)** sistema iniciado; dois usuários na mesma sala (lista com 2);
- **(4)** mensagens nos dois sentidos, com "Você" e nomes corretos;
- **(5)** o **mesmo id de mensagem** nos dois navegadores;
- **(6)** "Ana está digitando" visível para Beto;
- **(7)** queda da conexão de Beto (WebSocket derrubado sem reiniciar o servidor):
  Ana vê "Beto saiu" e a lista cai para 1;
- **(8)** reconexão automática de Beto;
- **(9)** lista consistente ("Beto", "Você"); a mensagem antiga de Beto continua
  "Você" para ele; nenhuma duplicata; o servidor registrou `resumed: true`; a nova
  mensagem é reconhecida;
- **(10)** **impostor:** um WebSocket cru aberto da página de Beto fez login pedindo
  outro `userId` e escreveu como "Ana" — o servidor atribuiu outro id e a mensagem
  **não** apareceu como "Você" para Ana;
- nenhum erro de console ou de página; layout inalterado.

## 8. Riscos residuais

| Risco                                                                                       | Situação / mitigação                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checagem de saúde configurada num caminho diferente de `/` e `/healthz` passa a receber 404 | Antes todo caminho respondia 200. Confirmar o caminho na plataforma antes do deploy (V01).                                                                                                |
| Contrato em dois arquivos                                                                   | Divergência é pega pelo teste de contrato na CI; não é pega se alguém mudar os dois de forma incompatível com clientes em cache — regra de evolução aditiva documentada em `PROTOCOLO.md` |
| Backend sem checagem de tipos                                                               | JSDoc presente; `tsc` não roda no backend até `@types/node` ser aprovado                                                                                                                  |
| Ferramentas de dev com avisos de segurança                                                  | Auditoria completa segue informativa na CI até a Fase 6                                                                                                                                   |
| Riscos residuais da Fase 1                                                                  | Inalterados (ver relatório da Fase 1, §7)                                                                                                                                                 |

## 9. Pendências técnicas e decisões

- **F2-04 (tipos do backend):** exige adicionar `@types/node` como devDependency
  (somente tipos, sem código de runtime). Não adicionei sem aprovação. Com ela:
  `backend/jsconfig.json` + inclusão em `check:types`.
- **V01:** caminho de checagem de saúde configurado na plataforma (ver §8).
- Itens de código morto restantes (P23: `status: "online"`, `typingTracker.remove`,
  `dom.toggle`, chaves de texto sem uso) continuam para F4-04, como planejado.
- Push, merge e PR: **não realizados** — aguardam autorização.

## 10. Pré-requisitos e recomendações para a Fase 3

- Fase 3 pode começar: CI executa todos os testes, então otimizações de build e
  renderização ficam protegidas.
- **F3-05** (alinhar `HISTORY_SIZE` com `HISTORY_ON_JOIN`) agora é só mudança de
  padrão em `config.js`.
- **F3-01** precisa da decisão V04 (imagens órfãs) e **F3-02** da V02 (modo sem build),
  porque mexem nos arquivos servidos.
- Antes de F6-03 (Vite), F7-01 (E2E versionado) — o roteiro funcional desta fase é um
  bom ponto de partida.
