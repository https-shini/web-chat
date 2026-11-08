# Protocolo WebSocket · web-chat

> Contrato entre cliente e servidor. Fontes no código:
> [`backend/src/protocol.js`](../backend/src/protocol.js) e
> [`backend/src/errors.js`](../backend/src/errors.js) (servidor) e
> [`frontend/src/protocol.js`](../frontend/src/protocol.js) (cliente).
> `backend/test/unit/contract.test.js` falha se os dois lados divergirem —
> inclusive os `maxlength` do `frontend/index.html`.
>
> **Regra de evolução:** só mudanças aditivas (tipo novo, campo opcional novo). Um
> campo existente nunca muda de significado; o cliente ignora tipos que não conhece.

## Envelope

Todo quadro é um objeto JSON:

```json
{ "type": "nome_do_evento", "payload": {} }
```

- `payload` ausente equivale a `{}`; qualquer outro tipo de `payload` é recusado.
- Mensagens de chat enviadas pelo servidor têm também `id` no topo do objeto.
- Quadros binários, JSON inválido, não-objeto ou `type` ausente são recusados com
  `invalid_message`; `type` desconhecido, com `unknown_type`. A conexão continua
  aberta.
- Quadros acima de `MAX_PAYLOAD_BYTES` (padrão 16 KiB) fecham a conexão com 1009.

## Cliente → servidor

| `type`         | `payload`                                       | Regras                                                                                                                                                                                                                                                                            |
| -------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_login`   | `{ userName, username, resumeToken?, userId? }` | Uma vez por conexão. `userName`: nome completo, string normalizada, 1–60 caracteres. `username`: obrigatório numa entrada nova (ver [Identidade](#identidade)); numa retomada válida é ignorado. `resumeToken`: opcional. `userId`, `role` e qualquer outro campo: **ignorados**. |
| `user_logout`  | `{}`                                            | Sair da sala. A identidade é encerrada no servidor (token inválido, username livre na hora), os outros recebem `user_left` imediatamente e a conexão fecha com **4004**. Sem login, só fecha a conexão.                                                                           |
| `chat_message` | `{ content, clientMsgId? }`                     | Exige login. `content`: string, normalizada, 1–1000 caracteres. `clientMsgId` (Fase 4): id de correlação do cliente (`[A-Za-z0-9_-]`, até 64) — o servidor o devolve na mensagem e no erro (`ref`), e ignora reenvios com o mesmo id. `kind`/`format` do cliente são ignorados.   |
| `typing_start` | `{}`                                            | Exige login (sem login é ignorado em silêncio). O cliente envia no máximo a cada 2 s.                                                                                                                                                                                             |
| `typing_stop`  | `{}`                                            | Idem.                                                                                                                                                                                                                                                                             |
| `command`      | `{ requestId?, text }`                          | Fase 4. Exige login. `text`: o comando como digitado (`/nome args`, até 1000). Interpretado só no servidor; resposta em `command_result` com o mesmo `requestId`. Consome o balde de mensagens. Ver [`CHAT_COMMANDS.md`](./CHAT_COMMANDS.md).                                     |

**Normalização de texto:** caracteres de controle (`\x00–\x1f`, `\x7f`) viram espaço;
extremidades são aparadas. O cliente aplica a mesma regra ao nome antes de enviar.

## Servidor → cliente

| `type`            | `payload`                                                                                                                    | Quando                                                                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session`         | `{ id, name, username, resumeToken, role, historyVersion }`                                                                  | Logo após um login aceito, **antes** de qualquer outro evento. `role`: `member`/`admin`. `historyVersion` muda a cada `/clearall`: diferente da que o cliente conhecia → descartar a conversa local.                                                                                                |
| `message_history` | `Array<{ id, type: "chat_message", payload }>`                                                                               | Após `session`, se houver histórico (até `HISTORY_ON_JOIN`, padrão 50).                                                                                                                                                                                                                             |
| `chat_message`    | `{ userId, userName, username?, content, timestamp, kind?, format?, clientMsgId? }` + `id`                                   | A cada mensagem aceita, para todos (inclusive quem enviou). `kind`: `action`, `roll`, `announcement` (ausente = texto). `format`: `bold`, `italic`, `code`, `spoiler`.                                                                                                                              |
| `user_joined`     | `{ userName, timestamp }`                                                                                                    | Para os outros, quando alguém entra (não em retomada que substitui conexão antiga).                                                                                                                                                                                                                 |
| `user_left`       | `{ userId, userName, timestamp, reason }`                                                                                    | Para os outros, quando alguém sai. `reason`: `left` ou `removed` (Fase 4: `userId` e `reason` aditivos). Saída comum só é anunciada depois da janela de retomada (`LEAVE_GRACE_MS`, padrão 10 s): quem volta dentro dela não gera `user_left` nem `user_joined`. Não ocorre durante o desligamento. |
| `user_list`       | `Array<{ id, name, status, role, statusText? }>`                                                                             | Após entradas, saídas e mudanças de nome/presença/papel, **agrupada** (50 ms). `status`: `online`/`away`; `role`: `member`/`admin`; `statusText`: motivo da ausência.                                                                                                                               |
| `user_typing`     | `{ userId, userName, isTyping }`                                                                                             | Para os outros, a cada sinal de digitação aceito.                                                                                                                                                                                                                                                   |
| `error`           | `{ code, message, ref? }`                                                                                                    | Recusa de uma operação. `ref` (Fase 4): `clientMsgId`/`requestId` do envio recusado.                                                                                                                                                                                                                |
| `command_catalog` | `{ commands: Array<{ name, aliases, category, categoryLabel, description, syntax, examples, permission, scope, allowed }> }` | Fase 4. Após `session` e após mudança de papel. Fonte do autocomplete e do `/help`.                                                                                                                                                                                                                 |
| `command_result`  | `{ requestId, tone, text, title?, lines?, code?, data? }`                                                                    | Fase 4. Exatamente uma por `command`, só para quem executou. `text` vazio = efeito já visível na sala.                                                                                                                                                                                              |
| `notice`          | `{ id, tone, text, timestamp }`                                                                                              | Fase 4. Aviso do servidor para a sala: troca de nome, novo administrador, silêncio, remoção.                                                                                                                                                                                                        |
| `chat_cleared`    | `{ byName, timestamp, historyVersion }`                                                                                      | Fase 4. A sala foi limpa por um administrador (`/clearall`).                                                                                                                                                                                                                                        |

