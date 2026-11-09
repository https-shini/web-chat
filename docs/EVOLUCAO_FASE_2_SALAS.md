# Evolução · Fase 2 — Backend com várias salas

> Parte do plano "salas e mensagens privadas" (Fase 1: barras redimensionáveis;
> Fase 3: mensagens privadas; Fases 4 e 5: interface; Fase 6: revisão geral).
> Contrato completo em [`PROTOCOLO.md`](./PROTOCOLO.md); comandos em
> [`CHAT_COMMANDS.md`](./CHAT_COMMANDS.md).

## O que mudou

A sala única deu lugar a salas criadas pelas pessoas, cada uma com código de
convite, participantes, histórico e moderação próprios. Uma identidade temporária
participa de várias ao mesmo tempo. Continua tudo em memória: sem banco, sem
arquivo, sem armazenamento no navegador.

```
conexão ──► hub (room/hub.js) ──► identidade (room/sessions.js)
              │                      └─ rooms: Set<conversationId>
              └─► diretório (room/directory.js) ──► sala (room/room.js) × N
                     ├─ por conversationId e por código
                     ├─ limites e fim das salas vazias
                     └─ proteção contra adivinhação (room/joinGuard.js)
```

| Módulo              | Papel                                                                                                                                                              | Reaproveitamento                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `room/sessions.js`  | Identidades, token de retomada, username único. Ganhou `rooms` e o aviso `onRetire`.                                                                               | Mantido; a lógica de token, prazo e teto não mudou.                                                                     |
| `room/hub.js`       | **Novo.** Sessão por conexão (login, retomada, queda, saída), resolução da conversa a partir do `conversationId`, operações da identidade (nome, ausência, admin). | O login saiu de `room.join` sem mudar as regras (nome, username, token, substituição da conexão antiga).                |
| `room/directory.js` | **Novo.** Salas por id e por código, códigos únicos, limites, destruição das salas vazias.                                                                         | —                                                                                                                       |
| `room/room.js`      | Regras de **uma** sala. A participação passou a ser da identidade (não da conexão).                                                                                | Histórico, anti-duplicação, lista agrupada, janela de saída, silêncio, limpeza e avisos: mesmas regras, agora por sala. |
| `room/policy.js`    | Autorização: administrador (global) e anfitrião (por sala).                                                                                                        | Mesma hierarquia, com o papel de anfitrião.                                                                             |
| `room/joinGuard.js` | **Novo.** Limite de tentativas erradas de código.                                                                                                                  | —                                                                                                                       |

## Decisões

1. **Participação da identidade, não da conexão.** Com várias salas, uma queda de
   rede não pode tirar a pessoa de todas. Durante os 2 min de retomada ela continua
   participando (fora das listas); ao voltar com o token, recebe cada sala de novo,
   com o mesmo papel. Vencido o prazo, sai de todas (`onRetire` → `hub.forget`).
2. **`conversationId` no topo do envelope.** O payload de cada evento ficou como
   era; só o envelope ganhou o escopo. O cliente manda a conversa no payload, e o
   servidor confere a participação antes de qualquer efeito.
3. **Mesma resposta para "não existe" e "não participo".** `conversation_not_found`
   nos dois casos, e `room_not_found` para qualquer código sem sala: quem testa ids
   ou códigos não aprende nada com a resposta.
4. **`conversationId` ≠ código.** O id da conversa é opaco e circula em todos os
   eventos; o código de convite é um segredo da sala, entregue só a quem está nela
   e nunca registrado em log (há teste para isso). Prepara a Fase 3: conversas
   privadas usarão o mesmo campo, com outro prefixo.
5. **Proteção contra adivinhação.** 26¹⁰ códigos, mais um limite de tentativas
   erradas por identidade e outro no servidor inteiro. Com o limite esgotado, até o
   código certo é recusado, para a resposta não virar oráculo. Só erro consome o
   limite.
6. **Remoção por sala.** `/kick` deixou de fechar a conexão e encerrar a identidade:
   tira a pessoa daquela sala (sem volta enquanto a sala existir) e mantém as outras.
   Fechar a conexão afetaria salas em que ela não fez nada.
7. **Anfitrião.** Quem cria. Saindo de vez, o papel passa para quem está há mais
   tempo, preferindo quem está conectado; queda curta não passa o papel. Anfitrião
   não modera administrador.
8. **Fim da sala.** Sala sem nenhuma participação espera `ROOM_EMPTY_TTL_MS` (60 s)
   e é destruída com histórico, código e lista de removidos. Os 60 s cobrem quem
   recarrega a página e entra de novo pelo link.
9. **Histórico menor por sala.** `HISTORY_SIZE` caiu de 1000 (sala única) para 200
   por sala. Com o teto de 500 salas e mensagens de até 1000 caracteres, o pior caso
   de memória fica perto de 120 MB.
10. **Quebra de protocolo assumida.** Cliente e servidor são publicados juntos; o
    teste de contrato garante que os dois mudaram juntos.

## Ponte no frontend

As Fases 4 e 5 trazem a navegação entre salas e conversas privadas. Para o app
continuar funcionando depois do merge desta fase, o frontend recebeu uma ponte
mínima:

- depois da sessão, entra na sala do link (`#/s/código`) ou cria uma sala nova;
- o endereço da página vira o link de convite da sala aberta (o código fica no
  fragmento, que o navegador não envia a nenhum servidor);
- mostra **uma** sala por vez; eventos de outras conversas são ignorados;
- convite inválido ou de sala que acabou: avisa e cria uma sala nova;
- removido da sala: volta à entrada com o aviso;
- o anfitrião vê os atalhos de moderação e o selo "anfitrião".

## Limitações conhecidas

- A interface ainda não navega entre várias salas (Fases 4 e 5); quem retoma uma
  identidade em várias salas vê só a primeira.
- Quem é removido de uma sala pode voltar com outra aba (identidade nova) se tiver
  o código — o mesmo limite do anonimato que já valia para `/kick`.
- O limite global de tentativas erradas pode, sob ataque, atrasar por alguns
  segundos quem digita um código errado de boa-fé.
- O catálogo de comandos marca a moderação como liberada se a pessoa modera
  **alguma** sala; a decisão de verdade é por sala, a cada comando.

## Testes

| Arquivo                                  | Cobre                                                                                                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/test/unit/rooms.test.js`        | Códigos (formato, leitura, colisão), criação, entrada, várias salas, isolamento de mensagens/histórico/digitação/presença, moderação por sala, anfitrião, limites, adivinhação, ciclo de vida |
| `backend/test/unit/room.test.js`         | Sessão separada da sala, retomada com salas, mensagens, saída, logs sem código                                                                                                                |
| `backend/test/integration/rooms.test.js` | Servidor real: sem sala pública, isolamento entre clientes, acesso sem participar, códigos errados, bloqueio, limites por ambiente, sala vazia, reinício do servidor                          |
| `frontend/test/rooms.test.js`            | Link de convite, isolamento por conversa no cliente, papéis, saída e recusas                                                                                                                  |
