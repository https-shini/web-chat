# Fase 1 · Relatório de implementação

> **Data:** 2026-11-07 · **Branch:** `claude/quirky-brown-37zb70` · **Base:** commit
> `263768a` (documentação de análise).
> Referências: [`ROADMAP_DE_IMPLEMENTACAO.md`](./ROADMAP_DE_IMPLEMENTACAO.md) (tarefas
> F1-01 a F1-12) e [`ANALISE_E_PLANO_DE_MELHORIAS.md`](./ANALISE_E_PLANO_DE_MELHORIAS.md)
> (problemas `Pxx`).

## 1. Resumo

| Item                                      | Resultado                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Tarefas da Fase 1                         | **12 de 12 concluídas** (F1-01 a F1-12)                                    |
| Problemas corrigidos                      | P01, P02, P03, P04, P05, P06, P07, P09, P10, P11; P30 mitigado             |
| Problema novo encontrado e corrigido      | Conexões sem login recebiam tudo o que acontecia na sala (§3.9)            |
| Testes automatizados                      | 78 (55 de integração do backend + 23 de unidade do frontend), todos verdes |
| Validação em navegador real               | 17 verificações em 2 execuções, todas verdes (§5.3)                        |
| Lint, tipos, contraste, formatação, build | Verdes                                                                     |
| Dependências novas                        | **Nenhuma** (testes usam `node:test`, nativo do Node)                      |
| Mudança visual                            | Nenhuma (só textos novos de erro, nos componentes de aviso existentes)     |

## 2. Linha de base (antes das correções)

Os testes foram escritos **antes** das correções e executados contra o código
original: **54 testes, 0 passando**. A maior parte falhava por depender do evento
`session` e dos logs estruturados, que ainda não existiam; os demais reproduziam
diretamente os defeitos da auditoria (personificação, mensagem descartada após
digitação, nome vazio aceito, login repetido, log forjado, stack trace para quadro
inválido). O 55º teste (§3.9) foi acrescentado depois, ao descobrir o defeito.

## 3. Problemas corrigidos

### 3.1 Personificação de usuário — P01 (F1-05, F1-06) · CRÍTICA

**Antes:** o servidor aceitava o `userId` enviado pelo cliente. Copiar o id de
alguém (que é público, vai em `user_list`) fazia as próprias mensagens aparecerem
na tela da vítima rotuladas como "Você".

**Depois:**

- O servidor ignora `payload.userId` e gera o id (`crypto.randomUUID()`).
- Após o login, envia ao próprio cliente o evento novo
  `session { id, name, resumeToken }`, **antes** do histórico.
- Toda mensagem e todo sinal de digitação usam a identidade associada à conexão;
  campos de identidade no payload são ignorados.
- **Identidade estável na reconexão:** sem isso, cada reconexão geraria um id novo
  e as mensagens anteriores da pessoa deixariam de aparecer como "Você" — uma
  regressão. O `resumeToken` (32 bytes aleatórios) prova a posse da identidade.
  O servidor guarda só o hash SHA-256; o token é de uso único (rotacionado a cada
  retomada), expira 10 min após a desconexão, nunca é registrado em log e, no
  cliente, fica só em memória (fechar a aba encerra a identidade).
- Retomar enquanto a conexão antiga ainda consta (queda não detectada) substitui
  a antiga sem avisos de "saiu"/"entrou" e sem duplicar a lista.

### 3.2 Rate limit compartilhado — P02 (F1-07, F1-08, F1-09) · CRÍTICA

**Antes:** sinais de digitação (um por tecla) e mensagens dividiam o mesmo balde;
depois de uma rajada de digitação, a mensagem era descartada sem aviso.

**Depois:**

- **Servidor:** dois baldes por conexão — sinais (`typing_*`) e mensagens (todo o
  resto, inclusive login e quadros inválidos). Capacidade e taxa mantidas
  (40 / 8 por s em cada): a proteção contra flood não foi afrouxada, só separada.
  Sinal excedente continua descartado em silêncio; `chat_message` excedente recebe
  `error { code: "rate_limited" }`, no máximo um aviso por segundo (para não
  amplificar o flood).
