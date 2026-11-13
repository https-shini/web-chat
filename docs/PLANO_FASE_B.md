# Plano da Fase B — arquitetura em três áreas

> Branch `feat/ux-audit-discord`. **Proposta para aprovação, sem implementação.**
> Segue a diretriz estrutural obrigatória:
>
> - navegação à esquerda;
> - comunicação no centro;
> - informações contextuais à direita;
> - o mesmo padrão em salas e conversas privadas.
>
> Base: a auditoria da Fase A (`docs/AUDITORIA_UX_DISCORD.md`).
>
> Discord e WhatsApp são referências de **padrão** (painel "Dados do grupo",
> lista de integrantes logo abaixo, ações destrutivas no fim). Nenhum ícone,
> marca ou recurso visual deles é usado: os ícones do protótipo são traços
> genéricos, e as cores são os tokens do web-chat.

As imagens em `docs/fase-b/` foram geradas de um protótipo estático em HTML que
usa o `tokens.css` real do app. Elas mostram **estrutura e hierarquia**. Não são
a versão final pixel a pixel. Os nomes e as mensagens são fictícios.

---

## 1. Visão geral

```
┌──────────────┬───────────────────────────────┬──────────────────┐
│ NAVEGAÇÃO    │ COMUNICAÇÃO                   │ CONTEXTO         │
│ Início       │ Cabeçalho: nome · resumo · ⓘ  │ Dados da sala /  │
│ Perfil       │ ───────────────────────────── │ Dados do contato │
│ Fixadas      │ Começo da conversa            │ 1. Informações   │
│ Salas      + │ Mensagens                     │ 2. Integrantes   │
│ Privadas   + │ Digitando…                    │ 3. Ações         │
│ ──────────── │ Campo de mensagem             │                  │
│ Comandos     │                               │                  │
└──────────────┴───────────────────────────────┴──────────────────┘
   280 px              flexível (mín. 480)          340 px
```

| Imagem                    | O que mostra                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `fase-b/room.png`         | Sala: informações, convite, integrantes e o menu de um integrante (com moderação); barra de ações sobre uma mensagem                            |
| `fase-b/room-bottom.png`  | Mesma sala com o painel rolado até as ações (limpar, apagar para todos, sair) e o menu de contexto de um item da navegação (fixar, mover, sair) |
| `fase-b/dm.png`           | Privada: o mesmo esqueleto, com "Dados do contato"                                                                                              |
| `fase-b/cmds.png`         | Página "Comandos"                                                                                                                               |
| `fase-b/profile.png`      | Página "Perfil e preferências"                                                                                                                  |
| `fase-b/tablet.png`       | 900 px: o painel direito como folha sobre a conversa                                                                                            |
| `fase-b/mobile-strip.png` | 375 px: navegação, conversa, dados da sala e dados do contato, cada um em tela cheia                                                            |

---

## 2. Esquerda — navegação

A ordem é obrigatória pela diretriz.

| #   | Item           | Comportamento                                                                                                                           | Hoje                                                          |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 3.1 | **Início**     | Abre o início no centro (criar sala, entrar com código, abrir privada). O painel direito fecha.                                         | Existe                                                        |
| 3.2 | **Perfil**     | Uma linha com avatar, nome, @ e presença. Abre "Perfil e preferências" no centro.                                                       | É o painel "você", no rodapé, com 4 botões. **Muda de lugar** |
| 3.3 | **Fixadas**    | Salas e privadas misturadas, na ordem que a pessoa escolher. Só aparece com pelo menos 1 item, e o "⋯" do título traz "Desafixar tudo". | Novo                                                          |
| 3.4 | **Salas** +    | Todas as salas que não estão fixadas. O "+" abre "Nova sala / Entrar com código".                                                       | Existe, sem o "+"                                             |
| 3.5 | **Privadas** + | Todas as privadas que não estão fixadas. O "+" abre "Conversa privada pelo @".                                                          | Existe, sem o "+"                                             |
| 3.6 | **Comandos**   | Abre a página de comandos no centro.                                                                                                    | É a ajuda em mensagem; o atalho fica na seção "Atalhos"       |

**Saem da barra lateral, sem perder nenhuma função:**

