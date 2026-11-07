# Design system · web-chat (v2)

> Versão 2, da Fase 5 (redesign de UI/UX). A versão anterior, com a identidade
> "fio da sessão", está arquivada em
> [`docs/historico/design-system-v1.md`](./historico/design-system-v1.md).
>
> Fonte da verdade: [`frontend/src/css/tokens.css`](../frontend/src/css/tokens.css).
> Este documento explica o sistema; os valores valem como estão no arquivo.

## 1. Conceito

Um chat em grupo de **painéis escuros**, na família visual dos aplicativos de
comunidade (barra lateral, conversa, lista de pessoas), mas com identidade
própria:

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
3. **Contraste medido, não estimado.** `npm run check:contrast` mede 71 pares
   em dois temas (142 verificações) e roda no `npm run lint`.
4. **Movimento é decorativo.** Com `prefers-reduced-motion: reduce`, toda
   animação vira instantânea e nada se perde.

## 2. Tokens

Três camadas, sempre nesta direção: **primitivos → semânticos → componentes**.
Componentes só leem semânticos. O Stylelint proíbe hex, `rgb()`/`hsl()`,
`!important` e medidas soltas de espaço, raio ou fonte em `components/` e
`base/`.

### 2.1 Cor: semânticos

| Token                      | Escuro (padrão)                   | Claro                 | Uso                                      |
| -------------------------- | --------------------------------- | --------------------- | ---------------------------------------- |
| `--color-bg-app`           | `#1e1f22`                         | mist-150              | moldura, entrada, painel "você"          |
| `--color-bg-sidebar`       | `#2b2d31`                         | mist-50               | barra lateral, pessoas, cartões          |
| `--color-bg-main`          | `#313338`                         | `#fff`                | conversa, modal                          |
| `--color-bg-elevated`      | `#383a40`                         | mist-100              | composer, cartões de resposta, esqueleto |
| `--color-bg-hover`         | graphite-650                      | mist-100              | linha/item sob o ponteiro                |
| `--color-bg-selected`      | graphite-600                      | mist-200              | item ativo, selo                         |
| `--color-bg-floating`      | graphite-950                      | graphite-850          | dica, toast (escuro nos dois temas)      |
| `--color-text-1/2/3`       | `#f2f3f5` / `#b5bac1` / `#a3a9b3` | mist-950/700/600      | principal / secundário / metadados       |
| `--color-brand`            | `#5865f2`                         | `#5865f2`             | **preenchimento** (botão primário)       |
| `--color-brand-text`       | indigo-350                        | indigo-600            | marca usada **como texto**               |
| `--color-ok` / `-text`     | `#23a559` / green-400             | green-600 / green-800 | presença (ponto) / texto de sucesso      |
| `--color-warn` / `-text`   | `#f0b232`                         | amber-800             | ausência, anúncio                        |
| `--color-danger` / `-text` | `#da373c` / red-300               | `#da373c` / red-700   | ação destrutiva / texto de erro          |
| `--color-sender-1..6`      | tons 300                          | tons 700              | nome e avatar de cada pessoa             |

Por que existem pares "preenchimento / texto": as cores de referência do
`#5865f2` (2.74:1), do vermelho (3.35:1) e do verde (3.97:1) **reprovam como
texto** sobre `#313338`. Elas ficam como preenchimento (texto branco por cima,
medido) e ponto de status (3:1), e cada uma ganhou um token de texto próprio
que passa 4.5:1.

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
- **Raio:** `sm 4px` (selo, código, item de lista), `md 8px` (campo, botão),
  `lg 12px` (cartão, popover, modal), `full` (avatar, ponto, pílula).
- **Sombra:** `--shadow-1` (cabeçalhos), `--shadow-2` (sugestões, dica),
  `--shadow-3` (cartão, modal, gaveta, toast).
- **Camadas (`--z-*`):** `drawer 50` < `overlay 100` < `popover 200` <
  `toast 1000`.
- **Movimento:** `fast 100ms`, `base 160ms`, `slow 240ms`; curvas `standard`,
  `out`, `in`. Animações nomeadas em `base/motion.css`.

### 2.4 Layout

| Token               | Valor                    |
| ------------------- | ------------------------ |
| `--sidebar-width`   | 15rem                    |
| `--members-width`   | 15rem                    |
| `--header-height`   | 3rem                     |
| `--gutter-message`  | 4.5rem (calha do avatar) |
| `--measure-message` | 70ch                     |

Pontos de quebra (usados como literais nas media queries): `30rem` (celular),
`48rem` (tablet), `64rem` (notebook).

## 3. Layout e responsividade

```
≥ 64rem   [ barra lateral | conversa | pessoas ]   pessoas pode ser fechado
48–64rem  [ barra lateral | conversa ]  + gaveta de pessoas à direita
< 48rem   [ conversa ]  + gaveta da barra (☰) à esquerda e de pessoas à direita
```

