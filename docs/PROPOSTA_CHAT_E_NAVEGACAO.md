# Proposta — navegação no padrão do Discord e chat principal

> Branch `feat/ux-audit-discord`. **Proposta para aprovação, sem implementação.**
>
> Este documento **atualiza** a ordem do menu esquerdo do `PLANO_FASE_B.md` e da
> `PROPOSTA_MENUS_LATERAIS.md`, conforme a sua nova diretriz:
>
> - Início e Comandos no topo;
> - as conversas no meio;
> - o perfil fixo embaixo.
>
> O resto daqueles documentos continua valendo (painel direito, fixar,
> reordenar, responsividade e as decisões D1 a D6 e M1 a M8).
>
> Imagens:
>
> - `docs/fase-b/chat-desk.png`: visão geral;
> - `chat-jump.png`: rolagem;
> - `chat-composer.png`: estados do campo de mensagem;
> - `chat-mobile.png`: celular com o teclado aberto.
>
> Os balões amarelos são anotações. Os nomes são fictícios.

---

## 1. O que existe hoje no chat (medido no código)

| Área                                          | Hoje                                                                                                                                                                   | Onde                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Campo de mensagem                             | **`<input type="text">` de uma linha**: texto longo vira uma faixa que rola para o lado; não há quebra de linha                                                        | `index.html`, `composer.js`            |
| Quebra de linha                               | **O servidor troca `\n` por espaço** (`normalizeText` remove os caracteres de controle)                                                                                | `backend/src/validation.js`            |
| Formatação                                    | Só por comando (`/bold`, `/italic`, `/code`, `/spoiler`), aplicada pelo servidor                                                                                       | `protocol.js` (`MESSAGE_FORMATS`)      |
| Variantes                                     | Texto, ação (`/me`), dado e moeda, aviso (`/announce`)                                                                                                                 | `message.js`                           |
| Agrupamento                                   | Mensagens seguidas da mesma pessoa são compactadas                                                                                                                     | `message.js`                           |
| Estados                                       | Enviando, enviada (✓), não enviada com "Tentar de novo", reenviando, e a marca "saiu"                                                                                  | `message.js`                           |
| Rolagem                                       | Acompanha o fim só se você já estava nele (menos de 80 px do fim). **Não há** aviso de mensagens novas quando você rolou para cima, nem separador de "novas" ou de dia | `messageList.js`                       |
| Respostas, edição, mensagens fixadas, menções | **Não existem** no produto (nem no servidor, nem no cliente)                                                                                                           | —                                      |
| Barra do campo                                | Só o botão Enviar; as sugestões de comando abrem ao digitar `/`                                                                                                        | `composer.js`, `commandSuggestions.js` |

A diretriz pede para aprimorar "respostas, menções, edições, mensagens fixadas e
demais recursos **existentes**".

- **Menções:** dá para melhorar só no navegador (seção 3.5).
- **Respostas, edição e mensagens fixadas:** são recursos **novos**. Exigem servidor e contrato novos. Estão na seção 6 como decisão separada, e não foram desenhados como se já existissem.

---

## 2. Menu lateral esquerdo — nova ordem

Imagem: `chat-desk.png`, à esquerda.

```
┌──────────────────────────────┐
│ ■ web-chat          [+] [‹]  │  nova conversa · recolher
│ [⌕ Ir para conversa   Ctrl K]│
│ ⌂ Início                     │  1. topo
│ / Comandos                   │  2. logo abaixo de Início
├──────────────────────────────┤
│ ⌄ FIXADAS               2    │  3. rola
│ ⌄ SALAS             2    +   │
│ ⌄ PRIVADAS          2    +   │
│   …                          │
├──────────────────────────────┤
│ (AS) Ana Souza      [🔔] [⚙] │  4. perfil fixo embaixo, sempre visível
│      @ana · online           │
└──────────────────────────────┘
```