| Hoje                                              | Vai para                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Atalhos · Comandos                                | Item 3.6 e botão `/` no campo de mensagem                                          |
| Atalhos · Limpar minha tela                       | Painel direito → "Sua tela"; menu de contexto da conversa                          |
| Moderação · Apagar para todos                     | Painel direito → "Moderação" (só para quem pode)                                   |
| Conexão (sempre visível)                          | Faixa no topo da navegação, **só quando houver problema** (ver `mobile-strip.png`) |
| "você": ausente, notificações, tema, sair do chat | Página Perfil                                                                      |

**Item de conversa:**

- ícone da sala (iniciais, cor da sala) ou avatar com presença;
- nome e uma linha de apoio: "Sala · N pessoas" ou "@pessoa · ausente";
- selo de não lidas; nome em negrito quando houver não lidas;
- o item atual tem fundo carmim suave e uma barra à esquerda.

**Menu de contexto do item:** clique direito, botão "⋯" ao passar o ponteiro,
Shift+F10 ou a tecla de menu. Opções:

- Fixar ou Desafixar;
- Mover para cima e Mover para baixo;
- Marcar como lida;
- Copiar convite (salas) ou Copiar @ (privadas);
- separador;
- Sair da sala ou Encerrar conversa.

---

## 3. Organização e personalização

| Recurso           | Como funciona                                                                                                                                                                                                                        | Teclado e leitor de tela                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fixar**         | Leva o item para "Fixadas". Ele sai da lista de origem, para não aparecer duas vezes. Ao desafixar, volta para a lista de origem, na posição em que estava.                                                                          | "Fixar" no menu de contexto; anúncio "Projeto final fixada"                                                                                           |
| **Reordenar**     | Arrastar com o ponteiro, inclusive pelo toque (com uma pressão longa, para não confundir com rolar).                                                                                                                                 | **Ctrl+Shift+↑/↓** com o item focado (ver `PROPOSTA_MENUS_LATERAIS.md`), e "Mover para cima/baixo" no menu. Anúncio da nova posição: "posição 2 de 4" |
| **Lista mista**   | Em "Fixadas", salas e privadas sempre se misturam. Opção no "⋯" da navegação: **"Separar salas e privadas"** (ligada por padrão; é a hierarquia exigida). Desligada, as seções 3.4 e 3.5 viram uma só, "Conversas", com ordem livre. | Um item de menu com estado marcado (`menuitemcheckbox`)                                                                                               |
| **Conversa nova** | Entra no topo da sua lista. Uma mensagem nova **não** reordena a lista sozinha, porque a ordem é da pessoa.                                                                                                                          | —                                                                                                                                                     |
| **Persistência**  | Ver a decisão D1                                                                                                                                                                                                                     | —                                                                                                                                                     |

### D1 — Persistência entre sessões: proposta com justificativa técnica

A diretriz pede a persistência "sempre que a infraestrutura atual permitir".
Hoje, ela **não permite** além da própria sessão:

- a identidade, as salas e as privadas existem **só em memória no servidor**;
- recarregar a página ou "Sair do chat" encerra a identidade (o token fica só em memória, por decisão de segurança);
- na sessão seguinte, a pessoa tem outro conjunto de conversas, com outros ids;
- uma ordem salva no navegador apontaria para conversas que não existem mais.

Gravar a ordem e as fixações no `localStorage` não traria nenhum benefício e
deixaria um rastro de quais conversas a pessoa teve. Isso contraria a regra de
não guardar informação sensível no navegador.

**Proposta:**

- Fixações e ordem ficam **em memória no cliente** pela vida da identidade.
- Sobrevivem a:
    - trocar de conversa, ir ao início ou ao perfil;
    - **quedas e reconexões** (o estado do cliente continua);
    - a retomada da sessão no servidor.
- Uma conversa que deixa de existir (saiu, encerrada, removido) some também das fixações e da ordem.
- A **única** preferência entre sessões continua sendo o tema, como hoje.
- **Opcional, só se você quiser:** a preferência "Separar salas e privadas" também entre sessões. Não identifica conversa nenhuma e pode ir para o `localStorage`, como o tema.

