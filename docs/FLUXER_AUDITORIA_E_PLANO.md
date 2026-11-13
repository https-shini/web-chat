# Fluxer como base — auditoria comparativa (Fase A) e plano (Fase B)

> Branch `feat/ux-audit-discord`. **Só análise e planejamento: nenhuma linha
> do app foi alterada.** A Fase C só começa com a sua aprovação explícita.
>
> **Fluxer analisado:** `github.com/fluxerapp/fluxer`, commit `287c2fb`
> (13/11/2026). É um clone raso, só lido, e nada dele foi executado.
>
> **Aplicação atual:** `main` em `3606dd2`. A auditoria de UX está em
> `AUDITORIA_UX_DISCORD.md`.
>
> Este documento **consolida e substitui como plano mestre** os anteriores:
>
> - `PLANO_FASE_B.md`;
> - `PROPOSTA_MENUS_LATERAIS.md`;
> - `PROPOSTA_CHAT_E_NAVEGACAO.md`.
>
> Eles continuam valendo como detalhamento de cada área.

---

## Resumo para decisão

1. **O Fluxer não pode ser incorporado como código pronto sem duas mudanças de fundo:**
    - **Licença:** todos os arquivos do Fluxer são **AGPL-3.0-or-later**. Um único arquivo dele dentro do web-chat obriga o **projeto inteiro** a virar AGPL, inclusive a obrigação de oferecer o código-fonte a quem usa o site (o web-chat hoje é **MIT**).
    - **Tecnologia:** o frontend do Fluxer é React, TypeScript, MobX, Lexical, Base UI e Lingui. São cerca de 3.450 arquivos TS/TSX e 640 de CSS. Os componentes dependem dos _stores_ e da API dele: guilds, canais e usuários persistentes, REST mais um gateway em Erlang e Cassandra. O web-chat é JavaScript sem framework, com cerca de 10 mil linhas, um servidor Node só em memória e um protocolo WebSocket próprio. **Nenhum componente do Fluxer roda aqui sem reescrita**, nem mesmo depois de virar AGPL.
2. **O que dá para aproveitar de verdade é muito:**
    - **comportamentos e regras** (agrupamento de mensagens, barra de novas mensagens, voltar ao presente, menus de contexto que viram folha inferior no celular, arrastar acessível pelo teclado, conjunto de atalhos, rótulos acessíveis da lista);
    - **o modelo de dados** de respostas, edição, reações e mensagens fixadas;
    - **bibliotecas MIT que o próprio Fluxer usa**, como `@floating-ui/dom` para posicionar menus.
3. **Recomendação (estratégia 1):**
    - manter a pilha atual;
    - implementar os padrões do Fluxer como código nosso (o projeto continua MIT);
    - adotar só as bibliotecas MIT que valerem a pena;
    - estender o **nosso** servidor com os recursos que o Fluxer tem e nós não: respostas, edição, exclusão, reações, mensagens fixadas e descrição da sala. Cada recurso tem contrato, permissões e testes, num PR próprio.
4. As alternativas (virar AGPL e portar código, ou migrar para React e fazer um fork) estão na seção 3, com custo e risco.

**Preciso de você:** a escolha da estratégia (E1, E2 ou E3) e as decisões da
seção 9.

---

# FASE A — Auditoria comparativa

## A1. Fluxer: o que existe de fato no código

### Monorepo

| Parte                                       | Tecnologia                                                                                                                                                                                                                                                                          | Tamanho                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `fluxer_app` (cliente web e desktop)        | React, TypeScript, **MobX** (estado), **Lexical** (campo de mensagem), **Base UI**, React Aria e Radix (menus e controles), **Floating UI** (posição), TanStack Virtual (listas longas), react-dnd com o backend acessível (arrastar), Lingui (tradução), Phosphor (ícones), rspack | 1.490 `.tsx`, 1.967 `.ts`, 644 `.css` (CSS Modules) |
| `fluxer_api`                                | TypeScript (Hono), esquemas Zod (`packages/schema`)                                                                                                                                                                                                                                 | 2.034 `.ts`                                         |
| `fluxer_gateway`                            | **Erlang** (tempo real)                                                                                                                                                                                                                                                             | 399 `.erl`                                          |
| `fluxer_messages`, `fluxer_server` e outros | **Rust**                                                                                                                                                                                                                                                                            | —                                                   |
| Banco                                       | **Cassandra** (`dev:cassandra:*`)                                                                                                                                                                                                                                                   | —                                                   |
| `packages/markdown_parser`                  | **Rust**, compilado para **WebAssembly** (`libfluxcore`) e chamado pelo app                                                                                                                                                                                                         | cerca de 6.900 linhas em Rust                       |
| `fluxer_desktop`, `fluxer_native`           | Desktop e nativo                                                                                                                                                                                                                                                                    | —                                                   |

**Licença:** `LICENSE` é a GNU AGPL v3. Os arquivos têm o cabeçalho
`SPDX-License-Identifier: AGPL-3.0-or-later` (3.445 arquivos `.ts`/`.tsx` e 638
de CSS no app).

### Frontend por área (linhas de TS/TSX em `fluxer_app/src/features`)

