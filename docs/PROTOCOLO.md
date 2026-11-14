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

| `type`         | `payload`                                   | Regras                                                                                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user_login`   | `{ userName, username, resumeToken? }`      | Uma vez por conexão. Começa (ou retoma) a **sessão**; não entra em sala nenhuma. `userName`: nome completo, 1–60 caracteres. `username`: obrigatório numa entrada nova (ver [Identidade](#identidade)); numa retomada válida é ignorado. `userId`, `role` e qualquer outro campo: **ignorados**.                                           |
| `user_logout`  | `{}`                                        | Encerra a sessão: a identidade acaba (token inválido, username livre na hora), sai de **todas** as salas (os outros recebem `user_left` imediatamente) e a conexão fecha com **4004**. Sem login, só fecha a conexão.                                                                                                                      |
| `room_create`  | `{ name?, requestId? }`                     | Exige login. Cria uma sala; quem cria entra como **anfitrião** e recebe `room_joined` com o código. `name`: até 40 caracteres (ausente = "Sala de {nome}").                                                                                                                                                                                |
| `room_join`    | `{ code, requestId? }`                      | Exige login. Entra pelo código de convite. Aceita o código com ou sem hífens, em maiúsculas, com espaços ou o link inteiro. Entrar de novo numa sala em que já está só reenvia o estado. Erros contam para a [proteção contra adivinhação](#salas).                                                                                        |
| `room_leave`   | `{ conversationId, requestId? }`            | Sai de uma sala; a sessão e as outras salas continuam. Quem sai recebe `room_left` (`reason: "left"`).                                                                                                                                                                                                                                     |
| `room_list`    | `{ requestId? }`                            | As conversas da sessão — salas e conversas privadas —, em `room_list`.                                                                                                                                                                                                                                                                     |
| `user_lookup`  | `{ username, requestId? }`                  | Exige login. Procura alguém **conectado** pelo `@` exato. Nunca lista, completa nem sugere. Resposta em `user_lookup`. Conta no [limite de buscas](#conversas-privadas).                                                                                                                                                                   |
| `dm_open`      | `{ username, requestId? }`                  | Exige login. Abre (ou retoma) a conversa privada com alguém, pelo `@` exato (o de uma busca, de uma lista de sala ou de um perfil). Resposta em `dm_opened`.                                                                                                                                                                               |
| `dm_close`     | `{ conversationId, requestId? }`            | Encerra a conversa privada para as duas pessoas; o histórico é descartado.                                                                                                                                                                                                                                                                 |
| `user_block`   | `{ username, requestId? }`                  | Bloqueia alguém até o fim da sessão. Resposta em `block_list`.                                                                                                                                                                                                                                                                             |
| `user_unblock` | `{ username, requestId? }`                  | Desfaz o bloqueio. Resposta em `block_list`.                                                                                                                                                                                                                                                                                               |
| `chat_message` | `{ conversationId, content, clientMsgId? }` | Exige participar da conversa. `content`: 1–1000 caracteres e até 20 linhas (quebras de linha `\n` são mantidas; ver normalização abaixo). `clientMsgId`: id de correlação (`[A-Za-z0-9_-]`, até 64) — devolvido na mensagem e no erro (`ref`); reenvio com o mesmo id na mesma sala não duplica. `kind`/`format` do cliente são ignorados. |
| `typing_start` | `{ conversationId }`                        | Conversa inválida é ignorada em silêncio. O cliente envia no máximo a cada 2 s.                                                                                                                                                                                                                                                            |
| `typing_stop`  | `{ conversationId }`                        | Idem.                                                                                                                                                                                                                                                                                                                                      |
| `command`      | `{ requestId?, text, conversationId? }`     | Exige login. Comandos de sala (`/me`, `/users`, `/mute`…) exigem `conversationId` de uma conversa da sessão; comandos gerais (`/ping`, `/nick`, `/rooms`…) funcionam sem. Resposta em `command_result`. Ver [`CHAT_COMMANDS.md`](./CHAT_COMMANDS.md).                                                                                      |

**Normalização de texto:** caracteres de controle (`\x00–\x1f`, `\x7f`) viram espaço;
extremidades são aparadas. O cliente aplica a mesma regra ao nome antes de enviar.

**Mensagens (`content`):** a mesma regra, exceto a quebra de linha, que é mantida:
`\r\n` e `\r` viram `\n`, tabulação vira dois espaços, o fim de cada linha é
aparado e linhas vazias seguidas viram uma só. A partir da 20ª linha, o resto é
juntado nela, separado por espaço (nada se perde até o limite de 1000 caracteres).

## Servidor → cliente

Eventos marcados com **◆** pertencem a uma sala e levam `conversationId` no topo.

| `type`              | `payload`                                                                                                                                  | Quando                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`           | `{ name, username, resumeToken, role, resumed, since }`                                                                                    | Logo após um login aceito, **antes** de qualquer outro evento. `role`: `member`/`admin` (global). `resumed: true` = a identidade anterior voltou, e cada sala dela chega em seguida num `room_joined`; `false` = identidade nova, em sala nenhuma. |
| `room_joined` ◆     | `{ conversationId, kind: "room", code, name, role, hostUsername, author, memberCount, historyVersion, created, resumed }`                  | Ao criar, entrar ou voltar (retomada) numa sala. `role`: seu papel **nesta** sala (`host`/`member`). `historyVersion` diferente da conhecida → descartar a conversa local dessa sala. Seguido de `message_history` (se houver) e `user_list`.      |
| `room_updated` ◆    | mesmo resumo de `room_joined`                                                                                                              | O resumo mudou para você (ex.: você virou anfitrião).                                                                                                                                                                                              |
| `room_left` ◆       | `{ reason }`                                                                                                                               | Você não está mais na sala: `left` (saiu), `removed` (removido por quem modera; não volta a ela) ou `closed`.                                                                                                                                      |
| `room_list`         | `{ rooms: RoomSummary[], dms: DmSummary[], requestId? }`                                                                                   | Resposta a `room_list`.                                                                                                                                                                                                                            |
| `user_lookup`       | `{ found, user?: { name, username }, requestId? }`                                                                                         | Resposta a `user_lookup`. `found: false` para quem não existe, não está conectado ou bloqueou você — sem distinção.                                                                                                                                |
| `dm_opened` ◆       | `{ conversationId, kind: "dm", peer: { name, username, online, author }, author, historyVersion, created, resumed }`                       | Você está numa conversa privada: ao abrir, ao receber a primeira mensagem de alguém ou ao voltar (retomada). Seguido de `message_history`, se houver.                                                                                              |
| `dm_updated` ◆      | mesmo resumo de `dm_opened`                                                                                                                | A outra pessoa mudou de nome ou de presença (`peer.online`).                                                                                                                                                                                       |
| `dm_closed` ◆       | `{ reason }`                                                                                                                               | A conversa privada acabou, com o histórico: `closed` (uma das duas encerrou ou bloqueou) ou `ended` (a identidade da outra pessoa acabou).                                                                                                         |
| `block_list`        | `{ blocked: Array<{ name, username }>, requestId? }`                                                                                       | Quem você bloqueou nesta sessão, depois de bloquear ou desbloquear.                                                                                                                                                                                |
| `message_history` ◆ | `Array<{ id, type: "chat_message", payload }>`                                                                                             | Após `room_joined`, se houver histórico (até `HISTORY_ON_JOIN`, padrão 50).                                                                                                                                                                        |
| `chat_message` ◆    | `{ userName, username, author, content, timestamp, kind?, format?, clientMsgId? }` + `id` (da mensagem)                                    | A cada mensagem aceita, para quem está na sala (inclusive quem enviou).                                                                                                                                                                            |
| `user_joined` ◆     | `{ userName, username, author, timestamp }`                                                                                                | Para os outros da sala, quando alguém entra (não numa volta dentro da janela de retomada).                                                                                                                                                         |
| `user_left` ◆       | `{ userName, username, timestamp, reason }`                                                                                                | Para os outros da sala. `reason`: `left` ou `removed`. Queda de conexão só é anunciada depois de `LEAVE_GRACE_MS` (padrão 10 s); saída da sala ou da sessão, na hora.                                                                              |
| `user_list` ◆       | `Array<{ name, username, status, role, statusText? }>`                                                                                     | Quem está conectado na sala, **agrupada** (50 ms). `role`: papel na sala — `admin` (global) prevalece sobre `host`.                                                                                                                                |
| `user_typing` ◆     | `{ userName, username, isTyping }`                                                                                                         | Para os outros da sala.                                                                                                                                                                                                                            |
| `notice` ◆          | `{ id, tone, text, timestamp }`                                                                                                            | Aviso do servidor para a sala: troca de nome, anfitrião novo, administrador, silêncio, remoção.                                                                                                                                                    |
| `chat_cleared` ◆    | `{ byName, timestamp, historyVersion }`                                                                                                    | O histórico da sala foi apagado por quem a modera (`/clearall`).                                                                                                                                                                                   |
| `error`             | `{ code, message, ref? }` (+ `conversationId` no topo, quando se refere a uma conversa)                                                    | Recusa de uma operação. `ref`: `clientMsgId`/`requestId` do envio recusado.                                                                                                                                                                        |
| `command_catalog`   | `{ commands: Array<{ name, aliases, category, categoryLabel, description, syntax, examples, permission, scope, requiresRoom, allowed }> }` | Após `session` e quando você passa a moderar alguma sala (ou deixa de). `allowed` é indicativo: a permissão é conferida por sala a cada execução.                                                                                                  |
| `command_result`    | `{ requestId, tone, text, title?, lines?, code?, data? }`                                                                                  | Exatamente uma por `command`, só para quem executou. `text` vazio = efeito já visível na sala.                                                                                                                                                     |

