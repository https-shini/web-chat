# Auditoria de UX/UI — Fase A

> Branch `feat/ux-audit-discord`, a partir da `main` (3606dd2). **Só análise:**
> nenhum componente foi alterado nesta fase.
>
> O Discord é a referência de **padrões**: hierarquia, navegação, painéis,
> mensagens, presença, não lidas, menus de contexto, popovers, modais, celular e
> teclado. Não é referência de identidade: nada de ícones, marcas ou recursos
> visuais dele. O web-chat mantém a própria identidade.

## Como a auditoria foi feita

- **Navegador real:**
    - backend local, Vite e Playwright Chromium;
    - 19 capturas: entrada, erro, início, sala vazia e com mensagens, sugestões, ajuda, cartão de pessoa, diálogo, privada enviada e recebida, início com conversas, tema claro, celular (375 px) e tablet (900 px);
    - desktop de 1440 px.
- **Medições no DOM**, não só olhando as capturas:
    - largura do nome no painel "você";
    - botões visíveis no cabeçalho em cada largura;
    - contraste do botão de perigo do diálogo;
    - sobreposição entre aviso e botão de enviar.
- **Leitura do código:**
    - frontend: `index.html`, todos os `ui/*.js`, `state/*.js` e o CSS;
    - backend: `protocol.js`, `room/policy.js`, comandos.
- **CSS:** levantamento de valores fora dos tokens, `z-index`, tamanhos de fonte, raios e pontos de quebra.

As capturas ficam fora do repositório. Por isso, cada item abaixo diz o que foi
observado e onde.

---

## 1. Inventário

### Telas

| Tela               | Onde                             | Arquivos                                                       |
| ------------------ | -------------------------------- | -------------------------------------------------------------- |
| Entrada (nome e @) | `.c-entry`                       | `ui/entry.js`, `css/components/entry.css`                      |
| Início             | `.c-home`                        | `ui/home.js`, `home.css`                                       |
| Conversa: sala     | `.c-header` + lista + composer   | `roomHeader.js`, `messageList.js`, `message.js`, `composer.js` |
| Conversa: privada  | Mesma estrutura, outro cabeçalho | `roomHeader.js`                                                |
| Falha / fora do ar | `.c-failure`                     | `failure.js`                                                   |
| Vazio da conversa  | `.c-empty`                       | `empty.js`                                                     |

### Painéis e navegação

| Elemento                 | Arquivos                           | Observação                                                               |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------------------ |
| Barra lateral            | `index.html`, `conversationNav.js` | Seções: Conversas (Início, Salas, Privadas), Atalhos, Moderação, Conexão |
| Painel "você"            | `index.html`, `main.js`            | Avatar, nome, @ e 4 botões: ausente, notificações, tema, sair do chat    |
| Painel de pessoas        | `people.js`, `members.css`         | Só em salas; agrupado por presença                                       |
| Redimensionadores        | `panelResize.js`                   | Barra lateral e painel de pessoas; teclado e Escape                      |
| Gavetas (celular/tablet) | `layout.js`                        | Barra lateral e pessoas; foco preso, fundo inerte                        |

### Sobreposições

| Elemento               | Tipo                          | Arquivos                           |
| ---------------------- | ----------------------------- | ---------------------------------- |
| Diálogo de confirmação | `<dialog>` modal              | `dialog.js`, `dialog.css`          |
| Cartão de pessoa       | Popover não modal             | `memberCard.js`, `member-card.css` |
| Sugestões de comando   | Listbox do campo              | `commandSuggestions.js`            |
| Dica                   | Tooltip                       | `tooltip.js`                       |
| Aviso                  | Toast                         | `toast.js`, `toast.css`            |
| Estado da conexão      | Faixa / item da barra lateral | `connection.js`                    |
| Digitando              | Linha sob a lista             | `typing.js`                        |

### Formulários

1. Entrada: nome e @.
2. Início:
    - Nova sala (nome opcional);
    - Entrar com código (código ou link);
    - Conversa privada (`@` exato).