Só conexões que entraram na sala recebem eventos dela.

## Identidade

- O `id` de cada pessoa é gerado pelo servidor; o cliente nunca o escolhe.
- `resumeToken` é secreto, de uso único e entregue só ao dono. Enviá-lo num novo
  `user_login` (por exemplo, após uma queda de rede) devolve o mesmo `id` e o nome
  guardado, e um token novo vem na `session`.
- O token expira **2 min** depois que a conexão termina (eram 10 min antes da
  Fase A). Token inválido ou expirado não é erro: a pessoa entra com uma
  identidade nova (e precisa de `userName` e `username`).
- **Username** (Fase A): de 3 a 20 caracteres — letras minúsculas sem acento,
  números, `.` e `_`, sem começar/terminar com ponto e sem `..`. Um `@` inicial
  é aceito e removido; maiúsculas viram minúsculas. Nomes que imitam o sistema
  ou uma menção coletiva (`admin`, `sistema`, `todos`, …) são reservados.
- O username é **único entre as identidades vivas**: conectadas ou ainda
  retomáveis. Fica reservado durante a janela de retomada (para quem caiu
  voltar com o mesmo @) e é liberado na hora por `user_logout` ou remoção
  (`/kick`). O nome completo pode se repetir; o username distingue as pessoas
  (`/kick @ana`, `/profile @ana`).
- O id e o username não são autenticação: não há contas nem senha, e a
  identidade some quando a participação termina.
- Retomar enquanto a conexão antiga ainda consta substitui a antiga, sem
  `user_left`/`user_joined` para os outros.
- O cliente guarda o token só em memória.

## Códigos de erro

| `code`              | Categoria      | Quando                                                                      |
| ------------------- | -------------- | --------------------------------------------------------------------------- |
| `invalid_message`   | protocolo      | Envelope inválido ou `content` que não é string                             |
| `unknown_type`      | protocolo      | `type` fora da lista acima                                                  |
| `invalid_name`      | validação      | Nome vazio, só espaços/controle, ausente ou de tipo errado                  |
| `invalid_username`  | validação      | Username ausente (entrada nova), fora do formato ou reservado               |
| `username_taken`    | validação      | Username com outra identidade viva                                          |
| `empty_message`     | validação      | `content` vazio após normalização                                           |
| `already_logged_in` | autorização    | Segundo `user_login` na mesma conexão                                       |
| `not_logged_in`     | autorização    | `chat_message` antes do login                                               |
| `rate_limited`      | limite de taxa | `chat_message` ou `command` acima do limite (no máximo 1 aviso por segundo) |
| `muted`             | autorização    | Fase 4: quem foi silenciado tentou publicar                                 |
| `internal_error`    | interno        | Defeito do servidor; nenhum detalhe é enviado                               |

## Limites de taxa

Por conexão, dois baldes independentes (padrões configuráveis por ambiente):

| Balde     | Eventos                                         | Capacidade / reposição | Ao exceder                                                 |
| --------- | ----------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| Mensagens | `chat_message`, `user_login`, quadros inválidos | 40 / 8 por s           | `chat_message` recebe `rate_limited`; o resto é descartado |
| Sinais    | `typing_start`, `typing_stop`                   | 40 / 8 por s           | Descartado em silêncio                                     |

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
