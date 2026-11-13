# Evolução · Fase 5 — Confiabilidade, acessibilidade, notificações e automação

> Branch `feat/phase5-reliability`, sobre a Fase 4 parte 3 (PR #10). Nada aqui
> foi publicado: merge e deploy dependem de autorização.

## 1. Auditoria: o que foi encontrado e o que foi feito

| #   | Área           | Achado                                                                                                                                                                                                                 | Gravidade                           | Situação                                                                                                                                |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Privacidade    | A notificação do sistema mostrava **quem escreveu e o texto da mensagem**, inclusive de conversas privadas. A central de notificações guarda histórico e aparece na tela bloqueada.                                    | Alta                                | **Corrigido.** Só "Nova mensagem" e onde (nome da sala; numa privada, só "Conversa privada"). Uma por conversa (`tag`), sem empilhar.   |
| 2   | Confiabilidade | Mensagens que chegavam numa conversa **de fundo** durante uma queda vinham no histórico da retomada e **não contavam como não lidas**.                                                                                 | Média                               | **Corrigido.** Retomada de conversa já conhecida conta o que é novo. O histórico de quem entra pela primeira vez continua não contando. |
| 3   | Desempenho     | O navegador guardava **todas** as mensagens de todas as conversas pela sessão inteira (memória e DOM sem limite).                                                                                                      | Média                               | **Corrigido.** Até 500 por conversa; a lista remove as mais antigas uma a uma, sem redesenhar nem reanunciar.                           |
| 4   | Qualidade      | **O teste de carga não media nada desde a Fase 2**: sem sala pública, os clientes nunca entravam numa sala, e todo cenário relatava 0 entregas sem falhar. A checagem de retomada comparava `undefined === undefined`. | Alta (para a confiança nos números) | **Corrigido.**                                                                                                                          |
| 5   | Qualidade      | Testes no navegador só rodavam à mão, fora do repositório.                                                                                                                                                             | Média                               | **Corrigido.** `npm run test:e2e` e job `navegador` no CI.                                                                              |
| 6   | Dependências   | `npm audit` passou a acusar avisos novos em ferramentas de **desenvolvimento** (Vite e dependências dele; o servidor de desenvolvimento). Produção: 0 no frontend e 0 no backend.                                      | Baixa (não chega à produção)        | **Pendente:** exige atualizar o Vite de versão principal (Fase 6).                                                                      |

## 2. Acessibilidade e experiência

Verificado por `e2e/01-salas.mjs`, `e2e/02-privadas.mjs` e `e2e/05-teclado.mjs`, a
cada execução:

- **axe (WCAG 2.0–2.2 A/AA), sem violações sérias ou críticas** no início, na sala com mensagens, na conversa privada e no celular a 320 px. O contraste dos tokens continua checado por `npm run check:contrast`.
- **Teclado:**
    - o 1º Tab chega ao link "Ir para a conversa";
    - entrar, criar sala e chegar aos três caminhos do início é possível só com o teclado;
    - todo foco percorrido tem indicador visível.
- **Foco:**
    - ao entrar no início, vai para o título;
    - ao abrir uma conversa, vai para o campo de mensagem;
    - o cartão de pessoa e o diálogo de confirmação fecham com Escape e devolvem o foco a quem os abriu;
    - o foco fica dentro do diálogo enquanto ele está aberto.
- **Nomes acessíveis:** os itens da lista de conversas são botões com tipo, `@`, presença e não lidas no rótulo.
- **Telas pequenas:** sem rolagem horizontal a 320 px e a 375 px; a gaveta lateral lista as conversas.
- **Estados vazios e de erro:**
    - início sem conversas;
    - convite inválido e pessoa indisponível, com o motivo no próprio início;
    - mensagem não enviada, com "Tentar de novo".

## 3. Reconexão e estabilidade

Quedas de verdade, não emuladas: um proxy TCP do próprio teste derruba as
conexões. A emulação "offline" do navegador não fecha WebSockets já abertos, então
não serve para isso.

| Cenário                                           | Resultado                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Queda curta (menos de 10 s)                       | Volta sozinha, sem "saiu"/"entrou" para os outros                                           |
| Queda longa, trocando de conversa durante a queda | A aberta recebe o que chegou; a de fundo conta como não lida; cada mensagem aparece uma vez |
| Envio sem rede                                    | Fica "enviando…" na fila e chega **uma vez** para todos ao voltar                           |
| Reenvio (Tentar de novo)                          | Mesmo `clientMsgId`: o servidor deduplica, e o cliente funde a confirmação                  |
| Evento repetido (mesmo id)                        | Ignorado (testes de unidade)                                                                |
| Servidor reiniciado                               | Início, com o motivo; nada velho na lista nem no endereço; nova sala funciona               |
| Retomada (teste de carga, cenário D)              | 20/20 identidades voltam com o mesmo `@`; queda detectada em 50 ms, reconexão em 59 ms      |

## 4. Notificações

- **Não lidas:** por conversa, no selo e no rótulo acessível; total no título da aba.
- **Aba em segundo plano:** a conversa aberta também conta até você voltar. Mensagens suas e avisos nunca contam.
- **Sem duplicar:** uma notificação do sistema por conversa (`tag`). Toast de conversa privada nova só na primeira mensagem, não na retomada.

### Análise de privacidade das notificações do sistema

As notificações do navegador já existiam antes desta fase:

- só com a aba oculta;
- permissão pedida no primeiro envio de mensagem (um gesto da pessoa).

O conteúdo delas expunha texto e remetente fora do controle do chat. Os pontos da
análise:

- a central de notificações do sistema **guarda histórico**;
- ela **aparece na tela bloqueada**;
- pode ser **sincronizada** entre aparelhos;
- tudo isso contradiz o "nada fica guardado".

O que foi feito nesta fase, sem acrescentar notificação nova, só reduzindo a
exposição:

- nem texto, nem remetente;
- numa privada, nem o nome da conversa.

**Decisão pendente:** passar a pedir permissão só por um botão explícito ("Avisar
quando chegar mensagem"), em vez de no primeiro envio, com a opção de desligar. É
uma mudança de comportamento e precisa de autorização.

## 5. Desempenho (medido antes de otimizar)

**Servidor:** `npm run load-test`, numa instância própria, com clientes WebSocket
reais no mesmo processo. Os números servem para comparar versões na mesma máquina.

| Cenário                                             | Resultado                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| A — uso normal, 5 pessoas                           | 500 entregas; latência p95 1,7 ms                                 |
| B — 200 pessoas entrando ao mesmo tempo             | 293 ms para todos entrarem; 40.000 entregas, p95 24 ms, p99 28 ms |
| C — 30 residentes + 1.880 entradas e saídas em 30 s | p95 2,3 ms; memória 83 → 95 MB                                    |
| D — queda e retomada                                | Detecção 50 ms; reconexão 59 ms; 20/20 retomadas                  |
| E — rampa até o teto de 300 conexões                | p95 51 ms com 300; acima do teto, recusa 1013                     |

**Cliente**, com o store sem DOM:

| Carga                            | Resultado         |
| -------------------------------- | ----------------- |
| 60.000 mensagens em 30 conversas | ~16 µs por evento |
| Trocar de conversa               | 0,1 ms            |
| Marca de "saiu" com 200 pessoas  | < 1 ms            |

O gargalo real era a retenção sem limite, já corrigida.

Ponto a acompanhar: a memória do servidor no cenário C cresce porque cada
identidade fica guardada 2 minutos depois de sair, que é a janela de retomada (por
desenho). Um teste mais longo deve confirmar que ela é liberada depois disso.

## 6. Automação dos testes no navegador

`npm run test:e2e`, também no CI (job `navegador`):

- **Não depende da produção:**
    - backend próprio em `127.0.0.1`, em porta livre, com `NODE_ENV=test`;
    - build de produção do frontend servido localmente;
    - a CSP real fica ligada.
- **`ALLOWED_ORIGINS`** fica igual à origem do site de teste, então a restrição de origem vale também no teste.
- **Sem segredos:** a chave de administração é gerada a cada execução, fica só em memória e nunca é registrada. O CI não usa nenhum segredo do repositório.
- **Fluxos principais:** salas, privadas, reconexão, reinício e teclado.
- **Detecção de vazamento:**
    - os ids internos reais, lidos do log do servidor de teste, não podem aparecer em nenhum quadro recebido nem no HTML de nenhuma página;
    - a chave de administração não pode voltar em nenhum quadro.

## 7. Pendências

1. Autorizar o pedido explícito de permissão de notificação (seção 4).
2. Atualizar o Vite para zerar os avisos de dependências de desenvolvimento (Fase 6).
3. Teste de memória de longa duração no servidor: liberação das identidades depois da janela de retomada.
4. Verificação manual com leitores de tela (NVDA, VoiceOver, TalkBack): o axe e os testes de teclado não substituem.