3. Composer: texto e comandos.

### Estados de mensagem

- Normal e agrupada (mesma pessoa em sequência).
- Própria, com o selo "você".
- De sistema: entrou, saiu.
- Aviso (`/announce`), ação (`/me`), dado ou moeda, ajuda.
- Envio: "enviando…", "enviada" ✓, "não enviada" com "Tentar de novo", e "reenviando… (tentativa N)".
- Selo "saiu" em mensagens de quem deixou a conversa.

### Componentes de base que existem hoje

| Componente                         | Existe?                         | Onde                                                                 |
| ---------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| Button / IconButton                | Sim (só CSS)                    | `button.css`: variantes `--primary`, `--ghost`, `--icon`, `--danger` |
| Input / Field                      | Sim (só CSS)                    | `field.css`                                                          |
| Textarea                           | Só o composer                   | `composer.css`                                                       |
| Select / Checkbox / Radio / Switch | **Não**                         | O switch de notificação é um botão `aria-pressed`                    |
| Tooltip                            | Sim                             | `tooltip.js`                                                         |
| Popover                            | Um só, específico               | `memberCard.js`                                                      |
| Dropdown / ContextMenu             | **Não**                         | —                                                                    |
| Modal / Dialog                     | Sim, um genérico de confirmação | `dialog.js`                                                          |
| Drawer                             | Sim                             | `layout.js`                                                          |
| Toast                              | Sim                             | `toast.js`                                                           |
| Badge                              | Sim                             | `identity.js` (`badge`)                                              |
| Avatar e presença                  | Sim                             | `identity.js`, `avatar.css`                                          |
| Tabs                               | **Não**                         | —                                                                    |
| Separator                          | Ad hoc                          | Bordas por componente                                                |
| EmptyState / ErrorState            | Parcial                         | `empty.js`, `failure.js`                                             |
| Loading / Skeleton                 | Spinner só                      | `spinner.css`                                                        |

---

## 2. Avaliação por tela

As colunas seguem as 10 perguntas da missão:

1. objetivo;
2. ação principal;
3. hierarquia;
4. navegação;
5. redundância;
6. ações difíceis de achar;
7. informação desnecessária;
8. inconsistências;
9. estados sem retorno;
10. o que se espera.

### 2.1 Entrada

1. **Objetivo:** criar a identidade temporária (nome e @).
2. **Ação principal:** "Entrar na sala". O rótulo está **errado**: desde a Fase 4, entrar leva ao **início**, e não a uma sala.
3. **Hierarquia:**
    - boa: marca à esquerda e formulário à direita no desktop;
    - no celular, o texto de apresentação empurra o formulário para baixo da dobra.
4. **Navegação:** só o tema; correto.
5. **Redundância:** "Entrar na sala" aparece no título do formulário **e** no botão.
6. —
7. **Informação desatualizada:**
    - "Sala aberta · tempo real" (não existe mais "a" sala);
    - "Único na sala" (o @ é único **no servidor**, entre as identidades vivas);
    - a `meta description` fala em "sala única".
8. **Inconsistência:** o texto contradiz as regras atuais (ver acima).
9. **Retorno:** o erro de @ ocupado vem do servidor e aparece no campo. Correto.
10. **Esperado:**
    - "Entrar" ou "Começar";
    - "Único entre quem está conectado";
    - formulário visível sem rolar a 375 px.

### 2.2 Início

1. **Objetivo:** escolher entre criar uma sala, entrar com código, abrir uma privada ou voltar a uma conversa.
2. **Ação principal:** **nenhuma em destaque**. São três cartões de mesmo peso, e o botão "Criar sala" tem o mesmo tom dos outros.
3. **Hierarquia:**
    - o sobretítulo "INÍCIO" repete o título "Olá, …";
    - a lista "Suas conversas" fica abaixo dos três cartões. Com conversas abertas, é ela que importa.
