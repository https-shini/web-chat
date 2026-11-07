# Roadmap de implementação · web-chat

> Derivado de [`ANALISE_E_PLANO_DE_MELHORIAS.md`](./ANALISE_E_PLANO_DE_MELHORIAS.md).
> IDs `Pxx` = problemas, `Mxx` = melhorias, `Vxx` = pontos de validação humana
> (todos definidos naquele documento). Data de referência: 2026-11-07.
>
> **Como usar:** execute as tarefas na ordem em que aparecem. Cada tarefa é um PR
> isolado, testável e documentado. Uma tarefa só é considerada concluída quando
> **todos** os seus critérios de conclusão forem verificáveis por comando, teste ou
> registro (captura, log, saída da CI).

---

## Sumário

- [Visão geral das fases](#visão-geral-das-fases)
- [Fase 1 — Correções críticas](#fase-1--correções-críticas)
- [Fase 2 — Fundação técnica](#fase-2--fundação-técnica)
- [Fase 3 — Performance e otimização](#fase-3--performance-e-otimização)
- [Fase 4 — Melhorias funcionais](#fase-4--melhorias-funcionais)
- [Fase 5 — UX/UI e acessibilidade](#fase-5--uxui-e-acessibilidade)
- [Fase 6 — Atualizações tecnológicas](#fase-6--atualizações-tecnológicas)
- [Fase 7 — Testes e validação](#fase-7--testes-e-validação)
- [Fase 8 — Evolução futura](#fase-8--evolução-futura)
- [Estratégia de implementação](#estratégia-de-implementação)
- [Plano de testes e validação](#plano-de-testes-e-validação)
- [Quadro de acompanhamento](#quadro-de-acompanhamento)

---

## Visão geral das fases

| Fase | Nome                      | Tarefas | Prioridade dominante | Resultado ao final                                                                |
| ---- | ------------------------- | ------: | -------------------- | --------------------------------------------------------------------------------- |
| 1    | Correções críticas        |      12 | Crítica / Alta       | Identidade confiável, entrega previsível, `.env` funcional, sem conexões fantasma |
| 2    | Fundação técnica          |       8 | Alta / Média         | Backend modular e tipado, protocolo único, CI com testes e auditoria              |
| 3    | Performance e otimização  |       5 | Média / Baixa        | Build < 150 KB, sem fontes de terceiros, renderização seletiva                    |
| 4    | Melhorias funcionais      |       5 | Média                | Reconexão sem ruído, confirmação de entrega                                       |
| 5    | UX/UI e acessibilidade    |       6 | Alta / Baixa         | Erros anunciados, navegação em conversas longas, composer melhor                  |
| 6    | Atualizações tecnológicas |       5 | Média / Baixa        | `npm audit` limpo, Vite atual, Node fixado                                        |
| 7    | Testes e validação        |       3 | Alta                 | E2E nos 3 modos de servir, carga e a11y automatizados                             |
| 8    | Evolução futura           |       5 | Baixa                | Deploy declarativo, anti-abuso, caminhos de escala                                |
|      | **Total**                 |  **49** |                      |                                                                                   |

**Sobre a ordem das fases 7 e 6.** A fase 7 consolida a validação, mas testes não
são deixados para o fim: a fase 1 começa criando o harness (F1-01) e toda tarefa
entrega seus próprios testes. A tarefa **F7-01 (E2E) deve ser executada antes de
F6-03 (upgrade do Vite)** — é a única dependência que cruza a ordem das fases.

```
Ordem de execução sugerida (caminho crítico em negrito)
**F1-01** → F1-02 → F1-03 → F1-04 → **F1-05 → F1-06** → F1-07 → F1-08 → F1-09 → F1-10 → F1-11 → F1-12
→ F2-01 → **F2-02 → F2-03** → F2-04 → F2-05 → F2-06 → F2-07 → F2-08
→ F3-* → F4-* → F5-* → F7-01 → F6-* → F7-02 → F7-03 → F8-*
```

---

## Fase 1 — Correções críticas

> **Status: concluída em 2026-11-07** — 12/12 tarefas. Detalhes, decisões, testes e
> riscos residuais em [`FASE_1_RELATORIO_DE_IMPLEMENTACAO.md`](./FASE_1_RELATORIO_DE_IMPLEMENTACAO.md).
>
> Desvios em relação ao plano abaixo, todos justificados no relatório:
>
> - **F1-05** ganhou um `resumeToken` (de uso único, guardado só como hash) para que
>   a identidade sobreviva a reconexões; sem ele, a correção causaria regressão
>   ("Você" sumiria das mensagens antigas). A supressão de avisos de entrada/saída
>   continua sendo F4-01.
> - **F1-08** mantém a capacidade e a taxa originais (40 / 8 por s) em cada balde,
>   em vez de recalibrar sem dados (V09); avisos de `rate_limited` limitados a 1/s.
> - **F1-02** valida também `PORT` e `VITE_SOCKET_URL` (no build) e mantém
>   `backend/.env` como fallback; a ausência de `ALLOWED_ORIGINS` só gera aviso (V03).
> - **F1-11** introduz a variável `HEARTBEAT_MS` (prevista em F2-06), necessária
>   para testar o heartbeat.
> - **Achado novo corrigido na fase:** conexões sem login recebiam os eventos da sala
>   (espectador invisível). O `broadcast` agora alcança só quem entrou.
> - Os testes rodam com `npm test`; incluí-los na CI continua sendo F2-02.

Objetivo: eliminar falhas de integridade, perda de dados e configuração que não
funciona. Nenhuma tarefa desta fase muda a aparência do produto.

### F1-01 — Harness de testes do protocolo

| Campo                  | Conteúdo                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição              | Adicionar `node --test` ao backend com testes de integração que sobem o servidor em porta efêmera e conversam com clientes `ws` reais. Script `npm test` na raiz que roda `npm --prefix backend test`.                                                                                                                                                                                                   |
| Objetivo               | Rede de proteção para todas as mudanças de protocolo; transformar os cenários [TESTADO] da análise em testes.                                                                                                                                                                                                                                                                                            |
| Prioridade             | Crítica (pré-requisito)                                                                                                                                                                                                                                                                                                                                                                                  |
| Complexidade           | Média                                                                                                                                                                                                                                                                                                                                                                                                    |
| Dependências           | —                                                                                                                                                                                                                                                                                                                                                                                                        |
| Módulos afetados       | `backend/package.json`, `backend/test/` (novo), `package.json`                                                                                                                                                                                                                                                                                                                                           |
| Pré-requisitos         | O servidor precisa aceitar porta por `PORT` (já aceita). Para não refatorar antes de testar, os testes iniciais sobem `node src/server.js` como processo filho.                                                                                                                                                                                                                                          |
| Critérios de conclusão | (1) `npm test` executa e reporta resultados; (2) testes de caracterização do comportamento **atual** passam (login, mensagem, histórico, digitação, saída, payload > 16 KiB fecha com 1009, origem recusada com 403 quando `ALLOWED_ORIGINS` definido); (3) os 6 cenários de defeito da análise existem como testes marcados `todo` ou `skip` com referência ao problema (P01, P02, P04, P05, P06, P07). |
| Riscos                 | Testes instáveis por timing — usar esperas por evento, nunca `sleep` fixo.                                                                                                                                                                                                                                                                                                                               |

### F1-02 — Configuração de ambiente coerente (M03)

| Campo                  | Conteúdo                                                                                                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição              | `envDir: ".."` em `vite.config.js`; backend carrega `.env` da raiz por caminho absoluto (ou `node --env-file` se V05 = Node ≥ 20.6); log de inicialização informa porta e estado da allowlist.                                                                       |
| Objetivo               | O `.env` documentado passa a ter efeito (P03, P30).                                                                                                                                                                                                                  |
| Prioridade             | Alta                                                                                                                                                                                                                                                                 |
| Complexidade           | Baixa                                                                                                                                                                                                                                                                |
| Dependências           | F1-01                                                                                                                                                                                                                                                                |
| Módulos afetados       | `vite.config.js`, `backend/src/server.js`, `.env.example`, `README.md`                                                                                                                                                                                               |
| Pré-requisitos         | Decisão V03 (falhar ou avisar sem allowlist em produção).                                                                                                                                                                                                            |
| Critérios de conclusão | (1) `VITE_SOCKET_URL=wss://exemplo.invalid` em `./.env` aparece em `dist/assets/*.js` após `npm run build`; (2) teste: com `ALLOWED_ORIGINS` em `./.env` e servidor iniciado via `npm --prefix backend start`, origem não listada recebe 403; (3) README atualizado. |
| Riscos                 | Quem já usa `frontend/.env` — documentar que a raiz passa a ser a fonte.                                                                                                                                                                                             |

### F1-03 — Validação de envelope e log seguro (M04, P04, P05)

| Campo                  | Conteúdo                                                                                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição              | `parseEnvelope()` exige objeto, `type` em allowlist e `payload` objeto (default `{}`); erros de cliente respondem `error { code: "invalid_message", message }` e geram **uma** linha de log sem stack; `type` desconhecido nunca é escrito cru no log.      |
| Objetivo               | Fechar log injection residual e parar de tratar erro de cliente como erro interno.                                                                                                                                                                          |
| Prioridade             | Alta                                                                                                                                                                                                                                                        |
| Complexidade           | Baixa                                                                                                                                                                                                                                                       |
| Dependências           | F1-01                                                                                                                                                                                                                                                       |
| Módulos afetados       | `backend/src/server.js`                                                                                                                                                                                                                                     |
| Pré-requisitos         | —                                                                                                                                                                                                                                                           |
| Critérios de conclusão | Testes: `chat_message` sem payload → `invalid_message`; frame `null` e texto não-JSON → `invalid_message`; `type` com `\n` → log de uma linha; nenhum `TypeError` no log em nenhum teste. Campo `message` mantido para compatibilidade com o cliente atual. |
| Riscos                 | Baixo; campo `code` é aditivo.                                                                                                                                                                                                                              |

### F1-04 — Login único por conexão e nome obrigatório (M04, P06, P07)

| Campo                   | Conteúdo                                                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição               | Nome normalizado vazio → `error { code: "invalid_name" }` sem registrar; segundo `user_login` na mesma conexão → `error { code: "already_logged_in" }` sem broadcast. |
| Objetivo                | Impedir avisos de sistema sem nome e spam de "entrou na sala".                                                                                                        |
| Prioridade              | Alta                                                                                                                                                                  |
| Complexidade            | Baixa                                                                                                                                                                 |
| Dependências            | F1-03                                                                                                                                                                 |
| Módulos afetados        | `backend/src/server.js`                                                                                                                                               |
| Critérios de conclusão  | Testes: nome `"   "` não gera `user_joined`; 5 logins → 1 `user_joined`.                                                                                              |
| Pré-requisitos / Riscos | O cliente atual envia `user_login` uma vez por conexão (`main.js:288`) — sem quebra.                                                                                  |

### F1-05 — Identidade emitida pelo servidor: lado servidor (M01)

| Campo                  | Conteúdo                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição              | O servidor ignora `payload.userId`, gera `crypto.randomUUID()` e responde ao próprio cliente `{ type: "session", payload: { id, name } }` **antes** de `message_history`.    |
| Objetivo               | Eliminar personificação (P01).                                                                                                                                               |
| Prioridade             | Crítica                                                                                                                                                                      |
| Complexidade           | Média                                                                                                                                                                        |
| Dependências           | F1-04                                                                                                                                                                        |
| Módulos afetados       | `backend/src/server.js`                                                                                                                                                      |
| Critérios de conclusão | Testes: duas conexões com o mesmo `userId` recebem ids distintos; nenhuma mensagem chega com `userId` igual ao id do receptor salvo se for dele; `user_list` sem duplicatas. |
| Riscos                 | Cliente atual compara com seu id local e deixaria de reconhecer as próprias mensagens até F1-06 — **implantar F1-05 e F1-06 juntos** (mesmo release).                        |

### F1-06 — Identidade emitida pelo servidor: lado cliente (M01)

| Campo                  | Conteúdo                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição              | `events.js` trata `session` → `store.actions.setMe({ id, name })`; `own` passa a comparar com o id do servidor; até o `session` chegar, mantém o comportamento atual (tolerância a servidor antigo). |
| Objetivo               | Rótulo "Você" confiável.                                                                                                                                                                             |
| Prioridade             | Crítica                                                                                                                                                                                              |
| Complexidade           | Baixa                                                                                                                                                                                                |
| Dependências           | F1-05                                                                                                                                                                                                |
| Módulos afetados       | `frontend/src/state/events.js`, `frontend/src/state/store.js`, `frontend/src/main.js`                                                                                                                |
| Critérios de conclusão | Teste unitário do tradutor de eventos; verificação manual com duas abas registrada no PR: só as próprias mensagens exibem "Você".                                                                    |
| Riscos                 | Ordem de eventos — garantido pelo servidor (F1-05).                                                                                                                                                  |

### F1-07 — Throttle do sinal de digitação no cliente (M02)

| Campo                  | Conteúdo                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Descrição              | `typing_start` enviado no máximo uma vez a cada 2 s enquanto há digitação; `typing_stop` após 2 s de inatividade (já existe). O receptor já expira em 6 s (`state/typing.js`). |
| Objetivo               | Reduzir tráfego O(N) por tecla e o consumo do balde (P02).                                                                                                                     |
| Prioridade             | Alta                                                                                                                                                                           |
| Complexidade           | Baixa                                                                                                                                                                          |
| Dependências           | F1-01                                                                                                                                                                          |
| Módulos afetados       | `frontend/src/main.js` (extrair para `frontend/src/state/typingSignal.js` testável)                                                                                            |
| Critérios de conclusão | Teste com relógio falso: 100 eventos `input` em 3 s → ≤ 2 `typing_start`.                                                                                                      |
| Riscos                 | Indicador remoto some se o intervalo > validade de 6 s — manter intervalo < 6 s.                                                                                               |

### F1-08 — Baldes separados e recusa explícita no servidor (M02)

| Campo                  | Conteúdo                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Descrição              | Um balde para `typing_*` (descarte silencioso) e outro para `chat_message`/`user_login` (recusa com `error { code: "rate_limited" }`).                       |
| Objetivo               | Digitação nunca bloqueia mensagens; usuário sabe quando foi limitado.                                                                                        |
| Prioridade             | Alta                                                                                                                                                         |
| Complexidade           | Baixa                                                                                                                                                        |
| Dependências           | F1-03                                                                                                                                                        |
| Módulos afetados       | `backend/src/server.js`                                                                                                                                      |
| Critérios de conclusão | Teste: 200 `typing_start` + 1 `chat_message` → mensagem entregue; 60 `chat_message` em rajada → excedentes recebem `rate_limited`, conexão permanece aberta. |
| Riscos                 | Amplificação de resposta a um atacante — limitada: no máximo 1 erro por mensagem recusada e ainda sujeita ao `maxPayload`; opcionalmente 1 erro por segundo. |

### F1-09 — Feedback de mensagem recusada no cliente (M02)

| Campo                  | Conteúdo                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição              | Ao receber `error` com `code: "rate_limited"`, mostrar aviso específico e devolver o último texto enviado ao campo se ele estiver vazio. |
| Objetivo               | Nenhuma perda silenciosa de texto.                                                                                                       |
| Prioridade             | Alta                                                                                                                                     |
| Complexidade           | Baixa                                                                                                                                    |
| Dependências           | F1-08                                                                                                                                    |
| Módulos afetados       | `frontend/src/state/events.js`, `frontend/src/ui/composer.js`, `frontend/src/i18n/strings.js`                                            |
| Critérios de conclusão | Teste unitário do tradutor; verificação manual registrada.                                                                               |
| Riscos                 | Sem `clientMsgId` (F4-02) não há correlação exata — usar "último enviado" como heurística documentada.                                   |

### F1-10 — Preservar `id` das mensagens e mesclar histórico (M06, P09)

| Campo                  | Conteúdo                                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição              | `transport/socket.js` repassa `id` do envelope; `events.js` usa-o; `message_history` é mesclado por id, preservando avisos de sistema locais.                                             |
| Objetivo               | Reconexão sem repintar nem reanunciar a conversa.                                                                                                                                         |
| Prioridade             | Alta                                                                                                                                                                                      |
| Complexidade           | Baixa                                                                                                                                                                                     |
| Dependências           | F1-01 (e testes de frontend básicos — pode antecipar parte de F2-01)                                                                                                                      |
| Módulos afetados       | `frontend/src/transport/socket.js`, `frontend/src/state/events.js`, `frontend/src/state/store.js`, `frontend/src/ui/messageList.js`                                                       |
| Critérios de conclusão | Teste: mensagem ao vivo seguida de histórico com a mesma mensagem → 1 item; `messageList` não executa `clear()` numa reconexão (teste com DOM ou verificação manual com contagem de nós). |
| Riscos                 | Baixo.                                                                                                                                                                                    |

### F1-11 — Heartbeat ping/pong (M05, P10)

| Campo                  | Conteúdo                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição              | Ping a cada `HEARTBEAT_MS` (default 30 000); conexão sem pong no ciclo seguinte é encerrada com `terminate()`, disparando a limpeza normal.                                |
| Objetivo               | Remover conexões fantasma da lista e do teto.                                                                                                                              |
| Prioridade             | Alta                                                                                                                                                                       |
| Complexidade           | Baixa                                                                                                                                                                      |
| Dependências           | F1-01                                                                                                                                                                      |
| Módulos afetados       | `backend/src/server.js`                                                                                                                                                    |
| Critérios de conclusão | Teste com `HEARTBEAT_MS=200` e cliente com `autoPong: false` → removido de `user_list` em ≤ 2 ciclos. Navegadores respondem ping automaticamente (sem mudança no cliente). |
| Riscos                 | Intervalo curto demais derruba redes lentas — default conservador.                                                                                                         |

### F1-12 — Desligamento gracioso (M05, P11)

| Campo                     | Conteúdo                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Descrição                 | `SIGTERM`/`SIGINT` → parar de aceitar conexões, fechar clientes com 1001, `httpServer.close()`, sair com 0 ou forçar após 5 s. |
| Prioridade / Complexidade | Baixa / Baixa                                                                                                                  |
| Dependências              | F1-11                                                                                                                          |
| Módulos afetados          | `backend/src/server.js`                                                                                                        |
| Critérios de conclusão    | Teste: processo filho recebe `SIGTERM`; cliente observa código 1001; processo termina com código 0 em < 5 s.                   |
| Pré-requisitos / Riscos   | Nenhum relevante.                                                                                                              |

---

## Fase 2 — Fundação técnica

> **Status: concluída em 2026-11-07** — 7 tarefas concluídas e F2-04 parcial.
> Detalhes em [`FASE_2_RELATORIO_DE_IMPLEMENTACAO.md`](./FASE_2_RELATORIO_DE_IMPLEMENTACAO.md).
>
> Desvios em relação ao plano abaixo:
>
> - **F2-03:** estrutura mais rasa que a planejada (`config`, `logger`, `errors`,
>   `protocol`, `validation`, `rateLimiter`, `room/`, `transport/`); o ponto de
>   entrada continua `src/server.js` (compatível com o comando de start existente).
> - **F2-04:** ESM concluído; checagem de tipos do backend depende de aprovação para
>   adicionar `@types/node`.
> - **F2-05:** em vez de `shared/protocol.js` importado pelos dois lados (quebraria o
>   frontend servido sem build e o backend publicável sozinho), um módulo de contrato
>   em cada lado e um teste de contrato que os compara (inclui os `maxlength` do HTML).
>   O formato de erro `{ type: "error", payload: { code, message } }` foi mantido.
> - **F2-07:** `GET /` mantém `200 ok` além do novo `/healthz`; outros caminhos 404.
> - **Extra:** removido o tratamento de `chat_cleared` no cliente (o servidor nunca o
>   emitiu); porta ocupada passou a gerar `listen_failed` em vez de derrubar o processo.

Objetivo: estrutura, padronização e automação que tornam as fases seguintes baratas.

### F2-01 — Testes unitários do frontend (M09)

| Campo                     | Conteúdo                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Testes `node --test` para `state/store.js`, `state/typing.js`, `state/events.js`, `i18n/strings.js` (`format`, `peopleCount`), `transport/socket.js` (com `WebSocket` falso e relógio controlado: backoff, jitter dentro de ±30 %, teto de tentativas, fila de 50). Avaliar `happy-dom` para `ui/` **[decisão no PR]**. |
| Objetivo                  | Cobrir a lógica do cliente sem navegador.                                                                                                                                                                                                                                                                               |
| Prioridade / Complexidade | Alta / Média                                                                                                                                                                                                                                                                                                            |
| Dependências              | F1-01                                                                                                                                                                                                                                                                                                                   |
| Módulos                   | `frontend/test/` (novo), `package.json`                                                                                                                                                                                                                                                                                 |
| Critérios de conclusão    | `npm test` cobre frontend e backend; cobertura de linhas (`node --test --experimental-test-coverage`) ≥ 80 % em `state/` e `transport/`.                                                                                                                                                                                |
| Riscos                    | Módulos que leem `import.meta.env` — isolar `config.js` com injeção.                                                                                                                                                                                                                                                    |

### F2-02 — CI completa (M12, P14)

| Campo                     | Conteúdo                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Em `ci.yml`: `npm --prefix backend ci`; `npm test`; `npm audit --omit=dev --audit-level=high` na raiz e no backend (bloqueante); `npm audit` completo (informativo, `continue-on-error`). |
| Prioridade / Complexidade | Alta / Baixa                                                                                                                                                                              |
| Dependências              | F2-01                                                                                                                                                                                     |
| Módulos                   | `.github/workflows/ci.yml`                                                                                                                                                                |
| Critérios de conclusão    | PR de prova com teste quebrado falha a CI (registrar link); `permissions: contents: read` mantido.                                                                                        |
| Riscos                    | Auditoria completa hoje tem 7 avisos — por isso informativa até F6-01.                                                                                                                    |

### F2-03 — Modularizar o backend (M10, P13)

| Campo                     | Conteúdo                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Descrição                 | Extrair `config.js`, `protocol.js`, `room.js`, `rateLimiter.js`, `logger.js`, `server.js` (`createServer()` sem efeito colateral) e `index.js` (entrada). Atualizar `package.json` (`main`, `start`, `dev`). |
| Objetivo                  | Backend testável por unidade, com responsabilidades separadas.                                                                                                                                               |
| Prioridade / Complexidade | Média / Média                                                                                                                                                                                                |
| Dependências              | F1-* concluídas, F2-02                                                                                                                                                                                       |
| Módulos                   | `backend/src/*`                                                                                                                                                                                              |
| Critérios de conclusão    | Suíte de integração **sem alterações** passa; testes unitários novos para `rateLimiter` e `protocol`; importar `server.js` não abre porta.                                                                   |
| Riscos                    | Regressão — mitigada pela suíte inalterada; PR sem mudança de comportamento (refactor puro).                                                                                                                 |

### F2-04 — Backend em ESM e com checagem de tipos (M28, P36)

| Campo                     | Conteúdo                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | `"type": "module"` no backend, `// @ts-check` + JSDoc, `jsconfig.json` (ou `backend/jsconfig.json`) incluído em `check:types`; remover override CommonJS do `eslint.config.js`. |
| Prioridade / Complexidade | Baixa / Baixa                                                                                                                                                                   |
| Dependências              | F2-03                                                                                                                                                                           |
| Critérios de conclusão    | `npm run check:types` cobre `backend/src` sem erros; testes verdes.                                                                                                             |
| Riscos                    | `__dirname` inexistente em ESM — usar `import.meta.dirname` (Node ≥ 20.11).                                                                                                     |

### F2-05 — Contrato de protocolo compartilhado (M11)

| Campo                     | Conteúdo                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | `shared/protocol.js` com tipos de evento, códigos de erro e limites; importado por backend e frontend; `docs/PROTOCOLO.md` com a tabela de mensagens (base: §3.3 da análise) incluindo `session` e `code`.                |
| Prioridade / Complexidade | Média / Média                                                                                                                                                                                                             |
| Dependências              | F2-04                                                                                                                                                                                                                     |
| Módulos                   | `shared/` (novo), `frontend/src/config.js`, `backend/src/protocol.js`, `vite.config.js` (permitir import fora do root: `server.fs.allow`)                                                                                 |
| Critérios de conclusão    | `grep` sem literais de tipo/limite duplicados fora de `shared/`; build e modo "servido cru" funcionando (V02).                                                                                                            |
| Riscos                    | Servido sem build, `frontend/` não alcança `../shared/` — se V02 exigir esse modo, copiar `shared/` para `frontend/src/shared/` em script de build ou manter o arquivo dentro de `frontend/src/` e importá-lo do backend. |

### F2-06 — Parâmetros operacionais por ambiente (M15, P28)

| Campo                     | Conteúdo                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Variáveis com defaults atuais: `MAX_CONNECTIONS`, `MAX_PAYLOAD_BYTES`, `RATE_*`, `HISTORY_SIZE`, `HISTORY_ON_JOIN`, `HEARTBEAT_MS`; validação na inicialização; documentar em `.env.example`. |
| Prioridade / Complexidade | Baixa / Baixa                                                                                                                                                                                 |
| Dependências              | F2-03                                                                                                                                                                                         |
| Critérios de conclusão    | Teste: sem variáveis → comportamento idêntico; valor inválido → processo sai com mensagem clara.                                                                                              |
| Riscos                    | —                                                                                                                                                                                             |

### F2-07 — Logger estruturado e `/healthz` (M16, P26, P27)

| Campo                     | Conteúdo                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | `logger.js` emitindo JSON por linha (`ts`, `level`, `event`, campos); nunca registra conteúdo de mensagem; `GET /healthz` → `{ status: "ok", uptimeSec, connections, users }`; demais rotas → 404. |
| Prioridade / Complexidade | Baixa / Baixa                                                                                                                                                                                      |
| Dependências              | F2-03; V01 (rota de healthcheck configurada na plataforma)                                                                                                                                         |
| Critérios de conclusão    | Testes: cada linha de log é JSON válido; `/healthz` 200 com o formato; `/x` 404.                                                                                                                   |
| Riscos                    | Plataforma configurada para checar `/` — **alterar a configuração da plataforma antes do deploy** (V01).                                                                                           |

### F2-08 — Consolidar documentação (M14, P24)

| Campo                     | Conteúdo                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | `CONTRIBUTING.md` na raiz (atualizado com fluxo de testes); `read-model/` → `docs/historico/` com aviso de obsolescência; cabeçalho de `docs/design-system.md` corrigido; `evolucao.md` com as pendências reais. |
| Prioridade / Complexidade | Baixa / Baixa                                                                                                                                                                                                    |
| Dependências              | —                                                                                                                                                                                                                |
| Critérios de conclusão    | Nenhum documento atual cita `script.js`/`style.css`; links do README verificados.                                                                                                                                |
| Riscos                    | Links externos para `read-model/` quebram — manter redirecionamento por arquivo `read-model/README.md` apontando o novo local.                                                                                   |

---

## Fase 3 — Performance e otimização

> **Status: concluída em 2026-11-07**, com escopo redefinido pelo pedido da fase
> (performance, estabilidade, gerenciamento de conexões e monitoramento). Detalhes,
> medições antes/depois e riscos em
> [`FASE_3_RELATORIO_DE_IMPLEMENTACAO.md`](./FASE_3_RELATORIO_DE_IMPLEMENTACAO.md).
>
> | Tarefa                               | Situação                                                                                                                                           |
> | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
> | F3-01 Build enxuto                   | Pendente — aguarda V04                                                                                                                             |
> | F3-02 Fontes auto-hospedadas         | Pendente — aguarda V02                                                                                                                             |
> | F3-03 Renderização seletiva          | Concluída — layout −95 a −97 % (medido)                                                                                                            |
> | F3-04 Limite de mensagens no cliente | Não necessária — após F3-03, 2.000 mensagens custam 1,5 s de layout; cortar o histórico visível seria mudança funcional sem ganho que a justifique |
> | F3-05 Alinhar buffer do servidor     | Não necessária — ≤ 2 MB, sem efeito mensurável                                                                                                     |
> | F7-02 Teste de carga                 | Antecipada e concluída (`npm run load-test`)                                                                                                       |
>
> Feitas também, por evidência ou pedido: lista de pessoas agrupada (−96 % de volume
> em entradas simultâneas), limite de fila por conexão (cliente lento), teto de
> identidades aplicado na liberação, heartbeat tolerante (`HEARTBEAT_MAX_MISSED`),
> prazo de login (4001), `/readyz`, métricas (`/metrics` opcional + log periódico),
> encerramento controlado em falha fatal.

### F3-01 — Build enxuto (M18, P16)

| Campo                     | Conteúdo                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Descrição                 | Remover de `frontend/public/` tudo que não é referenciado (mover capturas para `docs/assets/` se V04 pedir); favicon referenciado por `/images/favicon.ico` **ou** por import — emitido uma vez. |
| Prioridade / Complexidade | Média / Baixa                                                                                                                                                                                    |
| Dependências              | V04                                                                                                                                                                                              |
| Critérios de conclusão    | `du -sh dist` < 150 KB; nenhum arquivo em `dist/` sem referência; favicon carregando nos 3 modos de servir.                                                                                      |
| Riscos                    | Favicon quebrar no modo servido cru (já ocorreu, refactor-report §10) — testar os 3 modos.                                                                                                       |

### F3-02 — Fontes auto-hospedadas (M19, P17)

| Campo                     | Conteúdo                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | `woff2` (subset latino, pesos 400/700 e 700/800) em `frontend/public/fonts/`; `@font-face` em `css/base/typography.css`; `preload` da fonte do corpo; remover Google da CSP e os `preconnect`. |
| Prioridade / Complexidade | Média / Baixa                                                                                                                                                                                  |
| Dependências              | F3-01                                                                                                                                                                                          |
| Critérios de conclusão    | Nenhuma requisição a domínios do Google; capturas antes/depois equivalentes; licença OFL das fontes registrada.                                                                                |
| Riscos                    | Peso extra no repositório (~100 KB) — aceitável.                                                                                                                                               |

### F3-03 — Renderização seletiva (M17, P19)

| Campo                     | Conteúdo                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Descrição                 | No `subscribe` de `main.js`, guardar o estado anterior e renderizar cada componente só se sua fatia mudou. |
| Prioridade / Complexidade | Baixa / Baixa                                                                                              |
| Dependências              | F2-01                                                                                                      |
| Critérios de conclusão    | Teste: 100 `user_typing` não disparam `people.render`. Comportamento visual inalterado.                    |
| Riscos                    | Esquecer uma dependência de fatia — testes por componente.                                                 |

### F3-04 — Limite de mensagens no cliente (M17, P20)

| Campo                     | Conteúdo                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Store mantém no máximo `CLIENT_HISTORY_MAX` (500); `messageList` remove os nós mais antigos sem repintar.                     |
| Prioridade / Complexidade | Baixa / Baixa                                                                                                                 |
| Dependências              | F1-10                                                                                                                         |
| Critérios de conclusão    | Após 600 mensagens: store com 500, DOM com 500, posição de rolagem preservada quando o usuário está no fim.                   |
| Riscos                    | Remoção de nós em `role="log"` — validar que leitores de tela não anunciam remoções (`aria-relevant="additions"` já garante). |

### F3-05 — Alinhar buffer do servidor (P35)

| Campo                     | Conteúdo                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | `HISTORY_SIZE` default igual a `HISTORY_ON_JOIN` (50), ou documentar a razão de manter 1000. Atualizar README (seção do buffer). |
| Prioridade / Complexidade | Baixa / Baixa                                                                                                                    |
| Dependências              | F2-06                                                                                                                            |
| Critérios de conclusão    | Teste: com 60 mensagens, quem entra recebe 50; memória do array ≤ `HISTORY_SIZE`. README coerente.                               |
| Riscos                    | Nenhum.                                                                                                                          |

---

## Fase 4 — Melhorias funcionais

> **Status: concluída em 2026-11-07**, com o escopo ampliado pelo pedido da fase
> (evolução funcional + sistema de comandos). Detalhes em
> [`FASE_4_RELATORIO_DE_IMPLEMENTACAO.md`](./FASE_4_RELATORIO_DE_IMPLEMENTACAO.md) e
> [`CHAT_COMMANDS.md`](./CHAT_COMMANDS.md).
>
> | Tarefa                            | Situação                                                                                                                                     |
> | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
> | F4-01 Sessão retomável sem avisos | Concluída — janela `LEAVE_GRACE_MS` (10 s)                                                                                                   |
> | F4-02 Confirmação de entrega      | Concluída — `clientMsgId`, estados enviando/não enviada, reenvio idempotente                                                                 |
> | F4-03 Fila offline com aviso      | Concluída de outra forma — mensagem na fila aparece como "enviando…" e o prazo só conta depois de sair pela rede                             |
> | F4-04 Código morto                | Parcial — `chat_cleared` voltou a ter emissor; `typingTracker.remove` e `status` passaram a ser usados; restam `dom.toggle` e textos antigos |
> | F4-05 Nomes distinguíveis         | Pendente — V07; `/users` mostra id curto                                                                                                     |
>
> Acrescentados: 28 comandos (registro central, executor único, autocomplete ARIA,
> `/help`), administração por `ADMIN_KEY`, moderação (`/clearall`, `/announce`,
> `/mute`, `/unmute`, `/kick` com hierarquia), presença (`/afk`), troca de nome
> (`/nick`), variedades e formatação de mensagem.

### F4-01 — Sessão retomável na reconexão (M08, P08)

| Campo                     | Conteúdo                                                                                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | `session` passa a incluir `resumeToken`; cliente guarda em memória (não em `localStorage`) e envia `resume { token }` ao reconectar; servidor mantém a identidade por 10 s após a queda e suprime `user_left`/`user_joined` se retomada. |
| Prioridade / Complexidade | Média / Média                                                                                                                                                                                                                            |
| Dependências              | F1-05, F1-06, F2-03                                                                                                                                                                                                                      |
| Módulos                   | `backend/src/room.js`, `backend/src/protocol.js`, `frontend/src/main.js`, `frontend/src/state/events.js`                                                                                                                                 |
| Critérios de conclusão    | Testes: reconexão < 10 s → terceiros não recebem eventos de saída/entrada; > 10 s → recebem; token inválido → login normal.                                                                                                              |
| Riscos                    | Token é segredo de sessão — gerar com `crypto.randomBytes(32)`, comparar em tempo constante, nunca logar.                                                                                                                                |

### F4-02 — Confirmação de entrega otimista (M20, P22)

| Campo                     | Conteúdo                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Envio com `clientMsgId`; mensagem aparece como `pending`; eco do servidor (com o mesmo `clientMsgId`) confirma; `rate_limited`/timeout de 10 s marcam falha com ação "tentar de novo". |
| Prioridade / Complexidade | Média / Média                                                                                                                                                                          |
| Dependências              | F1-10, F1-09                                                                                                                                                                           |
| Módulos                   | `frontend/src/state/*`, `frontend/src/ui/message.js`, `frontend/src/css/components/message.css`, backend `protocol.js`                                                                 |
| Critérios de conclusão    | Testes: pending → confirmado sem duplicar; falha mostra ação acessível por teclado; `check:contrast` cobre o novo estado visual se houver nova cor.                                    |
| Riscos                    | Duplicação em reenvio — servidor deduplica por `clientMsgId` por conexão (janela curta).                                                                                               |

### F4-03 — Fila offline com aviso de descarte (P21)

| Campo                     | Conteúdo                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| Descrição                 | Ao atingir 50 itens, bloquear novos envios com aviso (em vez de descartar o mais antigo). |
| Prioridade / Complexidade | Baixa / Baixa                                                                             |
| Dependências              | F2-01                                                                                     |
| Critérios de conclusão    | Teste do transporte: 51º envio não remove o 1º; UI informa o bloqueio.                    |
| Riscos                    | —                                                                                         |

### F4-04 — Limpeza de código morto (M13, P23)

| Campo                     | Conteúdo                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Remover `typingUsers`, `status` em `user_list` (ou passar a usar), `chat_cleared`, `dom.toggle`, chaves sem uso; usar `typingTracker.remove()` quando `user_left` trouxer `userId` (adicionar o campo, aditivo). |
| Prioridade / Complexidade | Baixa / Baixa                                                                                                                                                                                                    |
| Dependências              | F2-05                                                                                                                                                                                                            |
| Critérios de conclusão    | Cada item de P23 resolvido; lint/tipos/testes verdes.                                                                                                                                                            |
| Riscos                    | Remover `status` quebra cliente externo desconhecido — mantê-lo se houver dúvida.                                                                                                                                |

### F4-05 — Nomes distinguíveis (M22, P33)

| Campo                     | Conteúdo                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Descrição                 | Conforme V07: sufixo automático (`Ana (2)`) devolvido em `session.name`, ou recusa com `name_taken`. |
| Prioridade / Complexidade | Baixa / Baixa                                                                                        |
| Dependências              | F1-05, V07                                                                                           |
| Critérios de conclusão    | Teste: dois logins "Ana" → nomes distintos em `user_list` (ou recusa, conforme decisão).             |
| Riscos                    | Comparação deve ser case/acento-insensível (`localeCompare` com `sensitivity: "base"`).              |

---

## Fase 5 — UX/UI e acessibilidade

> **Status: em andamento — redesign completo de UI/UX entregue em 2026-11-07.**
> Detalhes em [`FASE_5_RELATORIO_DE_IMPLEMENTACAO.md`](./FASE_5_RELATORIO_DE_IMPLEMENTACAO.md)
> e no [`design-system.md`](./design-system.md) (v2).
>
> | Tarefa                      | Situação                                                                                |
> | --------------------------- | --------------------------------------------------------------------------------------- |
> | F5-01 Toasts anunciados     | Concluída — `role="status"`, toast só visual quando repete falha já anunciada           |
> | F5-02 Mensagens novas       | Pendente                                                                                |
> | F5-03 Tempo e data          | Parcial — `<time datetime>` em todas as horas; separador de data pendente               |
> | F5-04 Contador no composer  | Pendente                                                                                |
> | F5-05 Multilinha            | Pendente (V06)                                                                          |
> | F5-06 Auditoria a11y manual | Pendente — auditoria automática feita (axe-core: 0 violações em 16 estados, dois temas) |
>
> Acrescentado fora das tarefas originais: layout em painéis (barra lateral,
> conversa, pessoas) com gavetas em telas estreitas, cartão de pessoa com ações
> de moderação, modal de confirmação, dicas, esqueleto, agrupamento de mensagens,
> novo design system com contraste medido em 142 pares.

### F5-01 — Toasts anunciados (M07, P18)

| Campo                     | Conteúdo                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Erros passam pelo `announcer` (ou `role="alert"`); toasts informativos com `role="status"`. **Pode ser antecipada** — independente. |
| Prioridade / Complexidade | Alta / Baixa                                                                                                                        |
| Dependências              | —                                                                                                                                   |
| Critérios de conclusão    | Teste DOM: `error` → texto na região `[data-announcer]`; verificação com NVDA ou VoiceOver registrada no PR.                        |
| Riscos                    | Anúncio duplo (toast + announcer) — usar só um mecanismo.                                                                           |

### F5-02 — Indicador "mensagens novas" (M23)

| Campo                     | Conteúdo                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Quando o usuário não está no fim da lista e chega mensagem, exibir botão "N mensagens novas" que rola até o fim.                   |
| Prioridade / Complexidade | Média / Baixa                                                                                                                      |
| Dependências              | F3-03                                                                                                                              |
| Critérios de conclusão    | Botão alcançável por teclado, com rótulo atualizado, some ao chegar ao fim; tokens existentes (sem cor nova fora de `tokens.css`). |
| Riscos                    | Competir com a região live — o botão não é live region.                                                                            |

### F5-03 — Semântica de tempo e separador de data (M23, P32)

| Campo                     | Conteúdo                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Descrição                 | `<time datetime="ISO">`, `title` com data completa; separador "Hoje"/"Ontem"/data quando o dia muda. |
| Prioridade / Complexidade | Baixa / Baixa                                                                                        |
| Dependências              | —                                                                                                    |
| Critérios de conclusão    | Validador HTML sem avisos; separador aparece em teste com mensagens de dias distintos.               |
| Riscos                    | Fuso horário — usar o local do navegador e testar com `TZ` fixo.                                     |

### F5-04 — Contador e aviso de limite no composer (M21, P31)

| Campo                     | Conteúdo                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Descrição                 | Contador `n/1000` visível a partir de 800, associado por `aria-describedby`; aviso ao colar texto truncado. |
| Prioridade / Complexidade | Baixa / Baixa                                                                                               |
| Dependências              | F2-05 (limite vindo do contrato)                                                                            |
| Critérios de conclusão    | Colar 1200 caracteres mostra aviso; contador anunciado de forma não intrusiva (não a cada tecla).           |
| Riscos                    | Verbosidade em leitor de tela — anunciar só ao cruzar limiares.                                             |

### F5-05 — Mensagens multilinha (M21) — condicional a V06

| Campo                     | Conteúdo                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | `<textarea>` com Enter envia e Shift+Enter quebra linha; servidor preserva `\n` (remove `\r` e demais controles); CSS `white-space: pre-wrap`; limite de linhas. |
| Prioridade / Complexidade | Baixa / Média                                                                                                                                                    |
| Dependências              | V06, F1-03                                                                                                                                                       |
| Critérios de conclusão    | Teste de servidor: `\n` preservado, `\r` e `\x00` removidos; log continua de uma linha (logger escapa).                                                          |
| Riscos                    | Reabrir log injection — o logger estruturado (F2-07) é pré-requisito.                                                                                            |

### F5-06 — Auditoria de acessibilidade manual

| Campo                     | Conteúdo                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Roteiro com NVDA+Firefox, VoiceOver+Safari, TalkBack+Chrome: entrada, envio, recebimento, reconexão, falha, troca de tema, zoom 200 % e 400 %. |
| Prioridade / Complexidade | Média / Média                                                                                                                                  |
| Dependências              | F5-01..F5-04                                                                                                                                   |
| Critérios de conclusão    | Relatório em `docs/a11y-verificacao.md` com resultado por passo e defeitos abertos como tarefas.                                               |
| Riscos                    | —                                                                                                                                              |

---

## Fase 6 — Atualizações tecnológicas

Regra: **uma ferramenta por PR**, com CI verde e, para o Vite, E2E (F7-01) verde.

### F6-01 — Correções transitivas (M24)

| Campo                     | Conteúdo                                                                     |
| ------------------------- | ---------------------------------------------------------------------------- |
| Descrição                 | `npm audit fix` (sem `--force`) na raiz; registrar avisos remanescentes.     |
| Prioridade / Complexidade | Média / Baixa                                                                |
| Dependências              | F2-02                                                                        |
| Critérios de conclusão    | Apenas avisos que exigem major do Vite permanecem; lint/build/testes verdes. |
| Riscos                    | Baixo.                                                                       |

### F6-02 — Fixar versão do Node (M27, P25)

| Campo                     | Conteúdo                                                                          |
| ------------------------- | --------------------------------------------------------------------------------- |
| Descrição                 | `engines.node` em ambos os `package.json`, `.nvmrc`, README e CI coerentes (V05). |
| Prioridade / Complexidade | Baixa / Baixa                                                                     |
| Dependências              | V05                                                                               |
| Critérios de conclusão    | `npm ci` com Node fora da faixa emite aviso; CI usa a versão do `.nvmrc`.         |
| Riscos                    | —                                                                                 |

### F6-03 — Upgrade do Vite para a major corrente (M25, P15)

| Campo                     | Conteúdo                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Atualizar `vite` revisando o guia de migração de cada major intermediária; validar `root`, `publicDir`, `envDir`, `build.target`. |
| Prioridade / Complexidade | Média / Média                                                                                                                     |
| Dependências              | **F7-01**, F6-01                                                                                                                  |
| Critérios de conclusão    | `npm audit` da raiz sem avisos altos; E2E verde nos 3 modos de servir; tamanho do bundle não aumenta > 10 %.                      |
| Riscos                    | Requisito de versão mínima do Node da nova major — confirmar contra V05.                                                          |

### F6-04 — `ws` patch

| Campo                     | Conteúdo                                              |
| ------------------------- | ----------------------------------------------------- |
| Descrição                 | `ws` 8.21.3 → última 8.x.                             |
| Prioridade / Complexidade | Baixa / Baixa                                         |
| Dependências              | F1-01                                                 |
| Critérios de conclusão    | Suíte de integração verde; `npm audit` backend limpo. |
| Riscos                    | Baixo.                                                |

### F6-05 — Ferramentas de qualidade (M26)

| Campo                     | Conteúdo                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Descrição                 | Avaliar, uma por PR: ESLint 10 (+`@eslint/js`, `globals`), Stylelint 18 (+config), TypeScript (checagem). Só aplicar se o custo de ajuste for baixo; caso contrário, registrar e adiar.                |
| Prioridade / Complexidade | Baixa / Média                                                                                                                                                                                          |
| Dependências              | F2-02                                                                                                                                                                                                  |
| Critérios de conclusão    | Para cada ferramenta: PR verde **ou** nota justificando o adiamento. As regras de projeto (proibição de `innerHTML`, tokens no CSS) continuam ativas — testar com um arquivo de prova que deve falhar. |
| Riscos                    | Regra customizada do Stylelint mudar de nome/semântica.                                                                                                                                                |

---

## Fase 7 — Testes e validação

### F7-01 — E2E de fumaça com Playwright

| Campo                     | Conteúdo                                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Dois contextos de navegador entram, trocam mensagens, verificam "Você", presença, digitação, reconexão (servidor reiniciado) e falha (servidor parado). Executar nos 3 modos: `vite dev`, `dist/` servido, `frontend/` servido cru (se V02). |
| Prioridade / Complexidade | Alta / Média                                                                                                                                                                                                                                 |
| Dependências              | F1-06; deve preceder F6-03                                                                                                                                                                                                                   |
| Módulos                   | `e2e/` (novo), `package.json` (`test:e2e`), CI (job separado)                                                                                                                                                                                |
| Critérios de conclusão    | Job de CI verde; captura de tela anexada como artefato em falha; execução local documentada no README.                                                                                                                                       |
| Riscos                    | Instabilidade — esperar por estados (`data-state="live"`), não por tempo.                                                                                                                                                                    |

### F7-02 — Teste de carga

| Campo                     | Conteúdo                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Descrição                 | Script em `scripts/load.mjs`: N conexões (100, 300, 500), M mensagens/s; medir latência p50/p95 de broadcast, memória e CPU. |
| Prioridade / Complexidade | Média / Média                                                                                                                |
| Dependências              | F2-06, F1-11                                                                                                                 |
| Critérios de conclusão    | Relatório em `docs/carga.md` com números e limites recomendados (alimenta V09).                                              |
| Riscos                    | Executar só em ambiente local/staging — nunca contra produção sem autorização.                                               |

### F7-03 — Acessibilidade automatizada

| Campo                     | Conteúdo                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| Descrição                 | `@axe-core/playwright` nas telas de entrada, sala vazia, sala com mensagens, falha; nos dois temas. |
| Prioridade / Complexidade | Média / Baixa                                                                                       |
| Dependências              | F7-01                                                                                               |
| Critérios de conclusão    | Zero violações "serious"/"critical"; job na CI.                                                     |
| Riscos                    | Falsos positivos — documentar exceções com justificativa.                                           |

---

## Fase 8 — Evolução futura

Todas condicionadas a decisões de produto (V01, V08).

| ID    | Descrição                                                                                                                                                                                                    | Objetivo                                    | Prioridade | Complexidade | Dependências                       | Módulos                                     | Critérios de conclusão                                                                                                                | Riscos                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------- | ------------ | ---------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| F8-01 | Deploy declarativo (ex.: `render.yaml` ou `Dockerfile`) com cabeçalhos HTTP: CSP com `frame-ancestors 'none'`, `connect-src` restrito ao host real, HSTS, `Referrer-Policy`, `Permissions-Policy` (M33, P29) | Segurança no transporte e reprodutibilidade | Média      | Média        | V01, F2-07                         | raiz, `frontend/index.html`                 | `curl -I` mostra os cabeçalhos; observatório de segurança (ex.: Mozilla Observatory) nota ≥ B+                                        | Quebrar conexão se `connect-src` errado — validar em staging                |
| F8-02 | Anti-abuso sem moderação central: silenciar pessoa localmente (N04) e bloqueio de mensagens repetidas (N05)                                                                                                  | Reduzir spam mantendo anonimato             | Média      | Baixa        | F1-05                              | `frontend/src/state`, `backend/src/room.js` | Testes: mensagem idêntica 3× em 10 s recusada; pessoa silenciada some só localmente                                                   | Falsos positivos em mensagens curtas ("ok")                                 |
| F8-03 | Escala horizontal: Redis pub/sub para broadcast, presença e histórico (M29, P34)                                                                                                                             | Mais de uma instância                       | Baixa      | Alta         | F2-03, F7-02 mostrando necessidade | `backend/src/room.js`                       | Duas instâncias formam uma só sala em teste                                                                                           | Custo de infraestrutura; contraria simplicidade — só com dados de carga     |
| F8-04 | PWA: manifest, ícones, service worker sem cache de mensagens (N08)                                                                                                                                           | Instalação e notificações em mobile         | Baixa      | Média        | F3-01                              | `frontend/`                                 | Lighthouse "installable"; notificações funcionam em Android                                                                           | Service worker cacheando versão antiga — estratégia network-first para HTML |
| F8-05 | Menções `@nome` e links clicáveis criados via DOM (N03, N06)                                                                                                                                                 | Usabilidade em sala movimentada             | Baixa      | Média        | F4-05                              | `frontend/src/ui/message.js`                | Testes: `javascript:` nunca vira link; links com `rel="noopener noreferrer nofollow"`; lint `no-restricted-properties` continua verde | XSS por URL — allowlist de esquemas `http(s)`                               |

---

## Estratégia de implementação

### Princípios

1. **Incremental:** um PR por tarefa; PRs pequenos (< 400 linhas alteradas, exceto F2-03).
2. **Preservar funcionalidades:** nenhuma funcionalidade listada na §6 da análise é
   removida; mudanças de comportamento visível são descritas no PR com antes/depois.
3. **Compatibilidade retroativa do protocolo:** só mudanças aditivas (novos tipos,
   novos campos opcionais). O servidor tolera clientes antigos; o cliente tolera
   servidor antigo. Mudanças que exigem os dois lados (F1-05 + F1-06) são publicadas
   **no mesmo release**, com o servidor primeiro.
4. **Teste antes da correção:** cada correção de defeito começa com um teste que
   falha reproduzindo o defeito.

### Branches e versionamento

| Item                 | Convenção                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch principal     | `main`, protegida: PR obrigatório, CI verde, 1 revisão                                                                                                                          |
| Branches de trabalho | `fase-N/FN-XX-descricao-curta` (ex.: `fase-1/F1-05-identidade-servidor`)                                                                                                        |
| Commits              | Convencionais em português, como já usado no histórico (`fix:`, `security:`, `refactor:`, `feat:`, `docs:`, `test:`, `ci:`)                                                     |
| Versionamento        | SemVer nos dois `package.json`; tag `vX.Y.Z` ao fim de cada fase. Sugestão: Fase 1 → `1.1.0`, Fase 2 → `1.2.0`; mudança incompatível de protocolo (se um dia ocorrer) → `2.0.0` |
| Changelog            | `CHANGELOG.md` (Keep a Changelog) atualizado em cada PR                                                                                                                         |

### Revisão de código

Checklist do revisor: (1) testes cobrem o critério de conclusão; (2) nenhum
`innerHTML`/literal de cor fora de tokens (o lint já impõe); (3) mudança de protocolo
documentada em `docs/PROTOCOLO.md`; (4) nenhum dado de usuário novo em logs;
(5) README/`.env.example` atualizados se houver configuração nova.

### Migrações de dados

Não há banco de dados. O equivalente a "migração" é a **evolução do protocolo**:
versionar com campo opcional `v` (F2-05), manter o servidor aceitando o formato
anterior por pelo menos um release, e só então remover o legado.

### Plano de rollback

| Situação                                                 | Ação                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Regressão no frontend                                    | Republicar o `dist/` da tag anterior (artefato estático, sem estado).                                                               |
| Regressão no backend                                     | Redeploy da tag anterior; estado em memória é perdido de qualquer forma em restart (comportamento já documentado).                  |
| Mudança de protocolo coordenada (F1-05/06, F4-01, F4-02) | Rollback do **frontend primeiro**, depois do backend — o cliente novo tolera servidor antigo.                                       |
| Configuração (`.env`, healthcheck)                       | Manter os valores anteriores registrados no PR; F2-07 exige ajustar a rota de healthcheck **na plataforma** antes e reverter junto. |

### Validação após cada fase

| Fase | Portão de saída                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Todos os testes de defeito (P01, P02, P04–P07, P09–P11) verdes; verificação manual com 2 navegadores registrada; deploy em staging (se houver) por 24 h sem erro no log. |
| 2    | CI com testes e auditoria; refactor sem alteração da suíte de integração; documentação consolidada.                                                                      |
| 3    | `dist` < 150 KB; nenhuma requisição externa; Lighthouse Performance ≥ 95 (registrado).                                                                                   |
| 4    | Testes de sessão retomável e confirmação de entrega; E2E manual de reconexão.                                                                                            |
| 5    | Relatório de a11y manual (F5-06) sem defeito crítico aberto.                                                                                                             |
| 6    | `npm audit` limpo (raiz e backend); E2E verde.                                                                                                                           |
| 7    | E2E, carga e axe na CI; limites operacionais documentados.                                                                                                               |
| 8    | Por tarefa.                                                                                                                                                              |

### Documentação contínua

A cada PR: atualizar o status no [quadro de acompanhamento](#quadro-de-acompanhamento)
abaixo, o README quando houver mudança de uso/configuração, e `docs/PROTOCOLO.md`
quando houver mudança de mensagem.

---

## Plano de testes e validação

| Camada                 | Ferramenta                                    | O que cobre                                                                                      | Onde                               | Quando roda                          |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------ |
| Unidade (backend)      | `node --test`                                 | `rateLimiter`, `protocol` (`parseEnvelope`, normalização), `room` (regras)                       | `backend/test/unit/`               | `npm test`, CI                       |
| Integração (protocolo) | `node --test` + cliente `ws`                  | Login, sessão, mensagens, histórico, digitação, rate limit, payload, origem, heartbeat, shutdown | `backend/test/integration/`        | `npm test`, CI                       |
| Unidade (frontend)     | `node --test` (+ `happy-dom` se adotado)      | Store, tradutor de eventos, typing, transporte (backoff/fila), formatação                        | `frontend/test/`                   | `npm test`, CI                       |
| Estático               | ESLint, Stylelint, `tsc`, Prettier, contraste | Regras de projeto, tipos, tokens, contraste                                                      | —                                  | `npm run lint`, CI (já existe)       |
| E2E                    | Playwright                                    | Fluxos ponta a ponta em 3 modos de servir                                                        | `e2e/`                             | CI (job separado)                    |
| Acessibilidade         | axe + roteiro manual                          | WCAG 2.2 AA                                                                                      | `e2e/`, `docs/a11y-verificacao.md` | CI + por release                     |
| Carga                  | `scripts/load.mjs`                            | Latência, memória, limites                                                                       | `docs/carga.md`                    | Por release / sob demanda            |
| Dependências           | `npm audit`                                   | Vulnerabilidades                                                                                 | CI                                 | Todo PR + CodeQL semanal (já existe) |

**Cenários obrigatórios de regressão** (derivados dos testes executados nesta análise):

| #   | Cenário                                       | Resultado esperado após as correções                        |
| --- | --------------------------------------------- | ----------------------------------------------------------- |
| 1   | Duas conexões com o mesmo `userId`            | Ids distintos atribuídos pelo servidor                      |
| 2   | 45+ sinais de digitação e depois uma mensagem | Mensagem entregue                                           |
| 3   | `chat_message` sem payload; frame `null`      | `invalid_message`, sem stack no log                         |
| 4   | `type` contendo `\n`                          | Log de uma linha                                            |
| 5   | Nome só com espaços                           | `invalid_name`, sem `user_joined`                           |
| 6   | 5 `user_login` na mesma conexão               | 1 `user_joined`                                             |
| 7   | `.env` na raiz com `VITE_SOCKET_URL`          | Valor presente no bundle                                    |
| 8   | Reconexão com histórico                       | Lista não é repintada                                       |
| 9   | Payload de 5 MiB                              | Conexão fechada com 1009, processo saudável (já passa hoje) |
| 10  | Origem fora da allowlist                      | 403 no handshake (já passa hoje)                            |

---

## Quadro de acompanhamento

Atualize a coluna **Status** (`pendente` · `em andamento` · `concluída` · `adiada`)
em cada PR.

| ID    | Tarefa                                | Fase | Prioridade | Complexidade | Depende de   | Status                             |
| ----- | ------------------------------------- | ---- | ---------- | ------------ | ------------ | ---------------------------------- |
| F1-01 | Harness de testes do protocolo        | 1    | Crítica    | Média        | —            | concluída                          |
| F1-02 | Configuração de ambiente coerente     | 1    | Alta       | Baixa        | F1-01        | concluída                          |
| F1-03 | Validação de envelope e log seguro    | 1    | Alta       | Baixa        | F1-01        | concluída                          |
| F1-04 | Login único e nome obrigatório        | 1    | Alta       | Baixa        | F1-03        | concluída                          |
| F1-05 | Identidade pelo servidor (servidor)   | 1    | Crítica    | Média        | F1-04        | concluída                          |
| F1-06 | Identidade pelo servidor (cliente)    | 1    | Crítica    | Baixa        | F1-05        | concluída                          |
| F1-07 | Throttle de digitação                 | 1    | Alta       | Baixa        | F1-01        | concluída                          |
| F1-08 | Baldes separados + `rate_limited`     | 1    | Alta       | Baixa        | F1-03        | concluída                          |
| F1-09 | Feedback de mensagem recusada         | 1    | Alta       | Baixa        | F1-08        | concluída                          |
| F1-10 | Preservar ids / mesclar histórico     | 1    | Alta       | Baixa        | F1-01        | concluída                          |
| F1-11 | Heartbeat                             | 1    | Alta       | Baixa        | F1-01        | concluída                          |
| F1-12 | Shutdown gracioso                     | 1    | Baixa      | Baixa        | F1-11        | concluída                          |
| F2-01 | Testes unitários do frontend          | 2    | Alta       | Média        | F1-01        | concluída                          |
| F2-02 | CI completa                           | 2    | Alta       | Baixa        | F2-01        | concluída                          |
| F2-03 | Modularizar backend                   | 2    | Média      | Média        | F2-02        | concluída                          |
| F2-04 | Backend ESM + tipos                   | 2    | Baixa      | Baixa        | F2-03        | parcial (tipos aguardam aprovação) |
| F2-05 | Protocolo compartilhado               | 2    | Média      | Média        | F2-04        | concluída                          |
| F2-06 | Parâmetros por ambiente               | 2    | Baixa      | Baixa        | F2-03        | concluída                          |
| F2-07 | Logger + `/healthz`                   | 2    | Baixa      | Baixa        | F2-03, V01   | concluída                          |
| F2-08 | Consolidar documentação               | 2    | Baixa      | Baixa        | —            | concluída                          |
| F3-01 | Build enxuto                          | 3    | Média      | Baixa        | V04          | pendente (aguarda V04)             |
| F3-02 | Fontes auto-hospedadas                | 3    | Média      | Baixa        | F3-01        | pendente (aguarda V02)             |
| F3-03 | Renderização seletiva                 | 3    | Baixa      | Baixa        | F2-01        | concluída                          |
| F3-04 | Limite de mensagens no cliente        | 3    | Baixa      | Baixa        | F1-10        | não necessária (medido)            |
| F3-05 | Alinhar buffer do servidor            | 3    | Baixa      | Baixa        | F2-06        | não necessária (medido)            |
| F4-01 | Sessão retomável                      | 4    | Média      | Média        | F1-06, F2-03 | concluída                          |
| F4-02 | Confirmação de entrega                | 4    | Média      | Média        | F1-10, F1-09 | concluída                          |
| F4-03 | Fila offline com aviso                | 4    | Baixa      | Baixa        | F2-01        | concluída                          |
| F4-04 | Limpeza de código morto               | 4    | Baixa      | Baixa        | F2-05        | parcial                            |
| F4-05 | Nomes distinguíveis                   | 4    | Baixa      | Baixa        | F1-05, V07   | pendente (aguarda V07)             |
| F5-01 | Toasts anunciados                     | 5    | Alta       | Baixa        | —            | concluída                          |
| F5-02 | Indicador de mensagens novas          | 5    | Média      | Baixa        | F3-03        | pendente                           |
| F5-03 | `<time datetime>` + separador de data | 5    | Baixa      | Baixa        | —            | parcial (falta separador)          |
| F5-04 | Contador no composer                  | 5    | Baixa      | Baixa        | F2-05        | pendente                           |
| F5-05 | Multilinha                            | 5    | Baixa      | Média        | V06, F2-07   | pendente                           |
| F5-06 | Auditoria a11y manual                 | 5    | Média      | Média        | F5-01..04    | pendente                           |
| F6-01 | `npm audit fix` transitivas           | 6    | Média      | Baixa        | F2-02        | pendente                           |
| F6-02 | Fixar Node                            | 6    | Baixa      | Baixa        | V05          | pendente                           |
| F6-03 | Vite major                            | 6    | Média      | Média        | F7-01, F6-01 | pendente                           |
| F6-04 | `ws` patch                            | 6    | Baixa      | Baixa        | F1-01        | pendente                           |
| F6-05 | Ferramentas de qualidade              | 6    | Baixa      | Média        | F2-02        | pendente                           |
| F7-01 | E2E Playwright                        | 7    | Alta       | Média        | F1-06        | pendente                           |
| F7-02 | Teste de carga                        | 7    | Média      | Média        | F2-06, F1-11 | concluída (antecipada na Fase 3)   |
| F7-03 | Axe automatizado                      | 7    | Média      | Baixa        | F7-01        | pendente                           |
| F8-01 | Deploy declarativo + cabeçalhos       | 8    | Média      | Média        | V01, F2-07   | pendente                           |
| F8-02 | Anti-abuso local                      | 8    | Média      | Baixa        | F1-05        | pendente                           |
| F8-03 | Escala horizontal                     | 8    | Baixa      | Alta         | F2-03, F7-02 | pendente                           |
| F8-04 | PWA                                   | 8    | Baixa      | Média        | F3-01        | pendente                           |
| F8-05 | Menções e links                       | 8    | Baixa      | Média        | F4-05        | pendente                           |
