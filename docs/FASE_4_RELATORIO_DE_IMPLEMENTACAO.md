# Fase 4 · Relatório de implementação

> **Data:** 2026-11-07 · **Branch:** `claude/quirky-brown-37zb70` · **Base:** commit
> `995c358` (fim da Fase 3).
> Escopo: evolução funcional (Prompt 1) e sistema de comandos do chat (Prompt 2),
> integrados. Referências: [`CHAT_COMMANDS.md`](./CHAT_COMMANDS.md),
> [`PROTOCOLO.md`](./PROTOCOLO.md), relatórios das Fases [1](./FASE_1_RELATORIO_DE_IMPLEMENTACAO.md),
> [2](./FASE_2_RELATORIO_DE_IMPLEMENTACAO.md) e [3](./FASE_3_RELATORIO_DE_IMPLEMENTACAO.md).

## 1. Resumo executivo

A sala ganhou o que faltava para ser um produto usável por um grupo: **28 comandos**
com autocomplete e ajuda descobríveis no próprio campo de mensagem, **administração
real** (por chave do operador, verificada no servidor), **moderação** (silenciar,
remover, limpar a sala, anunciar), **presença** (ausente) e **troca de nome**,
**confirmação de entrega** com "tentar de novo" sem duplicar, e **reconexão sem
avisos repetidos**. Tudo sem banco de dados, sem dependência nova e sem mudar a
stack.

| Item                                         | Resultado                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Comandos disponíveis                         | 28 (27 da primeira entrega pedida + `/admin`)                                               |
| Comandos planejados (catálogo de referência) | 72, documentados como não disponíveis                                                       |
| Tarefas do roadmap                           | F4-01, F4-02, F4-03 concluídas; F4-04 parcial; F4-05 pendente (V07)                         |
| Testes                                       | 193 → **265** (backend 106 unidade + 91 integração; frontend 68), todos verdes, 2 execuções |
| Navegador real                               | 27/27 verificações (autocomplete por teclado, comandos, moderação, entrega, remoção)        |
| Lint, tipos, contraste, formatação, build    | Verdes                                                                                      |
| Carga (cenários B e D)                       | Sem regressão relevante (§7)                                                                |
| Dependências novas                           | Nenhuma                                                                                     |

## 2. Diagnóstico funcional (Ciclo 1)

Validado no código e nos testes, não só na documentação.

| Recurso                         | Antes da Fase 4                                                               | Depois                                                        |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Entrada e saída                 | Implementado                                                                  | Implementado; saída anunciada após janela de retomada         |
| Identificação dos participantes | Implementado (id do servidor, monograma, cor)                                 | + `/profile`, `/users` com id curto                           |
| Gerenciamento de salas          | Inexistente (uma sala, por definição do produto)                              | Inalterado — salas múltiplas seguem fora do escopo            |
| Envio de mensagens              | Implementado, **sem confirmação**: descarte silencioso possível               | Implementado com confirmação, falha visível e reenvio         |
| Recebimento                     | Implementado                                                                  | + variedades (ação, dado, aviso) e formatação                 |
| Reconexão                       | Implementado; **necessitava correção**: queda gerava "saiu/entrou" para todos | Corrigido (janela de 10 s)                                    |
| Digitação                       | Implementado                                                                  | Inalterado; comandos não disparam "digitando"                 |
| Estados de conexão              | Implementado                                                                  | + estado "removido" (sem reconexão automática)                |
| Interação entre participantes   | Parcial (só texto)                                                            | + `/me`, `/roll`, `/flip`, formatação                         |
| Histórico                       | Implementado (memória)                                                        | + limpeza da sala por administrador, com versão               |
| Feedback de operações           | Parcial (toasts)                                                              | + respostas de comando por tom, estado de entrega             |
| Erros                           | Implementado (códigos)                                                        | + `muted`, códigos de comando, `ref` do envio recusado        |
| Presença                        | Inexistente além de "online"                                                  | Ausente com motivo                                            |
| Papéis e moderação              | Inexistente                                                                   | Administrador por chave; silenciar, remover, anunciar, limpar |
| Comandos                        | Inexistente                                                                   | 28                                                            |

## 3. Priorização

