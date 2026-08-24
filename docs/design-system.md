# Design system · web-chat

> **Estado:** proposta do Portão 1. Nada aqui foi codado ainda — este documento é o
> contrato que a Etapa 2 executa.
> **Todo ratio nesta página foi medido**, não estimado, por `scripts/check-contrast.mjs`
> (Anexo A da especificação) rodando sobre o `tokens.css` da §2. Saída completa em §6.

---

## 1. Plano de design

### 1.1 Conceito

> **Uma transcrição viva presa a um único fio.**
> A sala não é um app de mensagens com balões; é uma transcrição que ninguém guarda,
> pendurada num fio vertical que mostra, o tempo todo, se a sessão ainda está de pé.

Três consequências diretas, e cada uma é uma decisão contra o default:

1. **Uma superfície, não três.** O sistema atual empilha `#0f0f23`, `#1a1a2e` e `#16213e`
   separados por 1.07:1 — uma superfície fingindo ser três. Escolhi hierarquia por
   **espaço e tipografia**: a página inteira é `--color-surface-1`. A segunda superfície
   existe só onde a elevação é real (poço de campo, chip de pessoa, toast) e guarda
   **1.27:1** no escuro / **1.24:1** no claro — degrau que se enxerga.
2. **O cromo recua.** Cabeçalho, lista de pessoas e composer são texto e traço sobre a
   mesma superfície, sem cartão, sem borda translúcida, sem sombra. Só a mensagem tem
   peso tipográfico.
3. **Sem balão e sem alinhamento à direita.** Detalhado e defendido na §5.

### 1.2 Paleta

Quatro famílias, cinco hexes-semente. A escala primitiva completa (com os degraus
intermediários) está na §2.

| Hex       | Nome        | Papel declarado                                                   | Superfície onde vive        | Ratio medido                                                   |
| --------- | ----------- | ----------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `#0a1114` | `ink-950`   | Superfície base do tema escuro                                    | — (é a superfície)          | degrau para `ink-800`: **1.27:1**                              |
| `#f7f9fa` | `ink-50`    | Superfície base do tema claro                                     | — (é a superfície)          | degrau para `ink-200`: **1.24:1**                              |
| `#e9a83f` | `amber-400` | **Marca (escuro)**: preenchimento, anel de foco, fio reconectando | sobre `#0a1114` e `#182930` | **9.19:1** / s1 · **7.25:1** / s2 — 1.4.11 (≥3) e 1.4.3 (≥4.5) |
| `#8a5104` | `amber-700` | **Marca (claro)**: preenchimento, anel de foco                    | sobre `#f7f9fa` e `#d9e3e6` | **6.10:1** / s1 · **4.93:1** / s2                              |
| `#45be97` | `jade-300`  | Sessão viva (escuro) — ponto e rótulo "conectado"                 | sobre `#0a1114`             | **8.22:1** — passa 1.4.3 e 1.4.11                              |
| `#0d5c40` | `jade-700`  | Sessão viva (claro)                                               | sobre `#f7f9fa`             | **7.58:1**                                                     |
| `#f2786a` | `coral-300` | Sessão perdida / erro (escuro)                                    | sobre `#0a1114` e `#182930` | **6.95:1** / s1 · **5.48:1** / s2                              |
| `#b23325` | `coral-600` | Sessão perdida / erro (claro)                                     | sobre `#f7f9fa` e `#d9e3e6` | **5.86:1** / s1 · **4.74:1** / s2                              |

**Duas decisões de paleta que carregam o argumento:**

- **A marca é âmbar, e inverte de papel entre os temas.** No escuro é âmbar claro com
  texto tinta (`#0a1114` sobre `#e9a83f` = **9.19:1**); no claro é ocre profundo com
  texto papel (`#f7f9fa` sobre `#8a5104` = **6.10:1**). É exatamente a dupla restrição do
  T3: uma cor só não consegue ser preenchimento (≥3:1 vs superfície) **e** suporte de
  texto (≥4.5:1) nos dois temas — resolvi trocando a _lightness_ e mantendo a família,
  não empilhando exceções. Comparação: `#6366f1` com branco dá **4.47:1** e reprova.
- **Âmbar é a única cor quente do sistema, e não é status.** "Reconectando" usa o âmbar
  da marca em vez de um amarelo de aviso separado: reconectar _é_ o momento em que o
  produto pede atenção. Isso apaga um token inteiro (`--warning`) sem perder informação.

**Remetentes** (T9) — seis matizes tokenizados, nenhum deles âmbar (para "você" nunca
competir com "outra pessoa"). Todo membro medido nas duas superfícies de cada tema:

| Token              | Escuro    |  / s1 | / s2 | Claro     | / s1 | / s2 |
| ------------------ | --------- | ----: | ---: | --------- | ---: | ---: |
| `--color-sender-1` | `#7fb6e8` |  8.85 | 6.98 | `#175597` | 7.15 | 5.78 |
| `--color-sender-2` | `#59c9a5` |  9.36 | 7.38 | `#0d5c40` | 7.58 | 6.13 |
| `--color-sender-3` | `#b49bf0` |  8.06 | 6.35 | `#5e3fb8` | 6.91 | 5.59 |
| `--color-sender-4` | `#f193b8` |  8.71 | 6.87 | `#932b59` | 7.28 | 5.89 |
| `--color-sender-5` | `#8ed36e` | 10.60 | 8.36 | `#3d6b1f` | 5.99 | 4.84 |
| `--color-sender-6` | `#6fcbd4` | 10.12 | 7.99 | `#11565e` | 7.90 | 6.39 |

Comparação com o que existe hoje: `mediumpurple` sobre `--surface-light` = **4.22:1**
(reprova) e `darkgoldenrod` = **4.88:1** (raspa), ambos aplicados por `element.style.color`
fora de qualquer token.

**Proibido nesta paleta:** a paleta Tailwind default (`#6366f1`, `#10b981`, `#ef4444`,
`#f59e0b`) e o gradiente clipado em texto. Nenhum dos dois sobrevive à §4.

### 1.3 Tipografia

Duas famílias, funções que não se sobrepõem.

| Função      | Família                 | Pesos    | Por que esta                                                                                                                                                                                                                                                              |
| ----------- | ----------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Display** | `Syne`                  | 700, 800 | Grotesca de largura incomum e junções angulosas — tem personalidade sem ser a serifa editorial nem o grotesco neutro de template. Usada em **quatro lugares e só**: wordmark do cabeçalho, título da tela de entrada, título do estado vazio, título da falha de conexão. |
| **Texto**   | `Atkinson Hyperlegible` | 400, 700 | Desenhada para legibilidade: `l/1/I` e `0/O` são inconfundíveis. Numa sala anônima em que o nome do remetente é a única identidade, letras ambíguas são um problema funcional, não estético. Legível em blocos curtos e sequenciais — que é o que uma conversa é.         |

> **Restrição honesta:** `Atkinson Hyperlegible` publica **só 400 e 700**. A escala abaixo
> não usa 500 nem 600 em lugar nenhum — ênfase vem de tamanho, cor e tracking, não de
> pesos que a fonte não tem. Isso é limite da escolha, e está declarado em vez de
> escondido atrás de um `font-weight: 600` que o navegador sintetizaria.

**Escala** (todos os valores viram token na §2):

| Token        |          Tamanho |        Peso |  Tracking | Leading | Uso                                                         |
| ------------ | ---------------: | ----------: | --------: | ------: | ----------------------------------------------------------- |
| `--text-3xl` |    2.5rem / 40px | 700 display | `-0.02em` |     1.1 | Título da tela de entrada — a assinatura tipográfica        |
| `--text-2xl` |   1.75rem / 28px | 700 display | `-0.02em` |     1.1 | Título de estado vazio e de falha definitiva                |
| `--text-xl`  |  1.375rem / 22px | 700 display | `-0.02em` |     1.3 | Wordmark no cabeçalho da sala                               |
| `--text-lg`  |  1.125rem / 18px |   400 texto |         0 |    1.55 | Subtítulo de entrada, corpo do estado vazio                 |
| `--text-md`  |      1rem / 16px |   400 texto |         0 |    1.55 | **Corpo da mensagem** — o conteúdo do produto               |
| `--text-sm`  |  0.875rem / 14px |   700 texto |         0 |     1.3 | Nome do remetente, rótulos, botões                          |
| `--text-xs`  |   0.75rem / 12px |   400 texto |  `0.06em` |     1.3 | Estado da conexão, contagem de pessoas, mensagem de sistema |
| `--text-2xs` | 0.6875rem / 11px |   400 texto |  `0.06em` |     1.3 | Carimbo de hora                                             |