Se no futuro existirem contas persistentes, as fixações passam para o servidor.
Isso é mudança de produto, não desta fase.

---

## 4. Centro — comunicação

**Cabeçalho, igual nas salas e nas privadas:**

- ícone ou avatar, nome e resumo ("5 pessoas · 3 online" ou "@caio · online");
- o cabeçalho inteiro é um botão que abre ou fecha o painel direito (padrão do WhatsApp);
- à direita, só:
    - **Copiar convite**, nas salas e no desktop;
    - **ⓘ Dados**, que alterna o painel e fica marcado quando ele está aberto.
- Bloquear, encerrar e sair **saem do cabeçalho** e vão para o painel. A ação destrutiva deixa de ficar ao lado das comuns (P14).

**Lista de mensagens:**

- **Começo da conversa** no topo (P10):
    - sala: "Começo de {sala}", quem criou, "Copiar convite" e "Ver comandos";
    - privada: avatar, nome, @ e a explicação de que é temporária.
- Separador de dia ("Hoje").
- Nomes coloridos por autor, como hoje.
- **Sem o selo "você"** em cada mensagem (P9). O texto continua para leitor de tela.
- ✓ "enviada" **junto ao texto** (P16).
- **Markdown básico** (Q1): `**negrito**`, `*itálico*`, `` `código` ``.
    - Renderizado com elementos (`strong`, `em`, `code`) e nós de texto, **sem HTML**.
    - O texto enviado e o servidor não mudam.
- **Barra de ações ao passar o ponteiro ou focar a mensagem:**
    - Copiar texto;
    - Mencionar (insere `@pessoa` no campo);
    - "⋯" com Ver perfil, Mensagem privada e Copiar @.
    - O mesmo menu abre com clique direito ou Shift+F10.

**Campo de mensagem:**

- o botão `/` abre as sugestões de comando (as mesmas de hoje);
- o texto de exemplo diz onde a mensagem vai ("Mensagem em Projeto final", "Mensagem para @caio");
- foco com o anel padrão, não com a borda vermelha forte (P17);
- o aviso sobe acima do campo e **não cobre o botão de enviar** (P2).

**Páginas no centro:** Início, Perfil e Comandos ocupam o centro. O painel direito fica fechado nelas.

---

## 5. Direita — contexto

A ordem é obrigatória: informações, integrantes e ações.

### Sala — "Dados da sala"

1. **Informações:**
    - ícone grande, nome, "Sala · N pessoas" e o seu papel ("Você é anfitriã");
    - ações rápidas: **Convidar**, **Fixar** e **Limpar tela**;
    - **Convite**: o código, com o botão de copiar. Sai do tópico do cabeçalho (P15).
2. **Integrantes · N** (com "N online"):
    - filtro por nome ou @, só no cliente, com o que já foi recebido;
    - grupos: você primeiro, depois online, ausentes e o resto;
    - selos ANFITRIÃ e ADMIN **ao lado** do nome, sem cortar o nome (P4);
    - clique abre o **menu do integrante**:
        - Mensagem privada, Ver perfil, Copiar @;
        - **Moderação**, só quando o servidor permitiria (regra atual de `policy.js`): Silenciar ▸ 5, 10 ou 60 min, Liberar, e **Remover da sala…** com confirmação;
    - com mais de 50 integrantes, mostra 50 e "Ver todos (mais N)".
3. **Ações:**
    - **Sua tela:** "Limpar minha tela" (só para você);
    - **Moderação** (anfitrião ou admin): "Apagar histórico para todos…", com confirmação;
    - **Sair da sala…**, com "Você continua no chat e nas outras conversas".

### Privada — "Dados do contato"

1. **Informações:**
    - avatar grande com presença, nome, @ e um selo de presença por texto e cor (online, ausente com motivo, offline);
    - ações rápidas: **Copiar @**, **Fixar** e **Limpar tela**;
    - "Sobre esta conversa": privada e temporária.
2. **Integrantes:** não se aplica (são duas pessoas). O próprio contato é o bloco 1. Esta é a única diferença de estrutura, e é intencional.
3. **Ações:**
    - **Encerrar conversa…** (some para os dois);
    - **Bloquear @pessoa…** (até você sair do chat; a pessoa não é avisada).