| Área                                                                            | Linhas         | O que interessa a nós                                                                                       |
| ------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| `voice`                                                                         | 98 mil         | Nada (voz e vídeo estão fora do escopo)                                                                     |
| `channel`                                                                       | 76 mil         | Lista de mensagens, campo de mensagem, barras de resposta e edição, boas-vindas do canal, lista de privadas |
| `app`                                                                           | 70 mil         | Leiaute, barra lateral, área do usuário                                                                     |
| `user`                                                                          | 62 mil         | Perfil e configurações                                                                                      |
| `ui`                                                                            | 43 mil         | **Menus de contexto**, folha inferior, _popover_, dica, abas, rolagem, arrastar, foco                       |
| `messaging`                                                                     | 41 mil         | Renderização de Markdown, agrupamento, menções, reações                                                     |
| `lexical`                                                                       | 14,5 mil       | O editor do campo de mensagem                                                                               |
| `moderation`, `permissions`, `member`, `presence`, `notification`, `read_state` | 2 a 6 mil cada | Modelos de permissão, presença e não lidas                                                                  |

### Implementações estudadas

| Tema               | Onde                                                                                                                                                                 | O que faz                                                                                                                                                                                                                     | Serve para nós?                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Agrupamento        | `messaging/utils/MessageGroupingUtils.ts`                                                                                                                            | Abre um grupo novo se: mudou o autor; passaram **7 minutos** (`MESSAGE_GROUP_TIMEOUT`); **mudou o dia**; mudou o tipo (sistema contra usuário)                                                                                | **Sim, como regra.** O nosso agrupa só pelo autor seguido                                                                             |
| Fluxo do canal     | `channel/components/ChannelMessageStream.tsx`, `ChannelDivider`, `NewMessagesBar.tsx`, `ChannelWelcomeSection.tsx`                                                   | Divisor de dia, barra de "novas", voltar ao presente, seção de boas-vindas                                                                                                                                                    | **Sim, como comportamento**                                                                                                           |
| Campo de mensagem  | `ChannelTextarea.tsx` com Lexical; `ChannelReplyBar`, `EditingMessageInput`, autocompletar (`AutocompleteCommand`, `AutocompleteMention`…)                           | Editor rico com menções inline, barra de resposta e edição no lugar                                                                                                                                                           | **Comportamentos, sim. Lexical, não por agora** (seção A3)                                                                            |
| Menus de contexto  | `ui/action_menu/*` (`ContextMenu.tsx` sobre `@base-ui/react/context-menu`, `MessageContextMenu`, `DMContextMenu`, `GuildMemberContextMenu`…); `ui/menu_bottom_sheet` | Um menu por entidade; **no celular, o menu vira folha inferior** (`isMobileExperienceEnabled`)                                                                                                                                | **Sim, como estrutura** (um menu por entidade, montado a partir de grupos)                                                            |
| Atalhos            | `input/state/input_keybind/KeybindCommands.ts`                                                                                                                       | Cerca de 70 ações: `nav_channel_prev/next`, `nav_unread_prev/next`, `nav_quick_switcher`, `message_edit/reply/delete/pin/react`, `chat_jump_oldest_unread`, `chat_scroll_up/down`, `dnd_start/move_up/move_down/drop/cancel`… | **Sim, como lista de referência** (escolhemos um subconjunto)                                                                         |
| Arrastar acessível | `react-dnd-accessible-backend` mais as ações `dnd_*`                                                                                                                 | Pegar, mover com setas, soltar ou cancelar, tudo pelo teclado                                                                                                                                                                 | **Sim, como padrão de interação**                                                                                                     |
| Lista de privadas  | `channel/components/direct_message/DMListItem.tsx`                                                                                                                   | Rótulo acessível que diz nome, não lidas, menções, silenciada e **fixada** (`channel.isPinned`); menu por item                                                                                                                | **Sim, como padrão de rótulo**                                                                                                        |
| Privadas fixadas   | `pinned_dms` (lista de ids no servidor, `RpcSchemas.ts`)                                                                                                             | A fixação fica **no servidor**, na conta                                                                                                                                                                                      | **Não do mesmo jeito:** não temos conta (seção A4)                                                                                    |
| Mensagens          | `MessageResponseSchemas.ts`, `MessageRequestSchemas.ts`                                                                                                              | `message_reference` (resposta), `edited_timestamp`, `pinned`, reações por mensagem, limites em `packages/limits`                                                                                                              | **Sim, como modelo de dados** para o nosso protocolo                                                                                  |
| Markdown           | `packages/markdown_parser` (Rust/WASM) mais `messaging/components/markdown/renderers` (React)                                                                        | Interpretador robusto, testado com _fuzz_                                                                                                                                                                                     | **Não diretamente:** exige WASM (`wasm-unsafe-eval` na CSP) e React. Escrevemos um subconjunto em JS, com os mesmos casos como testes |
| Rolagem e listas   | `ui/scroller`, `@tanstack/react-virtual`                                                                                                                             | Virtualização para milhares de mensagens                                                                                                                                                                                      | **Não é necessário:** o nosso limite é de 500 mensagens por conversa                                                                  |
| Tema               | `features/theme`, `theme_settings`, CSS Modules e variáveis                                                                                                          | Temas e densidade                                                                                                                                                                                                             | Já temos tokens; adaptamos a ideia de **densidade compacta**                                                                          |

