# Proposta — menus laterais

> Branch `feat/ux-audit-discord`. **Proposta para aprovação, sem implementação.**
> Aprofunda as seções 2, 3 e 5 do `PLANO_FASE_B.md` (navegação à esquerda e
> painel de contexto à direita). Mantém a ordem obrigatória da diretriz:
> Início, Perfil, Fixadas, Salas, Privadas e Comandos.
>
> As imagens em `docs/fase-b/nav-*.png` vêm do mesmo protótipo estático, com os
> tokens reais. Os balões amarelos numerados são anotações, não fazem parte da
> interface. Os nomes são fictícios.

---

## 1. Diagnóstico da navegação atual

Não é um problema de estética. São problemas de percurso, medidos no app atual
(`index.html`, `conversationNav.js`, `people.js`, `memberCard.js`).

| #   | Problema                                                                                                   | Efeito para quem usa                                              |
| --- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| N1  | Para criar uma sala, entrar com código ou abrir uma privada, é preciso **sair da conversa** e ir ao Início | 3 a 4 passos e perda do contexto                                  |
| N2  | Não há como ir direto a uma conversa: só rolando a lista ou com Tab item por item                          | Com 15 conversas, até 15 Tabs                                     |
| N3  | **Cada conversa é uma parada de Tab**                                                                      | Quem usa o teclado atravessa a lista inteira para chegar ao resto |
| N4  | Não lidas fora da área visível não aparecem                                                                | Mensagens perdidas em listas longas                               |
| N5  | As seções não recolhem                                                                                     | A lista cresce sem controle; salas e privadas disputam espaço     |
| N6  | "Início" fica sob o título "Conversas"; Atalhos, Moderação e Conexão têm o mesmo peso das conversas        | Hierarquia confusa (auditoria, P5)                                |
| N7  | O painel "você" corta o nome (35 de 91 px) para caber 4 ícones sem rótulo                                  | Identidade ilegível; ícones ambíguos (P3)                         |
| N8  | Nenhuma ação sobre a conversa a partir da lista (fixar, sair, copiar convite)                              | É preciso abrir a conversa primeiro                               |
| N9  | Painel de pessoas: a lista é plana, sem filtro, e todas as ações ficam num cartão de clique único          | Em salas grandes, achar alguém exige rolar (P4, P11)              |
| N10 | No celular e no tablet, as gavetas cobrem tudo, e o cartão de pessoa fecha quando o teclado abre           | Navegação frágil no toque (P12)                                   |

---

## 2. Navegação esquerda (proposta)

Imagem: `nav-states.png`.

```
┌──────────────────────────────┐
│ ■ web-chat          [+] [‹]  │  marca · nova conversa · recolher
│ [⌕ Ir para conversa   Ctrl K]│  ir para qualquer conversa sua
│ ⌂ Início                     │  3.1
│ (AS) Ana Souza          ⌄    │  3.2 Perfil: clique abre o menu rápido
│      @ana · online           │
│ [Tudo] [Não lidas 3]         │  filtro
│ ⌄ FIXADAS               2    │  3.3 (recolhível)
│   PF Projeto final           │
│ • CL Caio Lima @caio     (2) │
│ ⌄ SALAS             2    +   │  3.4 (recolhível, + contextual)
│ • T3 Turma 3B            (5) │
│   JS Estudos de JS    📌 ⋯   │  ao passar o ponteiro: fixar e ⋯
│ › PRIVADAS         (1)   +   │  3.5 recolhida: total de não lidas
│                              │
│      [↓ 1 não lida abaixo]   │  aparece só se houver não lida fora da vista
├──────────────────────────────┤
│ / Comandos               [/] │  3.6, fixo no rodapé
└──────────────────────────────┘
```

### 2.1 O que muda e por quê

