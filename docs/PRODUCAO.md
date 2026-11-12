# Produção · web-chat

> Estado em 12 nov 2026, depois da Fase 3 da evolução (conversas privadas e id
> interno fora do protocolo). Detalhes do Render em
> [`DEPLOY_RENDER.md`](./DEPLOY_RENDER.md).

## Como o projeto vai para o ar

| Peça     | Onde                                  | Como publica                                                        |
| -------- | ------------------------------------- | ------------------------------------------------------------------- |
| Backend  | Render, serviço web `chat-backend`    | A cada commit na `main`: `npm ci --omit=dev` e `npm start`          |
| Frontend | Render, site estático `chat-frontend` | A cada commit na `main`: `npm ci && npm run build`, publica `dist/` |
| CI       | GitHub Actions (`.github/workflows/`) | Lint, tipos, contraste, testes e build em todo push e PR            |

**Mesclar um PR na `main` é publicar.** Não há etapa manual entre o merge e o
deploy.

## O que não existe (e por isso não precisa de cuidado)

- **Banco de dados, arquivos e migrações:** não há. Todo o estado (identidades,
  salas, conversas privadas, mensagens, bloqueios) vive na memória do processo.
- **Backup:** não há o que copiar. Por decisão de produto, nada é guardado.
- **Dados que sobrevivem a um deploy:** nenhum. Cada deploy do backend reinicia o
  processo e encerra todas as salas e conversas. As pessoas conectadas veem
  "reconectando", entram de novo como identidades novas e precisam de uma sala nova.
  Publique em horário de pouco uso.

## Pendências antes de considerar a produção protegida

Estas duas dependem de mudar a configuração do Render, o que só é feito com
autorização de quem é dono da conta. Foram conferidas por leitura em 12 nov 2026.

| Pendência                                                         | Situação conferida                                                                  | Como resolver                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **`ALLOWED_ORIGINS` no `chat-backend`**                           | Não definida: o servidor aceitou WebSocket vindo de uma origem qualquer (HTTP 101)  | Painel do Render → `chat-backend` → Environment → `ALLOWED_ORIGINS=https://chat-frontend-g42t.onrender.com` |
| **Cabeçalhos de segurança do site** (CSP, `X-Frame-Options` etc.) | Só `X-Content-Type-Options` é enviado: o Blueprint (`render.yaml`) não foi aplicado | Aplicar o Blueprint ou cadastrar os cabeçalhos no painel (ver `DEPLOY_RENDER.md`)                           |

Sem a primeira, qualquer página de terceiros pode abrir conexões com o servidor
usando o navegador de quem a visita. Sem a segunda, a página pode ser embutida em
outro site (clickjacking); a CSP do `<meta>` continua valendo para scripts.

Outras pendências, não bloqueantes:

- `ADMIN_KEY`: sem ela, não há administrador (anfitriões continuam moderando as
  próprias salas). Defina só no painel, nunca em arquivo versionado.
- Plano gratuito do Render: o backend dorme sem uso e leva até 1 min para acordar. A
  tela de entrada já explica a espera.
- Verificação manual com leitores de tela (NVDA, VoiceOver, TalkBack) ainda não
  feita.
- Testes de navegador (Playwright) rodam à mão, fora do CI.

## Variáveis de ambiente

Todas têm padrão seguro; nenhuma variável nova desta fase precisa ser definida.

| Variável                                                      | Serviço  | Obrigatória em produção | Observação                                              |
| ------------------------------------------------------------- | -------- | ----------------------- | ------------------------------------------------------- |
| `ALLOWED_ORIGINS`                                             | backend  | **Sim**                 | Origem exata do frontend; sem ela, qualquer origem vale |
| `ADMIN_KEY`                                                   | backend  | Não                     | Segredo; 16 a 200 caracteres; só no painel              |
| `NODE_ENV=production`                                         | backend  | Recomendada             | Faz a falta de `ALLOWED_ORIGINS` virar aviso no log     |
| `VITE_SOCKET_URL`                                             | frontend | **Sim**                 | `wss://…` do backend; embutida no build (pública)       |
| `MAX_ROOMS`, `MAX_ROOMS_PER_USER`, `MAX_DMS`, `HISTORY_SIZE`… | backend  | Não                     | Limites; ver `.env.example`                             |

O `.env` nunca é versionado (`.gitignore`); o `.env.example` não contém segredos.

## Antes de publicar

```bash
npm ci && npm --prefix backend ci
```

```bash
npm run lint && npm run format:check
```

```bash
npm test
```

```bash
npm run build
```

Tudo precisa passar. O CI repete essas etapas no PR.

## Publicar

1. Conferir o CI verde no PR.
2. Mesclar o PR na `main` (merge commit, sem squash, para o rollback ser um revert
   simples).
3. Acompanhar os dois deploys no painel do Render até "Live".
4. Verificar:

```bash
curl -sS https://chat-backend-3sxv.onrender.com/healthz
```

5. No navegador, em https://chat-frontend-g42t.onrender.com: entrar, conferir que
   o endereço virou `…/#/s/código`, abrir o link em outra aba anônima, trocar
   mensagens, `/ping`, Sair.

## Se algo der errado (rollback)

Como não há dados nem migrações, voltar atrás é só voltar o código.

- **Mais rápido:** painel do Render → serviço → Deploys → o deploy anterior →
  "Rollback to this deploy". Faça nos dois serviços: cliente e servidor precisam
  ser da mesma versão, porque o protocolo mudou nas Fases 2 e 3.
- **Definitivo:** reverter o merge na `main`, o que publica de novo a versão
  anterior:

```bash
git revert -m 1 <hash do merge>
```

```bash
git push origin main
```

Sinais de que é preciso voltar: `/healthz` sem responder depois de 2 min, log com
`handler_failed` ou `config_invalid`, ou a entrada no chat sem passar de
"Conectando".

## Observação e logs

- `GET /healthz`: vivo ou não, com contagem de conexões e sessões.
- `GET /readyz`: 503 quando está cheio ou desligando.
- `GET /metrics` (com `METRICS_ENABLED=true`): contadores, sem dados pessoais.
- Logs: uma linha JSON por evento, com ids internos e ids de conversa. Nunca trazem
  nome, `@`, conteúdo de mensagem, token, chave de administrador ou código de
  convite. Os ids internos aparecem só aqui e para administradores.