4. **Navegação:** "Início" na barra lateral. É o mesmo padrão do botão de mensagens diretas do Discord, mas sem a lista de privadas ao lado.
5. **Redundância:** a lista de conversas do início repete a lista da barra lateral.
6. —
7. **Informação desnecessária:** o sobretítulo.
8. —
9. **Retorno:** recusas do servidor aparecem no próprio cartão. Correto.
10. **Esperado:**
    - no desktop, ação primária clara ("Nova sala");
    - "Suas conversas" vazia com orientação (estado vazio);
    - no celular, ou cartões compactos ou uma lista de ações.

### 2.3 Conversa — sala

1. **Objetivo:** ler e escrever na sala, ver quem está nela.
2. **Ação principal:** escrever. O composer está no lugar certo.
3. **Hierarquia:**
    - o cabeçalho mostra nome, código de convite como tópico e ícones;
    - o tópico com o código é ruído: quem precisa do código usa "Copiar convite".
4. **Navegação:** a barra lateral lista as conversas. Correto.
5. **Redundância:**
    - "Comandos" está no cabeçalho **e** em Atalhos, na barra lateral;
    - o selo "VOCÊ" aparece em **toda** mensagem própria, além de no painel de pessoas.
6. **Ações difíceis de achar:**
    - limpar a tela e "Apagar para todos" ficam na barra lateral, longe da conversa a que se aplicam;
    - não há menu da sala (no Discord, fica no nome da sala).
7. **Informação desnecessária:** o selo "VOCÊ" repetido.
8. **Inconsistências:**
    - o `**negrito**` digitado aparece literal, mas existe `/bold`. A formatação existe só por comando;
    - o ✓ "enviada" fica na ponta direita da linha, longe do texto.
9. **Sem retorno:** nenhum caso encontrado. Os estados de envio estão cobertos.
10. **Esperado:**
    - cabeçalho com o nome da sala e ações agrupadas;
    - "começo da conversa" no topo da lista (introdução da sala, convite);
    - Markdown básico (negrito, itálico, código) renderizado **sem HTML** (nós de texto);
    - menu de contexto nas mensagens.

### 2.4 Conversa — privada

1. **Objetivo:** conversar a dois.
2. **Ação principal:** escrever.
3. **Hierarquia:** o cabeçalho mostra @, presença, bloquear e encerrar.
4. **Navegação:** a seção "Privadas" na barra lateral.
5. —
6. **Ações difíceis de achar:** o perfil da outra pessoa; não há painel nem cartão a partir do cabeçalho.
7. —
8. **Inconsistência:** em salas, o cartão de pessoa abre pelo painel. Na privada, não há como abrir o cartão da outra pessoa.
9. **Retorno:** encerrada ou bloqueada aparecem como aviso. Correto.
10. **Esperado:**
    - painel de perfil à direita (referência: segunda captura do Discord), com nome, @, presença, "Copiar @" e "Bloquear";
    - no celular, uma gaveta;
    - "começo da conversa" com a pessoa.

### 2.5 Barra lateral

1. **Objetivo:** navegar entre conversas.
2. **Ação principal:** escolher uma conversa.
3. **Hierarquia:** mistura quatro assuntos — Conversas, Atalhos, Moderação e Conexão — com o mesmo peso de seção.
4. —
5. **Redundância:** "Comandos" também no cabeçalho.
6. **Ações difíceis de achar:** criar sala ou abrir privada só pelo início. Não há "+" ao lado de "Salas" nem de "Privadas", como no Discord.
7. **Informação desnecessária:** a seção "Conexão" quando está tudo bem. O estado só importa quando cai.
8. **Inconsistências:**
    - "CONVERSAS" em caixa alta, mas "Salas" e "Privadas" em caixa normal;
    - os subtítulos têm estilos diferentes.
9. —
10. **Esperado:**
    - só conversas: Início, Salas (com +) e Privadas (com +);
    - ações da conversa no cabeçalho ou no menu da conversa;
    - conexão como faixa só quando houver problema.

### 2.6 Painel "você"