| Elemento                            | Proposta                                                                                                                                                                                                                                                                                               | Resolve                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| **Botão "+" (Nova conversa)**       | Popover com três abas: Nova sala, Com código e Privada. Os mesmos formulários e validações do Início, sem sair da conversa (`nav-novo.png`). O "+" de cada seção abre a aba certa.                                                                                                                     | N1: de 3 a 4 passos para 1 clique e Enter    |
| **Ir para conversa (Ctrl K)**       | Diálogo de busca **só nas suas conversas** (nome e @), com setas e Enter (`nav-switcher.png`). Se o texto for um @ válido, oferece "Conversa privada com @x". Isso usa a busca exata que já existe no servidor; nada é listado, e não há busca parcial no servidor. Também oferece "Criar a sala 'x'". | N2                                           |
| **Perfil compacto**                 | Uma linha: avatar com presença, nome e @, **sem cortar**. O clique abre o menu rápido (`nav-menus.png`): Online ou Ausente (com motivo), Notificações (chave), Tema, Perfil e preferências, e Sair do chat (com confirmação).                                                                          | N7                                           |
| **Filtro Tudo / Não lidas**         | Mostra só as conversas com não lidas, mantendo as seções. Só no navegador.                                                                                                                                                                                                                             | N4                                           |
| **Seções recolhíveis**              | Botão de seção com `aria-expanded`. Recolhida, mostra o total de não lidas da seção. O estado fica em memória.                                                                                                                                                                                         | N5                                           |
| **Item compacto, de uma linha**     | 36 px de altura: ícone (sala) ou avatar com presença (privada), nome e @ ou "ausente" em cinza. Selo de não lidas. Ponto à esquerda e negrito quando há não lidas. O nome completo e os detalhes ficam no rótulo acessível e na dica.                                                                  | Densidade: cabem cerca de 40% mais conversas |
| **Ações ao passar o ponteiro**      | Fixar ou desafixar, e "⋯". O mesmo menu abre com clique direito, Shift+F10, a tecla de menu ou uma pressão longa no toque.                                                                                                                                                                             | N8                                           |
| **Aviso de não lida fora da vista** | Pílula "↓ N não lidas abaixo" (ou "acima"). O clique rola até a primeira.                                                                                                                                                                                                                              | N4                                           |
| **Comandos fixo no rodapé**         | Sempre visível, sem rolar. A dica mostra o atalho "/".                                                                                                                                                                                                                                                 | —                                            |
| **Faixa de conexão**                | Só aparece com problema, no topo da navegação (`nav-mobile.png`).                                                                                                                                                                                                                                      | N6                                           |
| **Recolher para trilho**            | Botão "‹": a navegação vira um trilho de 72 px, com Início, você e os ícones das conversas, separados por grupo. Cada ícone tem selo e indicador de não lida, e a dica mostra nome e tipo (`nav-rail.png`).                                                                                            | Espaço em telas médias                       |

**Menu "⋯" da conversa** (igual ao do clique direito):

- Fixar ou Desafixar;
- Mover para cima ou para baixo;
- Marcar como lida;
- Copiar convite (sala) ou Copiar @ (privada);
- separador;
- Sair da sala… ou Encerrar conversa….

### 2.2 Fixar e reordenar

Imagem: `nav-drag.png`.

- **Fixar:** o item vai para "Fixadas" e sai da lista de origem; ao desafixar, volta à posição anterior (D4 do plano).
- **Reordenar:**
    - arrastar com o ponteiro; no toque, com pressão longa;
    - uma linha carmim mostra onde o item vai cair;
    - vale dentro de cada seção e, se a pessoa juntar as listas, numa lista só.
- **Pelo teclado:** com o item focado, **Ctrl+Shift+↑/↓** (⌘+Shift no macOS), ou "Mover para cima/baixo" no menu.
    - O leitor de tela anuncia: "Estudos de JS, posição 2 de 3 em Fixadas".
    - Este atalho **substitui** o Alt+Shift+↑/↓ que estava no `PLANO_FASE_B.md`: Alt+Shift fica para "próxima não lida", que é o padrão consagrado (seção 4).
- **Lista mista:** no "⋯" do título "Fixadas", a opção "Separar salas e privadas" (ligada por padrão). Desligada, as seções Salas e Privadas viram uma só, "Conversas", em ordem livre.

---

## 3. Painel direito (proposta)

Imagem: `nav-states.png`, à direita.

- **Cabeçalho compacto** (ícone, nome e "Sala · 5 pessoas · você é anfitriã"), depois as ações rápidas: Convidar, Fixar e Limpar tela.
    - Ocupa cerca de 130 px, contra 260 px na versão da Fase B, para que os **integrantes apareçam sem rolar**.
- **Blocos recolhíveis**, nesta ordem:

    | Bloco           | Conteúdo                                                                                                                                                                                                      | Padrão                                         |
    | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
    | Integrantes · N | Filtro por nome ou @; grupos "Online" e "Ausentes" (recolhíveis); selos ao lado do nome sem cortá-lo; ao passar o ponteiro, "Mensagem privada" e "⋯" (o menu do integrante, com a moderação quando permitida) | Aberto                                         |
    | Convite         | O código e o botão de copiar                                                                                                                                                                                  | Recolhido (já há "Convidar" nas ações rápidas) |
    | Ações           | Limpar minha tela; Apagar histórico para todos… (só quem pode); Sair da sala…                                                                                                                                 | Aberto                                         |

- **Privada:** o mesmo esqueleto, com "Dados do contato" (presença por texto e cor), as ações rápidas Copiar @, Fixar e Limpar tela, e o bloco Ações com Encerrar… e Bloquear….
- **Larguras:** o painel continua redimensionável, como hoje. Com o painel estreito, as ações rápidas viram só ícones, com dica.

