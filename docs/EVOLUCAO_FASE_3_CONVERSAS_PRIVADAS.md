# Evolução · Fase 3 — Conversas privadas no servidor

> Continuação de [`EVOLUCAO_FASE_2_SALAS.md`](./EVOLUCAO_FASE_2_SALAS.md).
> Contrato completo em [`PROTOCOLO.md`](./PROTOCOLO.md#conversas-privadas).
> A interface das conversas privadas fica para as Fases 4 e 5.

## O que mudou

Duas identidades conectadas podem conversar em privado, mesmo sem dividir uma
sala. A conversa é aberta pelo `@` exato da pessoa, fica só em memória
e acaba, com o histórico, quando uma das duas a encerra, bloqueia a outra ou
deixa de existir.

| Módulo               | Papel                                                                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room/transcript.js` | **Novo.** Histórico limitado, versão e anti-duplicação, comuns a salas e conversas privadas. `room.js` passou a usá-lo, sem mudar de comportamento. |
| `room/direct.js`     | **Novo.** A conversa privada (duas identidades) e o diretório delas: uma por par, limites, fim.                                                     |
| `room/hub.js`        | Busca por `@`, abrir, encerrar, bloquear; mensagens e digitação de salas e conversas privadas pelo mesmo caminho (`resolveConversation`).           |
| `room/sessions.js`   | Índice por id interno, busca de quem está conectado pelo `@`, e as conversas privadas e os bloqueios de cada identidade.                            |

## Decisões

1. **Dois tipos de conversa, um caminho.** Salas (`r_…`) e conversas privadas
   (`d_…`) têm regras de autorização próprias, mas expõem as mesmas operações de
   mensagem e digitação. O frontend da Fase 4 trata as duas como "conversa".
2. **Par de ids internos, nunca o `@`.** O diretório indexa cada conversa pelo par
   de ids emitidos pelo servidor. Quem entra depois com o mesmo `@` é outra
   identidade e não acha nada.
3. **Busca sem enumeração.** Só o `@` exato, só quem está conectado, com limite por
   identidade. A resposta traz nome, `@` e id, e nada mais.
4. **Abrir não avisa.** A outra pessoa só fica sabendo da conversa com a primeira
   mensagem. Abrir conversas em massa não gera nenhum aviso para ninguém, e as
   conversas novas têm limite próprio.
5. **Encerrar apaga para as duas.** É o modelo combinado: nenhuma das duas fica com
   uma cópia no servidor. O que já está na tela de cada uma o servidor não alcança.
6. **Bloqueio silencioso.** Quem bloqueia some para quem foi bloqueado: conversa
   encerrada, busca vazia e `user_unavailable` ao tentar abrir — a mesma resposta
   de quem não existe. O bloqueio é da sessão: acaba com a identidade de quem
   bloqueou.
7. **"Cheio" é "indisponível".** Se a outra pessoa está no limite de conversas,
   quem tenta abrir recebe `user_unavailable`, para a resposta não revelar nada
   sobre ela.
8. **Queda não encerra.** Durante os 2 min de retomada a conversa continua e guarda
   o que chegar; a outra pessoa vê `peer.online: false`. Vencido o prazo, ou em
   `user_logout`, a conversa é destruída e a outra pessoa recebe `dm_closed`.
9. **Bloqueio só em conversas privadas.** Numa sala, quem modera é o anfitrião;
   esconder mensagens de sala por pessoa é assunto da interface (Fases 4 e 5).

10. **O id interno não sai do servidor.** Pedido posterior à primeira versão desta
    fase: quem conversa se vê só pelo `@`. O id deixou de ir em todos os eventos
    (sessão, mensagens, listas, digitação, resumos de sala e de conversa privada,
    busca e bloqueios) e de ser aceito em pedidos (`dm_open`, `user_block`). No
    cliente, a chave de cada pessoa passou a ser o `@`. Só administradores veem
    o id, pelos comandos `/users`, `/profile` e `/id`.
11. **`since` contra confusão de `@` reutilizado.** Sem id no protocolo, o cliente
    reconhece as próprias mensagens pelo `@`. Como um `@` volta a ficar livre
    quando a identidade acaba, a sessão informa quando a identidade nasceu, e o
    cliente só marca como "suas" as mensagens escritas a partir daí.

## Limitações conhecidas

- Com o `@` como única identificação visível, mensagens antigas de uma sala
  escritas por alguém que já saiu aparecem com o mesmo `@` de quem o pegou
  depois. Elas não são marcadas como da pessoa nova, mas os outros participantes
  não têm como distinguir as duas no histórico.

- A interface ainda não mostra conversas privadas: o cliente atual ignora os
  eventos de conversas que não são a sala aberta.
- Quem foi bloqueado pode voltar como identidade nova (outra aba) e tentar de
  novo, se souber o `@`. É o limite do anonimato; os limites de busca e de
  conversas novas valem também para a identidade nova.
- Como o bloqueio é silencioso, a pessoa bloqueada pode deduzi-lo se vir a outra
  numa sala e não conseguir abrir conversa com ela.
- Os limites de busca, conversas novas e bloqueios são fixos no código
  (`DM_GUARD_DEFAULTS`); só os de quantidade e histórico são configuráveis por
  ambiente.

## Testes

| Arquivo                                   | Cobre                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/test/unit/direct.test.js`        | Busca, abrir, mensagens, digitação, isolamento, encerrar, bloqueio, queda, retomada, fim da identidade, mesmo `@` em identidade nova, limites, logs  |
| `backend/test/integration/direct.test.js` | Servidor real: os mesmos fluxos entre clientes, acesso de terceiros com o id, sem sessão, limite de buscas, `MAX_DMS_PER_USER`, reinício do servidor |
| `frontend/test/rooms.test.js`             | O cliente atual ignora eventos de conversas privadas sem quebrar a sala aberta                                                                       |