## A2. Aplicação atual (resumo da auditoria)

- **Arquitetura:**
    - frontend em JS com `@ts-check`, Vite 6, `state/store.js` com os eventos, `ui/*` com uma função por componente, nenhum `innerHTML`, CSS em BEM com `tokens.css`;
    - backend Node ESM com `ws`, tudo em memória.
- **Contrato:**
    - envelope `{type, payload, conversationId}`; espelho em `frontend/src/protocol.js`; `test/unit/contract.test.js` falha se os dois divergirem.
- **Regras:**
    - identidade efêmera; @ único entre quem está conectado; número de autor por conversa; ids internos só no servidor;
    - papéis: administrador global, anfitrião por sala;
    - moderação: `/mute`, `/kick`, `/clearall`, `/announce`;
    - privadas pelo @ exato, encerrar e bloquear;
    - histórico configurável (`HISTORY_SIZE`); deduplicação por `clientMsgId`; retomada em 2 minutos.
- **Qualidade:**
    - 180 testes de unidade no frontend e 353 no backend;
    - 67 verificações E2E, incluindo a de privacidade dos ids;
    - testes de memória e de carga;
    - CI com CodeQL;
    - CSP rígida.
- **Problemas de UX:** P1 a P20 em `AUDITORIA_UX_DISCORD.md` (4 altos, 10 médios e 6 baixos), mais N1 a N10 em `PROPOSTA_MENUS_LATERAIS.md`.
- **Limitações técnicas relevantes:**
    - campo de mensagem de uma linha (`<input>`), e o servidor troca `\n` por espaço;
    - não há respostas, edição, exclusão, reações, mensagens fixadas nem descrição de sala;
    - o motivo do silêncio não diz o tempo restante;
    - não há aviso de mensagens novas ao rolar para cima.

## A3. Comparação de arquitetura e incompatibilidades

| Aspecto           | Fluxer                                                                     | web-chat                                 | Consequência                                                                                       |
| ----------------- | -------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Licença           | AGPL-3.0-or-later                                                          | MIT                                      | Copiar código do Fluxer **muda a licença do projeto inteiro**                                      |
| Interface         | React, MobX, CSS Modules, rspack                                           | DOM direto, store próprio, BEM, Vite     | Os componentes não rodam sem React; trazê-lo significa **reescrever o frontend**                   |
| Dados             | Contas, guilds, canais e mensagens **persistentes**                        | Identidade e conversas **efêmeras**      | Fixar privadas "na conta" não tem onde morar; mensagens somem com a conversa                       |
| Tempo real        | Gateway Erlang com _opcodes_                                               | WebSocket próprio com `{type, payload}`  | O cliente do Fluxer não fala com o nosso servidor                                                  |
| Markdown          | Rust → WASM                                                                | —                                        | WASM exige `wasm-unsafe-eval` na CSP e cerca de 1 MB a mais                                        |
| Campo de mensagem | Lexical (MIT), com plugins próprios (AGPL)                                 | `<input>`                                | Lexical é MIT, mas a integração do Fluxer é AGPL; para os nossos recursos, um `<textarea>` resolve |
| Tamanho           | Vários MB de JS                                                            | 85 KB de JS e 54 KB de CSS (build atual) | Manter um orçamento de tamanho                                                                     |
| Escopo            | Voz, vídeo, servidores, fóruns, tópicos, figurinhas, GIFs, anexos, Premium | Texto em tempo real, anônimo             | A maior parte do Fluxer **não se aplica**                                                          |

## A4. Funcionalidades: Fluxer contra web-chat