---

## 4. Teclado e leitores de tela

| Contexto              | Teclas                                   | O que fazem                                                              |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Em qualquer lugar     | **Ctrl K** (⌘K no macOS)                 | Abre "Ir para conversa"                                                  |
| Em qualquer lugar     | **Alt+↑ / Alt+↓**                        | Conversa anterior ou seguinte, na ordem da lista                         |
| Em qualquer lugar     | **Alt+Shift+↑ / ↓**                      | Conversa não lida anterior ou seguinte                                   |
| Lista de conversas    | **↑ ↓ Home End**                         | Move o foco. A lista inteira é **uma parada de Tab** (_roving tabindex_) |
| Lista de conversas    | **Enter / Espaço**                       | Abre a conversa                                                          |
| Lista de conversas    | **→ / ←** no título de uma seção         | Expande ou recolhe                                                       |
| Lista de conversas    | **Shift+F10 / tecla de menu**            | Menu da conversa                                                         |
| Lista de conversas    | **Ctrl+Shift+↑ / ↓**                     | Move a conversa                                                          |
| Menus                 | Setas, Home, End, letras, Enter e Escape | Padrão APG de menu. Escape devolve o foco a quem abriu                   |
| Painel de integrantes | **↑ ↓** dentro da lista                  | Igual à lista de conversas                                               |

**Semântica:**

- a navegação continua um `nav`, com uma lista (`ul`) por seção;
- o título da seção é um `button` com `aria-expanded` e `aria-controls`;
- cada item é um `button`, com `aria-current="page"` no atual, como hoje;
- o rótulo acessível continua dizendo o tipo, o @, a presença e as não lidas (`conversationNav.js`);
- os anúncios usam a região `role="status"` que já existe: "fixada", "posição 2 de 3", "seção recolhida, 1 não lida".

**Atalhos que o navegador já usa:** Ctrl K abre a busca na barra de endereços
do Chrome e do Firefox. A página toma o atalho só com o foco dentro do app, como
fazem os apps de mensagens; nos outros casos, o navegador continua com ele.
Alt+↑ e Alt+↓ não colidem com nada no campo de mensagem.

---

## 5. Estados visuais

Todos com tokens existentes; nenhuma cor nova.

| Estado         | Item de conversa                                                                            | Título de seção                                                                      | Integrante                             |
| -------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| Padrão         | Texto secundário, fundo transparente                                                        | Rótulo em caixa alta, cinza                                                          | Nome e @                               |
| Hover          | `--color-bg-hover`; aparecem fixar e "⋯"; o selo de não lidas dá lugar às ações             | Texto principal                                                                      | Fundo de hover; aparecem privada e "⋯" |
| Foco (teclado) | Anel `--color-focus-ring` de 2 px, por dentro (não é cortado na rolagem)                    | Idem                                                                                 | Idem                                   |
| Selecionado    | `--color-bg-selected` e uma barra carmim de 3 px à esquerda                                 | —                                                                                    | —                                      |
| Não lida       | Texto principal em seminegrito, ponto à esquerda e selo carmim                              | Recolhida: o selo soma                                                               | —                                      |
| Recolhido      | —                                                                                           | Seta "›"; aberto: "⌄" com transição de 150 ms (nenhuma com `prefers-reduced-motion`) | Grupo recolhido                        |
| Arrastando     | O item levanta com sombra; na origem fica fantasma (35%); uma linha carmim mostra o destino | Recebe o item se ele cair numa seção recolhida                                       | —                                      |
| Desabilitado   | `--color-text-disabled`, sem hover (por exemplo, "Mover para cima" no primeiro)             | —                                                                                    | —                                      |
| Vazio          | —                                                                                           | Fixadas vazia: "Fixe pelo ⋯ de uma conversa"; Privadas vazia: "Abra uma pelo +"      | "Ninguém com esse nome" no filtro      |

As áreas de toque são de 36 px com ponteiro e 44 px com `pointer: coarse`.

---

## 6. Responsividade

| Largura      | Esquerda                                                                                                     | Direita                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| ≥ 1280 px    | Expandida, 272 px (redimensionável, como hoje); pode ser recolhida em trilho pelo "‹"                        | Aberta, 340 px                                               |
| 1024–1279 px | **Trilho de 72 px por padrão**; o "≡" expande por cima, como folha                                           | Aberta, empurrando o centro (é o trilho que libera o espaço) |
| 768–1023 px  | Trilho                                                                                                       | Folha sobre o centro                                         |
| < 768 px     | **Tela própria**: a lista é a tela principal (`nav-mobile.png`), sem "Ctrl K" visível; a busca vira um campo | Tela cheia, com "← voltar" (D2 do plano)                     |

