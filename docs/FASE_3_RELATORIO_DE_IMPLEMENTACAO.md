# Fase 3 · Relatório de implementação

> **Data:** 2026-11-07 · **Branch:** `claude/quirky-brown-37zb70` · **Base:** commit
> `35b6f64` (fim da Fase 2).
> Escopo definido pelo pedido da Fase 3 (performance, estabilidade, gerenciamento de
> conexões e monitoramento). Referências: [`ROADMAP_DE_IMPLEMENTACAO.md`](./ROADMAP_DE_IMPLEMENTACAO.md),
> relatórios das [Fases 1](./FASE_1_RELATORIO_DE_IMPLEMENTACAO.md) e
> [2](./FASE_2_RELATORIO_DE_IMPLEMENTACAO.md), [`PROTOCOLO.md`](./PROTOCOLO.md).

## 1. Resumo executivo

**Objetivo:** tornar o sistema mais estável, eficiente e observável sob uso real —
muitas entradas simultâneas, redes instáveis, clientes abusivos — sem mudar
funcionalidade, protocolo ou interface, e com toda otimização justificada por
medição antes e depois.

**Resultado.** Medições de referência revelaram quatro problemas reais, todos
corrigidos e medidos de novo:

| Problema (evidência)                                                                                 | Correção                                          | Resultado                                                                           |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 200 entradas simultâneas geravam **200 MB** de listas de pessoas (O(N²) por entrada)                 | Lista agrupada numa janela de 50 ms               | **7,7 MB (−96 %)**; tempo de entrada 877 → 242 ms; p95 com 300 conexões 140 → 25 ms |
| Um cliente que para de ler fazia o servidor bufferizar **+56 MB** sem teto                           | Limite de fila por conexão (`MAX_BUFFERED_BYTES`) | Cliente desconectado; os demais seguem recebendo                                    |
| Identidades liberadas chegavam a **28.600** entre varreduras (teto de 2.000 só aplicado a cada 30 s) | Teto aplicado na liberação                        | Constante em ~2.040; heap máx. 36,7 → 29,6 MB                                       |
| Navegador gastava **43 s de layout** para exibir 2.000 mensagens                                     | Renderização seletiva e agrupada por quadro       | **1,5 s (−97 %)**; exibição em 2,7 s em vez de 55 s                                 |

E três melhorias de estabilidade exigidas pelo pedido: heartbeat tolerante a
oscilações, prazo de login (o heartbeat não mantém conexões não autorizadas) e
encerramento controlado em falhas fatais. Monitoramento: `/readyz`, `/metrics`
(opcional) e log periódico de métricas. Teste de carga versionado
(`npm run load-test`).

**Testes:** 160 → **193**, todos verdes; testes de segurança das Fases 1 e 2
inalterados e verdes; dois testes funcionais em navegador (33 verificações) verdes.

### Relação com o roadmap

O escopo pedido para esta fase difere das tarefas F3-01 a F3-05 do roadmap
(planejadas antes das Fases 1 e 2). Situação de cada uma:

| Tarefa                                                                                                             | Situação                   | Motivo                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| F3-01 Build enxuto                                                                                                 | **Pendente**               | Mexe nos arquivos servidos; depende da decisão V04 (imagens)                                                                               |
| F3-02 Fontes auto-hospedadas                                                                                       | **Pendente**               | Depende de V02 (modo sem build); fora do foco de comunicação desta fase                                                                    |
| F3-03 Renderização seletiva                                                                                        | **Concluída**              | Medição: −95 a −97 % de layout                                                                                                             |
| F3-04 Limite de mensagens no cliente                                                                               | **Não necessária**         | Após F3-03, 2.000 mensagens custam 1,5 s de layout no total; cortar o histórico visível seria mudança funcional sem ganho que a justifique |
| F3-05 Alinhar buffer do servidor                                                                                   | **Não necessária**         | 1.000 mensagens ocupam no máximo ~1–2 MB; reduzir não muda nada mensurável                                                                 |
| F7-02 Teste de carga                                                                                               | **Antecipada e concluída** | Pedido explícito desta fase                                                                                                                |
| Novas: heartbeat tolerante, prazo de login, cliente lento, teto de identidades, métricas, `/readyz`, falhas fatais | **Concluídas**             | Pedido desta fase + evidências                                                                                                             |

## 2. Diagnóstico inicial

### 2.1 Estado encontrado

Arquitetura modular da Fase 2 (`room/` sem rede; `transport/` com conexão, HTTP,
heartbeat). Já existiam: heartbeat simples (Fase 1: encerra após 1 ping sem resposta),
desligamento gracioso, `/healthz`, limites de taxa separados. Árvore limpa, 160
testes verdes.