- **Cliente:** `typing_start` é enviado no máximo a cada 2 s durante a digitação
  (`frontend/src/state/typingSignal.js`), abaixo dos 6 s de validade no receptor.
- **Feedback:** ao receber `rate_limited`, o cliente exibe "Sua mensagem não foi
  enviada…" e devolve ao campo o último texto enviado, se o campo estiver vazio.
  O cliente não exibe mensagens de forma otimista, então uma mensagem recusada
  nunca aparece como enviada.

### 3.3 Variáveis de ambiente — P03, P30 (F1-02) · ALTA

**Antes:** o Vite lia `frontend/.env` e o backend `backend/.env`; o `.env` da raiz,
documentado no `.env.example`, era ignorado pelos dois.

**Depois** (respeitando a arquitetura existente — um `.env` na raiz, como o
`.env.example` já indicava):

- `vite.config.js`: `envDir` aponta para a raiz; `VITE_SOCKET_URL` inválida (não
  `ws://`/`wss://`) **falha o build** com a causa; um `frontend/.env*` remanescente
  gera aviso ("não é mais lido").
- Backend: carrega `<raiz>/.env` e depois `backend/.env` por caminho absoluto. A
  precedência é ambiente do processo > raiz > `backend/.env` (mantido por
  compatibilidade com a instrução anterior do README).
- Validação na inicialização: `PORT` inteira entre 0 e 65535; cada origem de
  `ALLOWED_ORIGINS` normalizada (`https://Ok.Example/` → `https://ok.example`) ou
  recusada (sem esquema, com caminho, curinga, esquema não http). Configuração
  inválida → linha `config_invalid` com a variável e saída com código 1.
- Sem `ALLOWED_ORIGINS`: o servidor sobe (comportamento preservado, decisão V03
  pendente) e registra `allowed_origins_disabled` — como `warn` com
  `NODE_ENV=production`.
- Só variáveis `VITE_` chegam ao bundle: verificado que `ALLOWED_ORIGINS` no mesmo
  `.env` não aparece em `dist/`.

### 3.4 Log injection — P04 (F1-03) · ALTA

**Antes:** `console.log("Tipo de mensagem desconhecido:", message.type)` permitia
forjar linhas com `\n`.

**Depois:** todo log é **uma linha JSON** (`ts`, `level`, `event`, campos);
`JSON.stringify` escapa todo caractere de controle. O `type` desconhecido só
aparece como prévia de até 40 caracteres, escapada. Logs registram ids de conexão
e de usuário — nunca conteúdo de mensagem, nome ou token.

### 3.5 Payloads inválidos — P05 (F1-03) · ALTA

**Antes:** `chat_message` sem payload ou quadro `null` geravam `TypeError` com stack
trace no log e a resposta "Erro interno do servidor".

**Depois:** `parseEnvelope()` valida antes de qualquer lógica: binário, JSON
inválido, não-objeto, `type` ausente ou de tipo errado, `payload` não-objeto →
`invalid_message`; tipo desconhecido → `unknown_type`; conteúdo não-string →
`invalid_message`. Cada caso gera uma linha `warn` com `reason`, sem stack. A
conexão continua aberta. Erros internos de verdade continuam separados
(`handler_failed`, nível `error`, com stack, resposta `internal_error`).

### 3.6 Validação de nomes — P06 (F1-04) · ALTA

Servidor: nome vazio, só espaços, só caracteres de controle, ausente ou de tipo
errado → `invalid_name`, sem registrar nem anunciar. A recusa é recuperável (a
mesma conexão pode tentar de novo). Caracteres de controle internos viram espaço;
extremidades aparadas; limite de 30 mantido (corte, como antes).

Cliente: `normalizeName()` aplica **a mesma regra** antes de conectar, então o
erro aparece na própria tela de entrada. Se o servidor ainda assim recusar, o
cliente fecha a conexão e volta à tela do nome com a explicação.

### 3.7 Login repetido — P07 (F1-04) · ALTA

Um login por conexão. Tentativas seguintes → `already_logged_in`, sem trocar nome
ou id e sem novo "entrou na sala". Reconexão legítima (nova conexão) segue normal.

### 3.8 Identificadores de mensagem — P09 (F1-10) · MÉDIA/ALTA