| Bloco                 | Comportamento                                                                                                                                                                                                                                                                              | Benefício                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Início e Comandos** | Fixos no topo, fora da área que rola. "Comandos" abre a página de comandos no centro (categorias, sintaxe, exemplos e permissão), usando o `command_catalog` que o servidor já manda                                                                                                       | Os dois destinos fixos ficam sempre no mesmo lugar, como "Amigos" e "Nitro" no topo do Discord |
| **Conversas**         | Fixadas, Salas e Privadas, recolhíveis, com o item compacto de uma linha, fixar, menu "⋯" e reordenar (`PROPOSTA_MENUS_LATERAIS.md`)                                                                                                                                                       | Só esta área rola; a navegação fica previsível                                                 |
| **Perfil (rodapé)**   | Avatar com presença, nome e @ **sem corte** (sobram cerca de 150 px para o texto), e só dois botões: **Notificações** (alterna, com estado) e **Preferências** (⚙, abre a página Perfil). Clicar no nome ou no avatar abre o menu rápido: Online ou Ausente…, Tema, Perfil e Sair do chat… | Padrão do painel de usuário do Discord. Corrige P3 (o nome cortado em 35 de 91 px)             |

**Teclado:** a mesma ordem no foco.

- Início, Comandos e a lista de conversas (uma parada de Tab, navegada com as setas).
- Depois, o perfil.
- O link "Ir para a conversa" continua sendo o primeiro Tab da página.

---

## 3. Chat principal

### 3.1 Histórico

| Melhoria               | Detalhe                                                                                 | Componente                                                    | Benefício                                                      |
| ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| **Separadores de dia** | "Hoje", "Ontem" ou a data, numa pílula centrada                                         | `messageList.js`                                              | Situa a conversa no tempo, sem repetir a data em cada mensagem |
| **"Novas mensagens"**  | Linha carmim antes da primeira não lida, ao abrir uma conversa com não lidas            | `messageList.js`, `store.js` (sabe onde começam as não lidas) | Você retoma onde parou                                         |
| **Espaçamento**        | 12 px entre grupos de autores e 2 px dentro do grupo; corpo em 16 px com entrelinha 1,5 | `message.css`                                                 | Leitura por blocos, como no Discord                            |
| **Largura de leitura** | Até cerca de 80 caracteres por linha em telas muito largas                              | `message.css`                                                 | Linhas longas cansam menos                                     |
| **Começo da conversa** | No topo (proposta da Fase B)                                                            | `messageList.js`                                              | Contexto e convite à mão                                       |

### 3.2 Identificação

| Melhoria           | Detalhe                                                                                                   | Benefício                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Cabeçalho do grupo | Avatar, **nome** colorido (cor por autor, como hoje), **@** em cinza ao lado e hora                       | O @ desfaz a ambiguidade entre nomes iguais (o @ é o identificador real) |
| Mensagens seguidas | Sem cabeçalho; **a hora aparece na margem ao passar o ponteiro ou focar**                                 | Menos ruído; a hora continua acessível                                   |
| Hora completa      | A dica com a data e a hora (`<time datetime>`, como hoje)                                                 | Precisão quando importa                                                  |
| Sem o selo "você"  | As suas mensagens se reconhecem pelo seu nome e pelo ✓ de envio. O leitor de tela continua ouvindo "você" | Corrige P9                                                               |
| "saiu"             | Selo discreto junto ao nome, como hoje                                                                    | Mantido                                                                  |
| Nome clicável      | Abre o cartão da pessoa (sala) ou o painel do contato (privada)                                           | Perfil a um clique da conversa                                           |

### 3.3 Estados e tipos de mensagem

| Tipo                         | Apresentação proposta                                                              | Hoje                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Sua mensagem                 | Igual às outras (padrão do Discord). ✓ junto ao texto e "enviada às 14:03" na dica | Selo "você" e ✓ na ponta da linha                                                                     |
| Enviando                     | Texto em cinza, com "enviando…" ao lado                                            | Parecido                                                                                              |
| **Não enviada**              | Linha logo abaixo do texto: "✕ Não enviada. **Tentar de novo** · **Apagar**"       | Botão separado. "Apagar" é novo e só local (descarta a tentativa; `discardFailed` já existe no store) |
| Menção a você                | Fundo âmbar suave e barra âmbar à esquerda; o `@ana` destacado                     | Não existe (seção 3.5)                                                                                |
| Sistema (entrou ou saiu)     | Linha compacta com ícone, sem avatar, com a hora pequena                           | Parecido, menos compacto                                                                              |
| Aviso da sala (`/announce`)  | Cartão índigo de largura total: "AVISO DA SALA · autor · hora"                     | Destaque menor                                                                                        |
| Resposta de comando (só sua) | Cartão tracejado com "Só você vê isto." e **Dispensar**                            | É um cartão grande, sem dispensar                                                                     |
| Ação (`/me`) e dado          | Itálico; o dado num chip com o resultado                                           | Parecido                                                                                              |
| Spoiler                      | Faixa que revela ao clicar ou com Enter, como hoje                                 | Mantido                                                                                               |