| Prioridade | Melhoria                                                     | Valor                           | Complexidade | Situação                             |
| ---------- | ------------------------------------------------------------ | ------------------------------- | ------------ | ------------------------------------ |
| P0         | Confirmação de entrega + reenvio sem duplicar (F4-02, F4-03) | Nenhuma mensagem some sem aviso | Média        | Feito                                |
| P0         | Reconexão sem avisos repetidos (F4-01)                       | Fim do ruído em rede instável   | Média        | Feito                                |
| P1         | Sistema de comandos + autocomplete + `/help`                 | Descoberta e atalhos            | Alta         | Feito                                |
| P1         | Administração confiável + moderação                          | Sala pública moderável          | Alta         | Feito                                |
| P1         | Presença e troca de nome                                     | Identificação e contexto        | Baixa        | Feito                                |
| P2         | Ações, dados, formatação, avisos                             | Expressividade                  | Baixa        | Feito                                |
| P2         | Limpeza de código morto (F4-04)                              | Manutenção                      | Baixa        | Parcial                              |
| P3         | Responder, editar, excluir mensagem                          | Organização                     | Média        | Adiado (§9)                          |
| P3         | Tópico/descrição da sala, modo lento, trava                  | Gestão da sala                  | Média        | Adiado                               |
| P3         | Banimento, avisos de moderação                               | Moderação forte                 | Alta         | Depende de identificação persistente |
| P3         | Nomes distinguíveis (F4-05)                                  | Evitar confusão                 | Baixa        | Aguarda V07                          |

## 4. Regras de negócio

### 4.1 Atores e permissões

| Ator                 | Como surge                                          | Pode                                                                      |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Participante         | Entra com um nome; identidade emitida pelo servidor | Enviar mensagens, usar comandos públicos, mudar o próprio nome e presença |
| Administrador        | Participante que provou a `ADMIN_KEY` com `/admin`  | Tudo acima + `/clearall`, `/announce`, `/mute`, `/unmute`, `/kick`        |
| Operador do servidor | Quem define `ADMIN_KEY` no ambiente                 | Distribuir a chave; sem chave, não há administradores                     |

Autorização **sempre no servidor**: papel e silêncio ficam na identidade emitida
pelo servidor (`room/sessions.js`); decisões em `room/policy.js` (`hasPermission`,
`canModerate`, `isMuted`). Campos `role`, `isAdmin`, `userId` vindos do cliente são
ignorados em qualquer evento.

### 4.2 Operações

| Operação                                                              | Condições                                                                | Efeito                                                                               | Eventos                                  | Erros                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------- |
| Publicar (mensagem, `/me`, `/roll`, `/flip`, formatação, `/announce`) | Na sala; não silenciado; conteúdo 1–1000; `kind` especial só por comando | Histórico + broadcast; encerra ausência; reenvio com mesmo `clientMsgId` não duplica | `chat_message`                           | `muted`, `empty_message`, `invalid_message`, `rate_limited` (com `ref`) |
| Trocar nome (`/nick`)                                                 | 1–30 visíveis; 1 troca/10 s                                              | Nome muda, id não                                                                    | `notice`, `user_list`                    | `invalid_arguments`, `cooldown`                                         |
| Ausência (`/afk`)                                                     | Na sala                                                                  | `status: away` + motivo; volta ao falar ou repetir                                   | `user_list`                              | —                                                                       |
| Tornar-se admin (`/admin`)                                            | `ADMIN_KEY` configurada; chave correta; sem bloqueio                     | Papel `admin`; catálogo reenviado                                                    | `notice`, `user_list`, `command_catalog` | `admin_disabled`, `admin_wrong_key`, `admin_locked`                     |
| Limpar sala (`/clearall confirmar`)                                   | Admin; confirmação explícita                                             | Histórico descartado; `historyVersion`+1                                             | `chat_cleared`; log `admin_action`       | `forbidden`, `confirmation_required`                                    |
| Silenciar / liberar                                                   | Admin; alvo único; hierarquia                                            | `mutedUntil` (prazo ou sem prazo)                                                    | `notice`                                 | `forbidden`, `not_found`, `ambiguous_target`, `cannot_moderate`         |
| Remover (`/kick`)                                                     | Admin; alvo único; hierarquia                                            | Sai na hora; token revogado; conexão fechada com 4003                                | `user_left{reason: removed}`, `notice`   | idem                                                                    |
| Reconectar                                                            | Token válido                                                             | Mesmo id; dentro da janela, sem avisos                                               | `session`                                | —                                                                       |

### 4.3 Estados

