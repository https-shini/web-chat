# Protocolo WebSocket · web-chat

> Contrato entre cliente e servidor. Fontes no código:
> [`backend/src/protocol.js`](../backend/src/protocol.js) e
> [`backend/src/errors.js`](../backend/src/errors.js) (servidor) e
> [`frontend/src/protocol.js`](../frontend/src/protocol.js) (cliente).
> `backend/test/unit/contract.test.js` falha se os dois lados divergirem —
> inclusive os `maxlength` do `frontend/index.html`.
>
> **Regra de evolução:** mudanças aditivas (tipo novo, campo opcional novo) são o
> padrão; um campo existente nunca muda de significado; o cliente ignora tipos que
> não conhece.
>
> **Exceção registrada — Fase 2 da evolução (várias salas):** a sala única deixou
> de existir. Login e entrada numa sala viraram passos separados, e mensagens,
> sinais e comandos passaram a exigir `conversationId`. É uma quebra deliberada:
> cliente e servidor são publicados juntos, do mesmo repositório, e o teste de
> contrato garante que os dois lados mudaram de acordo. Um cliente anterior à
> Fase 2 conecta e faz login, mas não entra em sala nenhuma.

## Envelope

Todo quadro é um objeto JSON:

```json
{ "type": "nome_do_evento", "payload": {} }
```

- `payload` ausente equivale a `{}`; qualquer outro tipo de `payload` é recusado.
- Mensagens de chat enviadas pelo servidor têm também `id` no topo do objeto.
- **Conversas:** todo evento do servidor que pertence a uma sala leva
  `conversationId` no **topo** do envelope (como o `id`), e o payload mantém o
  formato de antes:

    ```json
    { "type": "chat_message", "id": "…", "conversationId": "r_3fQ…", "payload": { … } }
    ```

    No sentido contrário, o cliente informa a conversa **dentro** do payload
    (`payload.conversationId`). O servidor confere, antes de qualquer efeito, que a
    identidade da conexão participa da conversa; "não existe" e "você não participa"
    recebem a mesma resposta (`conversation_not_found`).

- O `conversationId` é opaco (`r_` + 16 caracteres aleatórios) e **não** é o
  código de convite: o código só é entregue a quem está na sala e nunca vai para o
  log.
- Quadros binários, JSON inválido, não-objeto ou `type` ausente são recusados com
  `invalid_message`; `type` desconhecido, com `unknown_type`. A conexão continua
  aberta.
- Quadros acima de `MAX_PAYLOAD_BYTES` (padrão 16 KiB) fecham a conexão com 1009.

## Cliente → servidor

