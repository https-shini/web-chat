# Fase 5 · Relatório de implementação — redesign de UI/UX

> **Data:** 2026-11-07 · **Branch:** `claude/quirky-brown-37zb70` · **Base:** commit
> `b524397` (fim da Fase 4).
> Escopo: redesign completo da interface, com referência visual em aplicativos de
> chat em comunidade (barra lateral, conversa, lista de pessoas) e identidade própria.
> Referências: [`design-system.md`](./design-system.md) (v2),
> [`historico/design-system-v1.md`](./historico/design-system-v1.md) (anterior),
> [`FASE_4_RELATORIO_DE_IMPLEMENTACAO.md`](./FASE_4_RELATORIO_DE_IMPLEMENTACAO.md).

## 1. Resumo executivo

A interface foi refeita inteira: tokens, tipografia, layout em painéis, todos os
componentes e as interações (gavetas, cartão de pessoa, modal, dicas, toasts,
esqueleto). **Nenhuma funcionalidade foi removida, nenhum contrato de API mudou
e o backend não foi tocado.** Os botões novos executam comandos que já existiam,
pelo mesmo caminho do campo de mensagem; o servidor continua validando tudo.

| Item                                               | Resultado                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Telas e estados migrados                           | Entrada, sala (vazia, carregando, com mensagens, reconectando, falha, removido) |
| Componentes base                                   | 24 (tabela em `design-system.md` §4)                                            |
| Testes automatizados                               | 265 → **271** (frontend 74, backend 197), todos verdes                          |
| E2E do redesign (navegador real)                   | **80/80** verificações em 1280, 900, 390 e 360px, dois temas                    |
| E2E de regressão da Fase 4                         | **27/27** (seletores da lista de pessoas atualizados)                           |
| axe-core (WCAG 2.0/2.1/2.2 A e AA + boas práticas) | **0 violações** em 16 telas/estados                                             |
| Contraste medido                                   | 71 pares × 2 temas = **142/142**                                                |
| Erros de console (dev e build)                     | Nenhum                                                                          |
| Lint (ESLint, Stylelint), tipos, formatação, build | Verdes                                                                          |
| Backend alterado                                   | Não                                                                             |
| Dependências novas                                 | Nenhuma (axe-core rodou de fora do projeto, só para a auditoria)                |

## 2. Auditoria da interface anterior

| Aspecto            | Antes                                                                | Problema                                                                |
| ------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Layout             | Coluna única com "fio da sessão" à esquerda e pessoas no rodapé/topo | Não escalava para administração, presença e moderação da Fase 4         |
| Ações da Fase 4    | Só por comando digitado                                              | Moderação e presença pouco descobríveis                                 |
| Pessoas            | Lista simples com rótulos                                            | Sem agrupamento por papel/presença, sem ação a partir da pessoa         |
| Mensagens          | Cada mensagem com cabeçalho completo                                 | Ruído visual em conversa rápida                                         |
| Tipografia         | Duas famílias (Atkinson + Syne)                                      | Funcional, mas sem hierarquia de interface densa                        |
| Toasts             | Fora de região live                                                  | Não anunciados (pendência F5-01)                                        |
| Semântica da lista | `<ol role="log">`                                                    | Papel não permitido em `<ol>`; itens perdiam a semântica de lista (axe) |
| Responsividade     | Uma coluna adaptada                                                  | Sem gavetas, sem padrão para painéis laterais                           |

## 3. Design system (resumo; detalhes em `design-system.md`)

- **Paleta** a partir das cores de referência (`#313338`, `#2B2D31`, `#1E1F22`,
  `#383A40`, `#5865F2`, `#F2F3F5`, `#B5BAC1`, `#949BA4`, `#3F4147`, `#23A559`,
  `#F0B232`, `#F23F43`), **ajustada para contraste**:
    - `#949BA4` como texto de metadado sobre `#383A40` não passa: `--color-text-3`
      virou `#a3a9b3`;
    - o azul, o verde e o vermelho de referência reprovam como texto; ficaram como
      preenchimento e ponto de status, com tokens de texto próprios;
    - o vermelho destrutivo é `#da373c`, para o texto branco por cima passar 4.5:1;
    - tema claro completo, com verde mais escuro para o ponto de presença (3:1).