**Carregamento** — `preconnect` + `link`, nunca `@import` em CSS (hoje o `@import` na
linha 1 do `style.css` encadeia CSS → CSS de fonte → arquivo de fonte e bloqueia a
primeira pintura):

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Syne:wght@700;800&display=swap"
/>
```

O `* { font-family: Inter }` do reset universal morre; a família cai em `body` e o display
é aplicado por classe, nos quatro lugares listados.

**Alinhamento de horas:** nenhuma das duas famílias garante algarismo tabular, então a
coluna do carimbo tem largura fixa no layout. O alinhamento vem do grid, não da fonte —
declarado aqui para ninguém "consertar" depois com `font-variant-numeric` e achar que
resolveu.

### 1.4 Layout — cinco telas

Coluna única, `max-width: var(--layout-max)` (56rem), centrada. À esquerda, um trilho de
`3rem` que carrega **o fio** e os monogramas. Altura vem de `grid` (`header` / `main` /
`footer` em `min-content 1fr min-content`) sobre `100dvh` — **uma** unidade de viewport no
projeto inteiro. O `calc(100vh - 140px)` e o par `100dvh`/`100vh` desalinhado morrem.

**(a) Entrada**

```
┌────────────────────────────────────────────────────────┐
│                                                        │
│                                                        │
│            Sala aberta.                    ← Syne 700, 40px
│            Ninguém sabe quem você é.       ← Atkinson 400, 18px
│                                                        │
│            Como quer ser chamado           ← <label> VISÍVEL
│            ┌──────────────────────────┐                │
│            │ ▏                        │    ← poço surface-2, contorno 4.04:1
│            └──────────────────────────┘                │
│            ┌──────────────────────────┐                │
│            │        Entrar            │    ← preenchimento âmbar, texto tinta 9.19:1
│            └──────────────────────────┘                │
│                                                        │
│            A conversa some quando você sai.            │
│                                          ☾  ← alternador de tema
└────────────────────────────────────────────────────────┘
```

**(b) Sala com histórico**

```
┌────────────────────────────────────────────────────────┐
│ web-chat                    ● conectado   ·  4 pessoas │ ← header, sem cartão
├────────────────────────────────────────────────────────┤
│  ┃                                                     │
│ (MR)  Marina                                    14:02  │ ← monograma vazado + nome tokenizado
│  ┃    Alguém sabe se o deploy subiu?                   │ ← --text-md, medida 62ch
│  ┃                                                     │
│ (VC)  Você                                      14:03  │ ← monograma PREENCHIDO + rótulo "Você"
│  ┣━   Subiu agora. Está verde.                         │ ← traço de 2px âmbar: reforço não cromático
│  ┃                                                     │
│  ┃          Marina saiu da sala · 14:05                │ ← mensagem de sistema, centrada, --text-xs
│  ┃                                                     │
│  ┃    Marina está digitando…                           │ ← indicador vive NO fio, não numa barra
├────────────────────────────────────────────────────────┤
│ Mensagem                                               │ ← <label> sr-only
│ ┌────────────────────────────────────────┐  ┌────────┐ │
│ │ ▏                                      │  │ Enviar │ │ ← nome acessível textual, não só ícone
│ └────────────────────────────────────────┘  └────────┘ │
└────────────────────────────────────────────────────────┘
     ↑ o fio (┃) é contínuo do topo ao rodapé da lista
```

**(c) Sala vazia** — o fio existe, mas ainda não segura nada:

```
┌────────────────────────────────────────────────────────┐
│ web-chat                    ● conectado   ·  1 pessoa  │
├────────────────────────────────────────────────────────┤
│  ┃                                                     │
│  ┃                                                     │
│  ╿          Silêncio por enquanto.        ← Syne 700, 28px
│             Você é a primeira pessoa aqui.             │
│             Escreva a primeira linha.     ← convite à ação, sem desculpa
│                                                        │
│                                                        │
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐  ┌────────┐ │
│ │ ▏                                      │  │ Enviar │ │ ← foco chega aqui automaticamente
│ └────────────────────────────────────────┘  └────────┘ │
└────────────────────────────────────────────────────────┘
     ↑ o fio nasce no topo e termina num cap (╿): ninguém pendurado nele ainda