- **Medido a 1440 px:** o nome tem **35 px de 91 px necessários** ("An…", "@a…"). Os 4 botões tomam o espaço.
- **Esperado (padrão do Discord):**
    - nome e @ legíveis;
    - no máximo 2 ou 3 ícones;
    - o resto num menu do próprio painel (ausente, notificações, tema, sair).

### 2.7 Painel de pessoas

- **Problema:** o próprio nome trunca ("A…") porque os selos VOCÊ e ANFITRIÃO ficam na mesma linha.
- **Ação escondida:** a ação está toda num cartão que só abre por clique; não há menu de contexto.
- **Esperado:**
    - selos menores ou em segunda linha;
    - clique abre o cartão (perfil);
    - clique direito, Shift+F10 ou a tecla de menu abrem o menu de ações.

### 2.8 Celular (375 px)

- **Cabeçalho medido:** menu, convite, sair, comandos e pessoas, todos visíveis. "Bloquear" fica oculto, como deve numa sala. A suspeita de faltar o botão de pessoas **não se confirmou**.
- **Problema:** com 5 ícones, o nome da sala fica estreito, e "Sair da sala" (ação destrutiva) fica ao lado de ações comuns.
- **Esperado:** no celular, um menu "⋯" com convite, comandos e sair; pessoas fica visível.

---

## 3. Modais, menus e popovers

| Item                 | Diálogo                         | Cartão de pessoa                                       | Gavetas                        | Sugestões            | Dica                  | Aviso                       |
| -------------------- | ------------------------------- | ------------------------------------------------------ | ------------------------------ | -------------------- | --------------------- | --------------------------- |
| Tamanho e posição    | Centro, largura máxima em token | Junto ao gatilho, preso à janela                       | Lateral, 18rem (fora do token) | Acima do campo       | Junto ao alvo         | Canto inferior direito      |
| Botão fechar         | Cancelar                        | **Não tem**                                            | Sim                            | —                    | —                     | —                           |
| Clique fora          | Fecha                           | Fecha                                                  | Fecha                          | Perde o foco e fecha | —                     | —                           |
| Escape               | Fecha (nativo)                  | Fecha (captura)                                        | Fecha                          | Fecha                | Fecha primeiro a dica | —                           |
| Foco inicial         | Cancelar                        | Primeira ação                                          | Primeiro item                  | Fica no campo        | —                     | —                           |
| Foco de volta        | Sim                             | Sim                                                    | Sim                            | —                    | —                     | —                           |
| Teclado              | Foco preso nativo               | Tab percorre; **sem setas**                            | Foco preso                     | Setas, Tab e Enter   | Mostra no foco        | —                           |
| Telas pequenas       | OK                              | **Fecha no `resize`**: o teclado virtual pode fechá-lo | OK                             | OK                   | —                     | **Cobre o botão de enviar** |
| Rolagem              | —                               | Sem limite de altura com muitas ações                  | Própria                        | Própria              | —                     | —                           |
| Camada               | `top layer`                     | `--z-popover`                                          | `--z-drawer` + 1 (ad hoc)      | `--z-popover`        | `--z-toast`           | `--z-toast`                 |
| Carregando / retorno | Não tem estado de "enviando"    | Aviso ao copiar                                        | —                              | —                    | —                     | —                           |

**Medido:** com um aviso aberto a 1440 px, a caixa ocupa x 1040–1424 e y
822–888. O botão de enviar começa em (1147, 835). **O aviso cobre o botão de
enviar** enquanto está na tela (`pointer-events: none` deixa o clique passar,
mas o botão fica escondido).

**Medido:** o botão de perigo do diálogo tem branco sobre `rgb(185, 28, 28)`,
com contraste de **6,47:1**. Passa no AA. A suspeita de contraste ruim **não se
confirmou**.

**Cartão de pessoa:**

- "Silenciar" e "Liberar" aparecem **juntos**, sem saber se a pessoa está silenciada;
- o silêncio é sempre de 10 min, sem escolha;
- "Silenciar" não pede confirmação, e "Remover" pede.

---

## 4. Regras de negócio (como estão)