### 2.2 Análise de código (hipóteses)

| Ponto                                                                  | Hipótese                                                     | Confirmado por medição?                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `broadcastUserList` a cada entrada/saída envia a lista inteira a todos | Custo O(N²) por entrada; O(N³) numa tempestade de reconexões | **Sim** (cenários B, C, E)                                                                                                                   |
| `deliver` envia sem olhar a fila de saída                              | Cliente que não lê acumula memória no servidor               | **Sim** (+56 MB)                                                                                                                             |
| `sweep` só no heartbeat                                                | Teto de identidades violado entre varreduras                 | **Sim** (28.600)                                                                                                                             |
| `main.js` redesenha tudo em toda mudança de estado                     | Layout forçado por evento, O(n) por mensagem                 | **Sim** (43 s)                                                                                                                               |
| Conexão sem login ocupa vaga indefinidamente (responde ao ping)        | Recurso preso por conexão não autorizada                     | Sim, por análise; coberto por teste                                                                                                          |
| Heartbeat derruba após 1 ping perdido                                  | Pouca tolerância a oscilação                                 | Sim, por análise                                                                                                                             |
| `JSON.stringify` por destinatário                                      | Serialização repetida                                        | **Não**: o broadcast já serializa uma vez (Fase 2)                                                                                           |
| `history.shift()` em array de 1.000                                    | Custo por mensagem                                           | **Não** relevante: microssegundos                                                                                                            |
| Listeners e timers por conexão                                         | Acúmulo                                                      | **Não**: listeners morrem com o socket; WeakMap; nenhum timer por conexão até esta fase (o novo, de login, é cancelado no `close` — testado) |

### 2.3 Método de medição

`scripts/load-test.mjs` sobe uma instância **própria** do backend numa porta livre e
mede CPU e RSS do processo por fora (`/proc`), funcionando também no código anterior,
sem instrumentação. Latência = envio → recebimento, no mesmo relógio (clientes no
mesmo processo). Máquina: 4 CPUs, Node 22. Os clientes rodam num processo só: em
cargas altas parte da latência é do gerador; os números servem para **comparar
versões na mesma máquina**. Frontend: Chromium via Playwright com métricas de CPU do
DevTools (`Performance.getMetrics`), 150 bots reais na sala.

## 3. Métricas de referência e comparação antes/depois

### 3.1 Backend (`npm run load-test`)

| Cenário / métrica                                                      | Antes                     | Depois                                     |
| ---------------------------------------------------------------------- | ------------------------- | ------------------------------------------ |
| **A** uso normal (5 pessoas): latência p50 / p95                       | 0,74 / 1,27 ms            | 0,99 / 1,59 ms (variação < 0,35 ms, ruído) |
| **B** 200 entradas simultâneas: tempo até todos verem a lista completa | 877 ms                    | **242 ms**                                 |
| **B** volume recebido na entrada                                       | 200,3 MB / 40.200 quadros | **7,7 MB** / 20.576 quadros                |
| **B** CPU do servidor                                                  | 0,53 s                    | 0,42 s                                     |
| **B** chat com 200 pessoas: p50 / p95                                  | 10,2 / 18,1 ms            | 11,5 / 20,3 ms (inalterado)                |
| **C** 30 residentes + ~1.900 visitantes em 30 s: volume recebido       | 362,6 MB                  | **48,8 MB**                                |
| **C** CPU do servidor                                                  | 2,06 s                    | 1,81 s                                     |
| **D** queda abrupta detectada                                          | 21 ms                     | 61 ms (inclui a janela de 50 ms da lista)  |
| **D** reconexão de 20 com token: lista correta                         | 47 ms                     | 55 ms                                      |
| **D** cliente pendurado removido (heartbeat 1 s)                       | 1,9 s                     | 2,8 s (tolerância: 2 pings perdidos)       |
| **D** saudáveis que continuaram / identidades retomadas                | 40/40, 20/20              | 40/40, 20/20                               |
| **E** 200 conexões: p50 / p95                                          | 12,2 / 91,8 ms            | 9,1 / **16,5 ms**                          |
| **E** 300 conexões: p50 / p95                                          | 18,2 / 140,2 ms           | 14,2 / **25,4 ms**                         |
| **E** 350 tentativas (teto 300): abertas / recusadas com 1013          | 300 / 50                  | 300 / 50                                   |
| **E** CPU do servidor                                                  | 1,36 s                    | 0,87 s                                     |

**Escolha da janela de agrupamento** (cenário B, medida):