| Recurso                                                                               | Fluxer                                                    | web-chat                                                           | Proposta                                                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Três áreas (navegação, chat, contexto)                                                | Sim                                                       | Parcial                                                            | Fazer (Fase B, PRs 2 e 3)                                                                |
| Fixar conversas                                                                       | Sim (no servidor)                                         | Não                                                                | **Em memória** pela vida da identidade (D1); não há conta para guardar                   |
| Reordenar                                                                             | Sim (arrastar acessível)                                  | Não                                                                | Fazer, com o mesmo padrão de teclado                                                     |
| Menus de contexto                                                                     | Sim, por entidade                                         | Não                                                                | Fazer                                                                                    |
| Folha inferior no celular                                                             | Sim                                                       | Não                                                                | Fazer                                                                                    |
| Ir para conversa (Ctrl K)                                                             | Sim                                                       | Não                                                                | Fazer (só nas suas conversas mais o @ exato)                                             |
| Agrupamento por tempo e dia                                                           | Sim                                                       | Só por autor                                                       | Fazer                                                                                    |
| Novas mensagens e voltar ao presente                                                  | Sim                                                       | Não                                                                | Fazer                                                                                    |
| Markdown                                                                              | Completo                                                  | Só por comando                                                     | Subconjunto seguro em JS (C2)                                                            |
| Menções                                                                               | Sim, com notificação                                      | Não                                                                | Destaque e autocompletar no cliente; notificação opcional                                |
| **Respostas**                                                                         | Sim                                                       | Não                                                                | **Servidor e cliente** (F1)                                                              |
| **Edição**                                                                            | Sim                                                       | Não                                                                | **Servidor e cliente** (F2)                                                              |
| **Exclusão**                                                                          | Sim                                                       | Não                                                                | **Servidor e cliente** (F3)                                                              |
| **Reações**                                                                           | Sim (emoji livre e personalizado)                         | Não                                                                | **Servidor e cliente**, com uma lista fixa de emojis (F4)                                |
| **Mensagens fixadas**                                                                 | Sim                                                       | Não                                                                | **Servidor e cliente** (F5)                                                              |
| **Descrição da sala**                                                                 | Sim (tópico)                                              | Não                                                                | **Servidor e cliente** (F6)                                                              |
| Quebra de linha e blocos de código                                                    | Sim                                                       | Não                                                                | **Servidor** (C1)                                                                        |
| Presença                                                                              | Online, ausente, não perturbe, invisível e status próprio | Online e ausente com motivo                                        | Manter; "não perturbe" está fora do escopo                                               |
| Moderação                                                                             | Cargos, _timeout_, banimento e registro de auditoria      | Anfitrião e administrador; silenciar, remover, apagar tudo e aviso | Manter; acrescentar **apagar mensagem de outra pessoa** (F3)                             |
| Notificações                                                                          | Caixa de entrada, menções, por canal                      | Opcional e sem conteúdo                                            | Manter a privacidade; silenciar uma conversa só no cliente é opcional                    |
| Busca                                                                                 | No servidor, em todo o histórico                          | Não                                                                | Opcional: buscar **na conversa aberta**, só no cliente                                   |
| Voz, vídeo, anexos, emoji próprio, GIFs, fóruns, tópicos, servidores, amigos, Premium | Sim                                                       | —                                                                  | **Fora do escopo:** exigem armazenamento, contas ou infraestrutura que o produto não tem |

## A5. Riscos levantados

| Risco                                                                        | Gravidade | Tratamento                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contaminação de licença (AGPL num projeto MIT)                               | **Alta**  | Na estratégia recomendada, **nenhum código do Fluxer é copiado**: as implementações são nossas, e só ideias e regras de comportamento são reaproveitadas. Cada PR declara isso. Se você preferir a E2, a troca de licença é feita explicitamente antes |
| Escopo grande demais                                                         | Alta      | PRs pequenos e independentes, cada um com critério de aceitação; recursos de servidor um por PR                                                                                                                                                        |
| Regressões no núcleo (envio, deduplicação, reconexão, rascunho, privacidade) | Alta      | As suítes atuais rodam em todos os PRs; cada recurso novo tem testes de unidade, de contrato e E2E                                                                                                                                                     |
| O contrato cresce e diverge entre servidor e cliente                         | Média     | Campos novos **opcionais** e eventos novos (compatíveis com o cliente antigo); o teste de contrato acompanha                                                                                                                                           |
| Abuso por recursos novos (edição para enganar, reações em massa)             | Média     | Limites no servidor (seção B4), "(editada)" visível, a mesma limitação de taxa das mensagens                                                                                                                                                           |
| Tamanho e desempenho                                                         | Média     | Orçamento: JS até 160 KB e CSS até 80 KB sem compressão; medido no CI                                                                                                                                                                                  |
| CSP                                                                          | Média     | Sem WASM e sem estilos inline; as bibliotecas novas são só JS                                                                                                                                                                                          |

---

# FASE B — Arquitetura e plano

## B1. Estratégias possíveis

|                      | **E1 · Porte de padrões (recomendada)**                                                        | E2 · AGPL com porte de código                                                                                                   | E3 · Migrar para React e fazer um fork                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| O que é              | Manter a pilha; reimplementar os comportamentos do Fluxer; usar as bibliotecas MIT que ele usa | Trocar a licença para AGPL-3.0-or-later e traduzir trechos do Fluxer (TS/React → JS)                                            | Reescrever o frontend em React, TS e MobX e trazer os componentes do Fluxer com adaptadores                |
| Licença              | Continua MIT                                                                                   | **AGPL**: oferecer o código a quem usa o site, manter os avisos                                                                 | **AGPL**                                                                                                   |
| Código reaproveitado | Bibliotecas MIT (`@floating-ui/dom`); regras e modelo de dados                                 | Pequenos trechos de lógica pura (por exemplo, o agrupamento). Os componentes React continuariam precisando ser reescritos em JS | Componentes de UI, depois de adaptadores para os _stores_ e a API dele                                     |
| Esforço              | Médio (cerca de 11 PRs)                                                                        | Médio, mais o trabalho jurídico                                                                                                 | **Muito alto:** reescrever o frontend e todos os testes, e criar uma camada que imite os modelos do Fluxer |
| Risco de regressão   | Controlado                                                                                     | Controlado                                                                                                                      | **Alto**                                                                                                   |
| Tamanho final        | Cerca de 150 KB                                                                                | Igual à E1                                                                                                                      | Vários MB                                                                                                  |
| Ganho para quem usa  | Igual ao da E3 nos recursos do escopo                                                          | Igual ao da E1                                                                                                                  | Igual; o resto do Fluxer (voz, servidores) não se aplica                                                   |