**Só o que o navegador já recebe:** nenhum dado novo, nenhum id interno, nenhuma
mudança de contrato (Q4).

**Descrição da sala:** a diretriz cita "descrição". Hoje a sala só tem nome.
Ver a decisão D3.

---

## 6. Responsividade

| Largura                  | Esquerda                                                  | Centro                     | Direita                                                                                           |
| ------------------------ | --------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| **≥ 1280 px**            | Fixa, 280 px (redimensionável, como hoje)                 | Flexível                   | **Aberta por padrão**, 340 px, empurra o centro. Fechar vale até a pessoa reabrir.                |
| **1024–1279 px**         | Fixa, 260 px                                              | Flexível                   | Fechada por padrão. Abre como **folha sobre o centro**, com fundo escurecido, foco preso e Escape |
| **768–1023 px** (tablet) | Fixa, 260 px                                              | Flexível                   | Folha sobre o centro (ver `tablet.png`)                                                           |
| **< 768 px** (celular)   | **Tela própria**: a lista de conversas é a tela principal | Tela cheia, com "← voltar" | Tela cheia, com "← voltar" (ver `mobile-strip.png`)                                               |

### D2 — Celular: telas em pilha no lugar de gavetas

**Recomendação:** pilha de telas, como no WhatsApp e no Discord no celular.

- Gavetas a 320–375 px deixam pouco espaço e escondem o contexto.
- Em pilha, cada tela usa a largura inteira, e "voltar" é previsível.

**Detalhes:**

- **Botão voltar do Android e gesto de voltar do iOS:** cada nível (conversa e dados) entra no histórico do navegador com `history.pushState`, **sem mudar a URL**: a URL continua sendo o convite da sala aberta, como hoje.
- **Teclado virtual:**
    - altura com `100dvh` e `visualViewport`, para o campo de mensagem ficar acima do teclado;
    - nenhum painel fecha porque a janela mudou de tamanho. Isso corrige P12.
- **Toque:** áreas de pelo menos 44 × 44 px no celular (hoje, 24 px é o mínimo testado). A pressão longa num item abre o mesmo menu de contexto.
- **Não lidas fora da conversa aberta:** um selo no "← voltar" com o total.

**Alternativa:** manter as gavetas atuais (já testadas, com foco preso). É menos
trabalho, mas o painel direito também precisaria virar gaveta, e as duas
competiriam pelo pouco espaço.

**Larguras testadas na Fase F:** 320, 360, 375, 390, 430, 768, 1024, 1280, 1440
e 1920 px, nos dois temas.

---

## 7. Sistema de design

### Tokens novos (em `tokens.css`)

| Token                  | Valor                                  | Uso                                            |
| ---------------------- | -------------------------------------- | ---------------------------------------------- |
| `--layout-nav-width`   | 17.5rem (280 px)                       | Navegação; hoje 18rem solto no CSS             |
| `--layout-panel-width` | 21.25rem (340 px)                      | Painel direito                                 |
| `--layout-main-min`    | 30rem                                  | Mínimo do centro antes de o painel virar folha |
| `--header-height`      | 3.75rem                                | Cabeçalhos do centro e do painel, alinhados    |
| `--z-sheet`            | Entre `--z-drawer` e `--z-overlay`     | Substitui os `calc(+1)` ad hoc                 |
| `--z-menu`             | Acima de `--z-popover`                 | Menus de contexto                              |
| `--target-min`         | 2.75rem no toque, 2.25rem com ponteiro | Áreas de toque                                 |
| `--shadow-menu`        | Derivada de `--shadow-3`               | Menus                                          |

Os pontos de quebra (`--breakpoint-*`) já existem como documentação. As
`@media` passam a usar só esses quatro valores. Hoje há também 47.99, 63.99 e
90rem soltos.

### Componentes

Primeiro, só os que a estrutura usa. Cada um é um módulo pequeno em `ui/`, com
o CSS em `components/`.