| Janela               | Tempo de entrada | Volume   |
| -------------------- | ---------------- | -------- |
| sem agrupamento      | 877 ms           | 200,3 MB |
| 0 ms (próximo ciclo) | 265 ms           | 19,1 MB  |
| **50 ms (adotada)**  | 260 ms           | 7,7 MB   |
| 200 ms               | 289 ms           | 4,7 MB   |

### 3.2 Estabilidade prolongada (126 mil ciclos de entrar/sair em 100 s)

|   s | Identidades antes | Identidades depois | Heap depois (MB) | RSS depois (MB) |
| --: | ----------------: | -----------------: | ---------------: | --------------: |
|  10 |            12.340 |              2.040 |             29,6 |             113 |
|  20 |            25.260 |              2.040 |             24,3 |             122 |
|  30 |             2.840 |              2.040 |             23,9 |             123 |
|  60 |             2.900 |              2.040 |             23,7 |             123 |
| 100 |                 — |              2.040 |             23,0 |             124 |

Sem vazamento: RSS estável após 20 s; heap oscila com o coletor e volta. Atraso do
event loop p99 ≈ 23 ms sob ~1.300 entradas/saídas por segundo; processamento médio de
um quadro 0,15 ms.

### 3.3 Cliente lento

|                                              | Antes                               | Depois                                                                                                      |
| -------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1 cliente parado + 20.000 mensagens de ~1 KB | RSS +56 MB, cliente ainda conectado | Cliente desconectado ao passar de `MAX_BUFFERED_BYTES`; os demais continuam recebendo (teste de integração) |

### 3.4 Frontend (navegador real, 150 pessoas na sala)

| Fase                                   | Script antes → depois | Layout antes → depois | Estilo antes → depois | Tempo real             |
| -------------------------------------- | --------------------- | --------------------- | --------------------- | ---------------------- |
| 2.000 sinais de digitação              | 406 → **27 ms**       | 1.660 → **82 ms**     | 325 → 5 ms            | 2,5 s (ritmo do envio) |
| 2.000 mensagens                        | 3.672 → **211 ms**    | 43.447 → **1.472 ms** | 2.594 → 111 ms        | 55,0 → **2,7 s**       |
| 200 sinais com 2.000 mensagens na tela | 65 → **4 ms**         | 1.432 → **178 ms**    | 51 → 1 ms             | 1,7 s                  |

## 4. Alterações implementadas

### 4.1 Heartbeat tolerante

- Ping a cada `HEARTBEAT_MS` (30 s). **Pong ou qualquer quadro recebido** zera a
  contagem de pings sem resposta (`missed`, em `WeakMap`).
- A conexão só é encerrada após `HEARTBEAT_MAX_MISSED` (padrão **2**) pings seguidos
  sem nenhum sinal: detecção em 2–3 intervalos (60–90 s). Antes: 1 ping perdido
  derrubava (30–60 s).
- Distingue lento de morto: um cliente que responde a 1 de cada 3 pings, ou que só
  envia quadros, continua conectado (teste de integração); um mudo é removido.
- Tráfego: um ping (2 bytes + cabeçalho) por conexão a cada 30 s.
- O heartbeat **não** mantém conexão sem login: o prazo de login (4.2) vale
  independentemente de a conexão responder ao ping.

### 4.2 Ciclo de vida e limpeza de conexões

| Etapa                     | Garantia                                                                                             | Teste                |
| ------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| Abertura                  | Recusas contadas por motivo (`origin`, `capacity`, `shutting_down`)                                  | integração           |
| Prazo de login            | Sem `session` em `LOGIN_TIMEOUT_MS` (30 s) → fechamento **4001**; nome recusado não reinicia o prazo | unidade + integração |
| Fila de saída             | Acima de `MAX_BUFFERED_BYTES` (1 MiB) → `terminate` + log `slow_consumer`                            | integração           |
| Encerramento              | `close` cancela o timer de login, desfaz a participação e libera a identidade                        | unidade + integração |
| Identidades               | Teto aplicado na liberação; expiração para na primeira válida                                        | unidade + carga      |
| Lista de pessoas          | Agrupada (50 ms); envio pendente cancelado no desligamento                                           | unidade + integração |
| 200 ciclos de entrar/sair | Ao final: 0 conexões, 0 pessoas, 200 abertas = 200 fechadas                                          | integração           |

### 4.3 Comunicação

- **Lista de pessoas agrupada** (`room.js` + agendador injetado por
  `chatServer.js`): várias entradas/saídas em 50 ms geram um envio, com o estado final.
  O formato não mudou; o cliente já trata cada lista como a lista completa.