`ui/layout.js` decide o que está aberto pelo atributo `hidden`; o CSS decide
onde cada painel mora. Com gaveta aberta: fundo escurecido, todo o resto
`inert`, foco entra na gaveta, `Escape` ou toque no fundo fecham e o foco volta
para quem abriu. Sem rolagem horizontal em 360, 390, 900 e 1280px
(verificado no E2E).

## 4. Componentes

| Componente                                | CSS                       | JS                         | Observações                                                                     |
| ----------------------------------------- | ------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| Botão `.c-button`                         | `button.css`              | —                          | `--primary`, `--secondary`, `--danger`, `--ghost`, `--sm`, `--block`            |
| Botão de ícone `.c-icon-button`           | `button.css`              | —                          | nome em `aria-label`; dica em `data-tooltip`                                    |
| Ícone                                     | `icon.css`                | `ui/icons.js`              | SVG por `createElementNS`, `aria-hidden`                                        |
| Campo `.c-field`                          | `field.css`               | `ui/entry.js`              | rótulo, ajuda, erro com `aria-invalid`                                          |
| Marca `.c-brand`                          | `brand.css`               | —                          |                                                                                 |
| Barra lateral `.c-sidebar`                | `sidebar.css`             | `main.js` (atalhos)        | sala, atalhos, administração (só admin), conexão                                |
| Painel "você" `.c-user-panel`             | `sidebar.css`             | `ui/userPanel.js`          | ausência = `/afk`; tema                                                         |
| Cabeçalho `.c-header`                     | `header.css`              | `ui/layout.js`             | ☰, sala, tópico, pílula de estado, ajuda, pessoas                              |
| Estado `.c-connection` / `.c-status-pill` | `connection.css`          | `ui/connection.js`         | texto + ponto; pílula some quando conectado                                     |
| Identidade `.c-identity`                  | `avatar.css`              | `ui/identity.js`           | avatar, nome, ponto de presença, selo `.c-badge`                                |
| Mensagem `.c-message`                     | `message.css`             | `ui/message.js`            | agrupada (`--compact`), sistema, aviso privado, ação, anúncio, spoiler, entrega |
| Lista `.c-message-list`                   | `message-list.css`        | `ui/messageList.js`        | `div[role=log]` com `ol` dentro; agrupa por 5 min                               |
| Composer                                  | `composer.css`            | `ui/composer.js`           | aviso de fila, sugestões, envio por ícone                                       |
| Sugestões                                 | `command-suggestions.css` | `ui/commandSuggestions.js` | combobox ARIA                                                                   |
| Digitando                                 | `typing.css`              | `ui/typing.js`             | altura reservada (o composer não pula)                                          |
| Pessoas `.c-members`                      | `members.css`             | `ui/people.js`             | grupos Administradores / Online / Ausentes                                      |
| Cartão de pessoa                          | `member-card.css`         | `ui/memberCard.js`         | popover; folha na base em < 48rem                                               |
| Modal `.c-dialog`                         | `dialog.css`              | `ui/dialog.js`             | `<dialog>` nativo; foco começa em Cancelar                                      |
| Dica `.c-tooltip`                         | `tooltip.css`             | `ui/tooltip.js`            | hover/foco; `Escape` dispensa (1.4.13)                                          |
| Toast `.c-toast`                          | `toast.css`               | `ui/toast.js`              | `role=status`; visual-only quando o fato já foi anunciado                       |
| Esqueleto `.c-skeleton`                   | `conversation.css`        | `main.js`                  | primeira conexão sem mensagens                                                  |
| Vazio `.c-empty`                          | `empty.css`               | `ui/empty.js`              | "Boas-vindas à #sala-aberta!"                                                   |
| Falha `.c-failure`                        | `failure.css`             | `ui/failure.js`            | queda definitiva ou remoção                                                     |

### 4.1 O que cada controle faz (sem botão de enfeite)

| Controle                                         | Ação real                               |
| ------------------------------------------------ | --------------------------------------- |
| Comandos (barra e cabeçalho)                     | `/help` (local)                         |
| Limpar minha tela                                | `/clear` (local)                        |
| Apagar para todos (só admin)                     | confirmação → `/clearall confirmar`     |
| Relógio no painel "você"                         | `/afk` (alterna)                        |
| Sol/lua                                          | troca de tema (salvo em `localStorage`) |
| Pessoa no painel                                 | abre o cartão com dados de `user_list`  |
| Ver perfil completo                              | `/profile <id>`                         |
| Copiar id                                        | área de transferência                   |
| Ficar ausente / Trocar meu nome (próprio cartão) | `/afk` / preenche `/nick `              |
| Silenciar / Liberar (admin)                      | `/mute <id> 10` / `/unmute <id>`        |
| Remover da sala (admin)                          | confirmação → `/kick <id>`              |

Ações de moderação só aparecem para quem a lista do servidor marca como admin.
É conveniência de interface: o servidor recusa o comando de quem não é.

## 5. Acessibilidade (WCAG 2.2 AA)

- Contraste: 142/142 pares (`npm run check:contrast`); casos fora do arquivo de
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