Fontes: `backend/src/protocol.js`, `room/policy.js`, `room/*.js`, comandos e
`frontend/src/state/*`.

### Identidade

- Nome de exibição (até 60 caracteres) e `@username` (3 a 20 caracteres; minúsculas, números, `.` e `_`).
- O @ é **único entre as identidades vivas do servidor**.
- A identidade é temporária e fica só em memória. Depois de uma queda, volta com o token de retomada em até 2 min.
- O token fica só em memória no navegador; nada vai para `localStorage` além do tema.
- O id interno nunca sai num evento. Só administradores o veem, por `/users`, `/profile` e `/id`.

### Conversas

- Uma identidade participa de várias salas e privadas ao mesmo tempo.
- **Sala:**
    - criada sob pedido; quem cria é o **anfitrião**;
    - entra-se pelo código ou link de convite;
    - sair de uma sala não encerra o chat.
- **Privada:**
    - aberta pelo `@` exato, nunca por busca parcial;
    - "encerrar" some para os dois, com o histórico;
    - "bloquear" vale até o fim da sessão, afeta só privadas e é silencioso para quem é bloqueado ("encerrou").
- Número de autor por conversa: dado pelo servidor, fixo e sem relação entre conversas.
- Histórico em memória: no máximo 500 mensagens por conversa no cliente.

### Papéis

- **Administrador:**
    - global, pela chave `/admin`;
    - não pode ser moderado.
- **Anfitrião:**
    - modera só a própria sala;
    - não modera outro anfitrião;
    - só é moderado por um administrador.
- **Moderação:**
    - `/mute @ N`, `/unmute`, `/kick`;
    - `/clearall` (apagar o histórico para todos, com confirmação);
    - `/announce`.

### Mensagens

- Até 1000 caracteres.
- Formatação só por comando (`/bold`, `/italic`, `/me`) e emoticons aplicados pelo servidor.
- Envio confirmado pelo servidor e deduplicado por `clientMsgId`. Uma falha mostra "Tentar de novo".
- Recusas definitivas devolvem o texto ao rascunho da conversa certa.
- Rascunho por conversa, só em memória.

### Notificações

- Só depois que a pessoa ativa.
- Sem conteúdo: "Nova mensagem" e o nome da sala, ou "Conversa privada".

### Questões para decidir antes de mudar

| #   | Pergunta                                                   | Recomendação                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Renderizar Markdown digitado (`**x**`, `*x*`, `` `x` ``)?  | **Sim, no cliente**, com nós de texto e elementos (`strong`, `em`, `code`), sem HTML. O conteúdo enviado não muda, e o servidor não muda. `/bold` e `/italic` continuam.                                         |
| Q2  | O cartão deve saber se alguém está silenciado?             | Exige um campo novo em `user_list`, ou seja, **mudança de contrato**. Proponho deixar para depois. Por ora, mostrar "Silenciar" e "Liberar" num submenu de moderação, com a duração escolhida (5, 10 ou 60 min). |
| Q3  | Tirar "Atalhos", "Moderação" e "Conexão" da barra lateral? | Sim. Nenhuma função some: elas vão para o cabeçalho e o menu da conversa. A conexão vira uma faixa que só aparece com problema.                                                                                  |
| Q4  | Painel de perfil na privada?                               | Sim, só com o que o cliente já recebe (nome, @, presença). Sem mudança de contrato.                                                                                                                              |
| Q5  | Selo "você" em toda mensagem própria?                      | Tirar das mensagens e manter no painel de pessoas e no leitor de tela (o texto fica oculto, mas presente).                                                                                                       |

---

## 5. Problemas priorizados

Nenhum problema **crítico** foi encontrado: nada que impeça o uso, exponha dados
ou quebre a segurança.

