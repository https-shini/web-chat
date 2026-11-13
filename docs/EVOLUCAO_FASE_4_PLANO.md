# Evolução · Fase 4 — Plano do frontend multiconversa

> Planejamento. Nada daqui está implementado. Começa depois da aprovação da Fase 3
> ([PR #7](https://github.com/https-shini/web-chat/pull/7)).
> Branch prevista: `feat/multi-conversation-frontend`.

## Objetivo

O servidor já aceita várias salas e conversas privadas por pessoa. O cliente ainda
mostra uma sala por vez e ignora o resto. A Fase 4 faz o cliente guardar e
navegar por todas as conversas; a Fase 5 dá a forma final à interface.

## Referências e o que cada uma traz

| Referência  | O que aproveitar                                                             | Fase                                 |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------ |
| Discord     | Barra lateral com salas e conversas privadas, lista de membros, não lidas    | 4 e 5                                |
| Telegram    | Pessoas pelo `@`, busca exata, conversa privada direta, ids internos ocultos | feito (servidor); interface na 4 e 5 |
| Google Meet | Tela inicial com "criar sala" e "entrar com código", link de convite         | 5                                    |

## Escopo da Fase 4 (estado e navegação)

1. **Estado por conversa.** O store passa de "uma sala" para um mapa
   `conversationId → { tipo, resumo, mensagens, pessoas, digitando, versão do
histórico, não lidas }` mais `activeId`. Mensagem, lista e digitação vão para a
   conversa do `conversationId` do evento, em vez de serem descartadas.
2. **Eventos.** Tratar `room_joined`, `room_updated`, `room_left`, `dm_opened`,
   `dm_updated`, `dm_closed`, `room_list` e `block_list` para todas as conversas.
3. **Navegação.** Trocar de conversa sem recarregar: a lista de mensagens, o
   painel de pessoas e o campo de mensagem seguem a conversa ativa. O rascunho de
   cada conversa é guardado em memória.
4. **Não lidas.** Contador por conversa, zerado ao abrir; total no título da aba.
   Notificação do navegador só para conversa que não está aberta.
5. **Envio.** Mensagens, digitação e comandos levam o `conversationId` da
   conversa ativa (hoje, o da única sala).
6. **Barra lateral mínima.** Seções "Salas" e "Mensagens diretas" com os itens e
   os contadores. O visual definitivo fica para a Fase 5.
7. **Ações básicas:** criar sala, entrar por código, sair de uma sala, abrir
   conversa privada pelo `@` (campo de busca e botão no cartão de pessoa),
   encerrar conversa e bloquear.
8. **Retomada.** Ao voltar com o token, repor todas as conversas que o servidor
   reenviar, mantendo a que estava aberta.

Fora do escopo da Fase 4: tela inicial nova, redesenho visual, link de convite com
botão de copiar e responsividade final das novas áreas (Fase 5).

## Histórico e `@` reutilizado

Problema: com o `@` como única identificação visível, quando alguém sai e outra
pessoa pega o mesmo `@`, as mensagens antigas no histórico da sala ficam
indistinguíveis das novas para os outros participantes.

Solução proposta (decisão a confirmar antes de implementar):

- **No servidor**, cada participação numa conversa ganha um **número de autor**
  local àquela conversa (`author: 1, 2, 3…`), atribuído na entrada. Não é o id
  interno, não vale fora da conversa e não permite achar a pessoa em outro lugar.
  Cada mensagem leva o número de quem escreveu; a lista de pessoas leva o número
  de quem está presente.
- **No cliente**, mensagens cujo número de autor não está mais na lista são
  mostradas como de alguém que **já saiu** (nome esmaecido e marca "saiu"). Se o
  mesmo `@` reaparece com outro número, é outra pessoa: as mensagens não são
  agrupadas com as antigas e a cor do avatar muda.
- **"Você"** continua pelo `@` mais o `since` da sessão; com o número de autor, a
  regra fica mais simples (o seu número naquela conversa).
- Administradores continuam vendo o id interno só pelos comandos.

Alternativa mais simples, sem mudar o protocolo: o servidor reserva o `@` de quem
saiu enquanto houver mensagens dele em alguma sala ativa. Evita a confusão, mas
prende `@` por tempo indeterminado; por isso não é a recomendada.

## Entregas e ordem

1. Store multiconversa e testes de unidade (sem interface).
2. Eventos de sala e de conversa privada roteados por conversa.
3. Envio com a conversa ativa e rascunhos.
4. Barra lateral mínima, troca de conversa e não lidas.
5. Ações: criar, entrar, sair, abrir conversa privada, encerrar, bloquear.
6. Número de autor por conversa (servidor e cliente), se aprovado.
7. Testes no navegador: duas salas e uma conversa privada ao mesmo tempo,
   isolamento visual, não lidas, retomada, `@` reutilizado.

## Riscos

- O store atual é plano; a migração toca quase todos os componentes que leem
  `messages` e `people`. Mitigação: um seletor `activeConversation(state)` para os
  componentes continuarem lendo o mesmo formato.
- Memória no navegador: limitar mensagens guardadas por conversa (por exemplo, 500) e descartar as de conversas encerradas.
- Acessibilidade: troca de conversa precisa mover o foco e anunciar a conversa
  aberta, como já acontece na troca de tela.

## Critérios de aceite

- Duas salas e uma conversa privada abertas ao mesmo tempo, sem mensagem em lugar
  errado.
- Contadores de não lidas corretos e zerados ao abrir.
- Nenhum id interno no tráfego nem na tela de quem não é administrador (o teste da
  Fase 3 continua passando).
- Suítes atuais verdes e novas regressões no navegador.