**Por que E1:** o que o Fluxer resolve melhor são **decisões de produto e de
interação**. Essas decisões se reaproveitam sem copiar código. O código em si
está preso a React, MobX, à API e ao modelo persistente dele. A E2 troca a
licença do projeto para ganhar pouquíssimas linhas utilizáveis. A E3 custa uma
reescrita completa para chegar ao mesmo resultado visível.

## B2. Classificação dos elementos do Fluxer (na E1)

### 1. Reutilizar diretamente

| Item                                                                                                           | Licença                        | Uso                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@floating-ui/dom` (o núcleo, sem React, da biblioteca que o Fluxer usa)                                       | MIT                            | Posição de menus, _popovers_, dicas e sugestões, com o ajuste a bordas e rolagem. Substitui o cálculo manual em `memberCard.js` e `tooltip.js` |
| Modelo de dados das mensagens: `message_reference`, `edited_timestamp`, `pinned`, reações `{emoji, count, me}` | Ideia e formato (não é código) | Inspira os campos do **nosso** protocolo (B4), com nomes no nosso padrão                                                                       |
| Lista de ações de atalho (`KeybindCommands`)                                                                   | Ideia                          | O subconjunto da seção B6                                                                                                                      |
| _Opcional:_ ícones Phosphor                                                                                    | MIT                            | Só se você quiser trocar a biblioteca própria (`icons.js`). A recomendação é manter a nossa, para preservar a identidade                       |

Nenhum arquivo do repositório do Fluxer entra no nosso.

### 2. Adaptar e integrar (comportamento do Fluxer, código nosso)

| Comportamento                                                                                                                  | Origem no Fluxer                                                  | Onde entra                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------- |
| Agrupar por autor **e** 7 min **e** mesmo dia **e** mesmo tipo                                                                 | `MessageGroupingUtils.ts`                                         | `ui/messageList.js`                                      |
| Divisor de dia, barra de novas mensagens, voltar ao presente, boas-vindas                                                      | `ChannelMessageStream`, `NewMessagesBar`, `ChannelWelcomeSection` | `ui/messageList.js`, `ui/chat/welcome.js`                |
| Um menu por entidade (mensagem, pessoa, conversa), montado com grupos; folha inferior no celular                               | `ui/action_menu/*`, `menu_bottom_sheet`                           | `ui/primitives/menu.js`, `ui/primitives/bottomSheet.js`  |
| Arrastar acessível: pegar, setas, soltar ou cancelar                                                                           | `react-dnd-accessible-backend`, `dnd_*`                           | `ui/primitives/reorder.js` (lista de conversas)          |
| Rótulo acessível do item com o estado "fixada"                                                                                 | `DMListItem.tsx`                                                  | `ui/conversationNav.js`                                  |
| Barra de resposta acima do campo, edição no próprio lugar (Esc cancela, Enter salva), ↑ no campo vazio edita a última mensagem | `ChannelReplyBar`, `EditingMessageInput`, `message_edit_prev`     | `ui/composer.js`, `ui/chat/messageEditor.js`             |
| Autocompletar de comandos **e** de menções no mesmo componente                                                                 | `Autocomplete*.tsx`                                               | `ui/commandSuggestions.js`, que vira `ui/suggestions.js` |
| Reações abaixo da mensagem, com a sua em destaque                                                                              | `ReactionImage`, reações                                          | `ui/message.js`                                          |
| Mensagens fixadas consultáveis                                                                                                 | `chat_toggle_pins`                                                | Bloco "Mensagens fixadas" no painel direito              |
| Rolagem por atalho (`chat_scroll_up/down`, `chat_jump_oldest_unread`)                                                          | Atalhos                                                           | `ui/messageList.js`                                      |

### 3. Reconstruir ou aprimorar (sem equivalente utilizável)

| Item                                                                                                                      | Por quê                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Interpretador de Markdown em JS** (negrito, itálico, sublinhado, riscado, `código`, bloco de código, spoiler e citação) | O do Fluxer é Rust/WASM. O nosso será pequeno, puro e testado, gerando nós DOM sem HTML                                      |
| **Recursos de mensagem no servidor** (F1 a F6)                                                                            | O backend do Fluxer é outro mundo (Erlang, Rust, Cassandra)                                                                  |
| **Fixar e ordenar em memória**                                                                                            | O Fluxer guarda na conta; aqui não há conta                                                                                  |
| **Navegação no celular em pilha** (lista, conversa e dados)                                                               | O Fluxer tem a própria experiência móvel em React; a nossa reaproveita os componentes de desktop                             |
| **Campo de mensagem com `<textarea>`**                                                                                    | Lexical seria excessivo para os nossos recursos (não há emoji inline nem menções como "pílulas"). Pode ser reavaliado depois |

## B3. Arquitetura de destino (frontend)

```
frontend/src/
├─ state/          store.js (+ pins/order, refs, reactions, edits, scroll), events.js (+ eventos novos)
├─ markdown/       parse.js (puro, testado) · render.js (nós DOM, sem HTML)
├─ ui/primitives/  menu.js · contextMenu.js · bottomSheet.js · popover.js (floating-ui)
│                  sheet.js · rovingList.js · reorder.js · switch.js
├─ ui/nav/         sidebar.js · conversationNav.js · userBar.js · quickSwitcher.js · newConversation.js
├─ ui/chat/        messageList.js · message.js · messageActions.js · messageEditor.js
│                  reactions.js · welcome.js · jumpBar.js
├─ ui/composer/    composer.js · toolbar.js · suggestions.js (comandos e @)
├─ ui/panel/       contextPanel.js · roomInfo.js · dmInfo.js · members.js · pins.js
└─ ui/pages/       home.js · commands.js · profile.js
```

**Regras mantidas:**

- nenhum `innerHTML`;
- `@ts-check` em tudo;
- os componentes recebem dependências por parâmetro, como hoje;
- o store continua sendo a fonte única;
- cada componente novo tem um teste de unidade de comportamento (teclado, foco, estados).

## B4. Integração com o backend: mudanças propostas

**Todas compatíveis:** campos novos são opcionais e eventos novos são
ignorados por um cliente antigo. Cada recurso fica num PR próprio, com testes
de unidade, de contrato e E2E. Permissões no **servidor** (`policy.js`); o
cliente só esconde o que seria recusado.

| #   | Recurso                     | Contrato                                                                                                                                                                                           | Permissão e limites                                                                                                                                                             | Alternativa sem servidor                                 |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| C1  | Quebra de linha             | `chat_message.content` aceita `\n` (os outros caracteres de controle continuam removidos)                                                                                                          | Até 20 linhas; linhas vazias seguidas reduzidas a uma; nomes e @ sem `\n`                                                                                                       | Nenhuma: sem C1, não há Shift+Enter nem blocos de código |
| F1  | **Responder**               | Envio: `replyTo: <id>`. Mensagem: `reference: {id, username, author, excerpt}` (trecho de até 100 caracteres, copiado na hora)                                                                     | Só um id **da mesma conversa** e que esteja no histórico. A cópia mantém a referência mesmo que a original saia do histórico                                                    | Citar o texto à mão (`> trecho`) com Markdown            |
| F2  | **Editar**                  | Cliente → `message_edit {conversationId, id, content}`. Servidor → `message_updated {id, content, editedAt}`. O histórico ao entrar já vem editado                                                 | Só a **mesma identidade** que escreveu (não basta o mesmo @); enquanto a mensagem estiver no histórico; a mesma limitação de taxa das mensagens; "(editada)" para todos         | —                                                        |
| F3  | **Apagar**                  | Cliente → `message_delete {conversationId, id}`. Servidor → `message_deleted {id, by: "author" \| "moderation"}`                                                                                   | Autor: sempre. Na sala, anfitrião ou administrador também (com as regras de `policy.js`). Na privada, só o autor. Remoção pela moderação vira uma linha de sistema sem conteúdo | —                                                        |
| F4  | **Reações**                 | Cliente → `reaction_toggle {conversationId, id, emoji}`. Servidor → `message_reactions {id, reactions: [{emoji, count, authors: ["@u#n"]}]}`. O "minha" é calculado no cliente pela chave de autor | **Lista fixa de 12 emojis** (sem texto livre: nada de conteúdo arbitrário). Até 8 emojis diferentes por mensagem; limitação de taxa                                             | —                                                        |
| F5  | **Mensagens fixadas**       | Cliente → `message_pin {id, pinned}`. Servidor → `pins_updated {pins: [{id, username, author, excerpt, at}]}` mais uma linha de sistema "@ana fixou uma mensagem"                                  | Salas: anfitrião ou administrador. Privadas: as duas pessoas. Até 25 por conversa; somem com a conversa                                                                         | —                                                        |
| F6  | **Descrição da sala**       | Cliente → `room_update {conversationId, description}`. Servidor → `room_updated {description}`. O resumo da sala inclui a descrição                                                                | Anfitrião ou administrador; até 200 caracteres; texto normalizado; também pelo comando `/topic`                                                                                 | —                                                        |
| F7  | Silêncio com tempo restante | A recusa `muted` passa a trazer `until` (instante) e um texto neutro ("Você foi silenciado(a) por quem modera a sala")                                                                             | —                                                                                                                                                                               | Mostrar sem o tempo, como hoje                           |

**Não muda:**

- identidade efêmera, ids internos só no servidor;
- deduplicação por `clientMsgId`, retomada e isolamento das conversas;
- notificações sem conteúdo;
- Render e CSP.

## B5. Interface de destino

As imagens estão em `docs/fase-b/`. A organização é a da sua diretriz.

| Área                  | Conteúdo                                                                                                                                                                                                                                                                | Imagem                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Esquerda**          | Marca, "+" e recolher; "Ir para conversa" (Ctrl K); **Início**; **Comandos**; **Fixadas** (salas e privadas misturadas, reordenáveis); **Salas** (+); **Privadas** (+); **perfil fixo embaixo** (nome e @ inteiros, Notificações, Preferências e menu rápido de status) | `chat-desk.png`, `nav-*.png`                                           |
| **Centro**            | Cabeçalho (nome, descrição ou resumo, convite, ⓘ); boas-vindas; mensagens agrupadas com divisores; novas mensagens; respostas, reações, "(editada)" e fixada; barra de ações e menu; campo de várias linhas com barra, resposta e edição                                | `chat-desk.png`, `chat-feat.png`, `chat-jump.png`, `chat-composer.png` |
| **Direita (sala)**    | Informações (nome, **descrição** editável por quem pode, papel); ações rápidas; **mensagens fixadas**; integrantes (filtro, grupos, menu com moderação); ações (limpar a tela, apagar o histórico, sair)                                                                | `chat-feat.png`, `nav-states.png`                                      |
| **Direita (privada)** | Contato (nome, @, presença e motivo); ações rápidas; mensagens fixadas; encerrar e bloquear                                                                                                                                                                             | `dm.png`                                                               |
| **Celular**           | Pilha: lista, conversa e dados; menus como folha inferior; o campo acima do teclado                                                                                                                                                                                     | `mobile-strip.png`, `chat-mobile.png`, `nav-mobile.png`                |

**Fixadas** atende ao 3.2 da diretriz:

- fixar e desafixar;
- reordenar arrastando ou pelo teclado;
- misturar salas e privadas;
- preservar a organização pela sessão inteira, inclusive nas reconexões;
- as listas originais continuam independentes: o item fixado sai delas e volta ao desafixar, sem aparecer duas vezes.

**Persistência entre sessões:** não é possível sem contas (D1).

## B6. Sistema de design

- **Tokens novos** (`tokens.css`): larguras e alturas de leiaute, camadas (`--z-sheet`, `--z-menu`), área de toque mínima, sombra de menu e densidade (`--message-gap-group`, `--message-gap-inline`).
- **Componentes primitivos novos:** Menu/ContextMenu (APG), BottomSheet, Popover (floating-ui), Sheet, RovingList, Reorder, Switch, SegmentedControl, JumpBar e Skeleton.
- **Atalhos** (subconjunto da lista do Fluxer):

    | Tecla                     | Ação                                                                  |
    | ------------------------- | --------------------------------------------------------------------- |
    | Ctrl/⌘ K                  | Ir para conversa                                                      |
    | Alt+↑/↓                   | Conversa anterior ou seguinte                                         |
    | Alt+Shift+↑/↓             | Próxima conversa não lida                                             |
    | Ctrl+Shift+↑/↓            | Mover a conversa focada                                               |
    | ↑ no campo vazio          | Editar a sua última mensagem                                          |
    | Esc                       | Cancelar a resposta ou a edição; senão, ir ao fim e marcar como lidas |
    | Page Up / Page Down       | Rolar o histórico                                                     |
    | Shift+Page Up             | Ir à primeira não lida                                                |
    | Ctrl/⌘ B / I / E          | Negrito, itálico e código                                             |
    | Shift+F10 / tecla de menu | Menu da mensagem, pessoa ou conversa focada                           |

- **Movimento:** 150 a 200 ms; nada com `prefers-reduced-motion`.

## B7. Sequência de implementação (Fase C)

Cada PR sai da `main` atualizada, com CI verde, sem merge sem a sua
autorização, e com a nota "nenhum código do Fluxer foi copiado".

| PR                                       | Conteúdo                                                                                                                                                          | Depende de | Critério de aceitação                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **1 · Fundação**                         | Tokens; primitivos (Menu, ContextMenu, BottomSheet, Popover com `@floating-ui/dom`, Sheet, RovingList, Switch); correções P1, P2 e P17                            | —          | Testes de teclado de cada primitivo; axe sem violações; nenhuma mudança visível além das correções                                  |
| **2 · Navegação**                        | Nova ordem; perfil no rodapé; seções recolhíveis; item compacto; Fixadas em memória; reordenar (ponteiro, toque e teclado); menu da conversa; "+"; Ctrl K; trilho | 1          | Nenhuma função atual perdida (mapa da seção 7 da `PROPOSTA_MENUS_LATERAIS.md`); E2E de fixar, reordenar e navegar pelo teclado      |
| **3 · Painel direito**                   | Sala e privada com o mesmo esqueleto; integrantes; menus; ações; folha no tablet                                                                                  | 1          | Ações conforme o papel (E2E com membro, anfitrião e administrador)                                                                  |
| **4 · Campo de mensagem**                | `<textarea>`, crescimento, barra, atalhos, contador, faixa de silenciada, teclado virtual; **C1 no servidor**, num commit separado                                | 1          | Rascunho, recusa e deduplicação inalterados; Shift+Enter; texto de 1000 caracteres; 320 px com o teclado aberto                     |
| **5 · Histórico**                        | Agrupamento (7 min, dia, tipo); divisores; novas mensagens; voltar ao presente; boas-vindas; estados; barra de ações; menções no cliente; **Markdown**            | 1, 4       | Testes do interpretador (mais de 60 casos, incluindo entradas maliciosas); nenhum `innerHTML`; rolagem sem saltos com 500 mensagens |
| **6 · Responder e apagar (F1, F3)**      | Servidor, contrato e interface                                                                                                                                    | 5          | Permissões no servidor; resposta a mensagem apagada mostra "mensagem original apagada"; isolamento entre conversas                  |
| **7 · Editar (F2)**                      | Servidor, contrato e interface                                                                                                                                    | 6          | Só a mesma identidade edita; o histórico ao entrar vem editado; "(editada)"                                                         |
| **8 · Reações (F4)**                     | Servidor, contrato e interface                                                                                                                                    | 5          | Lista fixa; limites; leitor de tela lê "👍 3, você reagiu"                                                                          |
| **9 · Fixadas e descrição (F5, F6, F7)** | Servidor, contrato e painel                                                                                                                                       | 3, 5       | Permissões; limites; linha de sistema                                                                                               |
| **10 · Celular**                         | Pilha de telas, folha inferior, histórico do navegador, áreas de toque                                                                                            | 2, 3       | Larguras de 320 a 430 px sem rolagem horizontal; o botão voltar do Android funciona                                                 |
| **11 · Validação final (Fase D)**        | Todas as suítes, roteiro manual atualizado, comparação com os critérios                                                                                           | todos      | Relatório final                                                                                                                     |

Os PRs 6 a 9 são **independentes entre si** e podem mudar de ordem ou ser
cortados sem afetar os outros.

## B8. Como as funcionalidades atuais são preservadas

- **Inventário com dono:** cada função atual (comandos, moderação, privadas, bloqueio, convite, ausente, notificações, tema, sair, rascunho, estados de envio, "saiu", não lidas no título, redimensionar) tem o seu lugar novo registrado (`PROPOSTA_MENUS_LATERAIS.md`, seção 7). O PR que mexe nela atualiza o registro.
- **Os testes antigos não são apagados nem enfraquecidos:** quando o lugar de um botão muda, o teste muda de seletor e mantém a mesma verificação.
- **O contrato só cresce,** e o teste de contrato garante o espelho.
- **Privacidade:** o teste de ids internos no tráfego continua em todos os PRs; nenhum recurso novo manda id de identidade (as reações usam `@username#autor`, que já é público na conversa).

## B9. Como a qualidade é comprovada

| Camada           | O que roda                                                                                                                                              | Quando                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Unidade          | Frontend (store, Markdown, primitivos, composer) e backend (políticas e recursos novos)                                                                 | Todo PR                      |
| Contrato         | `contract.test.js` mais os eventos novos                                                                                                                | Todo PR que muda o protocolo |
| E2E (Playwright) | Os 67 atuais mais os fluxos novos com duas ou três pessoas reais                                                                                        | Todo PR                      |
| Acessibilidade   | axe em cada tela e estado novo; E2E de teclado; roteiro manual de leitor de tela atualizado (a ser executado por pessoas, sem ser declarado como feito) | Todo PR; o manual no PR 11   |
| Responsividade   | Capturas comparadas em 320, 360, 375, 390, 430, 768, 1024, 1280, 1440 e 1920 px, nos dois temas                                                         | PRs 2, 3, 4, 5, 10 e 11      |
| Estabilidade     | Memória (curto no CI, longo no PR 11), carga e reconexão com o proxy                                                                                    | PRs 4 a 9 e 11               |
| Segurança        | CodeQL, `npm audit`, CSP inalterada, nenhum `innerHTML`, entradas maliciosas no Markdown                                                                | Todo PR                      |
| Orçamento        | JS até 160 KB, CSS até 80 KB; tempo de abertura de conversa com 500 mensagens                                                                           | PRs 5 e 11                   |

---

## 9. Decisões para aprovar

| #      | Decisão                                                                                                     | Recomendação                              |
| ------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **S1** | Estratégia: **E1** (padrões do Fluxer, código nosso, MIT), E2 (AGPL e porte de código) ou E3 (React e fork) | **E1**                                    |
| S2     | Adotar `@floating-ui/dom` (MIT)                                                                             | Sim                                       |
| S3     | Manter os ícones próprios (sem Phosphor)                                                                    | Sim                                       |
| C1     | Quebra de linha no servidor                                                                                 | Sim                                       |
| C2     | Markdown (subconjunto) no cliente                                                                           | Sim                                       |
| F1–F7  | Responder, editar, apagar, reações (lista fixa), mensagens fixadas, descrição da sala, silêncio com tempo   | Sim, nesta ordem: F1+F3, F2, F4, F5+F6+F7 |
| D1     | Fixadas e ordem em memória (sem conta, não há como guardar entre sessões)                                   | Sim                                       |
| D2     | Celular em pilha de telas                                                                                   | Sim                                       |
| N1/N2  | Início e Comandos no topo; perfil no rodapé                                                                 | Sim (a sua diretriz)                      |
| M1–M8  | Itens da `PROPOSTA_MENUS_LATERAIS.md`                                                                       | Sim (M7 opcional)                         |

**Fora do escopo** (exigem contas, armazenamento ou infraestrutura que o produto
não tem, ou fogem do chat de texto):

- voz e vídeo;
- anexos e imagens;
- emoji próprio, figurinhas e GIFs;
- fóruns, tópicos e servidores com canais;
- amigos;
- Premium;
- busca em todo o histórico.

Se algum deles for desejado, ele vira um projeto à parte, com decisão de
arquitetura própria.