- **Tipografia:** Inter 400–800, escala 11 → 32px.
- **Escalas:** espaço (grade de 4px), raio (4/8/12/pílula), sombras, durações,
  camadas, larguras de painel.

## 4. O que mudou na interface

### 4.1 Layout

- **Barra lateral:** marca; sala `# sala-aberta` (atual); atalhos _Comandos_ e
  _Limpar minha tela_; _Administração → Apagar para todos_ (só para admin);
  estado da conexão; painel "você" com avatar, nome, presença, botão de
  ausência e tema.
- **Cabeçalho:** `#` + nome + tópico, pílula de estado (só quando não está
  conectado), ajuda, pessoas com contagem; ☰ em telas estreitas.
- **Conversa:** linhas com avatar de 40px, nome na cor da pessoa, selo "você",
  hora; mensagens seguidas da mesma pessoa (menos de 5 min) agrupadas sem
  cabeçalho, com a hora na calha ao passar o ponteiro.
- **Pessoas:** grupos _Administradores — N_, _Online — N_, _Ausentes — N_, com
  ponto de presença e texto do motivo da ausência.

### 4.2 Interações

| Interação                | Comportamento                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Gavetas (< 64 / < 48rem) | Fundo escurecido, resto da tela `inert`, foco entra, `Escape`/toque no fundo fecham, foco volta a quem abriu    |
| Cartão de pessoa         | Popover ao lado da lista; folha presa à base no celular; `Escape` e clique fora fecham                          |
| Modal                    | `<dialog>` nativo para _Apagar para todos_ e _Remover da sala_; foco começa em _Cancelar_                       |
| Dicas                    | Hover e foco por teclado; `Escape` dispensa sem mover o foco (1.4.13)                                           |
| Toasts                   | `role="status"`; quando repetem uma falha já anunciada pela conversa, ficam só visuais (um fato, um anúncio)    |
| Carregamento             | Esqueleto enquanto a primeira conexão não chega                                                                 |
| Microinterações          | Entrada de mensagem, gaveta, popover, modal e sugestões animados; tudo instantâneo com `prefers-reduced-motion` |

### 4.3 Controles novos e o que executam

Todos usam o caminho único `submit()` em `main.js` (o mesmo do campo de
mensagem), então passam pelo roteamento de comandos e pela validação e
autorização do servidor.

| Controle                        | Executa                          |
| ------------------------------- | -------------------------------- |
| Comandos (barra, cabeçalho)     | `/help`                          |
| Limpar minha tela               | `/clear`                         |
| Apagar para todos               | modal → `/clearall confirmar`    |
| Ausência (painel "você")        | `/afk`                           |
| Ver perfil completo             | `/profile <id>`                  |
| Copiar id                       | Área de transferência            |
| Ficar ausente / Trocar meu nome | `/afk` / preenche `/nick `       |
| Silenciar / Liberar             | `/mute <id> 10` / `/unmute <id>` |
| Remover da sala                 | modal → `/kick <id>`             |

Ações de moderação só aparecem para quem a lista do servidor marca como admin.
O papel exibido vem da própria entrada em `user_list`, porque o evento `session`
só informa o papel no momento da entrada (depois de um `/admin` ele ficaria
desatualizado). É só apresentação: a permissão é conferida a cada comando no
servidor.

## 5. Arquivos

| Área       | Arquivos                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens     | `css/tokens.css` (reescrito), `scripts/contrast.pairs.json` (71 pares)                                                                                                                                                        |
| Base       | `css/base/{reset,typography,a11y,motion}.css`                                                                                                                                                                                 |
| Novos CSS  | `avatar`, `brand`, `conversation`, `dialog`, `header`, `icon`, `member-card`, `members`, `sidebar`, `tooltip`                                                                                                                 |
| Reescritos | `app-shell`, `button`, `command-suggestions`, `composer`, `connection`, `empty`, `entry`, `failure`, `field`, `message`, `message-list`, `skip-link`, `toast`, `typing`                                                       |
| Removidos  | `identity.css` (→ `avatar.css`), `people.css` (→ `members.css`), `theme-toggle.css`, `thread.css` (o "fio" saiu; o estado vive na barra e na pílula)                                                                          |
| Novos JS   | `ui/icons.js`, `ui/layout.js`, `ui/dialog.js`, `ui/tooltip.js`, `ui/memberCard.js`, `ui/userPanel.js`                                                                                                                         |
| Alterados  | `index.html`, `main.js`, `i18n/strings.js`, `ui/{composer,connection,identity,message,messageList,people,themeToggle,toast}.js`, `state/events.js` (ícone de entrada/saída, toast sem anúncio duplo), `state/store.js` (tipo) |
| Testes     | `test/grouping.test.js` (novo, 6 testes), `test/events.test.js` (toast visual-only)                                                                                                                                           |