**Antes:** o transporte descartava o `id` do envelope; mensagens ao vivo ganhavam
um UUID local e o histórico (com o id real) substituía a lista inteira na
reconexão, apagando os avisos de sistema.

**Depois:** o `id` chega ao estado; `addMessage` ignora id repetido; o histórico é
**mesclado** (só entra o que falta, no fim, na ordem do servidor). Verificado no
navegador: após reiniciar o servidor, nenhum item da lista foi redesenhado,
reordenado ou duplicado.

### 3.9 Defeito novo: espectador invisível · ALTA

Encontrado durante a investigação de um teste intermitente. `broadcast` enviava
para **toda conexão aberta**, inclusive as que nunca fizeram login. Uma conexão
anônima recebia mensagens, digitação e a lista de pessoas sem aparecer nessa lista.
Agora só conexões que entraram na sala recebem eventos dela; ao entrar, a conexão
recebe o histórico normalmente. Coberto por teste. Não afeta o cliente, que faz
login assim que conecta.

### 3.10 Heartbeat — P10 (F1-11) e desligamento gracioso — P11 (F1-12)

- Ping a cada `HEARTBEAT_MS` (padrão 30 s); quem não responde até o ciclo seguinte é
  encerrado, o que dispara a saída normal da sala. A limpeza de identidades
  expiradas roda no mesmo ciclo. Navegadores respondem ping automaticamente.
- `SIGTERM`/`SIGINT`: fecha os clientes com 1001, encerra o servidor HTTP e sai com
  código 0; força a saída (código 1) após 5 s se algo travar. Avisos de saída não
  são transmitidos durante o desligamento.

## 4. Arquivos

### Modificados

| Arquivo                                                                                                  | Mudança                                                                                       |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `backend/src/server.js`                                                                                  | Identidade, sessões, validação, baldes, logs, config, heartbeat, shutdown, broadcast restrito |
| `backend/package.json`                                                                                   | Script `test`                                                                                 |
| `frontend/src/main.js`                                                                                   | `resumeToken` em memória, sinal de digitação, reações a recusas                               |
| `frontend/src/state/events.js`                                                                           | Evento `session`, id preservado, histórico mesclado, erros com código                         |
| `frontend/src/state/store.js`                                                                            | `setIdentity`, `mergeHistory`, `leaveRoom`, deduplicação em `addMessage`                      |
| `frontend/src/transport/socket.js`                                                                       | Repassa `id` do envelope                                                                      |
| `frontend/src/config.js`                                                                                 | Validação de `VITE_SOCKET_URL`, `TIMING.typingSignalInterval`                                 |
| `frontend/src/ui/entry.js`                                                                               | `normalizeName` (mesma regra do servidor), `reset(message)`                                   |
| `frontend/src/ui/composer.js`                                                                            | `restoreDraft(text)`                                                                          |
| `frontend/src/i18n/strings.js`                                                                           | Textos `errors.rateLimited` e `errors.invalidName`                                            |
| `vite.config.js`                                                                                         | `envDir` na raiz, validação no build, aviso de `frontend/.env`                                |
| `eslint.config.js`                                                                                       | Regras para os arquivos de teste                                                              |
| `package.json`                                                                                           | Scripts `test`, `test:front`, `test:back`                                                     |
| `.env.example`                                                                                           | Local único na raiz, novas variáveis, regras de validação                                     |
| `README.md`                                                                                              | Configuração, testes, deploy, funcionalidades e status                                        |
| `docs/ROADMAP_DE_IMPLEMENTACAO.md`, `docs/ANALISE_E_PLANO_DE_MELHORIAS.md`, `docs/INVENTARIO_TECNICO.md` | Status real                                                                                   |

### Novos