| `type`         | `payload`                                       | Regras                                                                                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user_login`   | `{ userName, username, resumeToken?, userId? }` | Uma vez por conexão. Começa (ou retoma) a **sessão**; não entra em sala nenhuma. `userName`: nome completo, 1–60 caracteres. `username`: obrigatório numa entrada nova (ver [Identidade](#identidade)); numa retomada válida é ignorado. `userId`, `role` e qualquer outro campo: **ignorados**. |
| `user_logout`  | `{}`                                            | Encerra a sessão: a identidade acaba (token inválido, username livre na hora), sai de **todas** as salas (os outros recebem `user_left` imediatamente) e a conexão fecha com **4004**. Sem login, só fecha a conexão.                                                                            |
| `room_create`  | `{ name?, requestId? }`                         | Exige login. Cria uma sala; quem cria entra como **anfitrião** e recebe `room_joined` com o código. `name`: até 40 caracteres (ausente = "Sala de {nome}").                                                                                                                                      |
| `room_join`    | `{ code, requestId? }`                          | Exige login. Entra pelo código de convite. Aceita o código com ou sem hífens, em maiúsculas, com espaços ou o link inteiro. Entrar de novo numa sala em que já está só reenvia o estado. Erros contam para a [proteção contra adivinhação](#salas).                                              |
| `room_leave`   | `{ conversationId, requestId? }`                | Sai de uma sala; a sessão e as outras salas continuam. Quem sai recebe `room_left` (`reason: "left"`).                                                                                                                                                                                           |
| `room_list`    | `{ requestId? }`                                | As salas de que a sessão participa, em `room_list`.                                                                                                                                                                                                                                              |
| `chat_message` | `{ conversationId, content, clientMsgId? }`     | Exige participar da conversa. `content`: 1–1000 caracteres. `clientMsgId`: id de correlação (`[A-Za-z0-9_-]`, até 64) — devolvido na mensagem e no erro (`ref`); reenvio com o mesmo id na mesma sala não duplica. `kind`/`format` do cliente são ignorados.                                     |
| `typing_start` | `{ conversationId }`                            | Conversa inválida é ignorada em silêncio. O cliente envia no máximo a cada 2 s.                                                                                                                                                                                                                  |
| `typing_stop`  | `{ conversationId }`                            | Idem.                                                                                                                                                                                                                                                                                            |
| `command`      | `{ requestId?, text, conversationId? }`         | Exige login. Comandos de sala (`/me`, `/users`, `/mute`…) exigem `conversationId` de uma conversa da sessão; comandos gerais (`/ping`, `/nick`, `/rooms`…) funcionam sem. Resposta em `command_result`. Ver [`CHAT_COMMANDS.md`](./CHAT_COMMANDS.md).                                            |

**Normalização de texto:** caracteres de controle (`\x00–\x1f`, `\x7f`) viram espaço;
extremidades são aparadas. O cliente aplica a mesma regra ao nome antes de enviar.

## Servidor → cliente

Eventos marcados com **◆** pertencem a uma sala e levam `conversationId` no topo.

| `type`              | `payload`                                                                                                                                  | Quando                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`           | `{ id, name, username, resumeToken, role, resumed }`                                                                                       | Logo após um login aceito, **antes** de qualquer outro evento. `role`: `member`/`admin` (global). `resumed: true` = a identidade anterior voltou, e cada sala dela chega em seguida num `room_joined`; `false` = identidade nova, em sala nenhuma. |
| `room_joined` ◆     | `{ conversationId, kind: "room", code, name, role, hostId, memberCount, historyVersion, created, resumed }`                                | Ao criar, entrar ou voltar (retomada) numa sala. `role`: seu papel **nesta** sala (`host`/`member`). `historyVersion` diferente da conhecida → descartar a conversa local dessa sala. Seguido de `message_history` (se houver) e `user_list`.      |
| `room_updated` ◆    | mesmo resumo de `room_joined`                                                                                                              | O resumo mudou para você (ex.: você virou anfitrião).                                                                                                                                                                                              |
| `room_left` ◆       | `{ reason }`                                                                                                                               | Você não está mais na sala: `left` (saiu), `removed` (removido por quem modera; não volta a ela) ou `closed`.                                                                                                                                      |
| `room_list`         | `{ rooms: RoomSummary[], requestId? }`                                                                                                     | Resposta a `room_list`.                                                                                                                                                                                                                            |
| `message_history` ◆ | `Array<{ id, type: "chat_message", payload }>`                                                                                             | Após `room_joined`, se houver histórico (até `HISTORY_ON_JOIN`, padrão 50).                                                                                                                                                                        |
| `chat_message` ◆    | `{ userId, userName, username?, content, timestamp, kind?, format?, clientMsgId? }` + `id`                                                 | A cada mensagem aceita, para quem está na sala (inclusive quem enviou).                                                                                                                                                                            |
| `user_joined` ◆     | `{ userName, timestamp }`                                                                                                                  | Para os outros da sala, quando alguém entra (não numa volta dentro da janela de retomada).                                                                                                                                                         |
| `user_left` ◆       | `{ userId, userName, timestamp, reason }`                                                                                                  | Para os outros da sala. `reason`: `left` ou `removed`. Queda de conexão só é anunciada depois de `LEAVE_GRACE_MS` (padrão 10 s); saída da sala ou da sessão, na hora.                                                                              |
| `user_list` ◆       | `Array<{ id, name, username, status, role, statusText? }>`                                                                                 | Quem está conectado na sala, **agrupada** (50 ms). `role`: papel na sala — `admin` (global) prevalece sobre `host`.                                                                                                                                |
| `user_typing` ◆     | `{ userId, userName, isTyping }`                                                                                                           | Para os outros da sala.                                                                                                                                                                                                                            |
| `notice` ◆          | `{ id, tone, text, timestamp }`                                                                                                            | Aviso do servidor para a sala: troca de nome, anfitrião novo, administrador, silêncio, remoção.                                                                                                                                                    |
| `chat_cleared` ◆    | `{ byName, timestamp, historyVersion }`                                                                                                    | O histórico da sala foi apagado por quem a modera (`/clearall`).                                                                                                                                                                                   |
| `error`             | `{ code, message, ref? }` (+ `conversationId` no topo, quando se refere a uma conversa)                                                    | Recusa de uma operação. `ref`: `clientMsgId`/`requestId` do envio recusado.                                                                                                                                                                        |
| `command_catalog`   | `{ commands: Array<{ name, aliases, category, categoryLabel, description, syntax, examples, permission, scope, requiresRoom, allowed }> }` | Após `session` e quando você passa a moderar alguma sala (ou deixa de). `allowed` é indicativo: a permissão é conferida por sala a cada execução.                                                                                                  |
| `command_result`    | `{ requestId, tone, text, title?, lines?, code?, data? }`                                                                                  | Exatamente uma por `command`, só para quem executou. `text` vazio = efeito já visível na sala.                                                                                                                                                     |

