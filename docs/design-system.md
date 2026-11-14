# Design system · web-chat (v4 · paleta do portfólio)

> Versão 4: a estrutura e as formas da v3 ("Maré") com a **paleta do portfólio
> pessoal [gcruz.dev.br](https://gcruz.dev.br)**, para os dois produtos terem
> a mesma identidade cromática. Só as cores mudaram em relação à v3. A versão 1,
> com a identidade "fio da sessão", está arquivada em
> [`docs/historico/design-system-v1.md`](./historico/design-system-v1.md).
>
> Fonte da verdade: [`frontend/src/css/tokens.css`](../frontend/src/css/tokens.css).
> Este documento explica o sistema; os valores valem como estão no arquivo.

## 1. Conceito

**Mesma identidade do portfólio.** As cores saem do design system publicado em
gcruz.dev.br; o layout é o de um chat comunitário (barra lateral, conversa,
pessoas):

- **carmim** (`#e11d48`) é a assinatura: ação principal, item atual, anel de
  foco — usado pouco e sempre no ponto de ação, como no portfólio;
- **índigo** é a segunda voz, pontual: selo "admin", avisos de administração,
  marcador do toast informativo. Nunca é a cor dominante;
- **slate** é a base: azul-marinho quase preto no escuro, cinza-azulado frio
  no claro, com superfícies em degraus e divisórias finas;
- estados: verde (sucesso e presença), âmbar (aviso e ausência), vermelho
  (erro e ações destrutivas, com tom e tratamento distintos do carmim);
- formas mantidas da v3: item atual com fundo tingido e traço interno; presença
  "ausente" como **anel vazado** (forma, não só cor); painel "você" como cartão
  encaixado; toasts como cápsulas com marcador de tom; cantos de 6/10/14px.
  Sem gradientes.

E o produto em si:

- **uma sala só**, então a barra lateral não finge ter servidores e canais: ela
  mostra a sala, atalhos reais, a conexão e você;
- **anonimato**: avatares são iniciais sobre uma cor derivada do id, sem foto;
- **efemeridade**: a entrada avisa que a conversa vive na memória do servidor.

Regras que valem para toda a interface:

1. **Nenhum botão decorativo.** Todo controle executa algo que já existe, quase
   sempre um comando do chat enviado pelo mesmo caminho do campo de mensagem.
   Permissão continua sendo verificada no servidor.
2. **Cor nunca é o único sinal.** Presença tem texto ("Ausente"), posse tem o
   selo "você", papel tem o selo "admin", estado de conexão tem rótulo.
3. **Contraste medido, não estimado.** `npm run check:contrast` mede 94 pares
   em dois temas (188 verificações) e roda no `npm run lint`.
4. **Movimento é decorativo.** Com `prefers-reduced-motion: reduce`, toda
   animação vira instantânea e nada se perde.

## 2. Tokens

Três camadas, sempre nesta direção: **primitivos → semânticos → componentes**.
Componentes só leem semânticos. O Stylelint proíbe hex, `rgb()`/`hsl()`,
`!important` e medidas soltas de espaço, raio ou fonte em `components/` e
`base/`.

### 2.1 Cor: semânticos

| Token                          | Escuro                                  | Claro                               | Uso                                           |
| ------------------------------ | --------------------------------------- | ----------------------------------- | --------------------------------------------- |
| `--color-bg-app`               | `#070d19` slate-950                     | `#f2f4f8` (fundo do portfólio)      | moldura, entrada, painel "você"               |
| `--color-bg-sidebar`           | `#0b1120` slate-920                     | `#f8fafc` slate-50                  | barra lateral, pessoas, cartão de pessoa      |
| `--color-bg-main`              | `#0f172a` slate-900                     | `#ffffff` slate-0                   | conversa, modal                               |
| `--color-bg-hover`             | `#151f2e` slate-850                     | `#eaeff5` slate-150                 | linha/item sob o ponteiro                     |
| `--color-bg-elevated`          | `#1e293b` slate-800                     | `#f1f5f9` slate-100                 | composer, cartões de resposta, sugestões      |
| `--color-bg-selected`          | `#243044` slate-750                     | `#e2e8f0` slate-200                 | item ativo, selo                              |
| `--color-bg-floating`          | `#070d19` slate-950                     | `#0f172a` slate-900                 | dica, toast (escuro nos dois temas)           |
| `--color-text-1 / 2 / 3`       | `#f8fafc` / `#cbd5e1` / `#94a3b8`       | `#0f172a` / `#334155` / `#475569`   | principal / secundário / metadados            |
| `--color-brand` (+ `-hover`)   | `#e11d48` (`#be123c`), texto branco     | `#e11d48` (`#be123c`), texto branco | botão principal                               |
| `--color-brand-text`           | `#fb7185` crimson-400                   | `#be123c` crimson-700               | carmim como texto e ícone                     |
| `--color-brand-soft`           | `#31182f` (carmim 16 %)                 | `#ffe4e6` crimson-100               | fundo tingido: item atual, botão ligado       |
| `--color-focus-ring`           | `#fb7185`                               | `#e11d48`                           | anel de foco (carmim, como no portfólio)      |
| `--color-accent-2` / `-soft`   | `#a5b4fc` / `#1e254e`                   | `#4f46e5` / `#e0e7ff`               | índigo: selo "admin", avisos de administração |
| `--color-border` / `-subtle`   | `#1a1f2d` / `#272e3f` (branco 6/10 %)   | `#e2e8f0` / `#e2e8f0`               | separador entre painéis / dentro de painel    |
| `--color-outline-control`      | `#8593a9` slate-450                     | `#64748b` slate-500                 | borda de controle                             |
| `--color-ok` / `-text`         | `#22c55e` / `#4ade80`                   | `#15803d` / `#166534`               | presença / texto de sucesso                   |
| `--color-warn` / `-text`       | `#f59e0b` / `#fbbf24`                   | `#b45309` / `#92400e`               | anel de ausência, anúncio                     |
| `--color-danger` (+ `-hover`)  | `#f87171` (`#fca5a5`), **texto escuro** | `#b91c1c` (`#991b1b`), texto branco | ação destrutiva                               |
| `--color-danger-text`          | `#f87171`                               | `#b91c1c`                           | texto de erro                                 |
| `--color-accent-2-on-floating` | `#818cf8`                               | `#818cf8`                           | marcador do toast informativo                 |
| `--color-danger-on-floating`   | `#f87171`                               | `#f87171`                           | marcador do toast de erro                     |
| `--color-sender-1..6`          | tons 300                                | tons 700                            | nome e avatar de cada pessoa                  |

**Ação principal × ação destrutiva.** Nunca a mesma combinação de fundo e
texto: no escuro, carmim com texto branco × salmão com texto escuro; no claro,
carmim × tijolo (`#b91c1c`, bem mais escuro). Toda ação destrutiva mantém o
rótulo explícito e a confirmação em modal.

**Onde a paleta se afasta do portfólio (só por contraste):** no escuro, o texto
de marca é crimson-400 (`#fb7185`), porque o crimson-500 do portfólio reprova
sobre os cartões; no claro, sucesso e aviso usam tons 700/800, porque os do
portfólio (`#22c55e`, `#f59e0b`) não chegam a 3:1 sobre branco; o vermelho
destrutivo do claro é `#b91c1c` para se separar do carmim.

### 2.2 Tipografia

Uma família, **Inter** (400–800, Google Fonts, já autorizada pela CSP), com
pilha de sistema de reserva. Hierarquia por tamanho e peso.

| Token        | Tamanho | Uso                                      |
| ------------ | ------- | ---------------------------------------- |
| `--text-2xs` | 11px    | selos, hora na calha                     |
| `--text-xs`  | 12px    | rótulos de seção (caixa alta), metadados |
| `--text-sm`  | 14px    | itens secundários, respostas de comando  |
| `--text-md`  | 16px    | corpo, mensagens, campos                 |
| `--text-lg`  | 18px    | nome no cartão                           |
| `--text-xl`  | 20px    | título do modal                          |
| `--text-2xl` | 24px    | título da entrada                        |
| `--text-3xl` | 32px    | boas-vindas da sala vazia                |

Pesos: `regular 400`, `medium 500`, `semibold 600`, `bold 700`, `display 800`.

### 2.3 Espaço, raio, sombra, camadas

- **Espaço:** grade de 4px, `--space-0` a `--space-16` (0 a 64px).
- **Raio:** `sm 6px` (selo, código, item de lista), `md 10px` (campo, botão),
  `lg 14px` (cartão, composer, popover, modal, toast), `full` (avatar, ponto,
  pílula).
- **Sombra:** tingidas por tema (herdadas da v3, inalteradas na v4):
  `--shadow-2` (sugestões, hover do botão principal), `--shadow-3` (cartão,
  modal, gaveta, toast). Painéis se separam por fio de 1px, não por sombra.
- **Foco:** anel `--focus-ring-width` + halo `--halo-width` tingido em campos e
  no composer; `--indicator-width` para o traço do item atual.
- **Camadas (`--z-*`):** `drawer 50` < `overlay 100` < `popover 200` <
  `toast 1000`.
- **Movimento:** `fast 100ms`, `base 160ms`, `slow 240ms`; curvas `standard`,
  `out`, `in`. Animações nomeadas em `base/motion.css`.

### 2.4 Layout

| Token                 | Valor                                                     |
| --------------------- | --------------------------------------------------------- |
| `--sidebar-width`     | 17rem (navegação; a pessoa pode arrastar a borda)         |
| `--members-width`     | 21rem (painel de contexto; também ajustável)              |
| `--layout-rail-width` | 4.5rem (navegação recolhida em trilho)                    |
| `--header-height`     | 3rem                                                      |
| `--nav-item-height`   | 2.25rem (2rem na densidade compacta)                      |
| `--menu-item-height`  | 2.25rem (2rem na densidade compacta)                      |
| `--gutter-message`    | 4.5rem (3.5rem na compacta) — calha do avatar             |
| `--message-gap-group` | `--space-4` (`--space-2` na compacta) — antes de um grupo |
| `--message-pad-y`     | `--space-0-5` (`--space-0` na compacta)                   |
| `--message-avatar`    | `--avatar-lg` (`--avatar-md` na compacta)                 |
| `--measure-message`   | 70ch                                                      |
| `--tap-min`           | 24px (mínimo de área de toque, WCAG 2.5.8)                |
| `--tap-comfort`       | 44px (cabeçalhos no toque e no celular)                   |

**Densidade** (`ui/density.js`): `:root[data-density="compact"]` troca só os
tokens acima. Tamanho de texto, contraste e o mínimo de 24px não mudam. A
escolha (Perfil › Preferências) fica no navegador, como o tema.

Pontos de quebra (usados como literais nas media queries): `30rem` (celular
estreito), `48rem` (celular × tablet) e `80rem` (painel de contexto encaixado).

## 3. Layout e responsividade

```
≥ 80rem    [ navegação | conversa | contexto ]   o contexto pode ser fechado
48–80rem   [ trilho | conversa ]  + folha de contexto à direita
           (o trilho pode ser expandido para a navegação inteira)
< 48rem    pilha de telas: lista → conversa → dados, cada uma na tela toda
```

`ui/layout.js` decide o que está aberto pelo atributo `hidden`; o CSS decide
onde cada painel mora.

- **Folhas e gavetas:** com uma delas aberta, o fundo escurece e todo o resto
  fica `inert`. O foco entra nela e circula dentro dela. `Escape` ou um toque no
  fundo fecham, e o foco volta para quem abriu.
- **Celular:** cada tela ganha uma entrada no histórico do navegador, sem mudar
  o endereço. O "voltar" do Android desce um nível. Voltar da lista pergunta
  "Sair do chat?", com o foco em "Ficar no chat".
- **Saída da página:** fechar, recarregar ou sair do site no meio do chat passa
  pela confirmação do navegador (`beforeunload`).
- **Larguras verificadas no E2E:** sem rolagem horizontal em 320, 375 e 430px
  (`01-salas`, `07-celular`, `13-pilha`). O computador é testado a 1280 e 1440px.

## 4. Componentes

| Componente                                | CSS                       | JS                                   | Observações                                                                                                                                             |
| ----------------------------------------- | ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botão `.c-button`                         | `button.css`              | —                                    | `--primary`, `--secondary`, `--danger`, `--ghost`, `--sm`, `--block`                                                                                    |
| Botão de ícone `.c-icon-button`           | `button.css`              | —                                    | nome em `aria-label`; dica em `data-tooltip`                                                                                                            |
| Ícone                                     | `icon.css`                | `ui/icons.js`                        | SVG por `createElementNS`, `aria-hidden`                                                                                                                |
| Campo `.c-field`                          | `field.css`               | `ui/entry.js`                        | rótulo, ajuda, erro com `aria-invalid`                                                                                                                  |
| Marca `.c-brand`                          | `brand.css`               | —                                    |                                                                                                                                                         |
| Barra lateral `.c-sidebar`                | `sidebar.css`, `nav.css`  | `ui/nav/sidebarNav.js`               | Início, Comandos, Fixadas, Salas, Privadas, Perfil no pé; setas, arrastar, Ctrl+Shift+↑/↓; selo de não lidas e "@N" de menções                          |
| Ir para conversa (Ctrl K)                 | `nav.css`                 | `ui/nav/quickSwitcher.js`            | combobox; só as suas conversas e o `@` exato                                                                                                            |
| Nova conversa (+)                         | `pages.css`               | `ui/nav/newConversation.js`          | popover com abas: criar sala, entrar com código, conversa privada                                                                                       |
| Painel "você" `.c-user-panel`             | `sidebar.css`             | `ui/userPanel.js`                    | ausência = `/afk`; notificações; menu rápido; abre o Perfil                                                                                             |
| Páginas Comandos e Perfil `.c-page`       | `pages.css`               | `ui/pages/*.js`                      | catálogo do servidor; nome, ausência, tema, densidade, notificações, sair                                                                               |
| Cabeçalho `.c-header`                     | `header.css`              | `ui/roomHeader.js`                   | Voltar (celular) ou ☰, conversa, descrição, convite, mais opções, contexto                                                                             |
| Menu `.c-menu`                            | `menu.css`                | `ui/primitives/menu.js`              | padrão APG: setas, submenu, busca por letra; folha inferior em < 48rem                                                                                  |
| Menu de contexto                          | `menu.css`                | `ui/primitives/contextMenu.js`       | clique direito, Shift+F10, tecla Menu, toque longo (500 ms)                                                                                             |
| Posicionamento                            | —                         | `ui/primitives/position.js`          | `@floating-ui/dom` (MIT, versão fixa)                                                                                                                   |
| Estado `.c-connection` / `.c-status-pill` | `connection.css`          | `ui/connection.js`                   | texto + ponto; pílula some quando conectado                                                                                                             |
| Identidade `.c-identity`                  | `avatar.css`              | `ui/identity.js`                     | avatar, nome, ponto de presença, selo `.c-badge`                                                                                                        |
| Mensagem `.c-message`                     | `message.css`             | `ui/message.js`                      | Markdown (nós DOM), menção, citação da resposta, (editada), reações, fixada, entrega                                                                    |
| Lista `.c-message-list`                   | `message-list.css`        | `ui/messageList.js`                  | `div[role=log]` com `ol`; agrupa (mesmo autor, mesmo dia, < 7 min); separador de dia; "Novas mensagens"; voltar ao fim; presa ao fim quando a área muda |
| Composer                                  | `composer.css`            | `ui/composer.js`                     | `<textarea>` que cresce; barra de formatação; resposta; contador; aviso de silêncio                                                                     |
| Sugestões                                 | `command-suggestions.css` | `ui/commandSuggestions.js`           | combobox ARIA: comandos e `@pessoa`                                                                                                                     |
| Digitando                                 | `typing.css`              | `ui/typing.js`                       | altura reservada (o composer não pula)                                                                                                                  |
| Painel de contexto `.c-members`           | `members.css`             | `ui/contextPanel.js`, `ui/people.js` | informações, descrição, fixadas, integrantes com filtro, ações                                                                                          |
| Cartão de pessoa                          | `member-card.css`         | `ui/memberCard.js`                   | popover (floating-ui); folha na base em < 48rem                                                                                                         |
| Modal `.c-dialog`                         | `dialog.css`              | `ui/dialog.js`                       | `<dialog>` nativo; foco começa no botão de cancelar                                                                                                     |
| Dica `.c-tooltip`                         | `tooltip.css`             | `ui/tooltip.js`                      | hover/foco; `Escape` dispensa (1.4.13)                                                                                                                  |
| Toast `.c-toast`                          | `toast.css`               | `ui/toast.js`                        | `role=status`; avisos de menção; visual-only quando o fato já foi anunciado                                                                             |
| Esqueleto `.c-skeleton`                   | `conversation.css`        | `main.js`                            | primeira conexão sem mensagens                                                                                                                          |
| Vazio `.c-empty`                          | `empty.css`               | `ui/empty.js`                        | "Boas-vindas à #sala-aberta!"                                                                                                                           |
| Falha `.c-failure`                        | `failure.css`             | `ui/failure.js`                      | queda definitiva ou remoção                                                                                                                             |

### 4.1 O que cada controle faz (sem botão de enfeite)

| Controle                                          | Ação real                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Comandos (navegação)                              | página com o catálogo do servidor                                                 |
| Limpar minha tela                                 | `/clear` (local)                                                                  |
| Apagar histórico para todos (quem modera)         | confirmação → `/clearall confirmar`                                               |
| Ausente (painel "você" e Perfil)                  | `/afk` (alterna; motivo opcional)                                                 |
| Tema e densidade                                  | troca na hora; guardados em `localStorage`                                        |
| Pessoa no painel                                  | abre o cartão com dados de `user_list`                                            |
| Ver perfil completo                               | `/profile @username`                                                              |
| Copiar `@`                                        | área de transferência                                                             |
| Silenciar ▸ 5 min / 10 min / 1 hora / Até liberar | `/mute @username 5` · `10` · `60` · sem número; Liberar = `/unmute`               |
| Remover da sala (quem modera)                     | confirmação → `/kick @username`                                                   |
| Responder / Editar / Apagar / Reagir / Fixar      | `replyTo` · `message_edit` · `message_delete` · `reaction_toggle` · `message_pin` |
| Descrição da sala (quem modera)                   | `room_update`                                                                     |

Ações de moderação só aparecem para quem a lista do servidor marca como admin.
É conveniência de interface: o servidor recusa o comando de quem não é.

## 5. Acessibilidade (WCAG 2.2 AA)

- Contraste: 188/188 verificações (94 pares × 2 temas) (`npm run check:contrast`); casos fora do arquivo de
  pares (anúncio com fundo tingido) medidos à parte e documentados no CSS.
- axe-core 4.10: 0 violações em 16 telas e estados (entrada, erro, sala vazia,
  sala com mensagens, sugestões, cartão, modal, gaveta no celular; dois temas).
- Foco: anel único `--color-focus-ring` (≥ 3:1 em todas as superfícies); skip
  link é o primeiro Tab; foco gerenciado em troca de tela, gavetas, cartão e
  modal.
- Alvos: mínimo 24px (2.5.8); 44px em ponteiro grosso.
- Leitores de tela: conversa em `role="log"`; mensagens agrupadas mantêm o nome
  em texto oculto; respostas de comando têm "Só você vê isto"; toasts em
  `role="status"`, sem anunciar duas vezes o mesmo fato.

## 6. Como adicionar uma cor

1. Primitivo em `tokens.css` (camada 1, prefixo `--_`).
2. Semântico nos **dois** temas (camadas 2 e 3).
3. Pares em `scripts/contrast.pairs.json` contra toda superfície onde a cor
   aparece (4.5 para texto, 3 para ícone, borda de controle e ponto).
4. `npm run lint` precisa passar.