Preservados de propósito: o script inline de tema (byte a byte; o hash na CSP
continua válido, verificado), os ids `campo-nome` e `campo-mensagem` com
`maxlength` 30 e 1000 (conferidos por `backend/test/unit/contract.test.js`), a
região `[data-announcer]`, o combobox de comandos e toda a lógica de entrega,
reconexão e retomada.

## 6. Testes e resultados

| Verificação                                        | Resultado                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                         | 74 + 197 = 271, 0 falhas                                                                                                                                                                                                                                                                                                                                         |
| `npm run lint` (ESLint, Stylelint, tsc, contraste) | Verde                                                                                                                                                                                                                                                                                                                                                            |
| `npm run format:check`                             | Verde                                                                                                                                                                                                                                                                                                                                                            |
| `npm run build`                                    | CSS 38.7 kB (6.9 kB gzip), JS 46.5 kB (17.0 kB gzip)                                                                                                                                                                                                                                                                                                             |
| Build de produção servido (`vite preview`)         | Sem erros de console; CSP intacta                                                                                                                                                                                                                                                                                                                                |
| E2E redesign (80 verificações)                     | Entrada, validação, tema, foco, esqueleto, vazio, agrupamento, selo "você", digitação, atalhos, ausência, admin, modal (Escape, cancelar, confirmar), cartão (ações por papel, copiar, perfil, silenciar, liberar, nome), painel no desktop, dicas, tablet (gaveta, `inert`, foco), celular (☰, fundo, folha), remoção, queda e volta da conexão, console limpo |
| E2E de regressão da Fase 4 (27)                    | Verde                                                                                                                                                                                                                                                                                                                                                            |
| axe-core, 16 estados × 2 temas                     | 0 violações                                                                                                                                                                                                                                                                                                                                                      |

Durante a validação apareceram e foram corrigidos:

1. botões de fechar gaveta e ☰ visíveis no desktop (ordem da cascata);
2. faixa de "digitando…" sem altura reservada;
3. papel de admin não refletido depois de `/admin`;
4. `role="log"` em `<ol>` (violação do axe, herdada da versão anterior);
5. cartão de pessoa com fundo sempre escuro no tema claro (1.92:1);
6. hora do anúncio a 4.21:1 no hover do tema escuro (tingimento fixado em 8 %, 4.57:1);
7. toasts que repetiam, para leitor de tela, uma falha já anunciada.

## 7. Roadmap da Fase 5

| Tarefa                                       | Situação                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| F5-01 Toasts anunciados                      | **Concluída**: `role="status"`, sem anúncio duplo, teste atualizado                        |
| F5-02 Indicador "mensagens novas"            | Pendente                                                                                   |
| F5-03 Semântica de tempo e separador de data | Parcial: `<time datetime>` em todas as horas; separador de data pendente                   |
| F5-04 Contador no composer                   | Pendente                                                                                   |
| F5-05 Multilinha                             | Pendente (condicional a V06)                                                               |
| F5-06 Auditoria manual com leitores de tela  | Pendente: a auditoria automática (axe) foi feita, a manual com NVDA/VoiceOver/TalkBack não |

## 8. Riscos residuais e pendências

| Item                                                            | Observação                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Verificação com leitores de tela reais                          | Não executada neste ambiente (F5-06)                                                                    |
| Fonte Inter via Google Fonts                                    | Mesmo provedor já autorizado na CSP; sem a rede, cai na pilha de sistema                                |
| Ações de moderação mostradas pela lista do servidor             | Apresentação apenas; o servidor recusa quem não é admin                                                 |
| "Liberar mensagens" aparece mesmo para quem não está silenciado | `user_list` não informa silenciamento; o servidor responde "não está silenciado" (sem efeito colateral) |
| Push, merge, PR                                                 | Não realizados: aguardam autorização                                                                    |