Só quem participa de uma sala recebe eventos dela.

## Salas

- **Não existe sala pública.** Toda sala é criada por alguém e só se entra nela
  pelo código de convite (ou pelo link `…/#/s/abc-defg-hij`, que o cliente lê).
- **Código** `abc-defg-hij`: 10 letras sorteadas com `crypto.randomInt`
  (26¹⁰ ≈ 1,4 × 10¹⁴ combinações), único entre as salas ativas.
- **Proteção contra adivinhação:** só tentativas erradas contam. Cada identidade
  tem 10 erros, repostos à razão de 1 a cada 30 s; o servidor inteiro, 100 erros,
  repostos a 5 por segundo. Esgotado qualquer um, toda entrada por código é
  recusada com `room_join_locked` — inclusive com o código certo, para a resposta
  não servir de oráculo.
- **Limites** (por ambiente): `MAX_ROOMS_PER_USER` (padrão 10) salas ao mesmo
  tempo por identidade, `MAX_ROOMS_CREATED_PER_USER` (5) salas ativas criadas por
  identidade, `MAX_ROOMS` (500) salas no servidor, `HISTORY_SIZE` (200) mensagens
  guardadas por sala.
- **Anfitrião:** quem cria. Modera só aquela sala (`/mute`, `/unmute`, `/kick`,
  `/clearall`, `/announce`). Se sai de vez (sai da sala, encerra a sessão ou não
  volta a tempo), o papel passa para quem está na sala há mais tempo, preferindo
  quem está conectado. Uma queda dentro da janela de retomada não passa o papel.
  Anfitrião não modera administrador.
- **Remoção (`/kick`)** vale só naquela sala: a pessoa recebe `room_left` com
  `reason: "removed"`, continua conectada e nas outras salas, e não volta àquela
  sala enquanto ela existir.
- **Fim da sala:** sem nenhuma participação (nem de quem está na janela de
  retomada), a sala espera `ROOM_EMPTY_TTL_MS` (padrão 60 s) e é destruída com o
  histórico, o código e a lista de removidos. Entrar durante a espera a mantém
  viva.

## Identidade

- O `id` de cada pessoa é gerado pelo servidor; o cliente nunca o escolhe.
- `resumeToken` é secreto, de uso único e entregue só ao dono. Enviá-lo num novo
  `user_login` (por exemplo, após uma queda de rede) devolve o mesmo `id`, o nome
  guardado e **todas as salas** de que a identidade participava, com o mesmo papel.
- O token expira **2 min** depois que a conexão termina. Durante esse prazo a
  identidade continua nas salas (fora das listas de quem está conectado); vencido o
  prazo, ela sai de todas. Token inválido ou expirado não é erro: a pessoa entra
  com uma identidade nova (`resumed: false`), em sala nenhuma.
- **Username**: de 3 a 20 caracteres — letras minúsculas sem acento, números, `.`
  e `_`, sem começar/terminar com ponto e sem `..`. Um `@` inicial é aceito e
  removido; maiúsculas viram minúsculas. Nomes que imitam o sistema ou uma menção
  coletiva (`admin`, `sistema`, `todos`, …) são reservados.
- O username é **único no servidor** entre as identidades vivas: conectadas ou
  ainda retomáveis. É liberado na hora por `user_logout`.
- O id e o username não são autenticação: não há contas nem senha, e a
  identidade some quando a participação termina.
- Retomar enquanto a conexão antiga ainda consta substitui a antiga, sem
  `user_left`/`user_joined` para os outros.
- O cliente guarda o token só em memória.
- Nada disso sobrevive ao processo: reiniciar o servidor apaga salas, mensagens,
  códigos, identidades e tokens.

## Códigos de erro