- **Sinais de digitação:** o throttle no cliente (1 a cada 2 s) já existia desde a
  Fase 1; a medição desta fase não indicou nada a mudar.
- **Serialização:** já era uma vez por broadcast (Fase 2). Compressão não foi
  adotada: quadros pequenos (< 1,2 KB) e nenhuma evidência de ganho.

### 4.4 Frontend (comunicação)

`frontend/src/state/renderLoop.js`: no máximo uma renderização por quadro de animação,
com o estado mais recente. `main.js` redesenha cada componente só se a parte do estado
de que ele depende mudou. Quando o servidor recusa o nome, a renderização é feita na
hora (a tela de entrada precisa estar visível antes de receber o foco). Nenhuma
mudança visual; o `role="log"` continua anunciando as mensagens novas.

### 4.5 Falhas e encerramento

| Situação                                     | Comportamento                                                                                                                                                                                                                                |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SIGTERM`/`SIGINT`                           | Para de aceitar conexões (`/readyz` → 503 `draining`), fecha clientes com 1001, cancela heartbeat, log de métricas e envio pendente da lista, fecha conexões HTTP ociosas, registra `metrics` finais e sai com 0; força a saída (1) após 5 s |
| Exceção ou promessa rejeitada sem tratamento | `fatal_error` com stack e origem → encerramento controlado com código 1 (a plataforma reinicia)                                                                                                                                              |
| Porta ocupada / configuração inválida        | `listen_failed` / `config_invalid`, saída 1 (Fase 2)                                                                                                                                                                                         |
| Erro numa conexão                            | Log `socket_error`; não afeta outras conexões (Fase 2)                                                                                                                                                                                       |
| Cliente some sem fechar                      | Heartbeat (4.1)                                                                                                                                                                                                                              |
| Cliente que não lê                           | Limite de fila (4.2)                                                                                                                                                                                                                         |

Nenhum mecanismo de retry foi adicionado ao servidor; a reconexão continua sendo do
cliente, com backoff e teto de tentativas (sem laço infinito).

## 5. Monitoramento

### 5.1 Health checks

| Rota           | Pergunta                               | Respostas                                                        |
| -------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `GET /healthz` | **Liveness** — o processo responde?    | `200`                                                            |
| `GET /readyz`  | **Readiness** — aceito conexões novas? | `200 ready` · `503 draining` (desligando) · `503 full` (no teto) |

Nenhuma expõe configuração, variáveis de ambiente, ids, nomes ou conteúdo.

### 5.2 Métricas (`backend/src/metrics.js`)

Disponíveis em `GET /metrics` (somente com `METRICS_ENABLED=true`) e numa linha de log
`metrics` a cada `METRICS_LOG_INTERVAL_MS` (60 s; `0` desliga) e no desligamento.

| Grupo      | Métricas                                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gauges     | `connections`, `users`, `identities`                                                                                                                            |
| Conexões   | `connectionsOpened`, `connectionsClosed`, `connectionsRejected{origin,capacity,shutting_down}`, `heartbeatTimeouts`, `loginTimeouts`, `slowConsumerDisconnects` |
| Eventos    | `framesReceived{tipo}`, `invalidFrames{motivo}`, `messagesAccepted`, `requestsRejected{código}`, `userListBroadcasts`                                           |
| Erros      | `errorsByCategory{protocol,validation,authorization,rate_limit,internal}`                                                                                       |
| Desempenho | `processing{frames, avgMs, p95Ms, maxMs}`, `eventLoopDelayMs{p50,p99,max}`                                                                                      |
| Processo   | `cpuPercent`, `rssMb`, `heapUsedMb`, `externalMb`                                                                                                               |

Rótulos com cardinalidade fechada (tipos do protocolo, códigos do catálogo, motivos
fixos): nenhum valor do cliente vira chave. No log periódico, as janelas (CPU, atraso
do event loop, máximo de processamento) são zeradas a cada linha.

**O que cada sinal indica:** `connections` subindo com `users` estável → conexões sem
login (ver `loginTimeouts`); `errorsByCategory.internal` > 0 → defeito do servidor
(procurar `handler_failed`); `heapUsedMb`/`rssMb` subindo sem `identities`/`users`
subirem → vazamento; `eventLoopDelayMs.p99` e `processing.maxMs` subindo → degradação;
`slowConsumerDisconnects`/`heartbeatTimeouts` altos → rede ou clientes problemáticos.

### 5.3 Logs novos

`client_disconnected` (com código), `login_timeout`, `slow_consumer`,
`heartbeat_timeout` (com `missedPings`), `metrics`, `fatal_error`; `shutdown_started`
agora informa `reason`. Proteções preservadas: JSON por linha, omissão de campos
sensíveis, nenhum conteúdo, nome ou token.

## 6. Testes

| Suíte                |  Fase 2 |  Fase 3 | Novos nesta fase                                                                                                                                                                                             |
| -------------------- | ------: | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend — unidade    |      58 |      77 | Agrupamento da lista (4), métricas (2), `/readyz` e `/metrics` (2), prazo de login e atividade (2), teto de identidades (3), validação de config (+6)                                                        |
| Backend — integração |      64 |      74 | Heartbeat tolerante, prazo de login (2), cliente lento, agrupamento com 30 entradas, `/metrics` desligado/ligado, 200 ciclos sem sobra, log periódico, `/readyz` + desligamento rápido com keep-alive aberto |
| Frontend — unidade   |      38 |      42 | Agendador de renderização (4)                                                                                                                                                                                |
| **Total**            | **160** | **193** |                                                                                                                                                                                                              |

Um teste da Fase 2 foi ajustado: `config.test.js` compara o objeto de configuração
inteiro e passou a incluir os cinco campos novos (os antigos mantêm os mesmos valores).

### Validação final

| Verificação                                                                                                | Resultado                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm test` (193)                                                                                           | Verde; backend repetido 3× sem falha                          |
| Regressão das Fases 1 e 2 (segurança, protocolo, contrato)                                                 | Verde, sem asserções alteradas                                |
| `npm run lint` (ESLint, Stylelint, tipos do frontend, contraste)                                           | Verde                                                         |
| `npm run format:check`, `npm run build`                                                                    | Verde                                                         |
| Inicialização (`npm start`) e configuração inválida (`HEARTBEAT_MAX_MISSED=0`)                             | Sobe e encerra com métricas finais; `config_invalid`, saída 1 |
| Dependências circulares                                                                                    | 39 módulos, 0 ciclos, 0 imports quebrados                     |
| `npm audit --omit=dev` (backend)                                                                           | 0                                                             |
| Carga (`npm run load-test`, cenários A–E)                                                                  | Ver §3                                                        |
| Funcional em navegador — Fase 2 (10 passos: 2 usuários, ids, digitação, queda, reconexão, lista, impostor) | 16/16                                                         |
| Funcional em navegador — Fase 1 (flood com aviso, texto devolvido, reinício do servidor sem duplicar)      | 17/17                                                         |

