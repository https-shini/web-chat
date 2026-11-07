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

| `type`         | `payload`                              | Regras                                                                                                                                                                          |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_login`   | `{ userName, resumeToken? , userId? }` | Uma vez por conexão. `userName`: string, normalizada, 1–30 caracteres. `resumeToken`: opcional. `userId`: **ignorado** (mantido só por compatibilidade com servidores antigos). |
| `chat_message` | `{ content }`                          | Exige login. `content`: string, normalizada, 1–1000 caracteres (excesso é cortado).                                                                                             |
| `typing_start` | `{}`                                   | Exige login (sem login é ignorado em silêncio). O cliente envia no máximo a cada 2 s.                                                                                           |
| `typing_stop`  | `{}`                                   | Idem.                                                                                                                                                                           |

**Normalização de texto:** caracteres de controle (`\x00–\x1f`, `\x7f`) viram espaço;
extremidades são aparadas. O cliente aplica a mesma regra ao nome antes de enviar.

## Servidor → cliente

| `type`            | `payload`                                         | Quando                                                                                                                             |
| ----------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `session`         | `{ id, name, resumeToken }`                       | Logo após um login aceito, **antes** de qualquer outro evento. Só para quem entrou.                                                |
| `message_history` | `Array<{ id, type: "chat_message", payload }>`    | Após `session`, se houver histórico (até `HISTORY_ON_JOIN`, padrão 50).                                                            |
| `chat_message`    | `{ userId, userName, content, timestamp }` + `id` | A cada mensagem aceita, para todos na sala (inclusive quem enviou).                                                                |
| `user_joined`     | `{ userName, timestamp }`                         | Para os outros, quando alguém entra (não em retomada que substitui conexão antiga).                                                |
| `user_left`       | `{ userName, timestamp }`                         | Para os outros, quando alguém sai (não durante o desligamento do servidor).                                                        |
| `user_list`       | `Array<{ id, name, status: "online" }>`           | Após entradas e saídas, **agrupada**: mudanças dentro de 50 ms geram um envio só, com o estado final (sempre depois de `session`). |
| `user_typing`     | `{ userId, userName, isTyping }`                  | Para os outros, a cada sinal de digitação aceito.                                                                                  |
| `error`           | `{ code, message }`                               | Recusa de uma operação. `message` é texto exibível; o cliente decide pelo `code`.                                                  |

Só conexões que entraram na sala recebem eventos dela.

## Identidade

- O `id` de cada pessoa é gerado pelo servidor; o cliente nunca o escolhe.
- `resumeToken` é secreto, de uso único e entregue só ao dono. Enviá-lo num novo
  `user_login` (por exemplo, após uma queda de rede) devolve o mesmo `id` e o nome
  guardado, e um token novo vem na `session`.
- O token expira 10 min depois que a conexão termina. Token inválido ou expirado
  não é erro: a pessoa entra com uma identidade nova (e precisa de `userName`).
- Retomar enquanto a conexão antiga ainda consta substitui a antiga, sem
  `user_left`/`user_joined` para os outros.
- O cliente guarda o token só em memória.

## Códigos de erro

| `code`              | Categoria      | Quando                                                         |
| ------------------- | -------------- | -------------------------------------------------------------- |
| `invalid_message`   | protocolo      | Envelope inválido ou `content` que não é string                |
| `unknown_type`      | protocolo      | `type` fora da lista acima                                     |
| `invalid_name`      | validação      | Nome vazio, só espaços/controle, ausente ou de tipo errado     |
| `empty_message`     | validação      | `content` vazio após normalização                              |
| `already_logged_in` | autorização    | Segundo `user_login` na mesma conexão                          |
| `not_logged_in`     | autorização    | `chat_message` antes do login                                  |
| `rate_limited`      | limite de taxa | `chat_message` acima do limite (no máximo 1 aviso por segundo) |
| `internal_error`    | interno        | Defeito do servidor; nenhum detalhe é enviado                  |

## Limites de taxa

Por conexão, dois baldes independentes (padrões configuráveis por ambiente):

| Balde     | Eventos                                         | Capacidade / reposição | Ao exceder                                                 |
| --------- | ----------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| Mensagens | `chat_message`, `user_login`, quadros inválidos | 40 / 8 por s           | `chat_message` recebe `rate_limited`; o resto é descartado |
| Sinais    | `typing_start`, `typing_stop`                   | 40 / 8 por s           | Descartado em silêncio                                     |

## Conexão

- `ALLOWED_ORIGINS` definida: handshake de origem não listada recebe HTTP 403.
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

| Código de fechamento | Motivo                                                                      |
| -------------------- | --------------------------------------------------------------------------- |
| 1001                 | Servidor desligando                                                         |
| 1006                 | Encerrada pelo heartbeat ou por cliente lento (sem handshake de fechamento) |
| 1009                 | Quadro acima de `MAX_PAYLOAD_BYTES`                                         |
| 1013                 | Servidor no teto de conexões                                                |
| 4001                 | Não entrou na sala dentro do prazo                                          |

## HTTP na mesma porta

| Rota            | Resposta                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /`         | `200 ok` (texto) — checagem de saúde simples                                                                                    |
| `GET /healthz`  | Liveness: `200` JSON `{ status, uptimeSec, connections, users }`                                                                |
| `GET /readyz`   | Readiness: `200 {"status":"ready"}`; `503` com `draining` ou `full`                                                             |
| `GET /metrics`  | Só com `METRICS_ENABLED=true` (senão `404`): contadores, tempo de processamento, event loop, CPU e memória — sem dados pessoais |
| outros caminhos | `404`; métodos diferentes de GET/HEAD: `405`                                                                                    |