- **Entrega (cliente):** `pending` → `confirmed` (eco com o mesmo `clientMsgId`) ou
  `failed` (erro com `ref`, ou 10 s sem confirmação depois de sair pela rede) →
  `pending` de novo ao "Tentar de novo" (mesmo `clientMsgId`).
- **Presença:** `online` ↔ `away`.
- **Papel:** `member` → `admin` (não há rebaixamento nesta fase; o papel some com o
  reinício do servidor).
- **Silêncio:** livre → silenciado (com ou sem prazo) → livre.
- **Conexão (cliente):** + `offline` com `closeCode` 4003 (removido), sem reconexão
  automática; "Entrar de novo" cria identidade nova.

## 5. Implementação

### 5.1 Backend

| Arquivo                            | Mudança                                                                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/commands/` (novo)             | `registry`, `parser`, `validator`, `executor`, `response`, `adminAuth`, `index`, `handlers/{basic,profile,social,formatting,admin,shared}`                                                                                               |
| `src/room/policy.js` (novo)        | Permissões, hierarquia, silêncio                                                                                                                                                                                                         |
| `src/room/room.js`                 | `publish` único; anti-duplicação (20 recentes por identidade conectada); `rename`, `setAway`, `grantAdmin`, `clearHistory`, `setMuted`, `remove`, `findMembers`, `listMembers`; janela de retomada com avisos cancelados no desligamento |
| `src/room/sessions.js`             | Campos de papel, presença, silêncio, contadores; `revoke`                                                                                                                                                                                |
| `src/protocol.js`, `src/errors.js` | Eventos `command`, `command_catalog`, `command_result`, `notice`, `chat_cleared`; `kind`, `format`, `clientMsgId`, `role`, `historyVersion`, `ref`; código `muted`; `CLOSE_CODES`                                                        |
| `src/transport/connection.js`      | Rota `command`; catálogo após login; `ref` nas recusas; aviso de limite também para comandos                                                                                                                                             |
| `src/transport/chatServer.js`      | Executor de comandos, `deliver` compartilhado, desconexão por remoção, agendador da janela de retomada                                                                                                                                   |
| `src/config.js`                    | `ADMIN_KEY` (16–200, sem espaços; nunca em mensagem de erro), `LEAVE_GRACE_MS`                                                                                                                                                           |
| `src/server.js`                    | Versão para `/version`; log `admin_status` (só ligado/desligado)                                                                                                                                                                         |
| `src/metrics.js`                   | `commandsExecuted{comando}`, `commandsRejected{código}`                                                                                                                                                                                  |

### 5.2 Frontend

| Arquivo                                                                    | Mudança                                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/commands/{input,autocomplete,local}.js` (novos)                       | Encaminhamento (só o nome), sugestões a partir do catálogo, `/help`, `/time`                                                          |
| `src/ui/commandSuggestions.js` (novo)                                      | Combobox ARIA: setas, Tab/Enter, Escape, clique/toque; sintaxe depois do nome                                                         |
| `src/state/store.js`                                                       | Entrega (`pending`/`confirmed`/`failed`), `key` estável, catálogo, papel, `historyVersion`, `/clear` local que o histórico não desfaz |
| `src/state/events.js`                                                      | Eventos novos, normalização de `kind`/`format`/tons, `ref` → falha da mensagem certa                                                  |
| `src/ui/message.js`, `messageList.js`                                      | Variedades, formatação, spoiler acessível, estado de entrega **atualizado no lugar** (sem reanunciar)                                 |
| `src/ui/people.js`, `failure.js`, `composer.js`                            | Etiquetas "admin"/"ausente"; tela "Você foi removido"; ganchos do autocomplete                                                        |
| `src/transport/socket.js`                                                  | `send` informa se saiu ou ficou na fila; 4003 encerra sem reconectar                                                                  |
| `src/main.js`                                                              | Encaminhamento, envio com `clientMsgId`, reenvio, prazo de confirmação, `/ping` medido no cliente                                     |
| `index.html`, CSS (`command-suggestions.css`, `message.css`, `people.css`) | Lista de sugestões; placeholder "digite / para comandos"; estilos só com tokens e pares de contraste já medidos                       |

**Mudança de comportamento intencional:** a mensagem recusada por limite de taxa não
volta mais ao campo (Fase 1); agora ela fica na conversa como "não enviada", com
"Tentar de novo" — mais claro e sem risco de perder texto que a pessoa já tinha
começado a escrever.