```

**(d) Reconectando** — o histórico continua legível; o fio muda de cor e vira tracejado:

```
┌────────────────────────────────────────────────────────┐
│ web-chat              ◐ reconectando…    ·  — pessoas  │ ← contagem vira "—", não mente "4"
├────────────────────────────────────────────────────────┤
│  ╏                                                     │ ← fio âmbar TRACEJADO (9.19:1)
│ (MR)  Marina                                    14:02  │
│  ╏    Alguém sabe se o deploy subiu?                   │
│  ╏                                                     │
│ (VC)  Você                                      14:03  │
│  ╏    Subiu agora. Está verde.                         │
│  ╏                                                     │
├────────────────────────────────────────────────────────┤
│ Tentando reconectar (3ª tentativa)…       ← role="status", anunciado UMA vez
│ ┌────────────────────────────────────────┐  ┌────────┐ │
│ │ ▏ Mensagem fica na fila                │  │ Enviar │ │ ← campo ATIVO; envio enfileirado
│ └────────────────────────────────────────┘  └────────┘ │
└────────────────────────────────────────────────────────┘
```

**(e) Falha definitiva de conexão** — o teto de backoff estourou; o fio foi cortado:

```
┌────────────────────────────────────────────────────────┐
│ web-chat                  ✕ sem conexão   ·  — pessoas │
├────────────────────────────────────────────────────────┤
│  ╏                                                     │
│ (MR)  Marina                                    14:02  │ ← histórico permanece legível
│  ╏    Alguém sabe se o deploy subiu?                   │
│  ╿                                                     │ ← o fio termina aqui: coral, cap visível
│                                                        │
│        A conexão caiu.                    ← Syne 700, 28px
│        Tentamos 6 vezes e paramos.        ← diz o que aconteceu
│        ┌──────────────────────┐                        │
│        │  Tentar de novo      │           ← caminho manual, alcançável por teclado
│        └──────────────────────┘                        │
├────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────┐  ┌────────┐ │
│ │ ▏                                      │  │ Enviar │ │ ← desabilitados, com aria-disabled
│ └────────────────────────────────────────┘  └────────┘ │
└────────────────────────────────────────────────────────┘
```

**Comportamento em 320px**

| O que              | Como                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Trilho do fio      | `3rem` → `1.5rem`, por `--rail-width`. O fio **não some** — é a assinatura e o indicador de estado.                                  |
| Monograma          | 32px → 28px, mas o alvo clicável do chip de pessoa continua ≥44px sob `pointer: coarse`.                                             |
| Cabeçalho          | Empilha em duas linhas: wordmark + estado; contagem de pessoas vira só o número + rótulo curto.                                      |
| Lista de pessoas   | Vira faixa horizontal com rolagem própria (`overflow-x`), presa dentro do container — **o body nunca rola na horizontal**.           |
| Medida da mensagem | `62ch` → `100%`; a mensagem ocupa a coluna inteira. Como nada é balão, não há `max-width: 70%` para brigar.                          |
| Carimbo de hora    | Sai da linha do nome e vira sufixo do nome, ainda em coluna de largura fixa.                                                         |
| Composer           | Campo e botão continuam lado a lado, botão com rótulo textual "Enviar" abreviado para ícone **com `aria-label`** só abaixo de 360px. |
| Zoom 200%          | Como o layout é grid + `ch` + `rem`, 200% equivale a ~640px de largura efetiva: mesma regra da coluna única, sem overflow.           |

### 1.5 Assinatura

**O fio da sessão.**

Um traço vertical de 2px que corre a altura inteira da lista de mensagens, no limite
direito do trilho. Todo monograma se pendura nele. Ele não é decoração: **é o indicador
de estado da conexão**, e é a única coisa pela qual esta interface vai ser lembrada.

| Estado       | Traço                                                                     | Token                  | Ratio vs superfície                      |
| ------------ | ------------------------------------------------------------------------- | ---------------------- | ---------------------------------------- |
| conectando   | contínuo, `--color-text-2`                                                | —                      | 8.82:1 (escuro)                          |
| conectado    | contínuo, discreto                                                        | `--color-thread-live`  | **4.04:1** (escuro) · **4.55:1** (claro) |
| reconectando | tracejado, âmbar                                                          | `--color-thread-retry` | **9.19:1** · **6.10:1**                  |
| offline      | tracejado coral, **terminando num cap visível** abaixo da última mensagem | `--color-thread-lost`  | **6.95:1** · **5.86:1**                  |

**Por que pertence a _este_ produto e não a qualquer chat:** este é um chat de **sala
única, efêmera e anônima**. Não há canais para navegar, nem histórico para procurar, nem
perfil para visitar. A única coisa que o produto realmente tem de estado é _"a linha está
viva?"_ — e a resposta some no instante em que a aba fecha. O fio dá forma exatamente a
isso: um objeto contínuo que existe enquanto a sessão existe, muda quando ela vacila, e é
literalmente cortado quando ela morre. Num chat com salas, papéis e persistência, o fio
seria enfeite. Aqui ele é o produto.

Ousadia gasta num lugar só: o fio. O resto — cabeçalho, composer, chips — é traço fino,
texto e espaço.

**Sob `prefers-reduced-motion: reduce`:** o tracejado de "reconectando" não caminha; fica
estático. O estado continua legível por cor **e** por padrão de traço **e** por texto —
três canais, nenhum dependendo de movimento.

### 1.6 Copy (pt-BR, centralizada em `src/i18n/strings.js`)

Voz ativa, frase-caso, sem desculpa, sem emoji no cromo. Todo texto de interface vem
deste módulo — nenhuma string solta no DOM ou no JS.

| Chave                 | Texto                                                    |
| --------------------- | -------------------------------------------------------- |
| `entry.title`         | Sala aberta.                                             |
| `entry.subtitle`      | Ninguém sabe quem você é.                                |
| `entry.nameLabel`     | Como quer ser chamado                                    |
| `entry.submit`        | Entrar                                                   |
| `entry.ephemeralNote` | A conversa some quando você sai.                         |
| `entry.nameRequired`  | Escreva um nome para entrar.                             |
| `room.composerLabel`  | Mensagem                                                 |
| `room.send`           | Enviar                                                   |
| `room.you`            | Você                                                     |
| `empty.title`         | Silêncio por enquanto.                                   |
| `empty.body`          | Você é a primeira pessoa aqui. Escreva a primeira linha. |
| `conn.connecting`     | conectando…                                              |
| `conn.online`         | conectado                                                |
| `conn.retrying`       | reconectando…                                            |
| `conn.retryingNth`    | Tentando reconectar ({n}ª tentativa)…                    |
| `conn.offline`        | sem conexão                                              |
| `conn.lostTitle`      | A conexão caiu.                                          |
| `conn.lostBody`       | Tentamos {n} vezes e paramos.                            |
| `conn.retryNow`       | Tentar de novo                                           |
| `conn.queued`         | Sua mensagem fica na fila até a conexão voltar.          |
| `people.count`        | {n} pessoa / {n} pessoas                                 |
| `people.unknown`      | — pessoas                                                |
| `system.joined`       | {name} entrou na sala                                    |
| `system.left`         | {name} saiu da sala                                      |
| `typing.one`          | {name} está digitando…                                   |
| `typing.two`          | {a} e {b} estão digitando…                               |
| `typing.many`         | várias pessoas estão digitando…                          |
| `theme.toLight`       | Mudar para tema claro                                    |
| `theme.toDark`        | Mudar para tema escuro                                   |
| `a11y.skipToRoom`     | Ir para a conversa                                       |
| `a11y.enteredRoom`    | Você entrou na sala. O campo de mensagem está em foco.   |

---

## 2. `tokens.css` completo

Sem lacuna. É este arquivo que `scripts/check-contrast.mjs` lê, e a saída da §6 é dele.

```css
/* ═══════════════════════════════════════════════════════════════════════
   web-chat · tokens
   Camada 1 primitivos (--_*)  →  Camada 2 semânticos  →  Camada 3 tema.
   Regra: nenhum componente consome primitivo. Nenhuma cor fora deste arquivo.
   Todo ratio em comentário foi medido por scripts/check-contrast.mjs.
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Camada 1 · primitivos ────────────────────────────────────────────
   Escala crua, sem papel. Degraus de tinta criados por medição: cada
   superfície vizinha guarda ≥1.2:1 da anterior (o sistema antigo separava
   surface-dark de surface-light por 1.07:1 — invisível).                */
:root {
    /* Tinta — matiz fria (~197°), croma baixo. Base do produto. */
    --_ink-50: #f7f9fa;
    --_ink-100: #e8eff1;
    --_ink-200: #d9e3e6;
    --_ink-300: #9fb4bc;
    --_ink-400: #6e7f86;
    --_ink-450: #63757c;
    --_ink-500: #5b7883;
    --_ink-600: #46595f;
    --_ink-750: #24373f;
    --_ink-800: #182930;
    --_ink-900: #101d22;
    --_ink-950: #0a1114;

    /* Âmbar — único calor do sistema. Marca e foco. */
    --_amber-300: #f2c57e;
    --_amber-400: #e9a83f;
    --_amber-700: #8a5104;
    --_amber-800: #6f4103;

    /* Jade — conexão viva. */
    --_jade-300: #45be97;
    --_jade-350: #59c9a5;
    --_jade-700: #0d5c40;

    /* Coral — perda de conexão e erro. Deliberadamente ≠ #ef4444. */
    --_coral-300: #f2786a;
    --_coral-600: #b23325;

    /* Remetentes — seis matizes, dois degraus (claro p/ fundo escuro,
       escuro p/ fundo claro). Nenhum deles cai na faixa quente do âmbar
       (matiz 30°–70°): "você" nunca compete com "outra pessoa". O verde-folha
       substituiu um ocre que, na tela, era indistinguível da marca. */
    --_azure-300: #7fb6e8;
    --_azure-700: #175597;
    --_violet-300: #b49bf0;
    --_violet-700: #5e3fb8;
    --_rose-300: #f193b8;
    --_rose-700: #932b59;
    --_leaf-300: #8ed36e;
    --_leaf-700: #3d6b1f;
    --_cyan-300: #6fcbd4;
    --_cyan-700: #11565e;
}

/* ─── Camada 2 · semânticos · tema escuro (padrão) ─────────────────── */
:root {
    /* Superfícies — duas, e só duas. A hierarquia é de espaço e tipografia;
       elevação só existe onde é real: poço de campo, chip, toast. */
    --color-surface-1: var(--_ink-950); /* página e lista de mensagens */
    --color-surface-2: var(--_ink-800); /* poço de campo, chip, toast — 1.27:1 sobre surface-1 */

    /* Texto */
    --color-text-1: var(--_ink-100); /* 16.36:1 / s1 · 12.90:1 / s2 — 1.4.3 */
    --color-text-2: var(--_ink-300); /*  8.82:1 / s1 ·  6.96:1 / s2 — 1.4.3 */
    --color-text-disabled: var(
        --_ink-400
    ); /*  3.61:1 / s2 — isento por 1.4.3 (controle desabilitado) */

    /* Marca — dois deveres, dois tokens (T3). */
    --color-brand: var(--_amber-400); /* preenchimento — 9.19:1 / s1 (1.4.11 ≥3) */
    --color-brand-hover: var(--_amber-300); /* preenchimento em hover */
    --color-brand-text: var(--_amber-400); /* marca como texto — 9.19:1 / s1 (1.4.3 ≥4.5) */
    --color-on-brand: var(--_ink-950); /* texto sobre preenchimento — 9.19:1 (1.4.3) */

    /* Contornos — decorativo ≠ identificador de controle (T6). */
    --color-border-subtle: var(--_ink-750); /* separador; isento de 1.4.11 */
    --color-outline-control: var(--_ink-500); /* borda de campo/botão — 4.04:1 / s1 · 3.19:1 / s2 */

    /* Foco */
    --color-focus-ring: var(--_amber-400); /* 9.19:1 / s1 · 7.25:1 / s2 — 1.4.11 */

    /* Estado da sessão — o fio (assinatura). */
    --color-ok: var(--_jade-300); /* 8.22:1 / s1 */
    --color-danger: var(--_coral-300); /* 6.95:1 / s1 · 5.48:1 / s2 */
    --color-thread-live: var(--color-outline-control);
    --color-thread-retry: var(--color-brand);
    --color-thread-lost: var(--color-danger);

    /* Remetentes — todo membro ≥4.5:1 em s1 e s2 (T9). */
    --color-on-sender: var(--_ink-950);
    --color-sender-1: var(--_azure-300);
    --color-sender-2: var(--_jade-350);
    --color-sender-3: var(--_violet-300);
    --color-sender-4: var(--_rose-300);
    --color-sender-5: var(--_leaf-300);
    --color-sender-6: var(--_cyan-300);
}