| Componente                     | Situação                            | Comportamento obrigatório                                                                                                                                                                                                                                                                     |
| ------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Menu / ContextMenu**         | **Novo**                            | Padrão APG "menu": `role="menu"` e `menuitem` / `menuitemcheckbox`; setas, Home, End e busca por letra; Enter e espaço; Escape fecha e devolve o foco; abre por clique, clique direito, Shift+F10, tecla de menu e pressão longa; posiciona dentro da janela; submenu (Silenciar ▸) com → e ← |
| **Popover**                    | Extraído de `memberCard.js`         | Posição, clique fora, Escape, foco de volta, **sem fechar no `resize`**                                                                                                                                                                                                                       |
| **Sheet** (folha lateral)      | Adaptado de `layout.js`             | Foco preso, fundo inerte, Escape e clique no fundo                                                                                                                                                                                                                                            |
| **ContextPanel**               | Novo, usa o painel de pessoas atual | Blocos: informações, integrantes, ações                                                                                                                                                                                                                                                       |
| **NavItem / NavSection**       | Adaptado de `conversationNav.js`    | Menu de contexto, arrastar, Ctrl+Shift+setas                                                                                                                                                                                                                                                  |
| **Switch**                     | Novo                                | `role="switch"` e `aria-checked`. Substitui o `aria-pressed` das notificações                                                                                                                                                                                                                 |
| **SegmentedControl**           | Novo                                | Tema escuro/claro (`radiogroup`)                                                                                                                                                                                                                                                              |
| **IconButton**                 | CSS existe                          | Sempre com nome acessível e dica                                                                                                                                                                                                                                                              |
| **Toast**                      | Existe                              | Nova posição: acima do campo de mensagem                                                                                                                                                                                                                                                      |
| **EmptyState / ErrorState**    | Parcial                             | Para listas vazias (Fixadas, Integrantes filtrados)                                                                                                                                                                                                                                           |
| **Skeleton**                   | Novo, mínimo                        | Lista de integrantes e retomada                                                                                                                                                                                                                                                               |
| Dialog, Tooltip, Avatar, Badge | Existem                             | Mantidos                                                                                                                                                                                                                                                                                      |

Select, Checkbox, Radio isolado e Tabs **não entram agora**: nenhuma tela da
proposta precisa deles. Os filtros de categoria da página de comandos são
botões com `aria-pressed`.

Os efeitos de movimento respeitam `prefers-reduced-motion`, como hoje.

---

## 8. Decisões que preciso que você aprove

| #      | Decisão                                                           | Recomendação                                                                                                                                                                                        |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Persistência das fixações e da ordem                              | Em memória pela vida da identidade, incluindo reconexões. Nada no `localStorage`. Opcional: só a preferência "Separar salas e privadas".                                                            |
| **D2** | Celular                                                           | Pilha de telas, com voltar integrado ao histórico e a URL sem mudança                                                                                                                               |
| **D3** | Descrição da sala                                                 | **Fora desta fase.** Exigiria um campo novo no contrato, um comando (`/topic`, só para o anfitrião), um limite de caracteres e validação no servidor. Proponho um PR próprio depois, se você quiser |
| **D4** | Item fixado sai da lista de origem                                | Sim: sem duplicar, e volta ao lugar ao desafixar                                                                                                                                                    |
| **D5** | Silenciar com duração à escolha (5, 10 ou 60 min, ou até liberar) | Sim. Usa `/mute @ N`, que o servidor já aceita (1 a 1440 min; sem número, até `/unmute`)                                                                                                            |
| **D6** | Cabeçalho sem bloquear, encerrar e sair (vão para o painel)       | Sim                                                                                                                                                                                                 |
| Q1     | Markdown básico renderizado no cliente, sem HTML                  | Sim                                                                                                                                                                                                 |
| Q2     | Estado "silenciado" no cartão                                     | Depois, porque muda o contrato. Por ora, "Silenciar" e "Liberar" no submenu de moderação                                                                                                            |
| Q5     | Selo "você" fora das mensagens                                    | Sim                                                                                                                                                                                                 |

---

## 9. Plano de implementação

Cada PR é pequeno, revisável, com CI verde e **sem merge sem a sua autorização**.

