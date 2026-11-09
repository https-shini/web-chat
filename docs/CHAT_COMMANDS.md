# Comandos do chat · web-chat

> Comandos digitados no campo de mensagem, no espírito dos comandos do Minecraft:
> curtos, diretos, fáceis de descobrir. Este documento lista **somente o que está
> disponível**; o que é planejado está separado em [§8](#8-comandos-planejados).

## 1. Como usar

- Digite `/` no campo de mensagem: aparecem as sugestões (setas navegam, **Tab** ou
  **Enter** completam, **Escape** fecha, toque/clique escolhe).
- Depois do nome, a sugestão mostra a sintaxe do comando.
- `/help` lista tudo; `/help nome` explica um comando.
- Para enviar uma mensagem que começa com `/`, use `//`: `//help` envia o texto
  `/help`.
- `1/2`, `a/b` e `/ olá` (barra seguida de espaço) são mensagens comuns.

## 2. Arquitetura

```
Navegador                                            Servidor
┌───────────────────────────────────┐                ┌──────────────────────────────────────────┐
│ commands/input.js                 │  "command"     │ transport/connection.js                  │
│   lê só o NOME e decide:          │  {requestId,   │   limite de taxa (balde de mensagens)    │
│   mensagem | local | servidor ────┼──  text} ─────►│ commands/executor.js — único interpretador│
│ commands/local.js (/help /clear   │                │   parser → registro → permissão →         │
│   /time), a partir do catálogo    │                │   argumentos → intervalo → handler        │
│ commands/autocomplete.js          │◄── catálogo ───│ commands/registry.js — FONTE OFICIAL      │
│ ui/commandSuggestions.js (ARIA)   │◄── resultado ──│ commands/handlers/*.js                    │
└───────────────────────────────────┘                │   → room/room.js (regras) + room/policy.js│
                                                     └──────────────────────────────────────────┘
```

| Peça          | Arquivo                                                                                        | Papel                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro      | `backend/src/commands/registry.js`                                                             | Lista oficial: nome, aliases, categoria, descrição, sintaxe, exemplos, parâmetros, permissão, escopo, handler. Recusa nome/alias duplicado. Gera o catálogo enviado ao cliente. |
| Parser        | `backend/src/commands/parser.js`                                                               | `/nome resto` → nome minúsculo + resto da linha; argumentos com aspas (`"João Silva"`). Só texto: sem `eval`, sem execução de nada.                                             |
| Validador     | `backend/src/commands/validator.js`                                                            | Converte e valida argumentos (`int`, `word`, `choice`, `text`).                                                                                                                 |
| Executor      | `backend/src/commands/executor.js`                                                             | Único interpretador. Permissão, argumentos, intervalo mínimo, execução, resposta. Nunca registra argumentos em log.                                                             |
| Respostas     | `backend/src/commands/response.js`                                                             | Tons padronizados e códigos de erro.                                                                                                                                            |
| Permissões    | `backend/src/room/policy.js`                                                                   | Quem pode o quê e com quem (hierarquia). Usada por comandos e regras da sala.                                                                                                   |
| Administração | `backend/src/commands/adminAuth.js`                                                            | Chave `ADMIN_KEY`, comparação em tempo constante, bloqueio.                                                                                                                     |
| Handlers      | `backend/src/commands/handlers/{basic,profile,social,formatting,admin}.js`                     | Um arquivo por categoria; chamam as operações da sala — nenhuma regra duplicada.                                                                                                |
| Cliente       | `frontend/src/commands/{input,autocomplete,local}.js`, `frontend/src/ui/commandSuggestions.js` | Encaminhamento, sugestões e comandos locais, sempre a partir do catálogo do servidor.                                                                                           |

**Uma regra por operação.** `/me`, `/roll`, `/flip`, `/announce`, formatação e a
mensagem digitada passam pela mesma função `room.publish`: silêncio, histórico,
anti-duplicação e ids valem igual para todos. Não há segundo interpretador no
cliente: ele só lê o nome para saber se o comando é local.

## 3. Permissões

| Permissão   | Quem                                         | Como se obtém                                                                   |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| `everyone`  | Qualquer pessoa com sessão                   | Entrando no chat                                                                |
| `moderator` | Anfitrião **da sala** ou administrador       | Criando a sala (ou herdando o papel de quem a criou), ou sendo administrador    |
| `admin`     | Administradores (globais, em todas as salas) | `/admin <chave>`, com a chave definida em `ADMIN_KEY` por quem opera o servidor |

- **Desde a Fase 2 da evolução (várias salas)** a moderação é **por sala**: o
  comando roda na conversa informada em `payload.conversationId`, e o executor
  confere que a sessão participa dela e qual é o papel dela **ali**. Anfitrião de
  uma sala não tem poder em outra.
- Comandos de sala (marcados `requiresRoom` no catálogo — `/users`, `/me`, `/roll`,
  formatação, moderação, `/invite`) recusam com `no_conversation` quando chegam sem
  uma conversa válida. Comandos gerais (`/ping`, `/nick`, `/afk`, `/rooms`, `/id`…)
  funcionam sem.
- O papel fica no servidor. Nada vem do cliente: `role`,
  `isAdmin` ou `userId` em qualquer payload são ignorados (há teste para isso).
- Sem `ADMIN_KEY` configurada, a administração fica **desativada**: os comandos
  administrativos aparecem com 🔒 e respondem que não há permissão; `/admin`
  responde que está desativada. Não existe controle administrativo fingido.
- `/admin`: comparação em tempo constante; 5 erros bloqueiam aquela identidade por
  10 min; mais de 20 erros por minuto no servidor bloqueiam todas as tentativas por
  1 min. A chave nunca é registrada em log, nem ecoada na tela.
- Hierarquia de moderação: só quem modera a sala modera alguém nela; ninguém modera
  a si mesmo; administrador não é moderado por ninguém; anfitrião só é moderado por
  administrador.
- O papel de anfitrião passa para quem está na sala há mais tempo quando o
  anfitrião sai de vez (sai da sala, encerra a sessão ou não volta no prazo de
  retomada). Uma queda curta não passa o papel.
- Os papéis duram enquanto a identidade existir (inclusive em reconexões com o
  token); somem quando o servidor reinicia.

## 4. Comandos disponíveis (30)

### Básicos

| Comando    | Aliases               | Sintaxe           | O que faz                                                                                                                        | Onde roda |
| ---------- | --------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `/help`    | `/ajuda`, `/comandos` | `/help [comando]` | Lista os comandos por categoria ou explica um (uso, aliases, exemplos, permissão)                                                | navegador |
| `/clear`   | `/limpar`             | `/clear`          | Limpa a conversa **só na sua tela**. Não apaga nada no servidor nem afeta ninguém; o histórico não traz essas mensagens de volta | navegador |
| `/time`    | `/hora`, `/date`      | `/time`           | Data e hora deste dispositivo                                                                                                    | navegador |
| `/users`   | `/online`, `/who`     | `/users`          | Quem está na sala, com @username, id curto, papel, ausência e silêncio                                                           | servidor  |
| `/ping`    | —                     | `/ping`           | Tempo de **ida e volta** da sua mensagem até o servidor (inclui o processamento)                                                 | servidor  |
| `/about`   | `/sobre`              | `/about`          | O que é o chat                                                                                                                   | servidor  |
| `/version` | `/versao`             | `/version`        | Versão do servidor e tempo no ar                                                                                                 | servidor  |
| `/rules`   | `/regras`             | `/rules`          | Regras de convivência                                                                                                            | servidor  |

### Salas

| Comando   | Aliases               | Sintaxe   | O que faz                                                                  |
| --------- | --------------------- | --------- | -------------------------------------------------------------------------- |
| `/invite` | `/convite`, `/codigo` | `/invite` | Mostra o código de convite da sala (só para quem já está nela)             |
| `/rooms`  | `/salas`              | `/rooms`  | Lista as salas de que você participa, com o código e se você é o anfitrião |

### Perfil

| Comando    | Aliases             | Sintaxe                 | O que faz                                                                                                     |
| ---------- | ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/nick`    | `/nome`             | `/nick <novo nome>`     | Troca o nome de exibição (no máximo 1 troca a cada 10 s). O id não muda. Todas as suas salas são avisadas     |
| `/profile` | `/whois`, `/perfil` | `/profile [nome ou id]` | Perfil público de alguém **da sala**: @username, id, papel na sala, status, desde quando está nela, mensagens |
| `/id`      | —                   | `/id`                   | Seu id completo (atribuído pelo servidor)                                                                     |
| `/me`      | —                   | `/me <ação>`            | Publica uma ação em terceira pessoa: “Ana está estudando”                                                     |
| `/afk`     | `/away`, `/ausente` | `/afk [motivo]`         | Marca ausência em todas as suas salas. Repetir `/afk` ou enviar uma mensagem (em qualquer sala) volta         |

### Interação

| Comando | Aliases           | Sintaxe                            | O que faz                                                                                                      |
| ------- | ----------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `/roll` | `/dice`, `/dado`  | `/roll`, `/roll 20`, `/roll 1 100` | Rola um dado **no servidor** (`crypto.randomInt`) e mostra a todos. Sem números: 1–6. Até 1.000.000 de valores |
| `/flip` | `/coin`, `/moeda` | `/flip`                            | Cara ou coroa, sorteado no servidor, para todos                                                                |

### Formatação

| Comando      | Aliases    | Sintaxe              | Resultado                                                                         |
| ------------ | ---------- | -------------------- | --------------------------------------------------------------------------------- |
| `/shrug`     | —          | `/shrug [texto]`     | `texto ¯\_(ツ)_/¯`                                                                |
| `/tableflip` | —          | `/tableflip [texto]` | `texto (╯°□°)╯︵ ┻━┻`                                                             |
| `/unflip`    | —          | `/unflip [texto]`    | `texto ┬─┬ノ( º _ ºノ)`                                                           |
| `/bold`      | `/negrito` | `/bold <texto>`      | Texto em negrito                                                                  |
| `/italic`    | `/italico` | `/italic <texto>`    | Texto em itálico                                                                  |
| `/code`      | —          | `/code <texto>`      | Texto em fonte monoespaçada                                                       |
| `/spoiler`   | —          | `/spoiler <texto>`   | Texto escondido; cada pessoa decide quando revelar (também para leitores de tela) |

A formatação é aplicada pelo servidor (`payload.format`) e desenhada pelo cliente
com elementos (`<strong>`, `<em>`, `<code>`, botão) — nunca com HTML vindo da rede.

### Moderação

| Comando     | Permissão | Sintaxe                        | O que faz                                                                                                                     |
| ----------- | --------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `/admin`    | todos     | `/admin <chave>`               | Torna você administrador global, se a chave estiver certa                                                                     |
| `/clearall` | moderator | `/clearall confirmar`          | Apaga o histórico **desta sala** para todos. Sem `confirmar`, só explica o efeito                                             |
| `/announce` | moderator | `/announce <texto>`            | Aviso destacado para a sala                                                                                                   |
| `/mute`     | moderator | `/mute <nome ou id> [minutos]` | Impede alguém de publicar **nesta sala**, por 1–1440 min ou até `/unmute`                                                     |
| `/unmute`   | moderator | `/unmute <nome ou id>`         | Libera                                                                                                                        |
| `/kick`     | moderator | `/kick <nome ou id>`           | Remove alguém **desta sala** agora. A pessoa continua conectada e nas outras salas, mas não volta a esta enquanto ela existir |

**Alvos:** `@username` (exato e único — o jeito recomendado), nome (sem diferenciar
maiúsculas) ou id/prefixo de id com 6+ caracteres (veja `/users`). Nome com espaço
vai entre aspas: `/mute "João Silva" 5`. Nomes repetidos pedem o `@username`.

**`/clearall` — o que acontece de fato:**

- o histórico em memória do servidor é descartado e a versão do histórico muda;
- quem está na sala recebe `chat_cleared` e a conversa some da tela;
- quem estava fora e volta com o token percebe pela versão no `room_joined` e
  descarta a conversa antiga;
- quem entra depois não vê nada;
- **não** há como apagar cópias que alguém tenha feito (captura de tela, cópia do
  texto). O servidor não guarda nada em disco, então não há “exclusão permanente” a
  prometer além da memória;
- a operação é registrada no log (`moderation_action`, com ids e a conversa — sem
  conteúdo nem código de convite).

**Limites conhecidos de `/mute` e `/kick`:** valem para a identidade emitida pelo
servidor, naquela sala. Como o chat é anônimo, quem abrir uma nova aba entra como
identidade nova e, se tiver o código, pode voltar à sala. Quem modera pode então
criar uma sala nova e chamar só quem quer. Banimento exige identificação
persistente (fora do escopo; ver §8).

## 5. Respostas

Todo comando enviado ao servidor recebe **exatamente uma** resposta
`command_result` (só para quem executou), correlacionada pelo `requestId`:

| Tom       | Uso                                                     | Aparência                     |
| --------- | ------------------------------------------------------- | ----------------------------- |
| `info`    | Informação (`/about`, `/rules`)                         | Traço neutro                  |
| `success` | Ação concluída (`/nick`, `/afk`)                        | Traço e texto verdes          |
| `warning` | Pede atenção ou confirmação (`/clearall` sem confirmar) | Traço e texto na cor da marca |
| `error`   | Recusa, com código (abaixo)                             | Traço e texto vermelhos       |
| `result`  | Resultado de consulta (`/users`, `/profile`, `/id`)     | Traço neutro                  |
| `admin`   | Evento administrativo (`/admin`)                        | Cor da marca                  |

Quando o efeito já aparece para a sala (`/me`, `/roll`, `/mute`, `/clearall`…), a
resposta tem texto vazio e o cliente não mostra nada. Mensagens publicadas por
comandos são mensagens de chat com `kind` (`action`, `roll`, `announcement`) ou
`format`; avisos de moderação e de nome são eventos `notice`.

### Códigos de erro

| Código                                                | Quando                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `unknown_command`                                     | Comando inexistente (com sugestões parecidas)                      |
| `invalid_command`                                     | Texto que não é comando                                            |
| `invalid_arguments`                                   | Argumentos faltando, a mais ou inválidos (a resposta mostra o uso) |
| `forbidden`                                           | Sem permissão (ex.: comando de administrador)                      |
| `not_found` / `ambiguous_target`                      | Alvo inexistente / nome repetido                                   |
| `cannot_moderate`                                     | Hierarquia (a si mesmo ou outro administrador)                     |
| `cooldown`                                            | Intervalo mínimo (ex.: `/nick`)                                    |
| `muted`                                               | Você está silenciado e o comando publicaria algo                   |
| `confirmation_required`                               | `/clearall` sem `confirmar`                                        |
| `admin_disabled` / `admin_locked` / `admin_wrong_key` | `/admin`                                                           |
| `client_command`                                      | Comando local enviado ao servidor (cliente desatualizado)          |
| `not_logged_in`                                       | Antes de entrar na sala                                            |

## 6. Segurança e limites

- Comandos consomem o **mesmo balde de mensagens** da conexão (40 em rajada, 8/s):
  quem abusa de comandos limita só a si mesmo, e excesso recebe `rate_limited` (com
  `ref` = `requestId`).
- O servidor é a única autoridade: identidade, papel e silêncio vêm da identidade
  emitida por ele.
- Nada é executado: sem `eval`, sem processo do sistema, sem interpolação em HTML.
- Logs: `command_executed` com id da pessoa, nome do comando e resultado — nunca os
  argumentos.
- Métricas: `commandsExecuted{comando}` e `commandsRejected{código}` (cardinalidade
  fechada).

## 7. Como criar um comando

1. Escolha a categoria e edite o arquivo em `backend/src/commands/handlers/`.
2. Acrescente a definição:

    ```js
    {
        name: "exemplo",              // minúsculas; único
        aliases: ["ex"],              // também únicos
        category: "social",
        description: "Explica em uma frase.",
        syntax: "/exemplo <texto>",
        examples: ["/exemplo olá"],
        permission: PERMISSIONS.EVERYONE, // ou ADMIN
        params: [{ name: "texto", type: "text" }],
        cooldownMs: 0,
        run: (ctx) => ctx.reply.success(`Você disse ${ctx.args.texto}`),
    }
    ```

3. Use as operações da sala (`ctx.room.publish`, `rename`, `setMuted`…) e a política
   (`room/policy.js`) — não reimplemente regra.
4. Devolva `ctx.reply.*` ou `null` (efeito já visível na sala).
5. O catálogo, o autocomplete e o `/help` passam a mostrá-lo sozinhos. O teste
   `backend/test/unit/commands.test.js` confere a contagem total — atualize-a.
6. Escreva testes de unidade (handler/regra) e de integração (ponta a ponta).

Comando que roda no navegador: `scope: "client"` no registro (sem `run`) e o handler
em `frontend/src/commands/local.js` + `runLocalCommand` em `main.js`.

## 8. Comandos planejados

**Não disponíveis.** Do catálogo de referência de 100 comandos, 28 foram
implementados. Os demais dependem de infraestrutura que não existe ou de decisão de
produto:

| Grupo              | Comandos                                                                                  | Dependência                                                            |
| ------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Salas              | `/room /rooms /join /leave /create /invite /members /owner /privacy /description`         | Várias salas (o produto tem uma sala só)                               |
| Banimento e avisos | `/ban /unban /warn /warnings /clearwarnings`                                              | Identificação persistente (a sala é anônima)                           |
| Papéis             | `/promote /demote /admins`                                                                | Hoje o papel vem da chave; promover sem chave exige decisão de produto |
| Chat               | `/topic /slow /slowmode /lock /unlock`                                                    | Estado da sala configurável (factível; não priorizado)                 |
| Jogos              | `/rps /guess /trivia /quiz /count /choose /team /word /number /score /8ball /joke /quote` | Estado de jogo e conteúdo                                              |
| Preferências       | `/theme /dark /light /sound /notify /compact /comfortable /settings`                      | Preferências locais (o tema já existe pelo botão)                      |
| Utilidades         | `/search /find /last /stats /uptime /report /bug /feedback`                               | Busca no histórico local; canal de denúncia                            |
| Perfil             | `/avatar /status /back`                                                                   | `/status` e `/back` ficaram cobertos por `/afk`; avatar exige imagens  |
| Formatação         | `/reverse /upper /lower /length`                                                          | Simples; não priorizados                                               |

Sobreposições do catálogo resolvidas com uma definição só: `/online` → alias de
`/users`; `/date` → `/time`; `/whois` → `/profile`; `/dice` → `/roll`; `/coin` →
`/flip`; `/status`/`/back` → `/afk`.

## 9. Como testar

```bash
npm test
```

| Arquivo                                     | Cobre                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/test/unit/commands.test.js`        | Parser, argumentos e aspas, registro (duplicados, 30 comandos, aliases), catálogo por permissão, chave de administrador e bloqueios, política                                                                                                                                          |
| `backend/test/unit/roomPhase4.test.js`      | Publicação única, anti-duplicação, silêncio, nome, ausência, limpeza, remoção, janela de retomada                                                                                                                                                                                      |
| `backend/test/integration/commands.test.js` | Ponta a ponta com servidor real, incluindo: usuário comum em `/clear` e `/clearall`, administrador em `/clearall` com dois usuários, texto com `/` que não executa, comando inexistente, manipulação de permissão pelo cliente, `/mute`, `/kick`, hierarquia, administração desativada |
| `frontend/test/commands.test.js`            | Encaminhamento (`1/2`, `//`, aliases), autocomplete (`/cl` → `/clear`, `/clearall`), `/help`, `/time`                                                                                                                                                                                  |
| `frontend/test/delivery.test.js`            | Respostas, catálogo, avisos, `/clear` local, `chat_cleared`                                                                                                                                                                                                                            |

Para experimentar localmente com administração, defina `ADMIN_KEY` no `.env` da raiz
(16+ caracteres) e rode `npm run dev`.