| Arquivo                                     | Conteúdo                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `backend/test/helpers.js`                   | Harness: servidor como processo filho, clientes `ws`, captura de logs, barreira de ordenação |
| `backend/test/security.test.js`             | 10 testes                                                                                    |
| `backend/test/messages.test.js`             | 8 testes                                                                                     |
| `backend/test/connections.test.js`          | 8 testes                                                                                     |
| `backend/test/validation.test.js`           | 9 testes                                                                                     |
| `backend/test/logs.test.js`                 | 5 testes                                                                                     |
| `backend/test/config.test.js`               | 15 testes                                                                                    |
| `frontend/src/socketUrl.js`                 | Validação de URL compartilhada entre build e navegador                                       |
| `frontend/src/state/typingSignal.js`        | Throttle do sinal de digitação                                                               |
| `frontend/test/*.test.js` (5 arquivos)      | 23 testes                                                                                    |
| `docs/FASE_1_RELATORIO_DE_IMPLEMENTACAO.md` | Este relatório                                                                               |

## 5. Testes e resultados

### 5.1 Cobertura por área pedida

| Área         | Cenários cobertos (todos verificam comportamento observável)                                                                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Segurança    | Personificação copiando o id; troca de identidade por novo login; token forjado; acesso à sala sem login (falar e ouvir); identidade constante na conexão; allowlist (403, sem Origin, permitida)                                                                          |
| Mensagens    | Válida (id, autor, horário); vazia; tipo errado; 9 formatos de quadro inválido + binário + tipo desconhecido; 200 sinais de digitação + mensagem; flood com `rate_limited` e avisos limitados; id ao vivo = id no histórico; normalização e limite de 1000                 |
| Conexões     | Login normal; login repetido (×5); saída; reconexão com token (mesmo id, rotação, token antigo inválido); substituição de conexão antiga; histórico após a sessão; heartbeat; SIGTERM                                                                                      |
| Validações   | Nome vazio, espaços, controle, ausente; tipo errado; extremidades; acima do limite; controle interno; token de tipo errado                                                                                                                                                 |
| Logs         | Toda linha é JSON; injeção pelo `type`; parsing sem stack; ausência de conteúdo, nome e token; erros legítimos com contexto                                                                                                                                                |
| Configuração | `.env` da raiz lido; `backend/.env` legado; precedência raiz > legado; ambiente > arquivos; normalização de origens; 4 origens inválidas; 4 portas inválidas; aviso sem allowlist; HTTP 200                                                                                |
| Frontend     | `session`; "Você" pelo id do servidor; `session` malformada; id preservado; deduplicação; mesclagem na reconexão; servidor antigo sem id; `rate_limited`; `invalid_name`; erros genéricos; store; transporte com id; throttle (5 cenários); `isSocketUrl`; `normalizeName` |

Os testes de configuração copiam o servidor para um diretório temporário com a
mesma estrutura do repositório, para provar de onde o `.env` é lido **sem tocar em
nenhum `.env` real**.

### 5.2 Resultados

| Verificação                                          | Resultado                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `npm run test:back`                                  | 55/55 — **8 execuções consecutivas** sem falha                   |
| `npm run test:front`                                 | 23/23                                                            |
| `npm run lint` (ESLint, Stylelint, `tsc`, contraste) | Sem erros; 42 pares de contraste passam                          |
| `npm run format:check`                               | OK                                                               |
| `npm run build`                                      | OK (JS 15,8 KB; era 13,9 KB)                                     |
| `npm --prefix backend start`                         | Sobe, registra `server_listening`; SIGTERM → `shutdown_complete` |
| `npm --prefix backend audit`                         | 0 vulnerabilidades                                               |
| Build com `.env` na raiz                             | `VITE_SOCKET_URL` presente no bundle; `ALLOWED_ORIGINS` ausente  |
| Build com `VITE_SOCKET_URL=http://…`                 | Falha com "VITE_SOCKET_URL inválida"                             |
| Build com `frontend/.env`                            | Aviso "não é mais lido"; valor não usado                         |

Dois defeitos **do harness de teste** foram encontrados e corrigidos durante o
trabalho, e ficam registrados porque causavam falhas intermitentes: (1) um teste
que falhava antes de `stop()` deixava o servidor vivo e travava o runner; (2) uma
espera que resolvia de forma síncrona não removia o seu observador, que passava a
consumir mensagens destinadas a esperas seguintes.

### 5.3 Validação no navegador real

Roteiro Playwright (Chromium) com backend e `vite` reais, duas pessoas (Ana e
Beto), executado duas vezes, 17/17 nas duas:

- própria mensagem marcada "Você" para Ana e como "Ana" para Beto; lista com 2
  pessoas;
- indicador "está digitando" visível para Beto;
- mensagem enviada logo após 150 teclas rápidas entregue;
- 60 envios num único tique: aviso "não foi enviada" exibido, texto devolvido ao
  campo, 40/60 entregues (proteção mantida);
- servidor encerrado com SIGTERM (código 0) e reiniciado: reconexão sem duplicar,
  sem redesenhar nem reordenar itens; mensagens antigas continuam "Você"; nova
  mensagem reconhecida; lista com 2 pessoas;
- nenhum erro de console ou de página; layout idêntico ao anterior.

O roteiro não foi versionado: a suíte E2E permanente é a tarefa F7-01.

## 6. Compatibilidade

| Combinação                     | Comportamento                                                                                                                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliente novo + servidor novo   | Completo.                                                                                                                                                                                                                                                             |
| Cliente novo + servidor antigo | Funciona como antes: sem `session`, o cliente mantém o id local, que ele continua enviando em `userId`.                                                                                                                                                               |
| Cliente antigo + servidor novo | Conversa funciona, mas o cliente antigo **deixa de marcar as próprias mensagens como "Você"** (o id dele não é mais aceito). Erros com código são exibidos pelo texto. Digitação de cliente antigo (um sinal por tecla) pode ter sinais descartados — mensagens, não. |

**Mudanças de protocolo (todas aditivas):** evento `session`; campo opcional
`resumeToken` em `user_login`; campo `code` em `error` (o `message` foi mantido);
`userId` em `user_login` passa a ser ignorado.

**Mudanças de comportamento observáveis:** logs em JSON; nome inválido e login
repetido recusados; conexões sem login não recebem eventos; `.env` passa a ser lido
da raiz; configuração inválida impede a inicialização.

**Transição recomendada:** publicar backend e frontend **no mesmo deploy**. Como o
`index.html` normalmente não é cacheado por muito tempo e os assets têm hash, um
recarregamento basta para o cliente antigo virar novo.

## 7. Riscos residuais

| Risco                                                                                                     | Situação                                                                                   |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Com várias mensagens recusadas no mesmo segundo, só um aviso é enviado e só o último texto volta ao campo | Escolha deliberada (anti-amplificação). Resolução completa: confirmação de entrega, F4-02. |
| Identidades retomáveis ficam na memória até 10 min (teto de 2000 liberadas)                               | Limitado; perdidas em reinício (comportamento esperado de sala efêmera).                   |
| Allowlist de origem continua opcional                                                                     | Agora visível no log; decisão V03 pendente.                                                |
| Avisos (toasts), incluindo o de limite, não são anunciados a leitores de tela                             | P18, tarefa F5-01.                                                                         |
| Reconexão após reinício do servidor gera id novo (o servidor esqueceu as sessões)                         | Mensagens antigas continuam "Você" (já calculadas); o avanço é F4-01.                      |
| A CI ainda não roda `npm test`                                                                            | Tarefa F2-02 (primeira da Fase 2).                                                         |
| Teto de conexões ainda é verificado após o handshake                                                      | Inalterado (P28).                                                                          |

## 8. Pendências e decisões que dependem de aprovação

- **V03:** em produção, a ausência de `ALLOWED_ORIGINS` deve impedir a inicialização?
  Hoje: aviso.
- **V09:** calibragem real dos limites (40 / 8 por s) sem dados de produção.
- **V01:** domínio e plataforma de produção, para configurar `ALLOWED_ORIGINS`.
- Push, merge e PR: **não realizados** — aguardam autorização.

## 9. Recomendações para a Fase 2

1. **F2-02 primeiro:** incluir `npm --prefix backend ci` e `npm test` na CI, para que
   as 78 verificações protejam todo PR.
2. **F2-03:** modularizar `server.js` (que cresceu para 603 linhas) usando a suíte de
   integração **sem alterações** como rede de proteção — os testes já tratam o
   servidor como caixa-preta, então sobrevivem à refatoração.
3. **F2-05:** mover os códigos de erro e o evento `session` para o contrato
   compartilhado e criar `docs/PROTOCOLO.md`.