### 3.4 Barra de ações da mensagem

Ao passar o ponteiro ou focar uma mensagem (Tab ou setas na lista), aparece a
barra com:

- **Copiar texto**;
- **Mencionar** (insere `@pessoa` no campo);
- **⋯**: Ver perfil, Mensagem privada, Copiar @ e, para quem modera, Silenciar e Remover.

O mesmo menu abre com clique direito ou Shift+F10. No toque, a pressão longa
abre o mesmo menu como folha inferior.

### 3.5 Menções (só no navegador, sem mudar o contrato)

- Uma mensagem que contém o **seu @** (`@ana`, como palavra inteira) ganha o destaque âmbar.
- O rótulo para leitor de tela recebe "menciona você".
- Ao digitar `@` no campo, as sugestões mostram as pessoas **da conversa aberta**. É o mesmo componente das sugestões de comando, e os dados já estão no navegador (lista de integrantes).
- **Nada novo é enviado** ao servidor; a mensagem continua sendo texto.

### 3.6 Rolagem

| Comportamento                       | Detalhe                                                                                                                   | Benefício                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Acompanhar o fim                    | Como hoje, só se você estiver no fim                                                                                      | Mantido                              |
| **Rolou para cima**                 | Mensagens novas **não puxam a tela**. Aparece "↓ 3 mensagens novas" acima do campo; o clique vai ao fim (`chat-jump.png`) | Hoje elas chegam sem nenhum aviso    |
| **Esc**                             | Com o foco no campo e sem sugestões abertas: vai ao fim e marca como lidas                                                | Atalho do Discord                    |
| **Page Up / Page Down**             | Rolam o histórico mesmo com o foco no campo                                                                               | Ler sem largar o teclado             |
| **Posição por conversa**            | Ao voltar para uma conversa, você volta para onde estava (em memória)                                                     | Trocar de conversa não perde o lugar |
| Remoção das antigas (limite de 500) | `overflow-anchor`, para a tela não pular                                                                                  | Sem saltos                           |
| Movimento reduzido                  | Rolagem instantânea com `prefers-reduced-motion`                                                                          | Acessibilidade                       |

---

## 4. Campo de mensagem e teclado

Imagens: `chat-composer.png` e `chat-mobile.png`.

### 4.1 Estrutura

```
┌──────────────────────────────────────────────────────────────┐
│ Mensagem em Projeto final                                    │  área de texto
│                                                              │  (cresce com o texto)
│ [/] [Aa] │ [B] [<>]     Enter envia · Shift+Enter nova linha [➤]│  barra
└──────────────────────────────────────────────────────────────┘
```