## 7. Segurança

Todas as proteções das Fases 1 e 2 seguem ativas e cobertas pelos mesmos testes:
identidade pelo servidor, personificação, participação na sala, limites separados,
validação de payload e de nome, login único, ids preservados, log injection.
Acréscimos desta fase que **reforçam** a segurança: prazo de login (conexão não
autorizada não ocupa vaga), limite de fila (memória do servidor não fica à mercê de
um cliente), teto de identidades efetivo, `/metrics` desligado por padrão.

## 8. Riscos residuais e limitações

| Item                                                  | Situação                                                                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Detecção de queda mais lenta (60–90 s com os padrões) | Escolha deliberada pela tolerância; ajustável (`HEARTBEAT_MS`, `HEARTBEAT_MAX_MISSED`)                                                                 |
| O navegador não vê pings do servidor                  | Se o servidor sumir sem fechar o TCP, o cliente só percebe pelo timeout do sistema. Resolver exige ping de aplicação — mudança de protocolo, não feita |
| Lista de pessoas com até 50 ms de atraso              | Imperceptível; medido                                                                                                                                  |
| `/metrics` sem autenticação quando ligado             | Expõe só contagens e uso de recursos; ligar apenas em rede interna ou atrás do proxy                                                                   |
| Gerador de carga num processo só                      | Latências altas incluem o gerador; comparar versões, não tratar como capacidade absoluta                                                               |
| Renderização agrupada por quadro                      | Em aba oculta, o navegador adia os quadros: a tela atualiza ao voltar (notificações não dependem disso)                                                |
| Teto de conexões verificado após o handshake          | Inalterado (P28)                                                                                                                                       |
| `uncaughtException` não é exercitado por teste        | Não há forma de provocá-lo sem injetar defeito; caminho revisado no código                                                                             |

## 9. Pendências e pré-requisitos para a Fase 4

- **F3-01 / F3-02** aguardam V04 e V02.
- **F2-04 (tipos do backend)** segue aguardando aprovação de `@types/node`.
- Fase 4 pode começar: F4-01 (sessão retomável sem avisos repetidos) e F4-02
  (confirmação de entrega) são mudanças localizadas em `room/room.js` e no cliente,
  agora com métricas para verificar o efeito.
- Push, merge e PR: **não realizados** — aguardam autorização.