Só quem participa de uma conversa — sala ou privada — recebe eventos dela.

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

## Conversas privadas

- **Tipo distinto de conversa.** O `conversationId` começa com `d_` (salas, com
  `r_`). `chat_message`, `typing_start` e `typing_stop` funcionam igual, com o
  `conversationId` da conversa privada; os eventos de volta (`chat_message`,
  `message_history`, `user_typing`) levam o mesmo id no topo. Comandos de sala
  (`/me`, `/kick`…) não rodam numa conversa privada.
- **Só as duas pessoas.** Não há como entrar numa conversa privada: ela existe
  entre duas identidades, e o servidor confere a participação em toda operação.
  Para qualquer outra pessoa, mesmo sabendo o id, a resposta é
  `conversation_not_found`.
- **Ligada às identidades, nunca ao `@`.** No servidor, cada conversa é indexada
  pelos ids internos das duas identidades (que não saem dele). Uma identidade nova que reutilize o
  mesmo `@` não encontra nem recupera nada da anterior.
- **Busca só pelo `@` exato**, e só de quem está conectado agora. Não existe
  listagem, prefixo nem sugestão. Quem bloqueou você não aparece.
- **Abrir não avisa ninguém.** Quem abre recebe `dm_opened`; a outra pessoa só
  recebe o dela junto com a primeira mensagem (que vem no `message_history`).
  Abrir de novo devolve a mesma conversa. Conversa nova exige a outra pessoa
  conectada.