| Elemento          | Detalhe                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Área de texto** | `<textarea>` no lugar do `<input>`. Cresce sozinha de 1 linha até cerca de 40% da altura da área do chat; depois rola por dentro. Volta a 1 linha depois do envio                                                                                                                                                                                                                                                                                         |
| `/` Comandos      | Abre as sugestões de comando (as mesmas de hoje) sem precisar digitar                                                                                                                                                                                                                                                                                                                                                                                     |
| `Aa` Formatação   | Mostra ou esconde B, `<>`, itálico e spoiler. Cada botão **envolve o texto selecionado** com a marcação                                                                                                                                                                                                                                                                                                                                                   |
| Dica de teclas    | "Enter envia · Shift+Enter nova linha", só no desktop e só até a primeira mensagem enviada na sessão                                                                                                                                                                                                                                                                                                                                                      |
| Contador          | Só a partir de 800 de 1000 caracteres, em âmbar; em vermelho no limite. O `maxlength` continua                                                                                                                                                                                                                                                                                                                                                            |
| Enviar            | Desabilitado (visualmente e por `aria-disabled`) com o campo vazio; 36 px; 44 px no toque                                                                                                                                                                                                                                                                                                                                                                 |
| Silenciada        | Depois de uma recusa `muted`, aparece uma faixa sobre o campo: "Você foi silenciada nesta sala. Pode continuar lendo." O campo continua habilitado, porque o silêncio pode acabar. **O servidor não informa quanto tempo falta**; mostrar o tempo exigiria um campo novo no contrato (fica junto de Q2). O texto atual do servidor ("silenciado por um administrador") também é impreciso: o anfitrião também silencia. Proponho o ajuste, com o seu aval |
| Foco              | Borda neutra mais um halo carmim suave, no lugar da borda vermelha forte (P17)                                                                                                                                                                                                                                                                                                                                                                            |
| Texto de exemplo  | "Mensagem em {sala}" ou "Mensagem para @pessoa"                                                                                                                                                                                                                                                                                                                                                                                                           |

**Formatação no campo:** o que o botão insere depende da decisão Q1 (Markdown
renderizado no cliente).

- Com Q1, B insere `**texto**`.
- Sem Q1, o botão manda o comando correspondente (`/bold texto`), que já existe.

### 4.2 Atalhos

| Tecla                              | Ação                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| Enter                              | Envia (desktop)                                                   |
| Shift+Enter                        | Nova linha (depende da decisão C1)                                |
| Ctrl/⌘+B, I, E                     | Negrito, itálico e código na seleção                              |
| ↑ / ↓ com sugestões abertas        | Escolhe a sugestão; Tab ou Enter completam; Esc fecha (como hoje) |
| Esc (sem sugestões)                | Vai ao fim e marca como lidas                                     |
| Page Up / Page Down                | Rola o histórico                                                  |
| Alt+↑ / ↓, Alt+Shift+↑ / ↓, Ctrl K | Navegação entre conversas (`PROPOSTA_MENUS_LATERAIS.md`)          |
| Ctrl/⌘+Enter                       | Envia sempre (útil no celular com teclado físico)                 |

O rascunho por conversa, a devolução do texto quando o servidor recusa e os
estados de envio **não mudam**.

### 4.3 Textos longos e código

