# Deploy no Render · web-chat

A infraestrutura está descrita em [`render.yaml`](../render.yaml) (Blueprint do
Render). Este guia explica o que o arquivo contém, como aplicá-lo com segurança e
como verificar o resultado.

## Serviços

| Serviço         | Tipo                  | Origem              | Build                     | Execução    | Saúde      |
| --------------- | --------------------- | ------------------- | ------------------------- | ----------- | ---------- |
| `chat-backend`  | Web service (Node 22) | `backend/`          | `npm ci --omit=dev`       | `npm start` | `/healthz` |
| `chat-frontend` | Site estático (Vite)  | raiz do repositório | `npm ci && npm run build` | —           | —          |

Os dois publicam automaticamente a cada commit no `main` (`autoDeployTrigger: commit`).

**Por que `/healthz` e não `/readyz` no health check:** `/readyz` responde 503 quando
a sala está no teto de conexões. Como health check, isso faria o Render reiniciar o
serviço exatamente no momento de maior uso. `/healthz` só confirma que o processo
responde.

## Variáveis de ambiente

| Serviço         | Variável          | Valor                                     | Natureza                                  |
| --------------- | ----------------- | ----------------------------------------- | ----------------------------------------- |
| `chat-backend`  | `NODE_VERSION`    | `22`                                      | Pública — igual ao CI                     |
| `chat-backend`  | `ALLOWED_ORIGINS` | `https://chat-frontend-g42t.onrender.com` | Pública                                   |
| `chat-backend`  | `ADMIN_KEY`       | definida no painel (`sync: false`)        | **Segredo** — nunca no repositório        |
| `chat-frontend` | `NODE_VERSION`    | `22`                                      | Pública                                   |
| `chat-frontend` | `VITE_SOCKET_URL` | `wss://chat-backend-3sxv.onrender.com`    | Pública — embutida no JavaScript no build |

As demais variáveis do backend (limites, heartbeat, métricas) usam os padrões do
código; a lista completa está no [README](../README.md#configuração-do-ambiente).

### Origens permitidas (`ALLOWED_ORIGINS`)

O backend só aceita o handshake do WebSocket vindo das origens listadas. Conexões
**sem** cabeçalho `Origin` também são recusadas (403).

Para autorizar outro domínio (por exemplo, um domínio próprio):

1. Escreva a origem completa: esquema + host [+ porta], sem barra final e sem
   caminho. Exemplo: `https://chat.exemplo.com.br`.
2. Acrescente-a separada por vírgula:
   `https://chat-frontend-g42t.onrender.com,https://chat.exemplo.com.br`.
3. Não use curinga (`*`) nem prefixo: a comparação é exata.
4. Atualize também o `connect-src` da CSP do frontend se o **backend** mudar de
   endereço (ver abaixo).

Isso protege contra páginas de terceiros abrindo o WebSocket pelo navegador de
alguém. **Não é autenticação**: fora do navegador, o cabeçalho `Origin` pode ser
forjado por qualquer script.

## Cabeçalhos do site estático

| Cabeçalho                 | Valor (resumo)                                                                         | Para quê                                            |
| ------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `Content-Security-Policy` | igual à do `index.html` + `frame-ancestors 'none'`; `connect-src` só o backend oficial | `frame-ancestors` só funciona como cabeçalho HTTP   |
| `X-Frame-Options`         | `DENY`                                                                                 | Proteção contra clickjacking em navegadores antigos |
| `X-Content-Type-Options`  | `nosniff`                                                                              | Sem adivinhação de tipo de arquivo                  |
| `Referrer-Policy`         | `strict-origin-when-cross-origin`                                                      | Não vaza caminho e parâmetros para outros sites     |
| `Permissions-Policy`      | câmera, microfone, localização, pagamento, USB desligados                              | O chat não usa nenhum desses recursos               |
| `Cache-Control`           | `/assets/*` imutável por 1 ano; `/index.html` sempre revalidado                        | Arquivos com hash no nome nunca mudam               |

**Se o script de tema do `index.html` mudar**, o hash `sha256-…` muda: atualize-o no
`<meta>` da CSP **e** no `render.yaml`, ou o tema deixa de ser aplicado antes da
primeira pintura.

## Como aplicar o Blueprint

Os serviços já existem e foram criados pelo painel. O `render.yaml` só passa a
valer quando um Blueprint é ligado a ele:

1. No painel do Render: **New → Blueprint**, escolha o repositório `web-chat` e o
   arquivo `render.yaml`.
2. O Render mostra o **plano de mudanças** antes de aplicar. Confira que os
   serviços `chat-backend` e `chat-frontend` aparecem como **existentes** (não
   como novos) e que as mudanças esperadas são:
    - backend: build `npm ci --omit=dev`, health check `/healthz`,
      `NODE_VERSION=22`, `ALLOWED_ORIGINS`;
    - frontend: build `npm ci && npm run build`, `NODE_VERSION=22`, cabeçalhos.
3. Preencha `ADMIN_KEY` quando pedido (ou mantenha a já configurada).
4. Aplique e acompanhe os dois deploys.

Para aplicar só a restrição de origem, sem Blueprint: no serviço `chat-backend`,
**Environment → Add Environment Variable** → `ALLOWED_ORIGINS` com o valor acima,
e salve (o Render faz um novo deploy).

## Verificação depois do deploy

```bash
curl -sS https://chat-backend-3sxv.onrender.com/healthz
```

```bash
curl -sSI https://chat-frontend-g42t.onrender.com/ | grep -iE "content-security|x-frame|permissions|referrer"
```

E no navegador, em https://chat-frontend-g42t.onrender.com:

- entrar com nome completo e nome de usuário;
- enviar `/ping` (resposta só para você);
- abrir o console: nenhuma violação de CSP;
- Sair: volta para a entrada e o nome de usuário fica livre.

Uma página de outro domínio que tente abrir o WebSocket deve receber 403.

## Plano gratuito

Os dois serviços estão no plano gratuito. O backend "dorme" depois de um período
sem uso e leva alguns segundos para acordar; como a sala vive na memória, cada
reinício (inclusive cada deploy) apaga mensagens, participantes e usernames
reservados.