/* ─── Camada 3 · tema claro (só sobrescreve a camada 2) ──────────────
   Nenhuma regra de componente aqui. Nunca.
   A marca inverte de papel: no escuro é âmbar claro com texto tinta;
   no claro é ocre profundo com texto papel. Mesma família, mesma
   identidade, as duas restrições (1.4.3 + 1.4.11) atendidas nos dois. */
[data-theme="light"] {
    --color-surface-1: var(--_ink-50);
    --color-surface-2: var(--_ink-200); /* 1.24:1 sobre surface-1 */

    --color-text-1: var(--_ink-900); /* 16.29:1 / s1 · 13.17:1 / s2 */
    --color-text-2: var(--_ink-600); /*  6.97:1 / s1 ·  5.63:1 / s2 */
    --color-text-disabled: var(--_ink-400); /*  3.19:1 / s2 — isento */

    --color-brand: var(--_amber-700); /* 6.10:1 / s1 · 4.93:1 / s2 (1.4.11) */
    --color-brand-hover: var(--_amber-800);
    --color-brand-text: var(--_amber-700); /* 6.10:1 / s1 · 4.93:1 / s2 (1.4.3) */
    --color-on-brand: var(--_ink-50); /* 6.10:1 sobre o preenchimento */

    --color-border-subtle: var(--_ink-200);
    --color-outline-control: var(--_ink-450); /* 4.55:1 / s1 · 3.68:1 / s2 */

    --color-focus-ring: var(--_amber-700); /* 6.10:1 / s1 · 4.93:1 / s2 */

    --color-ok: var(--_jade-700); /* 7.58:1 / s1 */
    --color-danger: var(--_coral-600); /* 5.86:1 / s1 · 4.74:1 / s2 */

    --color-on-sender: var(--_ink-50);
    --color-sender-1: var(--_azure-700);
    --color-sender-2: var(--_jade-700);
    --color-sender-3: var(--_violet-700);
    --color-sender-4: var(--_rose-700);
    --color-sender-5: var(--_leaf-700);
    --color-sender-6: var(--_cyan-700);
}

/* ─── Escalas não cromáticas (idênticas nos dois temas) ─────────────── */
:root {
    /* Espaço — base 4px. --space-0-5 e --space-1-5 legitimam 2px e 6px (T4). */
    --space-0: 0;
    --space-0-5: 0.125rem; /*  2px */
    --space-1: 0.25rem; /*  4px */
    --space-1-5: 0.375rem; /*  6px */
    --space-2: 0.5rem; /*  8px */
    --space-3: 0.75rem; /* 12px */
    --space-4: 1rem; /* 16px */
    --space-5: 1.25rem; /* 20px */
    --space-6: 1.5rem; /* 24px */
    --space-8: 2rem; /* 32px */
    --space-10: 2.5rem; /* 40px */
    --space-12: 3rem; /* 48px */
    --space-16: 4rem; /* 64px */

    /* Raio — formas quase retas; o produto é transcrição, não balão. */
    --radius-0: 0;
    --radius-sm: 0.125rem; /* 2px — chip, monograma */
    --radius-md: 0.25rem; /* 4px — campo, botão, toast */
    --radius-lg: 0.5rem; /* 8px — painel de estado */
    --radius-full: 9999px; /* só ponto de estado e trilho do fio */

    /* Traço */
    --rule-1: 1px;
    --rule-2: 2px;
    --rule-thread: 2px;
    --focus-ring-width: 3px;
    --focus-ring-offset: 2px;

    /* Sombra — usada só onde há elevação real (toast). */
    --shadow-0: none;
    --shadow-1: 0 1px 2px rgb(0 0 0 / 0.3);
    --shadow-2: 0 8px 24px -8px rgb(0 0 0 / 0.55);

    /* Tempo e curva */
    --duration-0: 0ms;
    --duration-fast: 120ms;
    --duration-base: 200ms;
    --duration-slow: 320ms;
    --ease-standard: cubic-bezier(0.2, 0, 0, 1);
    --ease-out: cubic-bezier(0, 0, 0, 1);
    --ease-in: cubic-bezier(0.3, 0, 1, 1);

    /* Opacidade — nunca aplicada a texto que precisa passar em 1.4.3;
       para texto apagado existe --color-text-2 / --color-text-disabled. */
    --opacity-0: 0;
    --opacity-disabled: 0.5;
    --opacity-scrim: 0.6;
    --opacity-1: 1;

    /* Camadas */
    --z-base: 0;
    --z-sticky: 10;
    --z-overlay: 100;
    --z-toast: 1000;

    /* Alvos de toque (T7) */
    --tap-min: 24px;
    --tap-comfort: 44px;

    /* Breakpoints — declarados aqui como fonte única de verdade; media
       queries não aceitam var(), então o literal na @media é a exceção
       justificada do comando 2. */
    --breakpoint-sm: 30rem; /* 480px */
    --breakpoint-md: 48rem; /* 768px */
    --breakpoint-lg: 64rem; /* 1024px */

    /* Tipografia */
    --font-display: "Syne", "Trebuchet MS", sans-serif;
    --font-text: "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif;

    --text-2xs: 0.6875rem; /* 11px — carimbo de hora */
    --text-xs: 0.75rem; /* 12px */
    --text-sm: 0.875rem; /* 14px */
    --text-md: 1rem; /* 16px — corpo da mensagem */
    --text-lg: 1.125rem; /* 18px */
    --text-xl: 1.375rem; /* 22px */
    --text-2xl: 1.75rem; /* 28px */
    --text-3xl: 2.5rem; /* 40px — só a assinatura de entrada */

    --weight-regular: 400;
    --weight-bold: 700;
    --weight-display: 700;

    --leading-tight: 1.1;
    --leading-snug: 1.3;
    --leading-normal: 1.55;

    --tracking-tight: -0.02em;
    --tracking-normal: 0;
    --tracking-wide: 0.06em;
    --tracking-caps: 0.12em;

    /* Layout */
    --measure-message: 62ch;
    --rail-width: 3rem;
    --layout-max: 56rem;
}

