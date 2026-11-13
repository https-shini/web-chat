# Evolução · Fase 6 — Atualização do Vite (5 → 6)

> Branch `chore/phase6-vite6`, a partir da `main`. Mudança só de ferramenta de
> desenvolvimento e build: nada no código do app muda. Sem merge e sem deploy
> sem autorização.

## Por que agora

O `npm audit` passou a acusar avisos em ferramentas de **desenvolvimento**. A
produção não é afetada: 0 avisos nas dependências do frontend e 0 no backend.

| Pacote                                                    | Gravidade | O que é                                                                                                                                                            | Onde age                                 |
| --------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `vite` 5.4.21                                             | alta      | Travessia de caminho em `.map` de dependências otimizadas; script de outra origem via middleware; `server.fs.allow`/`deny` contornáveis; `launch-editor` (Windows) | Servidor de desenvolvimento              |
| `esbuild` 0.21.5                                          | moderada  | Qualquer site pode mandar requisições ao servidor de desenvolvimento e ler a resposta                                                                              | Servidor de desenvolvimento              |
| `brace-expansion`, `fast-uri`, `js-yaml`, `source-map-js` | alta      | Negação de serviço por CPU e confusão de URI                                                                                                                       | Dependências do ESLint, Stylelint e Vite |
| `postcss-selector-parser`                                 | moderada  | Complexidade quadrática                                                                                                                                            | Dependência do Stylelint                 |

## Versões consideradas

| Opção                                | Corrige tudo?                                                                                 | Risco                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Vite 5.4.x mais novo                 | Não: os avisos do Vite e do esbuild exigem versão principal nova                              | —                                                                    |
| **Vite 6.4.6** (escolhida)           | **Sim.** Os avisos do Vite são corrigidos a partir da 6.4.4, e o Vite 6 já usa esbuild ≥ 0.25 | Baixo: mudanças de quebra só em áreas que o projeto não usa (abaixo) |
| Vite 7.x                             | Sim                                                                                           | Node ≥ 20.19 e mais mudanças, sem ganho para este projeto agora      |
| Vite 8.x (sugerida pelo `npm audit`) | Sim                                                                                           | Alto: troca o empacotador (Rolldown); merece fase própria            |

## Mudanças de quebra do Vite 6 contra o projeto

Fonte: guia oficial de migração (`docs/guide/migration.md` na tag `v6.4.6` do
repositório do Vite).

| Mudança                                                                   | Afeta o projeto?                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Padrão de `resolve.conditions` / `ssr.resolve.conditions`                 | Não: não configuramos                                             |
| `json.stringify` passa a `'auto'`                                         | Não: não importamos JSON no frontend                              |
| Mais elementos HTML com referência a recurso processada                   | Não: o `index.html` gerado é idêntico, só os nomes com hash mudam |
| `postcss-load-config` v6                                                  | Não: não há configuração de PostCSS                               |
| Sass com a API moderna por padrão                                         | Não: não usamos Sass                                              |
| Nome do CSS em modo biblioteca                                            | Não: não é biblioteca                                             |
| SSR, `terser`, `commonjsOptions`, globs com intervalos, `fs.cachedChecks` | Não usados                                                        |
| Node                                                                      | Exige 18, 20 ou ≥ 22; CI e Render usam 22                         |

Plugins: o projeto não usa nenhum plugin do Vite.

## O que mudou

- `package.json`: `vite` `^5.4.21` → `^6.4.6`.
- `package-lock.json`, 39 entradas, todas esperadas e conferidas uma a uma:
    - Vite 6.4.6 e o esbuild 0.25.12 dele, com os binários por plataforma;
    - `tinyglobby` (novo, exigido pelo Vite 6);
    - correções de patch/minor dentro das faixas já permitidas, pelo `npm audit fix` **sem `--force`**: `brace-expansion` 1.1.22, `fast-uri` 3.1.9, `js-yaml` 4.3.2, `postcss-selector-parser` 7.2.1 e `source-map-js` 1.2.2;
    - `cssesc` saiu, porque não é mais usado.
- Nenhuma outra dependência foi atualizada.

## Verificação

| Verificação                                   | Resultado                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm audit` (com desenvolvimento)             | **0** avisos (antes: 7)                                                                                                                                                        |
| Build                                         | O `index.html` gerado é idêntico (o hash da CSP do script de tema não muda); JS com 1 byte de diferença; CSS só com espaços diferentes do minificador (`@media (` → `@media(`) |
| Lint, Stylelint, tipos, contraste, formatação | OK                                                                                                                                                                             |
| Testes de unidade                             | Frontend 171/171, backend 353/353                                                                                                                                              |
| Servidor de desenvolvimento                   | Vite 6.4.6 sobe e serve o app                                                                                                                                                  |
| Regressões no navegador contra o Vite 6       | Ver o PR                                                                                                                                                                       |

## Como desfazer

`git revert` do merge: volta o `package.json` e o lockfile. Como o build
gerado é equivalente, nenhum ajuste de produção é necessário em nenhuma das
duas direções.

## Depois

Vite 7 e 8 (Rolldown) entram como avaliação separada, quando houver ganho
concreto. Até lá, o `npm audit` no CI continua apontando qualquer aviso novo.