### 5.3 Integração Fase 4 × comandos

- **Um interpretador** (servidor). O cliente só lê o nome para separar comandos
  locais (`/help`, `/clear`, `/time`).
- **Registro central** é a fonte do catálogo; autocomplete e `/help` não têm lista
  própria.
- **Uma regra por operação:** mensagem digitada e comandos que publicam usam
  `room.publish`; moderação usa `room/policy.js`. Não há botões de moderação na
  interface nesta fase — por isso não há caminho duplicado.
- **Respostas padronizadas:** exatamente uma `command_result` por comando.

## 6. Protocolo

Todas as mudanças são **aditivas** (detalhes em [`PROTOCOLO.md`](./PROTOCOLO.md)):

| Direção    | Novo                                                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C → S      | `command {requestId, text}`; `chat_message.clientMsgId`                                                                                                                                                                                                               |
| S → C      | `command_catalog`, `command_result`, `notice`, `chat_cleared`; em `session`: `role`, `historyVersion`; em `chat_message`: `kind`, `format`, `clientMsgId`; em `user_left`: `userId`, `reason`; em `user_list`: `status` real, `role`, `statusText`; em `error`: `ref` |
| Fechamento | 4003 removido                                                                                                                                                                                                                                                         |

**Compatibilidade:** cliente antigo + servidor novo — conversa funciona; comandos
digitados por ele viram mensagens comuns (texto `/x`), variedades aparecem como
texto, e não há confirmação de entrega. Cliente novo + servidor antigo — sem
catálogo, o autocomplete não abre e todo `/x` vai ao servidor como comando (que o
servidor antigo recusa como tipo desconhecido); mensagens comuns são entregues, mas
na tela de quem envia aparecem duas vezes — o eco do servidor e a cópia pendente, que
vira "não enviada" após o prazo (o servidor antigo não ecoa `clientMsgId`).
**Publique backend e frontend juntos.**

## 7. Testes e resultados (Ciclo 5)

| Suíte                |  Fase 3 |  Fase 4 | Novos                                                                                                                                                                                                     |
| -------------------- | ------: | ------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend — unidade    |      77 |     106 | parser, validador, registro (28, aliases, duplicados), catálogo por permissão, `/admin` e bloqueios, política, publicação/anti-duplicação, silêncio, nome, ausência, limpeza, remoção, janela de retomada |
| Backend — integração |      74 |      91 | 17 em `commands.test.js` (abaixo)                                                                                                                                                                         |
| Frontend — unidade   |      42 |      68 | encaminhamento, autocomplete, `/help`, `/time`, entrega, reenvio, prazo, histórico, `/clear`, `chat_cleared`, `historyVersion`, catálogo, avisos                                                          |
| **Total**            | **193** | **265** |                                                                                                                                                                                                           |

**Os 8 cenários exigidos pelo Prompt 2:**

| #   | Cenário                              | Onde                             | Resultado                                                                         |
| --- | ------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Usuário comum executando `/clear`    | integração + navegador           | Só a tela dele limpa; servidor e outros intactos                                  |
| 2   | Usuário comum tentando `/clearall`   | integração + navegador           | `forbidden`                                                                       |
| 3   | Administrador executando `/clearall` | integração + navegador           | Pede confirmação; com `confirmar`, limpa                                          |
| 4   | Dois usuários vendo o efeito         | integração + navegador           | Ambos recebem `chat_cleared`; quem entra depois não vê nada                       |
| 5   | `/cl` sugere comandos                | unidade + navegador              | `/clear` e `/clearall` (restrito marcado)                                         |
| 6   | Mensagem com `/` não é comando       | unidade + integração + navegador | `1/2 pizza` e até `"/clearall confirmar"` enviado como mensagem não executam nada |
| 7   | Comando inexistente                  | integração + navegador           | `unknown_command` com sugestão                                                    |
| 8   | Manipular permissões pelo cliente    | unidade + integração             | `role`/`isAdmin`/`userId` no login e no comando ignorados → `forbidden`           |