- **Colar texto grande:** o campo cresce até o limite e passa a rolar; o contador aparece. Acima de 1000 caracteres, o texto não é cortado em silêncio: o aviso "O texto tem 1350 caracteres; o limite é 1000" aparece **antes** de enviar.
- **Código:** com C1 e Q1, um bloco entre ` ``` ` vira um quadro com fonte monoespaçada, rolagem horizontal própria e o botão "Copiar". Isso é renderizado com elementos e nós de texto, **sem HTML**.
- **Sem C1:** o código inline (`` `x` ``) funciona do mesmo jeito, e os blocos de várias linhas não existem.

### 4.4 Celular e teclado virtual

Imagem: `chat-mobile.png`.

- `<meta name="viewport" content="…, interactive-widget=resizes-content">`, mais a altura com `100dvh` e o ajuste por `visualViewport` onde o navegador não suportar: o campo fica **sempre acima do teclado**, e o histórico encolhe sem pular.
- Abrir o teclado mantém a última mensagem visível se você estava no fim.
- **Nenhum painel ou menu fecha por mudança de tamanho** (corrige P12).
- No toque, **Enter faz nova linha** e o botão ➤ envia (padrão do WhatsApp). Isso depende de C1; sem C1, Enter envia, como hoje (`enterkeyhint="send"`).
- A dica de teclas não aparece no celular.
- Botões de 44 px; a barra do campo cabe em 320 px sem quebrar.

---

## 5. Consistência visual

- **Uma escala de superfícies:**
    - navegação e painel em `--color-bg-sidebar`;
    - chat em `--color-bg-main`;
    - campo, cartões e menus em `--color-bg-elevated`;
    - rodapé do perfil em `--color-bg-app`.

    São os tokens atuais, usados com a mesma regra em todas as áreas.

- **Os mesmos estados em toda parte:** hover `--color-bg-hover`, selecionado `--color-bg-selected`, foco com anel `--color-focus-ring` de 2 px, carmim só para a ação principal, o item atual e "novas".
- **Âmbar** para menção e ausência; **índigo** para aviso e administrador.
- **Raios:** `--radius-sm` em itens, `--radius-md` em botões e campos, `--radius-lg` em cartões, menus e no campo de mensagem.
- **Movimento:** 150 ms em hover, abrir e fechar, e 200 ms em painéis. Nada com `prefers-reduced-motion`.
- **Ícones:** a biblioteca própria (`icons.js`), com traço uniforme. Nenhum ícone de terceiros.

---

## 6. Recursos que não existem (decisão separada)

| Recurso                       | O que exigiria                                                                                                                                                 | Recomendação                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Responder a uma mensagem**  | Campo `replyTo` no envio; o servidor confere que a mensagem é da mesma conversa e manda um trecho dela junto; o cliente mostra a citação e rola até a original | **Primeiro candidato.** Valor alto, risco moderado. PR próprio, com contrato e testes |
| **Editar a própria mensagem** | Evento novo (`message_edit`), validação de autoria e janela de tempo no servidor, "(editada)" para todos                                                       | Depois de responder                                                                   |
| **Mensagens fixadas**         | Lista por sala no servidor (só o anfitrião fixa), evento novo e um bloco "Fixadas" no painel direito                                                           | Depois; combina com o painel da Fase B                                                |
| **Menção com notificação**    | Aviso sem conteúdo: "Você foi mencionada em {sala}"                                                                                                            | Avaliar junto com a privacidade das notificações                                      |

Nenhum deles entra sem a sua aprovação explícita, porque mudam o contrato e o
servidor.

---

## 7. Componentes modificados

| Arquivo                                      | Mudança                                                                                                                                   | Benefício                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `index.html`                                 | Navegação (topo, conversas, perfil no rodapé); campo `<textarea>` com barra; `meta viewport`                                              | Estrutura nova                      |
| `ui/conversationNav.js`                      | Seções, item compacto, menu, reordenar (proposta anterior)                                                                                | Navegação                           |
| `ui/userPanel` (no `main.js` e `index.html`) | Perfil compacto no rodapé, 2 botões e menu rápido                                                                                         | Nome legível; ações com rótulo      |
| `ui/composer.js`                             | Textarea com crescimento automático, atalhos, formatação na seleção, contador, estado de silenciada                                       | Escrita confortável                 |
| `ui/commandSuggestions.js`                   | Também sugere `@pessoas` da conversa                                                                                                      | Menções sem erro de digitação       |
| `ui/messageList.js`                          | Separadores de dia, "Novas mensagens", botão de novas, posição por conversa, Page Up/Down e Esc                                           | Rolagem previsível                  |
| `ui/message.js`                              | Cabeçalho com @, hora na margem, barra de ações, menção, falha com "Apagar", aviso e resposta de comando com dispensar, sem o selo "você" | Hierarquia e legibilidade           |
| `state/store.js`                             | Onde começam as não lidas, posição de rolagem e fixações e ordem (em memória)                                                             | Suporte ao acima, sem mudar eventos |
| `css/components/*.css`                       | `message`, `composer`, `sidebar`, `conversation-nav`, `typing` e `toast`, com os tokens atuais                                            | Consistência                        |
| `css/tokens.css`                             | Tokens de layout e camadas (Fase B)                                                                                                       | Fim dos valores soltos              |
| **Servidor**                                 | **Nada**, a menos que você aprove C1 (e os recursos da seção 6)                                                                           | —                                   |

---

## 8. Decisões para aprovar

| #      | Decisão                                                                                                                                                                                                                                                                                                                                                                | Recomendação                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **N1** | Nova ordem: Início, Comandos, conversas e perfil fixo embaixo (substitui "Perfil em segundo")                                                                                                                                                                                                                                                                          | Sim, conforme a sua diretriz                                                            |
| **N2** | Perfil no rodapé com 2 botões (Notificações e Preferências), e o menu rápido no nome                                                                                                                                                                                                                                                                                   | Sim                                                                                     |
| **C1** | **Permitir quebra de linha nas mensagens.** O servidor passa a aceitar `\n` só no conteúdo de mensagens (não em nomes nem comandos), com no máximo 20 linhas e linhas vazias seguidas reduzidas a uma; os outros caracteres de controle continuam removidos. A exibição já usa `white-space: pre-wrap` e `textContent`, sem risco de injeção. Exige testes no servidor | Sim. Sem isso não há Shift+Enter, blocos de código nem Enter como nova linha no celular |
| **C2** | Markdown no cliente (Q1 da auditoria), incluindo os blocos de código com C1                                                                                                                                                                                                                                                                                            | Sim                                                                                     |
| **C3** | Sugestões de `@pessoa` ao digitar `@` (só quem está na conversa aberta)                                                                                                                                                                                                                                                                                                | Sim                                                                                     |
| **C4** | "Apagar" uma mensagem que não foi enviada (só local)                                                                                                                                                                                                                                                                                                                   | Sim                                                                                     |
| **C5** | Esc vai ao fim e marca como lidas                                                                                                                                                                                                                                                                                                                                      | Sim                                                                                     |
| **C6** | Respostas, edição e mensagens fixadas (seção 6)                                                                                                                                                                                                                                                                                                                        | Fora desta etapa. Proposta: "Responder" como próximo recurso, num PR próprio            |

As decisões anteriores continuam pendentes: D1 a D6 (`PLANO_FASE_B.md`) e M1 a
M8 (`PROPOSTA_MENUS_LATERAIS.md`).

---

## 9. Ordem de implementação

Atualiza o plano da Fase B.

| PR                        | Conteúdo                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 · Fundação              | Tokens; Menu/ContextMenu, Popover e folha; correções pontuais (texto da entrada, aviso sobre o botão de enviar)                                        |
| 2a · Navegação            | Nova ordem (N1), perfil no rodapé (N2), seções e item compacto, lista com uma parada de Tab                                                            |
| 2b · Painel direito       | Informações, integrantes e ações                                                                                                                       |
| **3 · Campo de mensagem** | Textarea, crescimento, barra, atalhos, contador, silenciada, teclado virtual. **Com C1**, inclui a mudança no servidor com testes, num commit separado |
| **4 · Histórico**         | Separadores, novas mensagens, rolagem, identificação, estados, barra de ações e menções no navegador                                                   |
| 5 · Organização e atalhos | Fixar, reordenar, "+", Ctrl K e trilho                                                                                                                 |
| 6 · Perfil e Comandos     | As páginas no centro                                                                                                                                   |
| 7 · Celular e regressão   | Pilha de telas e as suítes completas (Fase G)                                                                                                          |

### Riscos

| Risco                                                                                                                                               | Contenção                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trocar o `<input>` por `<textarea>` mexe em `composer.js`, nas sugestões, no rascunho, na devolução do texto recusado e em todos os E2E que digitam | A API pública do `composer` (`getValue`, `setValue`, `focus`) não muda. Os E2E usam o mesmo `#campo-mensagem`. O Enter continua enviando no desktop. Testes novos para Shift+Enter, colar texto grande e silenciada |
| C1 muda a validação do servidor                                                                                                                     | Teste de unidade para `\n` aceito só em mensagens, o limite de linhas, a remoção dos outros caracteres de controle e o nome e o @ sem `\n`. Teste de contrato                                                       |
| A rolagem sem puxar e a posição por conversa podem esconder mensagens novas                                                                         | O botão "N novas" é obrigatório quando você não está no fim. E2E com rolagem para cima e chegada de mensagens                                                                                                       |
| Menção e @ nas sugestões                                                                                                                            | Só dados que já estão no navegador; nenhum id interno; o teste de tráfego continua                                                                                                                                  |
| Desempenho com 500 mensagens e separadores                                                                                                          | Os separadores entram no mesmo desenho incremental com chave (`messageList`); medido no teste de carga                                                                                                              |