**No toque:**

- uma pressão longa abre o menu da conversa;
- arrastar começa só depois da pressão longa, para não confundir com rolar;
- nenhum menu ou painel fecha só porque o teclado virtual mudou a altura da janela (corrige P12).

---

## 7. Nada se perde

Mapa de cada função atual para o lugar novo:

| Hoje                                          | Na proposta                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Início (barra lateral)                        | Início, primeiro item                                                  |
| Lista de salas e privadas                     | Fixadas, Salas e Privadas; menu da conversa                            |
| Atalhos · Comandos                            | Comandos, no rodapé; `/` no campo                                      |
| Atalhos · Limpar minha tela                   | Painel direito → Ações; ação rápida "Limpar tela"                      |
| Moderação · Apagar para todos                 | Painel direito → Ações (só quem pode)                                  |
| Conexão                                       | Faixa só com problema; o estado continua anunciado por `role="status"` |
| "Você": ausente                               | Menu rápido do perfil → Ausente… (e `/afk`)                            |
| "Você": notificações                          | Menu rápido → Notificações; página Perfil                              |
| "Você": tema                                  | Menu rápido → Tema; página Perfil                                      |
| "Você": sair do chat                          | Menu rápido → Sair do chat…; página Perfil                             |
| Redimensionar a barra lateral                 | Mantido, e também o modo trilho                                        |
| Painel de pessoas e cartão                    | Painel direito → Integrantes, com o menu do integrante                 |
| Copiar convite (cabeçalho)                    | Mantido no cabeçalho; também nas ações rápidas e no menu da conversa   |
| Sair da sala, encerrar e bloquear (cabeçalho) | Painel direito → Ações; menu da conversa                               |

**Uma troca honesta:** ficar ausente, trocar o tema e ligar as notificações
passam de **1 clique** (ícones no painel "você") para **2** (abrir o menu
rápido e escolher). Em troca:

- o nome e o @ ficam legíveis;
- cada opção ganha rótulo, em vez de um ícone ambíguo;
- os 4 botões deixam de disputar espaço.

São ações raras, e `/afk` continua a 1 comando. Se preferir manter 1 clique
para "Ausente", a alternativa é tornar o próprio ponto de presença do avatar um
botão que alterna Online e Ausente.

---

## 8. Decisões para aprovar

| #   | Decisão                                                                                                                              | Recomendação                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| M1  | Botão "+" com as três formas de começar, sem ir ao Início                                                                            | Sim                                          |
| M2  | "Ir para conversa" (Ctrl K), só nas suas conversas mais o @ exato                                                                    | Sim                                          |
| M3  | Perfil compacto com menu rápido (2 cliques para ausente, tema e notificações)                                                        | Sim. Alternativa: ponto de presença clicável |
| M4  | Item de uma linha (36 px)                                                                                                            | Sim                                          |
| M5  | Lista com uma parada de Tab e setas (muda o comportamento de teclado atual; os testes de teclado são atualizados, não enfraquecidos) | Sim                                          |
| M6  | Trilho de 72 px como padrão entre 1024 e 1279 px                                                                                     | Sim                                          |
| M7  | Guardar entre sessões só "trilho ou expandido" e "Separar salas e privadas", como o tema (não identificam conversa nenhuma)          | Opcional. O padrão proposto é só em memória  |
| M8  | Atalhos: Alt+↑/↓, Alt+Shift+↑/↓ e Ctrl+Shift+↑/↓ para mover                                                                          | Sim                                          |

As decisões D1 a D6 do `PLANO_FASE_B.md` continuam pendentes e valem aqui
também (especialmente D1, a persistência só em memória, e D4, o item fixado
sai da lista de origem).

---

## 9. Como entra no plano de PRs

Os menus laterais ocupam os PRs 2 e 3 do plano, divididos assim:

1. **PR 2a · Navegação esquerda:**
    - estrutura, seções recolhíveis e item compacto;
    - perfil compacto com menu rápido;
    - Comandos no rodapé e faixa de conexão;
    - lista com uma parada de Tab.
2. **PR 2b · Painel direito:** blocos recolhíveis, integrantes agrupados com filtro, menu do integrante e ações.
3. **PR 3a · Organização:** fixar, menu da conversa, reordenar (ponteiro, toque e teclado), lista mista e filtro "Não lidas".
4. **PR 3b · Atalhos:** botão "+", "Ir para conversa", Alt+setas, trilho e pílula de não lidas.

O PR 1 (fundação: menu, popover e folha) continua sendo o primeiro, porque
todos os menus acima dependem dele.

Em cada PR:

- testes de unidade do estado novo (fixadas, ordem, seções, limpeza ao sair);
- E2E de teclado e de toque;
- axe;
- as suítes atuais completas.