| PR                        | Conteúdo                                                                                                                                                                                                                     | Corrige                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **1 · Fundação**          | Tokens de layout e camadas; componentes Menu/ContextMenu, Popover, Sheet, Switch e SegmentedControl, com testes de unidade e de teclado; correções pontuais (texto da entrada, aviso fora do botão de enviar, foco do campo) | P1, P2, P17, P19          |
| **2 · Três áreas**        | Estrutura da grade; navegação na ordem nova (Início, Perfil, Salas, Privadas, Comandos); painel direito com informações, integrantes e ações, para salas e privadas; cabeçalho simplificado; faixa de conexão                | P3, P4, P5, P7, P14, P15  |
| **3 · Organização**       | Fixadas, menu de contexto dos itens, reordenar (ponteiro, toque e teclado), lista mista, limpeza ao sair ou encerrar                                                                                                         | —                         |
| **4 · Perfil e Comandos** | As duas páginas no centro; a página de comandos usa o catálogo que o servidor já manda (`command_catalog`: categoria, sintaxe, exemplos, permissão); "Usar" preenche o campo da última conversa aberta                       | P20 (parcial)             |
| **5 · Mensagens**         | Começo da conversa, Markdown sem HTML, selo "você", ✓ junto ao texto, barra de ações e menu de contexto da mensagem, Silenciar ▸                                                                                             | P6, P8, P9, P10, P11, P16 |
| **6 · Celular**           | Pilha de telas, histórico, teclado virtual, áreas de toque                                                                                                                                                                   | P12, D2                   |
| **7 · Regressão (G)**     | E2E de todos os fluxos, axe, roteiro manual atualizado, memória, produção local                                                                                                                                              | —                         |

Ordem: 1 → 2 → 3 → 4 → 5 → 6 → 7. O 4 e o 5 podem ser feitos em paralelo
depois do 2.

---

## 10. Riscos de regressão e como cada um é contido

| Risco                                                                                                           | Contenção                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Os testes E2E e de unidade dependem de seletores e lugares atuais (`data-action`, painel de pessoas, cabeçalho) | Os seletores de dados (`data-action`, `data-conversation-action`) continuam onde a função continua. Os testes são **atualizados para o lugar novo, nunca enfraquecidos**: cada verificação antiga ganha uma equivalente |
| Foco preso, inércia e Escape (gavetas, diálogo, cartão)                                                         | Os componentes novos reaproveitam a lógica testada de `layout.js` e `dialog.js`. E2E de teclado para cada menu e folha                                                                                                  |
| Menus abertos com o fundo inerte ou com o diálogo aberto                                                        | Uma camada só (`--z-menu`); Escape em captura fecha primeiro o elemento mais alto, como já faz o cartão                                                                                                                 |
| Fixações apontando para conversa que não existe                                                                 | Limpeza no mesmo ponto em que o store já remove a conversa (`removeConversation`), com teste de unidade                                                                                                                 |
| Não lidas, rascunho por conversa, deduplicação e reconexão                                                      | O store muda só com o acréscimo de `pinned` e `order`; os eventos e o socket não mudam. As suítes atuais (180 de frontend, 353 de backend, 67 E2E e memória) rodam a cada PR                                            |
| URL ou convite no celular com `pushState`                                                                       | A URL só muda como hoje (convite da sala aberta); o histórico guarda só o nível da tela. E2E de "voltar" no celular                                                                                                     |
| Privacidade                                                                                                     | Nenhum dado novo no navegador; o teste de ids internos no tráfego continua; nada novo no `localStorage` (D1)                                                                                                            |
| CSP                                                                                                             | Posicionamento por `element.style` (CSSOM é permitido sem `unsafe-inline`); nenhum `innerHTML`, nenhum estilo ou script inline novo                                                                                     |
| Desempenho com muitas conversas e integrantes                                                                   | Listas com chave estável (como `messageList`); integrantes limitados a 50 visíveis; medir no teste de carga                                                                                                             |
| Arrastar no toque conflitando com rolar                                                                         | Pressão longa para começar o arrasto; o teclado e o menu são sempre alternativas                                                                                                                                        |

---

## 11. O que não muda

- Contrato WebSocket, servidor, Render, CSP e cabeçalhos.
- Identidade efêmera, ids internos só no servidor, notificações sem conteúdo.
- Rascunho por conversa, estados de envio, "saiu", não lidas no título.
- Temas escuro e claro, a paleta e os tokens existentes.
