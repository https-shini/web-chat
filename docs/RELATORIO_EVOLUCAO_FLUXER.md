# Relatório — Evolução da aplicação com base no Fluxer

> Plano mestre: `FLUXER_AUDITORIA_E_PLANO.md` (branch `feat/ux-audit-discord`).
> Estratégia aprovada: **E1**. O Fluxer (AGPL-3.0) foi usado como referência
> de padrões e de modelo de dados, **sem copiar código**. Das bibliotecas MIT
> que o Fluxer usa, foi adotada só `@floating-ui/dom` (versão fixa 1.6.13).
> O projeto continua MIT.

## 1. Entregas (PRs empilhados, todos em rascunho)

| PR                                                     | Branch                 | Conteúdo                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#13](https://github.com/https-shini/web-chat/pull/13) | `feat/ui-01-fundacao`  | Primitivos: menu acessível (padrão APG, submenu, busca por letra, folha inferior no celular), menu de contexto (clique direito, Shift+F10, tecla Menu, toque longo), posicionamento com floating-ui; correções de texto, avisos e foco do campo |
| [#14](https://github.com/https-shini/web-chat/pull/14) | `feat/ui-02-navegacao` | Menu lateral na ordem pedida (Início, Comandos, Fixadas, Salas, Privadas, Perfil no rodapé); fixar e reordenar (arrastar e teclado); filtro "Não lidas"; Ctrl K; botão "+"; páginas Comandos e Perfil                                           |
| [#15](https://github.com/https-shini/web-chat/pull/15) | `feat/ui-03-painel`    | Painel de contexto igual para sala e privada: informações, ações rápidas, integrantes com filtro e menu, moderação (silenciar ▸ 5/10/60 min/até liberar), sair e bloquear                                                                       |
| [#16](https://github.com/https-shini/web-chat/pull/16) | `feat/ui-04-composer`  | Campo de mensagem com várias linhas (até 20 linhas, também no servidor), barra de formatação, atalhos, contador, teclado virtual (`visualViewport`)                                                                                             |
| [#17](https://github.com/https-shini/web-chat/pull/17) | `feat/ui-05-historico` | Markdown seguro (só nós DOM), menções, agrupamento por autor e tempo, separador de dia, "Novas mensagens", voltar ao fim, ações da mensagem por barra, menu e teclado                                                                           |
| [#18](https://github.com/https-shini/web-chat/pull/18) | `feat/ui-06-mensagens` | Servidor e interface: responder, editar, apagar (própria e moderação), reações (12 emojis fixos), mensagens fixadas, descrição da sala, silêncio com prazo                                                                                      |
| [#19](https://github.com/https-shini/web-chat/pull/19) | `feat/ui-10-celular`   | Celular em pilha: lista → conversa → dados, cada uma na tela toda; voltar do Android/navegador desce um nível; 44 px no cabeçalho                                                                                                               |
| [#20](https://github.com/https-shini/web-chat/pull/20) | `feat/ui-11-validacao` | Validação final, a conversa fica presa ao fim quando o campo cresce, roteiro manual de acessibilidade atualizado e este relatório                                                                                                               |
| [#21](https://github.com/https-shini/web-chat/pull/21) | `feat/ui-12-decisoes`  | Aviso ao sair, densidade compacta, avisos de menção; revisão da documentação                                                                                                                                                                    |

Ordem de merge: #13 → #14 → #15 → #16 → #17 → #18 → #19 → #20 → #21, um por
vez, com a sua autorização e com o CI verde em cada etapa. Nada foi mesclado
nem publicado.

## 2. O que veio do Fluxer

| Elemento do Fluxer                                                                   | Como foi usado                                                                                              | Onde ficou                                      |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `ui/action_menu/*`, `menu_bottom_sheet`                                              | **Adaptado (padrão):** um menu por entidade, montado por grupos; folha inferior no celular                  | `ui/primitives/menu.js`, `contextMenu.js`       |
| `@floating-ui/dom` (MIT)                                                             | **Reutilizado (biblioteca)**                                                                                | `ui/primitives/position.js`                     |
| `KeybindCommands.ts` (atalhos)                                                       | **Adaptado (lista de referência):** subconjunto — Ctrl K, ↑ editar, Esc, Shift+F10, Ctrl+Shift+↑/↓, Alt+↑/↓ | `main.js`, `sidebarNav.js`, `messageList.js`    |
| Arrastar acessível (`dnd_*`)                                                         | **Adaptado (padrão):** pegar, setas, soltar ou cancelar pelo teclado                                        | `ui/nav/sidebarNav.js`                          |
| Rótulo do item de privada (`DMListItem.tsx`)                                         | **Adaptado:** nome, não lidas, fixada e presença no rótulo                                                  | `ui/nav/sidebarNav.js`                          |
| Modelo de mensagem (`message_reference`, `edited_timestamp`, reações, `pinned`)      | **Adaptado (modelo de dados)** para o nosso protocolo                                                       | `backend/src/room/messageOps.js`, `protocol.js` |
| Agrupamento (mesmo autor, mesmo dia, < 7 min), "Novas mensagens", voltar ao presente | **Reimplementado** com as mesmas regras                                                                     | `ui/messageList.js`                             |
| Barra de resposta, edição no lugar, ↑ edita a última                                 | **Reimplementado**                                                                                          | `ui/composer.js`, `ui/message.js`, `main.js`    |
| Markdown (Rust/WASM)                                                                 | **Não reutilizado:** exigiria `wasm-unsafe-eval` na CSP e React. Subconjunto próprio em JS, com testes      | `markdown/parse.js`, `render.js`                |
| Fixadas na conta (`pinned_dms`)                                                      | **Não aplicável:** não há contas. Fixar e ordenar ficam em memória (D1)                                     | `state/navigation.js`                           |
| Experiência móvel (React)                                                            | **Reconstruído:** pilha de telas sobre os componentes atuais                                                | `ui/layout.js`                                  |

Nenhum arquivo do Fluxer foi copiado: não há código AGPL no repositório.

## 3. Preservação

- **Contrato:** só cresceu (eventos novos, campos opcionais). O teste de contrato confere que frontend e backend estão espelhados.
- **Permissões:** conferidas no servidor:
    - editar só a própria mensagem;
    - apagar a própria, ou qualquer uma para quem modera;
    - fixar só quem modera, ou as duas pessoas numa privada;
    - descrição só quem modera.

    A interface só esconde o que não é permitido.

- **Privacidade:** nenhum id interno sai do servidor. As reações usam `@username#autor`, que já é público na conversa. O teste de ids no tráfego roda em todos os E2E.
- **Segurança:**
    - sem `innerHTML` com conteúdo não confiável;
    - CSP e o hash do script de tema inalterados;
    - links com `noopener noreferrer`;
    - reações só da lista fixa.
- **Armazenamento:** o navegador só guarda o tema. Fixadas, ordem, rascunhos e posição de rolagem ficam em memória.
- **Testes antigos:** nenhum foi apagado nem enfraquecido. Quando um lugar ou um texto mudou, o seletor foi atualizado e a verificação continua a mesma, por exemplo o `09-painel`, que agora procura o texto neutro do silêncio.

## 4. Revisão final (PR 12)

A tabela com o commit validado de cada PR, o resultado do CI e dos testes
locais está na descrição do PR #21. Ela fica lá e não num commit, porque um
commit novo mudaria o que foi validado.

### 4.1 Como cada PR foi validado

Em cada branch, no commit mais recente, numa cópia separada (worktree), foram
rodados os mesmos passos do CI:

- `format:check`, `lint` (ESLint, Stylelint, tipos e contraste), `build` e
  `npm test` (frontend e backend);
- auditoria das dependências de produção;
- o E2E completo **três vezes**, para expor instabilidade.

Depois disso, o CI do GitHub rodou de novo em cada PR.

### 4.2 Problemas encontrados e corrigidos na revisão

- **Teste instável no PR 3** (`09-painel`): o axe media o contraste durante a
  animação de entrada. A causa foi corrigida na raiz: o `axe()` do harness
  espera as animações finitas terminarem (`document.getAnimations()`).
- **Esperas por tempo fixo:** oito delas podiam falhar sem motivo numa
  máquina lenta e foram trocadas por esperas pela condição:
    - axe depois de animação;
    - aviso do servidor depois de `/mute` e `/unmute`, que antes era uma
      corrida entre conexões;
    - dois quadros depois de uma rolagem;
    - a condição de "última mensagem à vista".
- **Falha real no CI do PR 12** (3 de 3 execuções): "Ficar no chat" conferia o
  histórico antes de a resposta do diálogo ser aplicada. O teste passou a
  esperar o estado final. Depois disso, o CI ficou verde.
- **Esperas por tempo que ficaram:** seis, todas em verificações de
  _ausência_ ("a mensagem silenciada não chega", "não pede de novo"). Uma
  espera assim pode deixar passar um erro, mas nunca falha sem motivo; três
  delas já existiam no `main`.
- **Documentação desatualizada:**
    - `PROTOCOLO.md` não tinha os eventos do PR 6 nem as várias linhas do
      PR 4. Foi corrigido no PR de origem e levado adiante por merge;
    - o README dizia "nenhuma dependência de runtime no frontend" e tinha a
      tabela "O que não existe" e os números de contraste desatualizados;
    - o `design-system.md` descrevia o layout antigo;
    - um comentário do `ci.yml` estava desatualizado.

    Hoje, todos os eventos (20 do cliente, 25 do servidor), os 34 códigos de
    erro, os limites e os 12 emojis estão no protocolo, conferidos por script.

- **Bug antigo:** um aviso de sistema numa conversa de fundo zerava as não
  lidas. Foi corrigido, e há teste.

### 4.3 Regressões

- **Testes unitários:** dos 510 títulos do `main`, três mudaram de nome, por
  mudanças de regra aprovadas: várias linhas (C1) e a janela de 7 minutos do
  agrupamento. As asserções continuam exatas nos limites (6:59 agrupa, 7:00
  não). Nenhum teste foi removido.
- **E2E:** as 81 verificações dos roteiros 01 a 07 do `main` continuam
  presentes e passando.

### 4.4 Pendências e verificações não realizadas

- **Foco do menu no PR 2** (`08-navegacao`, "o menu abre com o foco no
  primeiro item"): falhou **1 vez em 41** execuções do CI, no commit 707f793,
  e não foi reproduzida.
    - Tentativas: 10 execuções locais com a CPU 6× mais lenta, 40 aberturas
      de menu com a lista sendo redesenhada sem parar e o roteiro real 25
      vezes.
    - Causas descartadas pelo código e por teste: o menu escondido no
      momento do foco; um segundo atalho Shift+F10; a atualização do próprio
      menu; o redesenho da lista tomando o foco (ele só devolve o foco se o
      foco já estava na lista).
    - Hipótese restante (não comprovada): algo do ambiente do CI, como a
      emulação de foco com duas páginas no mesmo navegador.
    - O teste agora diz onde estava o foco quando falha. Continua como
      pendência.
- **CodeQL:**
    - o PR #13, contra o `main`, deu "No new alerts in code changed by this
      pull request";
    - a análise do código da pilha inteira rodou com sucesso na branch final
      (execução 43561215646, 167 arquivos JS);
    - **a lista de alertas não pôde ser lida neste ambiente**: não há
      ferramenta de _code scanning_, e baixar a CLI do CodeQL foi bloqueado.
      A consulta fica na aba Security do GitHub;
    - cada PR ganha a sua própria verificação do CodeQL quando a base dele
      passar a ser o `main`.
- **Leitores de tela** (NVDA, VoiceOver, TalkBack): **não executados**. O
  ambiente não tem interface gráfica nem esses sistemas. A limitação está em
  `ACESSIBILIDADE_TESTES_MANUAIS.md`.
- **PR #5** (`feat/connection-feedback`, anterior a esta pilha): continua
  aberto contra o `main`, sem conflito com a pilha (conferido com um merge de
  teste).

## 5. Pendências (registro anterior, PR 11)

1. **Testes manuais com leitores de tela** (NVDA, VoiceOver, TalkBack): o roteiro está em `ACESSIBILIDADE_TESTES_MANUAIS.md` (seções 10 a 13 novas) e **ainda não foi executado**. A acessibilidade não pode ser declarada só pela automação.
2. **CodeQL:** só roda nos PRs contra `main`. Como os PRs estão empilhados, cada um passa pelo CodeQL quando o anterior for mesclado e a base dele mudar para `main`.
3. **Merge sequencial** dos PRs #13 a #19 e do PR 11: depende da sua autorização, um por vez, com CI verde.
4. **Documentação do site do Fluxer:** `fluxer.com` e `docs.fluxer.com` não resolvem neste ambiente. A análise usou o repositório (`fluxer_docs` incluído). Vale conferir o blog e o roadmap na próxima análise.
5. **Decisões em aberto:**
    - avisar antes de sair da página no celular (`beforeunload`), já que voltar na lista encerra a sessão efêmera;
    - densidade compacta;
    - notificação de menção (hoje é só destaque e aviso em texto).
6. **Fora do escopo** (exige contas, armazenamento ou infraestrutura): voz e vídeo, anexos, emoji próprio, busca em todo o histórico, persistência entre sessões.