/* ─── Movimento ─────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

**Duas regras que não se negociam, e como este arquivo as garante:**

1. **Componente nunca consome primitivo.** Todo `--_*` só aparece do lado direito de um
   token da camada 2. Os arquivos em `css/components/` só podem citar `--color-*`,
   `--space-*`, `--radius-*`, `--text-*`, `--duration-*`, `--z-*`, `--tap-*`. Isso vira
   regra de stylelint no commit `chore(ci)`.
2. **Cor com transparência é composta antes de ser medida.** Nenhum token de cor deste
   arquivo usa `rgba()` ou `color-mix()` — só `--shadow-*`, que não é medido porque é
   sombra sob o elemento, não contorno que identifica controle. Motivo prático: a borda
   atual `rgba(255,255,255,.1)` sobre `#1a1a2e` **compõe para `#313143` e mede 1.34:1**,
   contra 3:1 exigido por 1.4.11 — o número só aparece depois de compor, e é por isso que
   o script recusa cor não literal.

---

## 3. Inventário de componentes

Legenda: **✓** implementado · **—** não se aplica · **n/a** o componente não é interativo.
Célula vazia seria decisão pendente; não há nenhuma.

| Componente                 | Arquivo                                                      | Variantes                                     | default | hover | active | focus-visible | disabled | loading | vazio | erro |
| -------------------------- | ------------------------------------------------------------ | --------------------------------------------- | :-----: | :---: | :----: | :-----------: | :------: | :-----: | :---: | :--: |
| Botão                      | `components/button.css`                                      | `primary`, `quiet`, `icon`                    |    ✓    |   ✓   |   ✓    |       ✓       |    ✓     |    ✓    |   —   |  —   |
| Campo de texto             | `components/field.css`                                       | `single-line`                                 |    ✓    |   ✓   |   ✓    |       ✓       |    ✓     |    —    |   —   |  ✓   |
| Composer                   | `components/composer.css` · `ui/composer.js`                 | `ready`, `queued`, `blocked`                  |    ✓    |   ✓   |   ✓    |       ✓       |    ✓     |    ✓    |   —   |  ✓   |
| Mensagem — própria         | `components/message.css` · `ui/message.js`                   | `self`                                        |    ✓    |   ✓   |   —    |       —       |    —     |    ✓    |   —   |  ✓   |
| Mensagem — de outro        | `components/message.css` · `ui/message.js`                   | padrão (sem modificador)                      |    ✓    |   ✓   |   —    |       —       |    —     |    —    |   —   |  —   |
| Mensagem — de sistema      | `components/message.css` · `ui/message.js`                   | `system`                                      |    ✓    |   —   |   —    |       —       |    —     |    —    |   —   |  —   |
| Lista de mensagens         | `components/message-list.css` · `ui/messageList.js`          | `com-histórico`, `vazia`                      |    ✓    |   —   |   —    |       ✓       |    —     |    ✓    |   ✓   |  ✓   |
| Fio da sessão (assinatura) | `components/thread.css` · `ui/connection.js`                 | `connecting`, `live`, `retry`, `lost`         |    ✓    |   —   |   —    |       —       |    —     |    ✓    |   ✓   |  ✓   |
| Identidade do remetente    | `components/identity.css` · `ui/identity.js`                 | `self`(preenchido), `other`(vazado)           |    ✓    |   ✓   |   —    |       —       |    —     |    —    |   —   |  —   |
| Indicador de digitação     | `components/typing.css` · `ui/typing.js` · `state/typing.js` | `one`, `two`, `many`                          |    ✓    |   —   |   —    |       —       |    —     |   n/a   |   ✓   |  —   |
| Lista de pessoas online    | `components/people.css` · `ui/people.js`                     | `inline`, `compacta`(<480px)                  |    ✓    |   ✓   |   —    |       ✓       |    —     |    ✓    |   ✓   |  ✓   |
| Estado de conexão          | `components/connection.css` · `ui/connection.js`             | `connecting`, `online`, `retrying`, `offline` |    ✓    |   —   |   —    |       —       |    —     |    ✓    |   —   |  ✓   |
| Notificação (toast)        | `components/toast.css` · `ui/toast.js`                       | `info`, `error`                               |    ✓    |   ✓   |   ✓    |       ✓       |    —     |    —    |   —   |  ✓   |
| Tela de entrada            | `components/entry.css` · `ui/entry.js`                       | `idle`, `submitting`                          |    ✓    |   ✓   |   ✓    |       ✓       |    ✓     |    ✓    |   —   |  ✓   |
| Estado vazio               | `components/empty.css` · `ui/empty.js`                       | `sala-vazia`                                  |    ✓    |   —   |   —    |       —       |    —     |    —    |   ✓   |  —   |
| Estado de falha definitiva | `components/failure.css` · `ui/failure.js`                   | `offline-final`                               |    ✓    |   ✓   |   ✓    |       ✓       |    —     |    ✓    |   —   |  ✓   |
| Alternador de tema         | `components/theme-toggle.css` · `ui/themeToggle.js`          | `to-light`, `to-dark`                         |    ✓    |   ✓   |   ✓    |       ✓       |    —     |    —    |   —   |  —   |
| Skip link                  | `components/skip-link.css`                                   | `único`                                       |    ✓    |   ✓   |   ✓    |       ✓       |    —     |    —    |   —   |  —   |
| Casca da aplicação         | `components/app-shell.css`                                   | `entry`, `room`                               |    ✓    |   —   |   —    |       —       |    —     |    —    |   —   |  —   |
| Região de anúncio          | `a11y/announce.js`                                           | `polite`, `assertive`                         |   n/a   |  n/a  |  n/a   |      n/a      |   n/a    |   n/a   |  n/a  | n/a  |

> **Corrigido após a implementação:** este inventário previa `ui/button.js`,
> `ui/field.js` e `ui/thread.js`. Botão e campo acabaram sendo HTML + CSS, sem
> comportamento próprio a encapsular, e o estado do fio é escrito por
> `ui/connection.js`, que já é quem conhece o estado da conexão — três módulos
> vazios só para bater com a tabela seriam cerimônia. A tabela acima descreve os
> arquivos que existem; a divergência está registrada em
> `docs/refactor-report.md` §8.

**Notas de estado que valem regra:**

- `focus-visible` é global (`base/a11y.css`): anel de `3px` em `--color-focus-ring`, com
  `border-radius: inherit` para não desenhar quadrado em alvo redondo, e `offset` de 2px.
  Medido **9.19:1** (escuro) e **6.10:1** (claro) contra a superfície base — 1.4.11 pede 3.
- `disabled` usa `--color-text-disabled` (**3.61:1** escuro / **3.19:1** claro) e
  `aria-disabled`, **não** `opacity` sobre texto. Controle desabilitado é isento de 1.4.3,
  mas 3:1 é o piso que escolhi para continuar legível.
- `loading` do composer é o estado "fila": o campo continua editável e o envio acumula —
  loading aqui não bloqueia, informa.
- Só **um** `role="alert"` no projeto inteiro: a falha definitiva de conexão. Todo o resto
  é `role="status"` / `aria-live="polite"`.

**Decisão sobre anúncio duplo** (resolve o item "anunciada uma vez" do Anexo B): a lista
de mensagens é `role="log"` + `aria-live="polite"` + `aria-relevant="additions"` e é a
**única** fonte de anúncio de mensagem. `a11y/announce.js` cuida só do que não está na
lista — mudança de estado da conexão, troca de tema, entrada na sala. Se as duas
anunciassem, cada mensagem seria lida duas vezes; a fila com deduplicação do
`announce.js` existe para o caso oposto (seis tentativas de reconexão não podem virar
seis anúncios — só a mudança de estado é anunciada).

---

## 4. Mapa de migração — `frontend/css/style.css` (452 linhas, 54 blocos + 6 aninhados)

Nada desaparece por esquecimento. **Morre** sempre vem com motivo.

|   # | Bloco atual                                                 | Destino                                                                                                                                                                                                                                                                                                                                                                                                     |
| --: | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | `@import` Google Fonts                                      | **Morre.** Vira `preconnect` + `link` no `<head>` (§1.3): `@import` encadeia requisição e bloqueia a primeira pintura.                                                                                                                                                                                                                                                                                      |
|   2 | `*` (reset + `font-family: Inter`)                          | `base/reset.css` (box-sizing, margin) + `base/typography.css` (família em `body`, não no `*`).                                                                                                                                                                                                                                                                                                              |
|   3 | `:root` (11 tokens de aparência)                            | **Morre inteiro.** Substituído por `tokens.css` em três camadas. `--primary-color`→`--color-brand`/`--color-brand-text`, `--surface-dark`→`--color-surface-1`, `--surface-light`→`--color-surface-2`, `--text-primary`→`--color-text-1`, `--text-secondary`→`--color-text-2`, `--success-color`→`--color-ok`, `--error-color`→`--color-danger`, `--warning-color` **morre** (§1.2: reconectar usa a marca). |
|   4 | `body` (gradiente 135° com `#16213e` hardcoded 2×)          | `base/reset.css`: superfície chapada `--color-surface-1`. Gradiente **morre** — conceito de superfície única (§1.1).                                                                                                                                                                                                                                                                                        |
|   5 | `.container` (flex centrado, `100dvh`)                      | `components/app-shell.css`: `grid` `min-content 1fr min-content` sobre `100dvh`. Unidade única de viewport no projeto.                                                                                                                                                                                                                                                                                      |
|   6 | `.login` (cartão, borda `rgba(...,.1)`, sombra)             | `components/entry.css` **sem cartão**: superfície única, hierarquia por espaço. Borda de 1.34:1 **morre** (reprova 1.4.11).                                                                                                                                                                                                                                                                                 |
|   7 | `.login > h2` (gradiente clipado em texto)                  | `components/entry.css` → `entry.title`, Syne 700 `--text-3xl`. Gradiente clipado **morre**: proibido pelo briefing e impede medir contraste do texto.                                                                                                                                                                                                                                                       |
|   8 | `.login__subtitle`                                          | `components/entry.css` → `--color-text-2`, `--text-lg`.                                                                                                                                                                                                                                                                                                                                                     |
|   9 | `.login__form`                                              | `components/entry.css`, `gap: var(--space-5)`.                                                                                                                                                                                                                                                                                                                                                              |
|  10 | `.login__input`                                             | `components/field.css`. Borda vira `--color-outline-control` (**4.04:1**, era 1.34:1).                                                                                                                                                                                                                                                                                                                      |
|  11 | `.login__input:focus` (`box-shadow` 10% ≈ **1.12:1**)       | **Morre.** Substituído pelo `:focus-visible` global de `base/a11y.css` (**9.19:1**).                                                                                                                                                                                                                                                                                                                        |
|  12 | `.login__button`                                            | `components/button.css` variante `primary`. `color: white` sobre `#6366f1` (**4.47:1**) → `--color-on-brand` sobre `--color-brand` (**9.19:1**).                                                                                                                                                                                                                                                            |
|  13 | `.login__button:hover` (`transform: translateY(-1px)`)      | `components/button.css`: hover vira `--color-brand-hover`. `transform` fica, mas desligado sob `prefers-reduced-motion`.                                                                                                                                                                                                                                                                                    |
|  14 | `.chat` (`display:none` alternado por JS)                   | `components/app-shell.css`: troca de tela vira atributo de estado + `hidden`, com foco movido para o composer.                                                                                                                                                                                                                                                                                              |
|  15 | `.chat__header` (cartão + borda + sombra)                   | `components/app-shell.css`: faixa sem cartão, separada por `--color-border-subtle`. Sombra **morre** (cromo recua).                                                                                                                                                                                                                                                                                         |
|  16 | `.chat__info h3`                                            | `components/app-shell.css` → wordmark, Syne 700 `--text-xl`. Vira o **`<h1>`** da página.                                                                                                                                                                                                                                                                                                                   |
|  17 | `.chat__status`                                             | `components/connection.css`, quatro estados reais.                                                                                                                                                                                                                                                                                                                                                          |
|  18 | `.chat__status::before` (ponto + `pulse` infinito)          | `components/connection.css`: ponto mantido (`--color-ok`, **8.22:1**), `pulse` **morre** — animação infinita reprova 2.2.2 e não carrega informação.                                                                                                                                                                                                                                                        |
|  19 | `.users__count`                                             | `components/people.css`.                                                                                                                                                                                                                                                                                                                                                                                    |
|  20 | `.users__list` (`max-width: 200px`)                         | `components/people.css`, largura por grid, não por literal.                                                                                                                                                                                                                                                                                                                                                 |
|  21 | `.user__item` (cor inline via JS)                           | `components/people.css` + `components/identity.css`: cor vira classe `--color-sender-N` medida, mais monograma.                                                                                                                                                                                                                                                                                             |
|  22 | `.chat__messages` (`max-height: calc(100vh - 140px)`)       | `components/message-list.css`. O `calc` mágico **morre**: altura vem do grid do shell.                                                                                                                                                                                                                                                                                                                      |
|  23 | `.welcome__message` (borda tracejada)                       | `components/empty.css`, com copy da §1.6. A borda tracejada **morre**; o estado vazio ganha tela própria.                                                                                                                                                                                                                                                                                                   |
|  24 | `.welcome__message p`                                       | `components/empty.css`.                                                                                                                                                                                                                                                                                                                                                                                     |
|  25 | `.welcome__message p:first-child`                           | `components/empty.css` → `empty.title` em Syne.                                                                                                                                                                                                                                                                                                                                                             |
|  26 | `.message` (`max-width: 70%`, `messageSlide`)               | `components/message.css`: medida `62ch`, sem `%`. Animação vira transição de opacidade curta, desligada sob movimento reduzido.                                                                                                                                                                                                                                                                             |
|  27 | `@keyframes messageSlide`                                   | `base/motion.css`, com fallback de movimento reduzido.                                                                                                                                                                                                                                                                                                                                                      |
|  28 | `.message--self` (balão âmbar-indigo à direita)             | `components/message.css`: **balão e alinhamento à direita morrem** (§5). Vira monograma preenchido + rótulo "Você" + traço de 2px em `--color-brand`.                                                                                                                                                                                                                                                       |
|  29 | `.message--other` (balão + borda 1.34:1)                    | `components/message.css`: sem balão, sem borda; monograma vazado + nome tokenizado.                                                                                                                                                                                                                                                                                                                         |
|  30 | `.message--sender` (`opacity: .9` + cor inline)             | `components/identity.css`: `--color-sender-N` por classe, `--text-sm` 700. `opacity` sobre texto **morre** (quebra a medição de contraste).                                                                                                                                                                                                                                                                 |
|  31 | `.message--timestamp` (`opacity: .7`)                       | `components/message.css`: `--color-text-2` (**8.82:1**) em vez de opacidade.                                                                                                                                                                                                                                                                                                                                |
|  32 | `.message--system` (balão itálico centrado)                 | `components/message.css` variante `system`: linha centrada, `--text-xs`, sem balão.                                                                                                                                                                                                                                                                                                                         |
|  33 | `.typing__indicator` (barra própria, `display:none` inline) | `components/typing.css`: vira linha dentro da lista, presa ao fio. `style="display:none"` **morre** (zero `style=` no HTML).                                                                                                                                                                                                                                                                                |
|  34 | `.typing__dots`                                             | `components/typing.css`.                                                                                                                                                                                                                                                                                                                                                                                    |
|  35 | `.typing__dots span`                                        | `components/typing.css`.                                                                                                                                                                                                                                                                                                                                                                                    |
|  36 | `.typing__dots span:nth-child(1)`                           | `components/typing.css`.                                                                                                                                                                                                                                                                                                                                                                                    |
|  37 | `.typing__dots span:nth-child(2)`                           | `components/typing.css`.                                                                                                                                                                                                                                                                                                                                                                                    |
|  38 | `@keyframes typingDots` (loop infinito)                     | `base/motion.css`; sob movimento reduzido os pontos ficam estáticos e o texto "está digitando…" carrega a informação sozinho.                                                                                                                                                                                                                                                                               |
|  39 | `.chat__form` (cartão + borda)                              | `components/composer.css`, sem cartão, separado por `--color-border-subtle`.                                                                                                                                                                                                                                                                                                                                |
|  40 | `.chat__input` (`border-radius: 24px`)                      | `components/field.css`, `--radius-md`. Raio de balão **morre** com o conceito.                                                                                                                                                                                                                                                                                                                              |
|  41 | `.chat__input:focus` (**1.12:1**)                           | **Morre** → `:focus-visible` global.                                                                                                                                                                                                                                                                                                                                                                        |
|  42 | `.chat__button` (44px, só ícone, sem nome acessível)        | `components/button.css` variante `primary`; ganha rótulo textual "Enviar" (ícone só <360px, com `aria-label`). Os 44px viram `--tap-comfort`.                                                                                                                                                                                                                                                               |
|  43 | `.chat__button:hover` (`transform: scale(1.05)`)            | `components/button.css`; `transform` desligado sob movimento reduzido.                                                                                                                                                                                                                                                                                                                                      |
|  44 | `.chat__button > span` (glifo)                              | `components/button.css`; o glifo recebe `aria-hidden="true"`.                                                                                                                                                                                                                                                                                                                                               |
|  45 | `.notifications` (`z-index: 1000` literal)                  | `components/toast.css`, `var(--z-toast)`.                                                                                                                                                                                                                                                                                                                                                                   |
|  46 | `.notification` (`max-width: 300px`)                        | `components/toast.css`, medida por `ch`. Mantém `--shadow-2` — é elevação real.                                                                                                                                                                                                                                                                                                                             |
|  47 | `@keyframes notificationSlide`                              | `base/motion.css`, com fallback.                                                                                                                                                                                                                                                                                                                                                                            |
|  48 | `.notification--success`                                    | `components/toast.css` variante `info` (`--color-ok`).                                                                                                                                                                                                                                                                                                                                                      |
|  49 | `.notification--error`                                      | `components/toast.css` variante `error` (`--color-danger`).                                                                                                                                                                                                                                                                                                                                                 |
|  50 | `@keyframes pulse`                                          | **Morre.** Ver bloco 18.                                                                                                                                                                                                                                                                                                                                                                                    |
|  51 | `@media (max-width: 768px)` (único breakpoint)              | `components/*.css`, com `--breakpoint-sm` (480px) e `--breakpoint-md` (768px), mais `@media (pointer: coarse)` para alvos de 44px.                                                                                                                                                                                                                                                                          |
| 51a | ↳ `.chat__header`                                           | `components/app-shell.css`.                                                                                                                                                                                                                                                                                                                                                                                 |
| 51b | ↳ `.chat__users`                                            | `components/people.css`.                                                                                                                                                                                                                                                                                                                                                                                    |
| 51c | ↳ `.users__list`                                            | `components/people.css`.                                                                                                                                                                                                                                                                                                                                                                                    |
| 51d | ↳ `.message` (`max-width: 85%`)                             | `components/message.css` — vira `100%` (§1.4, 320px).                                                                                                                                                                                                                                                                                                                                                       |
| 51e | ↳ `.login`                                                  | `components/entry.css`.                                                                                                                                                                                                                                                                                                                                                                                     |
| 51f | ↳ `.chat__messages` (`calc(100vh - 160px)`)                 | **Morre.** Altura por grid.                                                                                                                                                                                                                                                                                                                                                                                 |
|  52 | `.chat__messages::-webkit-scrollbar`                        | `base/reset.css`, com `scrollbar-width`/`scrollbar-color` padrão além do prefixo.                                                                                                                                                                                                                                                                                                                           |
|  53 | `::-webkit-scrollbar-track`                                 | `base/reset.css`.                                                                                                                                                                                                                                                                                                                                                                                           |
|  54 | `::-webkit-scrollbar-thumb` (`rgba(255,255,255,.2)`)        | `base/reset.css` → `--color-outline-control`.                                                                                                                                                                                                                                                                                                                                                               |
|  55 | `::-webkit-scrollbar-thumb:hover`                           | `base/reset.css` → `--color-brand`.                                                                                                                                                                                                                                                                                                                                                                         |

**Arquivos substituídos por inteiro** (regra 12 da §6 do prompt): `frontend/css/style.css`
e `frontend/js/script.js` não são editados — são **substituídos**, e cada bloco de regra
está mapeado acima. `frontend/index.html` é reescrito (estrutura semântica, landmarks,
labels, bootstrap de tema). `style_original.css` e `script_original.js` são **removidos**
(órfãos; o histórico do git preserva).

---

## 5. Autocrítica anti-default

### (a) O que eu produziria igual para qualquer chat

1. **Coluna única centrada com header / lista / composer.** É a forma de todo chat desde 2005. Mantive: a alternativa (sidebar de canais) é escopo que este produto não tem.
2. **Monograma circular com iniciais.** Avatar de iniciais é o default absoluto de
   produto anônimo. Mantive a ideia, mudei o desenho (ver (b) item 3).
3. **Toast no canto superior direito.** Posição default. Mantive — é onde o usuário
   procura, e mexer nisso é ousadia gasta no lugar errado.
4. **Escala de espaço de 4px, `focus-visible` global, `prefers-reduced-motion`.** Não são
   escolhas de personalidade, são o piso. Iguais em qualquer projeto meu.
5. **Ponto colorido + rótulo para estado de conexão.** Padrão consagrado; mantive porque
   é reconhecível na hora.
6. Primeira versão do meu próprio plano: azul-petróleo com acento verde-menta, cartões
   elevados, balões arredondados. Ou seja — **o template de novo, com outra matiz.**
   Refiz. O que segue em (b) é o que mudou.

### (b) O que troquei por causa disso, e por quê

1. **Balões e alinhamento à direita → transcrição em coluna única.**
   _Trocado porque_ o balão é o único vocabulário que qualquer chat usa, e porque ele
   custa: `max-width: 70%` joga fora 30% da largura, o alinhamento alternado deixa a
   leitura em ziguezague, e em 320px vira uma coluna de fragmentos. A transcrição é mais
   honesta com um produto que é literalmente uma transcrição efêmera.
   _Custo assumido, declarado:_ perde-se a leitura instantânea de "minha vs sua" que o
   alinhamento dá de graça. Compenso com **três** sinais redundantes (monograma
   preenchido, rótulo "Você", traço âmbar de 2px) — o que também é o que faz o desenho
   passar em 1.4.1, coisa que cor de remetente sozinha não faz hoje.
2. **Três superfícies falsas → uma superfície verdadeira.**
   _Trocado porque_ medi: `#1a1a2e` vs `#16213e` = **1.07:1**. Empilhar cartões que ninguém
   enxerga é decoração que custa contraste de borda. A segunda superfície agora só existe
   onde há elevação real, e guarda **1.27:1**.
3. **Círculo com iniciais → monograma quadrado-de-canto-vivo (`--radius-sm`, 2px),
   preenchido para "você" e vazado para os outros.**
   _Trocado porque_ o círculo preenchido para todo mundo transforma identidade em pura
   cor. Preenchido-vs-vazado é diferença de _forma_, que sobrevive a daltonismo, a
   monocromia e a print.
4. **Indigo Tailwind → âmbar que inverte entre temas.**
   _Trocado porque_ `#6366f1` reprova (**4.47:1**) e porque indigo é a assinatura de
   template mais reconhecível da web. O âmbar também elimina o token `--warning`: a cor
   de atenção e a cor da marca passam a ser a mesma, o que é verdade neste produto.
5. **Inter em `*` → Syne (display, 4 lugares) + Atkinson Hyperlegible (texto).**
   _Trocado porque_ Inter no seletor universal é o default de template escrito em CSS, e
   porque numa sala anônima a legibilidade de nomes curtos é requisito funcional. Atkinson
   é escolha de acessibilidade que também dá personalidade — não é neutralidade.
6. **Barra de "digitando" separada → linha presa ao fio.**
   _Trocado porque_ a barra própria era um pedaço de cromo a mais competindo com a
   mensagem; presa ao fio, ela usa a assinatura em vez de brigar com ela.
7. **Estado de conexão como `textContent` solto → o fio.**
   _Trocado porque_ era a peça mais fácil de fazer default (um badge no header) e é a
   informação mais importante que este produto tem. Virou a assinatura.
8. **Ideia rejeitada, para registro:** cogitei desbotar as mensagens antigas em direção ao
   topo ("borda do esquecimento") como metáfora de efemeridade. **Descartei** — texto
   desbotado reprova 1.4.3 por construção, e ilegibilidade não é conceito, é defeito.

---

## 6. Verificação medida

Saída de `node scripts/check-contrast.mjs` sobre o `tokens.css` da §2, com
`scripts/contrast.pairs.json` contendo **42 pares** — um para cada decisão de cor do plano
(par não declarado é par não verificado):

```
── tema dark ─────────────────────────────────────────────
✅  16.36 / 4.5  texto principal / superfície base            (#e8eff1 sobre #0a1114)
✅  12.90 / 4.5  texto principal / superfície elevada         (#e8eff1 sobre #182930)
✅   8.82 / 4.5  texto secundário / superfície base           (#9fb4bc sobre #0a1114)
✅   6.96 / 4.5  texto secundário / superfície elevada        (#9fb4bc sobre #182930)
✅   9.19 / 4.5  texto sobre preenchimento de marca           (#0a1114 sobre #e9a83f)
✅  11.84 / 4.5  texto sobre preenchimento de marca em hover  (#0a1114 sobre #f2c57e)
✅   9.19 / 3    preenchimento de marca / superfície base     (1.4.11)
✅   7.25 / 3    preenchimento de marca / superfície elevada  (1.4.11)
✅  11.84 / 3    preenchimento em hover / superfície base     (1.4.11)
✅   9.19 / 4.5  marca como texto / superfície base
✅   7.25 / 4.5  marca como texto / superfície elevada
✅   4.04 / 3    contorno de controle / superfície base       (1.4.11)
✅   3.19 / 3    contorno de controle / superfície elevada    (1.4.11)
✅   9.19 / 3    anel de foco / superfície base               (1.4.11)
✅   7.25 / 3    anel de foco / superfície elevada            (1.4.11)
✅   4.04 / 3    fio vivo / superfície base                   (1.4.11)
✅   9.19 / 3    fio reconectando / superfície base           (1.4.11)
✅   6.95 / 3    fio perdido / superfície base                (1.4.11)
✅   8.22 / 4.5  estado conectado como texto / base
✅   8.22 / 3    estado conectado como ponto / base           (1.4.11)
✅   6.95 / 4.5  estado de erro como texto / base
✅   5.48 / 4.5  estado de erro como texto / elevada
✅   1.27 / 1.2  degrau de elevação: superfície 2 sobre 1
✅   3.61 / 3    texto desabilitado / superfície elevada      (isento de 1.4.3)
✅   8.85 / 4.5  remetente 1 / base      ✅ 6.98 / 4.5  remetente 1 / elevada
✅   9.36 / 4.5  remetente 2 / base      ✅ 7.38 / 4.5  remetente 2 / elevada
✅   8.06 / 4.5  remetente 3 / base      ✅ 6.35 / 4.5  remetente 3 / elevada
✅   8.71 / 4.5  remetente 4 / base      ✅ 6.87 / 4.5  remetente 4 / elevada
✅  10.60 / 4.5  remetente 5 / base      ✅ 8.36 / 4.5  remetente 5 / elevada
✅  10.12 / 4.5  remetente 6 / base      ✅ 7.99 / 4.5  remetente 6 / elevada
✅  8.85 · 9.36 · 8.06 · 8.71 · 10.60 · 10.12 / 4.5  monogramas 1–6 (texto sobre preenchimento)

── tema light ────────────────────────────────────────────
✅  16.29 / 4.5  texto principal / superfície base            (#101d22 sobre #f7f9fa)
✅  13.17 / 4.5  texto principal / superfície elevada         (#101d22 sobre #d9e3e6)
✅   6.97 / 4.5  texto secundário / superfície base           (#46595f sobre #f7f9fa)
✅   5.63 / 4.5  texto secundário / superfície elevada        (#46595f sobre #d9e3e6)
✅   6.10 / 4.5  texto sobre preenchimento de marca           (#f7f9fa sobre #8a5104)
✅   8.17 / 4.5  texto sobre preenchimento de marca em hover  (#f7f9fa sobre #6f4103)
✅   6.10 / 3    preenchimento de marca / superfície base     (1.4.11)
✅   4.93 / 3    preenchimento de marca / superfície elevada  (1.4.11)
✅   8.17 / 3    preenchimento em hover / superfície base     (1.4.11)
✅   6.10 / 4.5  marca como texto / superfície base
✅   4.93 / 4.5  marca como texto / superfície elevada
✅   4.55 / 3    contorno de controle / superfície base       (1.4.11)
✅   3.68 / 3    contorno de controle / superfície elevada    (1.4.11)
✅   6.10 / 3    anel de foco / superfície base               (1.4.11)
✅   4.93 / 3    anel de foco / superfície elevada            (1.4.11)
✅   4.55 / 3    fio vivo / superfície base                   (1.4.11)
✅   6.10 / 3    fio reconectando / superfície base           (1.4.11)
✅   5.86 / 3    fio perdido / superfície base                (1.4.11)
✅   7.58 / 4.5  estado conectado como texto / base
✅   7.58 / 3    estado conectado como ponto / base           (1.4.11)
✅   5.86 / 4.5  estado de erro como texto / base
✅   4.74 / 4.5  estado de erro como texto / elevada
✅   1.24 / 1.2  degrau de elevação: superfície 2 sobre 1
✅   3.19 / 3    texto desabilitado / superfície elevada      (isento de 1.4.3)
✅   7.15 / 4.5  remetente 1 / base      ✅ 5.78 / 4.5  remetente 1 / elevada
✅   7.58 / 4.5  remetente 2 / base      ✅ 6.13 / 4.5  remetente 2 / elevada
✅   6.91 / 4.5  remetente 3 / base      ✅ 5.59 / 4.5  remetente 3 / elevada
✅   7.28 / 4.5  remetente 4 / base      ✅ 5.89 / 4.5  remetente 4 / elevada
✅   5.99 / 4.5  remetente 5 / base      ✅ 4.84 / 4.5  remetente 5 / elevada
✅   7.90 / 4.5  remetente 6 / base      ✅ 6.39 / 4.5  remetente 6 / elevada
✅  7.15 · 7.58 · 6.91 · 7.28 · 5.99 · 7.90 / 4.5  monogramas 1–6 (texto sobre preenchimento)

Todos os pares passam.      exit 0
```

**Controle — prova de que o script lê os tokens.** Rodando o mesmo script sobre um
`tokens.css` montado com a paleta atual do projeto, ele reprova exatamente onde a
auditoria dizia que reprovaria:

```
❌   4.47 / 4.5  texto sobre preenchimento de marca  (#ffffff sobre #6366f1)   → 1.4.3
❌   1.22 / 3    contorno de controle / superfície base                        → 1.4.11
❌   1.03 / 3    anel de foco / superfície base                                → 1.4.11
❌   1.07 / 1.2  degrau de elevação: superfície 2 sobre 1                      → elevação falsa
12 par(es) reprovado(s).      exit 1
```

E as duas cores translúcidas do CSS atual, **compostas antes de medir** (regra 9):

| Valor atual                          | Composto sobre | Resultado |      Ratio | Veredito                     |
| ------------------------------------ | -------------- | --------- | ---------: | ---------------------------- |
| `rgba(255,255,255,0.1)` (borda, 11×) | `#1a1a2e`      | `#313143` | **1.34:1** | ❌ 1.4.11 exige 3            |
| `rgba(255,255,255,0.1)` (borda)      | `#16213e`      | `#2d3751` | **1.34:1** | ❌ 1.4.11                    |
| `rgba(99,102,241,0.1)` (foco)        | `#16213e`      | `#1e2850` | **1.12:1** | ❌ foco invisível na prática |

**Resumo dos alvos fechados nesta paleta:** 1.4.1 (identidade não depende só de cor),
1.4.3 (todo texto ≥4.5), 1.4.11 (contorno de controle, preenchimento, anel de foco e as
três cores do fio ≥3), com o degrau de elevação ≥1.2 em ambos os temas.

---

## 7. Como adicionar uma cor

1. Crie o **primitivo** (`--_familia-degrau`) com o hex literal.
2. Aponte um **semântico** (`--color-<papel>`) para ele, nos **dois** temas.
3. Declare o **par** em `scripts/contrast.pairs.json`, contra a superfície real onde a cor
   vai aparecer, com o mínimo do critério (4.5 texto, 3.0 não texto, 1.2 degrau).
4. Rode `node scripts/check-contrast.mjs`. Se reprovar, muda a cor — não o mínimo.
5. Se a cor tem transparência, **componha sobre a superfície real** e registre o hex
   composto. O script recusa cor não literal de propósito.

Par não declarado é par não verificado.