Também testados ponta a ponta: `/admin` (chave errada, bloqueio, chave fora dos
logs, catálogo reenviado), `/announce`, `/me`, `/roll` (faixa válida e inválida),
`/flip`, `/spoiler`, `/shrug`, `/nick`, `/afk`, `/users`, `/profile`, `/id`,
`/ping`, `/rules`, `/version`, `/about`, `/mute` (com `ref` do envio recusado),
`/unmute`, `/kick` (4003, aviso, token revogado), hierarquia, administração
desativada, reenvio sem duplicar, janela de retomada.

**Navegador real** (Chromium, backend + `vite`, `ADMIN_KEY` definida), 27/27:
autocomplete (`/` lista 28, `aria-expanded`, `/cl`, seta, Tab, sintaxe, Escape),
mensagem com `/` confirmada, `/help roll`, comando inexistente, `/clearall` recusado
para Beto, `/admin` sem expor a chave, etiqueta "admin", `/me`/`/roll` como ação,
`/announce` destacado, spoiler revelado por clique, `/clear` só na tela do Beto,
"ausente" na lista, mensagem do silenciado "não enviada" → "Tentar de novo" após
`/unmute` entrega uma vez, `/clearall` nos dois navegadores, `/kick` com tela de
remoção e "Entrar de novo", nenhum erro de console. Verificado também em 375 px: sem
rolagem horizontal.

**Regressão:** os testes das Fases 1–3 seguem verdes; dois testes de unidade do
frontend foram atualizados para os comportamentos intencionais da §5.2 (mensagem
recusada vira "não enviada"; `user_list` traz presença e papel), e o teste de
configuração ganhou os campos novos. O helper de integração define
`LEAVE_GRACE_MS=0` para os testes antigos, que esperam o aviso de saída na hora; a
janela tem testes próprios.

**Carga** (cenários da Fase 3): entrada de 200 pessoas 242 → 294 ms e 7,7 → 9,9 MB
(o catálogo de comandos, ~11 KB, vai a cada pessoa que entra); latência de chat p95
20 → 24 ms; reconexão de 20 em 62 ms; nenhuma identidade perdida. Variação
compatível com o recurso novo, sem regressão estrutural.

## 8. Segurança

Preservadas e verificadas: identidade pelo servidor, personificação, participação na
sala, limites separados, validação de payload e nome, login único, ids, log
injection, prazo de login, cliente lento.

Novas garantias: autorização centralizada (`policy.js`); cliente não forja
`kind: announcement`; chave de administrador em tempo constante, com bloqueio por
identidade e global, nunca registrada nem exibida; comandos não executam nada além
de handlers registrados; argumentos fora dos logs; ações administrativas
registradas (`admin_action`) com ids; comandos sob o limite de taxa existente;
reenvio idempotente; spoiler escondido também para leitores de tela até ser aberto.

## 9. Riscos residuais e pendências

| Item                                                                            | Situação                                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/mute` e `/kick` contornáveis abrindo nova aba (identidade nova)               | Limite da sala anônima; banimento exige identificação persistente (P3, decisão de produto)                    |
| Papel de admin some no reinício do servidor                                     | Por design (memória); a pessoa repete `/admin`                                                                |
| Quem tem a chave tem poder total; não há rebaixamento nem auditoria persistente | Distribuir a chave com cuidado; `admin_action` no log                                                         |
| Responder, editar, excluir mensagens                                            | Adiados (P3): exigem decidir regras de autoria/tempo e mudam o histórico                                      |
| Tópico da sala, modo lento, trava                                               | Adiados (P3)                                                                                                  |
| Toasts ainda não anunciados a leitores de tela                                  | F5-01 (Fase 5); falhas de entrega já são anunciadas pela região live                                          |
| F4-04 (código morto) parcial                                                    | `dom.toggle` e chaves de texto antigas ainda existem; `typingTracker.remove` e `status` passaram a ser usados |
| F4-05 (nomes distinguíveis)                                                     | Aguarda V07; `/users` mostra o id curto para diferenciar                                                      |
| Catálogo (~11 KB) enviado a cada entrada                                        | Aceitável (medido); compactar se a sala crescer                                                               |
| Push, merge, PR                                                                 | Não realizados — aguardam autorização                                                                         |

## 10. Pré-requisitos para a Fase 5

- A interface ganhou componentes novos (sugestões, respostas, estados de entrega);
  a revisão visual e de acessibilidade da Fase 5 deve incluí-los (F5-06).
- F5-01 (toasts anunciados) ficou mais importante: erros de comando aparecem na
  conversa, mas avisos como "silenciado" ainda saem por toast.