- **Bloqueio** (`user_block`): vale até o fim da sessão de quem bloqueou. Encerra a
  conversa entre as duas e impede conversa nova nas duas direções. Quem foi
  bloqueado não é avisado: vê `dm_closed` com `reason: "closed"` e, ao tentar de
  novo, `user_unavailable` — a mesma resposta de "essa pessoa não existe". Vale só
  para conversas privadas; salas têm moderação própria.
- **Ciclo de vida:** queda de conexão não encerra nada — a outra pessoa recebe
  `dm_updated` com `peer.online: false`, e quem volta com o token em até 2 min
  recebe as conversas de novo, com o histórico. Quando uma identidade acaba
  (`user_logout` ou prazo vencido), todas as conversas privadas dela são
  destruídas com o histórico, e a outra pessoa recebe `dm_closed` com
  `reason: "ended"`. Reiniciar o servidor apaga todas.
- **Limites contra abuso**, por identidade: 20 buscas seguidas e depois 1 a cada
  3 s (`lookup_limited`; `dm_open` por `@` também conta); 10 conversas **novas**
  seguidas e depois 1 a cada 30 s (`dm_open_limited`; reabrir não conta); até 100
  bloqueios por sessão (`block_limit`). Por ambiente: `MAX_DMS_PER_USER` (20)
  conversas abertas por pessoa, `MAX_DMS` (5000) no servidor e `DM_HISTORY_SIZE`
  (100) mensagens guardadas por conversa.

## Identidade

- **Quem conversa se vê pelo `@username`.** É ele que identifica a pessoa em
  mensagens, listas, digitação e conversas privadas, e é por ele que se indica
  alguém (`dm_open`, `user_block`, `/mute @ana`).
- **O id interno não sai do servidor.** Cada identidade tem um id gerado pelo
  servidor (o cliente nunca o escolhe), usado nos índices e nos logs. Ele não vai
  em nenhum evento e não é aceito em nenhum pedido. Só administradores o veem,
  pelos comandos `/users`, `/profile` e `/id`, e só eles podem indicar alguém por
  ele nos comandos de moderação.
- **`since`** (na `session`) é o instante em que a identidade nasceu. Como um `@`
  pode ser reutilizado depois que a identidade anterior acaba, o cliente só trata
  como "suas" as mensagens com o seu `@` escritas a partir desse instante
  (regra de reserva, para servidores sem `author`).