| #   | Gravidade | Problema                                                                                                                                  | Onde                          | Evidência                      |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------ |
| P1  | **Alto**  | O texto da entrada contradiz as regras: "Entrar na sala", "Sala aberta", "Único na sala" e a `meta description`                           | `index.html`, `strings.js`    | Captura 01 e código            |
| P2  | **Alto**  | O aviso cobre o botão de enviar                                                                                                           | `toast.css`                   | Medido: as caixas se sobrepõem |
| P3  | **Alto**  | O painel "você" trunca o nome e o @ (35 de 91 px)                                                                                         | `index.html`, `sidebar.css`   | Medido                         |
| P4  | **Alto**  | O próprio nome trunca no painel de pessoas por causa dos selos                                                                            | `members.css`, `people.js`    | Captura 05                     |
| P5  | Médio     | A barra lateral mistura navegação, atalhos, moderação e conexão; a caixa dos títulos é inconsistente                                      | `index.html`, `sidebar.css`   | Captura 05                     |
| P6  | Médio     | Não há menu de contexto (clique direito, Shift+F10) em mensagens, pessoas e conversas                                                     | —                             | Código                         |
| P7  | Médio     | Não há painel de perfil na privada                                                                                                        | `layout.js`                   | Captura 10                     |
| P8  | Médio     | Markdown digitado aparece literal                                                                                                         | `message.js`                  | Captura 05                     |
| P9  | Médio     | Selo "VOCÊ" em toda mensagem própria                                                                                                      | `message.js:297`              | Captura 05                     |
| P10 | Médio     | Não há "começo da conversa" no topo da lista                                                                                              | `messageList.js`              | Capturas 05 e 10               |
| P11 | Médio     | Cartão de pessoa: "Silenciar" e "Liberar" juntos, sem estado; silêncio fixo de 10 min; sem setas                                          | `memberCard.js`               | Código                         |
| P12 | Médio     | O cartão de pessoa fecha em qualquer `resize`, inclusive quando o teclado virtual abre no celular                                         | `memberCard.js:216`           | Código                         |
| P13 | Médio     | O início não tem ação primária; o sobretítulo repete o título; a lista de conversas fica depois dos cartões                               | `home.js`, `home.css`         | Capturas 03 e 12               |
| P14 | Médio     | Cabeçalho no celular: 5 ícones, e "Sair da sala" ao lado de ações comuns                                                                  | `roomHeader.js`, `header.css` | Medido e captura 15            |
| P15 | Baixo     | O tópico da sala mostra o código de convite                                                                                               | `roomHeader.js`               | Captura 05                     |
| P16 | Baixo     | O ✓ "enviada" fica afastado do texto                                                                                                      | `message.css`                 | Captura 05                     |
| P17 | Baixo     | O foco do composer é uma borda vermelha forte                                                                                             | `composer.css`                | Captura 05                     |
| P18 | Baixo     | Não há "+" para criar sala ou abrir privada pela barra lateral                                                                            | `conversationNav.js`          | Código                         |
| P19 | Baixo     | Os pontos de quebra (30, 47.99, 63.99, 64 e 90rem) e as larguras de painel (18rem) não estão em tokens; o `z-index` usa `calc(+1)` ad hoc | CSS                           | Levantamento                   |
| P20 | Baixo     | Faltam componentes de base: Menu/ContextMenu, Popover genérico, Switch, Tabs, Skeleton                                                    | —                             | Inventário                     |

### O que já está bom

Isto deve ser preservado no redesign:

- Tokens de cor, tipografia, espaço e raio já centralizados. Todos os tamanhos de fonte e raios usam tokens.
- Diálogo nativo (`<dialog>`) com foco preso, Escape e foco de volta.
- Gavetas com foco preso e fundo inerte.
- Dicas que seguem a WCAG 1.4.13.
- Estados de envio completos e acessíveis.
- `prefers-reduced-motion` respeitado em `motion.css` e `tokens.css`.
- Nenhum `innerHTML`; tudo é `textContent` ou elementos.

---

## 6. Próxima fase (B)

A Fase B vai propor, sem implementar:

- o sistema de design (tokens que faltam e os componentes da lista);
- a nova estrutura de barra lateral, cabeçalho e painéis;
- as decisões Q1 a Q5;
- o plano em PRs pequenos e os riscos de regressão.
