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
| PR 11                                                  | `feat/ui-11-validacao` | Validação final, a conversa fica presa ao fim quando o campo cresce, roteiro manual de acessibilidade atualizado e este relatório                                                                                                               |

Ordem de merge: #13 → #14 → … → #19 → PR 11, um por vez, com a sua
autorização. Nada foi mesclado nem publicado.

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

## 4. Testes (último ciclo, branch `feat/ui-11-validacao`)

| Suíte                                    | Resultado                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Backend (`npm run test:back`)            | 374/374                                                                 |
| Frontend (`npm run test:front`)          | 236/236                                                                 |
| E2E com axe (`npm run test:e2e`)         | 188/188 (arquivos 01 a 13; axe sem violações sérias nas telas cobertas) |
| Lint (ESLint, Stylelint, tsc, contraste) | ok                                                                      |
| Prettier                                 | ok                                                                      |
| Build de produção (`vite build`)         | ok — JS 193 kB (64 kB gzip), CSS 89 kB (14 kB gzip)                     |
| Memória (`npm run test:memory`)          | ver seção 4.1                                                           |

Capturas conferidas a 1440, 1024 (trilho), 768 e 375 px, além de 320 e 430 px
no E2E.

### 4.1 Memória

`node scripts/memory-test.mjs` (padrão: 2 ciclos de 90 s de rotatividade a 8
pessoas/s, com repousos de 160 s, mais longos que a janela de retomada de 2 min).
**Todos os critérios passaram.**

| Medida                                    | Valor                                  |
| ----------------------------------------- | -------------------------------------- |
| Mensagens enviadas e recebidas            | 2880 / 2880, sem perda                 |
| Retomadas com o mesmo @ e a sala de volta | 360 / 360                              |
| Saídas por logout e por queda             | 540 + 540                              |
| Pico de identidades                       | 308                                    |
| Identidades depois de cada repouso        | 2 (só as residentes)                   |
| Privadas que sobraram                     | 0                                      |
| Memória (RSS) no fim do 1º repouso        | 92,9 MB                                |
| Memória (RSS) no fim do 2º repouso        | 94,2 MB (sem crescimento contínuo)     |
| Erros                                     | 0; o servidor ficou no ar o tempo todo |

## 5. Pendências

1. **Testes manuais com leitores de tela** (NVDA, VoiceOver, TalkBack): o roteiro está em `ACESSIBILIDADE_TESTES_MANUAIS.md` (seções 10 a 13 novas) e **ainda não foi executado**. A acessibilidade não pode ser declarada só pela automação.
2. **CodeQL:** só roda nos PRs contra `main`. Como os PRs estão empilhados, cada um passa pelo CodeQL quando o anterior for mesclado e a base dele mudar para `main`.
3. **Merge sequencial** dos PRs #13 a #19 e do PR 11: depende da sua autorização, um por vez, com CI verde.
4. **Documentação do site do Fluxer:** `fluxer.com` e `docs.fluxer.com` não resolvem neste ambiente. A análise usou o repositório (`fluxer_docs` incluído). Vale conferir o blog e o roadmap na próxima análise.
5. **Decisões em aberto:**
    - avisar antes de sair da página no celular (`beforeunload`), já que voltar na lista encerra a sessão efêmera;
    - densidade compacta;
    - notificação de menção (hoje é só destaque e aviso em texto).
6. **Fora do escopo** (exige contas, armazenamento ou infraestrutura): voz e vídeo, anexos, emoji próprio, busca em todo o histórico, persistência entre sessões.