- **`author`** é o número de autor: o servidor numera os participantes de **cada
  conversa** na ordem em que entram (1, 2, 3…; numa conversa privada, quem abre é
  1 e a outra pessoa é 2). O número é fixo para a vida da conversa — sair e
  voltar mantém o mesmo — e fica gravado em cada mensagem, então o histórico
  continua mostrando quem escreveu mesmo depois que a pessoa sai. Uma identidade
  nova que reaproveita um `@` recebe **outro** número, e assim as mensagens de
  quem usou o `@` antes não se confundem com as dela. O número não deriva do id
  interno e cada conversa conta do zero: o mesmo número em duas conversas não diz
  nada sobre a pessoa. Só o servidor o atribui; `author` enviado pelo cliente é
  ignorado. Ele vai em `chat_message`, `user_list`, `user_joined`, `user_left` e
  `user_typing`; o seu próprio vem no resumo da conversa (`room_joined`/`dm_opened`).
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

| `code`                   | Categoria      | Quando                                                                                                                               |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid_message`        | protocolo      | Envelope inválido ou `content` que não é string                                                                                      |
| `unknown_type`           | protocolo      | `type` fora da lista acima                                                                                                           |
| `invalid_name`           | validação      | Nome vazio, só espaços/controle, ausente ou de tipo errado                                                                           |
| `invalid_username`       | validação      | Username ausente (entrada nova), fora do formato ou reservado                                                                        |
| `username_taken`         | validação      | Username com outra identidade viva                                                                                                   |
| `empty_message`          | validação      | `content` vazio após normalização                                                                                                    |
| `already_logged_in`      | autorização    | Segundo `user_login` na mesma conexão                                                                                                |
| `not_logged_in`          | autorização    | Operação que exige sessão antes do login                                                                                             |
| `rate_limited`           | limite de taxa | `chat_message` ou `command` acima do limite (no máximo 1 aviso por segundo)                                                          |
| `muted`                  | autorização    | Fase 4: quem foi silenciado tentou publicar                                                                                          |
| `invalid_room_code`      | validação      | `room_join` com código fora do formato `abc-defg-hij`                                                                                |
| `invalid_room_name`      | validação      | Nome de sala com mais de 40 caracteres ou de tipo errado                                                                             |
| `room_not_found`         | validação      | Nenhuma sala ativa com o código                                                                                                      |
| `conversation_not_found` | autorização    | Conversa inexistente ou de que a sessão não participa (mesma resposta)                                                               |
| `removed_from_room`      | autorização    | Tentativa de voltar a uma sala de onde foi removido                                                                                  |
| `room_join_limit`        | autorização    | Já está no número máximo de salas                                                                                                    |
| `room_create_limit`      | autorização    | Já criou o número máximo de salas ativas                                                                                             |
| `rooms_full`             | limite de taxa | O servidor está no limite de salas                                                                                                   |
| `room_join_locked`       | limite de taxa | Tentativas erradas demais com códigos de sala                                                                                        |
| `invalid_user`           | validação      | `@` ausente ou fora do formato                                                                                                       |
| `user_unavailable`       | validação      | Ninguém disponível com esse `@` ou id: não existe, não está conectado, bloqueou você ou está no limite de conversas (mesma resposta) |
| `dm_self`                | validação      | Conversa privada consigo mesmo                                                                                                       |
| `dm_limit`               | autorização    | Você já tem o número máximo de conversas privadas                                                                                    |
| `dms_full`               | limite de taxa | O servidor está no limite de conversas privadas                                                                                      |
| `lookup_limited`         | limite de taxa | Buscas por `@` demais em pouco tempo                                                                                                 |
| `dm_open_limited`        | limite de taxa | Conversas novas demais em pouco tempo                                                                                                |
| `block_limit`            | autorização    | Número máximo de bloqueios da sessão                                                                                                 |
| `internal_error`         | interno        | Defeito do servidor; nenhum detalhe é enviado                                                                                        |

## Limites de taxa

Por conexão, dois baldes independentes (padrões configuráveis por ambiente):

| Balde     | Eventos                                                                                                   | Capacidade / reposição | Ao exceder                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Mensagens | `chat_message`, `command`, `user_login`, `room_*`, `user_lookup`, `dm_*`, `user_block`, quadros inválidos | 40 / 8 por s           | `chat_message`, `command`, `room_create`, `room_join`, `user_lookup` e `dm_open` recebem `rate_limited`; o resto é descartado |
| Sinais    | `typing_start`, `typing_stop`                                                                             | 40 / 8 por s           | Descartado em silêncio                                                                                                        |

## Conexão

- `ALLOWED_ORIGINS` definida: handshake de origem não listada recebe HTTP 403,
  e conexão **sem** cabeçalho `Origin` também (clientes automatizados precisam
  enviar uma origem permitida). A comparação é exata (esquema + host + porta),
  sem curinga nem prefixo. Isso protege contra páginas de terceiros abrindo o
  WebSocket pelo navegador de alguém; não é autenticação — fora do navegador,
  `Origin` pode ser forjado. Em produção a lista é obrigatória (sem ela o
  servidor não sobe); vazia, só fora de produção: qualquer origem.
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