| `code`                   | Categoria      | Quando                                                                      |
| ------------------------ | -------------- | --------------------------------------------------------------------------- |
| `invalid_message`        | protocolo      | Envelope inválido ou `content` que não é string                             |
| `unknown_type`           | protocolo      | `type` fora da lista acima                                                  |
| `invalid_name`           | validação      | Nome vazio, só espaços/controle, ausente ou de tipo errado                  |
| `invalid_username`       | validação      | Username ausente (entrada nova), fora do formato ou reservado               |
| `username_taken`         | validação      | Username com outra identidade viva                                          |
| `empty_message`          | validação      | `content` vazio após normalização                                           |
| `already_logged_in`      | autorização    | Segundo `user_login` na mesma conexão                                       |
| `not_logged_in`          | autorização    | Operação que exige sessão antes do login                                    |
| `rate_limited`           | limite de taxa | `chat_message` ou `command` acima do limite (no máximo 1 aviso por segundo) |
| `muted`                  | autorização    | Fase 4: quem foi silenciado tentou publicar                                 |
| `invalid_room_code`      | validação      | `room_join` com código fora do formato `abc-defg-hij`                       |
| `invalid_room_name`      | validação      | Nome de sala com mais de 40 caracteres ou de tipo errado                    |
| `room_not_found`         | validação      | Nenhuma sala ativa com o código                                             |
| `conversation_not_found` | autorização    | Conversa inexistente ou de que a sessão não participa (mesma resposta)      |
| `removed_from_room`      | autorização    | Tentativa de voltar a uma sala de onde foi removido                         |
| `room_join_limit`        | autorização    | Já está no número máximo de salas                                           |
| `room_create_limit`      | autorização    | Já criou o número máximo de salas ativas                                    |
| `rooms_full`             | limite de taxa | O servidor está no limite de salas                                          |
| `room_join_locked`       | limite de taxa | Tentativas erradas demais com códigos de sala                               |
| `internal_error`         | interno        | Defeito do servidor; nenhum detalhe é enviado                               |

## Limites de taxa

Por conexão, dois baldes independentes (padrões configuráveis por ambiente):

| Balde     | Eventos                                                              | Capacidade / reposição | Ao exceder                                                                                          |
| --------- | -------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| Mensagens | `chat_message`, `command`, `user_login`, `room_*`, quadros inválidos | 40 / 8 por s           | `chat_message`, `command`, `room_create` e `room_join` recebem `rate_limited`; o resto é descartado |
| Sinais    | `typing_start`, `typing_stop`                                        | 40 / 8 por s           | Descartado em silêncio                                                                              |

## Conexão

- `ALLOWED_ORIGINS` definida: handshake de origem não listada recebe HTTP 403,
  e conexão **sem** cabeçalho `Origin` também (clientes automatizados precisam
  enviar uma origem permitida). A comparação é exata (esquema + host + porta),
  sem curinga nem prefixo. Isso protege contra páginas de terceiros abrindo o
  WebSocket pelo navegador de alguém; não é autenticação — fora do navegador,
  `Origin` pode ser forjado. Vazia: qualquer origem (só para desenvolvimento).
- Acima de `MAX_CONNECTIONS` (padrão 500): fechamento com 1013.
- Prazo de login: conexão que não entra na sala em `LOGIN_TIMEOUT_MS` (padrão 30 s)
  é fechada com **4001**. Nome recusado não reinicia o prazo. O cliente oficial
  faz login assim que conecta.
- Heartbeat: ping a cada `HEARTBEAT_MS` (padrão 30 s). Pong **ou qualquer quadro
  recebido** conta como sinal de vida. Só após `HEARTBEAT_MAX_MISSED` (padrão 2)
  pings seguidos sem nenhum sinal a conexão é encerrada e a pessoa sai da sala —
  detecção em 2–3 intervalos (60–90 s com os padrões); um ping perdido não derruba.
- Cliente que para de ler: se a fila de envio de uma conexão passa de
  `MAX_BUFFERED_BYTES` (padrão 1 MiB), a conexão é encerrada.
- Desligamento do servidor: fechamento com 1001; o cliente reconecta sozinho.

| Código de fechamento | Motivo                                                                       |
| -------------------- | ---------------------------------------------------------------------------- |
| 1001                 | Servidor desligando                                                          |
| 1006                 | Encerrada pelo heartbeat ou por cliente lento (sem handshake de fechamento)  |
| 1009                 | Quadro acima de `MAX_PAYLOAD_BYTES`                                          |
| 1013                 | Servidor no teto de conexões                                                 |
| 4001                 | Não entrou na sala dentro do prazo                                           |
| 4003                 | Removido por um administrador (`/kick`). O cliente **não** reconecta sozinho |
| 4004                 | A própria pessoa saiu (`user_logout`). O cliente **não** reconecta sozinho   |

## HTTP na mesma porta

| Rota            | Resposta                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`         | `200 ok` (texto) — checagem de saúde simples                                                                                    |
| `GET /healthz`  | Liveness: `200` JSON `{ status, uptimeSec, connections, users }`                                                                |
| `GET /readyz`   | Readiness: `200 {"status":"ready"}`; `503` com `draining` ou `full`                                                             |
| `GET /metrics`  | Só com `METRICS_ENABLED=true` (senão `404`): contadores, tempo de processamento, event loop, CPU e memória — sem dados pessoais |
| outros caminhos | `404`; métodos diferentes de GET/HEAD: `405`                                                                                    |
