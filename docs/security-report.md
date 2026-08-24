# Auditoria de segurança · web-chat

> Escopo exclusivo: segurança da informação. Referência conceitual:
> ISO/IEC 27001 (confidencialidade, integridade, disponibilidade). Nenhuma
> alegação de conformidade ou certificação é feita — a norma é usada só
> como lente para nomear e priorizar risco.
>
> Método: leitura de todo o código versionado, dos cinco arquivos de
> configuração citados no pedido, do histórico completo do Git (68 commits,
> todos os branches, `git grep` sobre cada blob que já existiu, não só o
> estado atual), auditoria de dependências (`npm audit`) e testes
> comportamentais reais contra o servidor e o frontend rodando — não
> inspeção estática apenas.
>
> **Este documento cobre duas rodadas de auditoria** na mesma sessão de
> trabalho: a primeira (§2.1–2.10) focou no servidor; a segunda (§2.11–2.12)
> aprofundou o frontend, que na primeira passagem foi verificado só quanto a
> segredos no bundle, não quanto a controles de navegador como CSP.

---

## 1. Os cinco arquivos citados no pedido

| Arquivo             | Veredito                         | Motivo                                                                                                                                                                |
| ------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example`      | Correto, mantido                 | Só a URL local `ws://localhost:8080`, que é intencionalmente pública — é o próprio propósito do arquivo. Nenhum segredo.                                              |
| `.gitignore`        | Estava incompleto, **estendido** | Já cobria `.env*`; não tinha regra para chaves privadas, `.npmrc` ou material criptográfico. Nenhum desses arquivos existe hoje no projeto — a extensão é preventiva. |
| `.prettierignore`   | Correto, mantido                 | Só exclui `dist/`, `node_modules/` e lockfiles da formatação. Nenhuma implicação de segurança.                                                                        |
| `.prettierrc.json`  | Correto, mantido                 | Preferências de estilo puras.                                                                                                                                         |
| `.stylelintrc.json` | Correto, mantido                 | Regras de lint de CSS. Nenhuma implicação de segurança.                                                                                                               |

Nenhum dos cinco continha segredo, credencial ou informação de infraestrutura.

---

## 2. Achados

### 2.1 `ws` com CVEs conhecidas na dependência de produção — **ALTO**

**Onde:** `backend/package.json`, `ws@^8.17.0` (intervalo `8.0.0–8.20.1` vulnerável).

Três avisos de segurança publicados para o `ws` nessa faixa, incluindo
**divulgação de memória não inicializada** — o processo pode vazar bytes de
memória que não pertencem à mensagem sendo processada, e duas formas de
negação de serviço por exaustão via fragmentação/cabeçalhos HTTP.
Confidencialidade e disponibilidade, numa dependência que roda em produção
(não é ferramenta de build).

**Alteração:** `ws` atualizado para `8.21.3` (mais recente da major 8,
sem breaking change). `npm audit` no backend: **0 vulnerabilidades**
(antes: 1 alta). Testado: fluxo de login, mensagem e desconexão continuam
funcionando (suíte em `sec-test*.mjs`, descartada após o teste).

### 2.2 `vite`/`esbuild` com CVEs conhecidas — **MÉDIO** (residual, ver §4)

**Onde:** `package.json`, `vite@^5.4.10`.

Quatro avisos, incluindo path traversal no tratamento de `.map` de
dependências otimizadas e um bypass de `server.fs.deny`. Todos afetam
**exclusivamente o servidor de desenvolvimento** (`vite dev`/`esbuild`
serve), nunca o artefato de build (`dist/`) que é o que roda em produção.
São `devDependencies` — não vão para produção de forma alguma.

**Alteração:** atualizado para `5.4.21`, a última versão de patch da major
5 — confirmado consultando a lista completa de versões publicadas. As CVEs
restantes só têm correção definitiva em uma major seguinte (6.x/7.x/8.x),
que muda API de configuração e exigiria testar o pipeline de build inteiro
antes de trocar. Não forcei essa troca: um upgrade de major sem teste
extensivo é justamente o tipo de mudança que pode quebrar o build de
produção, o que violaria "preservar o funcionamento atual". Ver risco
residual em §4.

### 2.3 Nenhum limite de tamanho de mensagem no WebSocket — **ALTO**

**Onde:** `backend/src/server.js`, criação do `WebSocketServer`.

O módulo `ws` aceita, por padrão, frames de até **100 MiB cada**,
integralmente bufferizados na memória do processo antes de qualquer
validação da aplicação rodar. Um único cliente malicioso — sem
autenticação, sem login — derruba o processo por exaustão de memória com
uma única mensagem. Testado e reproduzido: um payload de 5 MiB (bem abaixo
do limite padrão do `ws`) já demonstra o caminho de ataque.

**Alteração:** `maxPayload: 16 * 1024` (16 KiB) na configuração do
`WebSocketServer`. Cobre com folga o maior payload legítimo (mensagem de
1000 caracteres em UTF-8 multibyte + envelope JSON) e faz o `ws` recusar
qualquer frame maior **antes** de bufferizá-lo. Testado: um payload de 5
MiB agora fecha a conexão com código `1009` (mensagem grande demais) e o
processo continua respondendo normalmente a outras conexões.

### 2.4 Nenhum limite de taxa de mensagens — **ALTO**

**Onde:** `backend/src/server.js`, handler `ws.on("message", ...)`.

Sem limite algum, um cliente conectado (sem autenticação prévia) pode
enviar `chat_message` em loop apertado. Cada mensagem aceita: (a) cresce
`messageHistory` em memória, (b) é retransmitida (`broadcast`) para **todos**
os clientes conectados. Um único script malicioso satura CPU e memória do
processo e a rede de todo mundo na sala — negação de serviço trivial,
documentada como risco conhecido desde a entrega anterior e agora corrigida.

**Alteração:** limitador de taxa por conexão (balde de fichas: capacidade
40, reabastecimento 8/s), aplicado a toda mensagem recebida antes de
qualquer processamento. Calibrado deliberadamente generoso: o cliente
dispara `typing_start` a **cada tecla digitada**, sem debounce — testei
digitação simulada de 15 sinais em 1,5s (10/s, mais rápido que digitação
humana real) e **100% chegaram** aos outros clientes. Um flood de 200
mensagens em rajada teve só 40 aceitas, e a conexão não caiu (o excesso é
descartado em silêncio — ver justificativa em §5).

### 2.5 Identidade do usuário aceita sem validação de tipo — **MÉDIO**

**Onde:** `backend/src/server.js`, `case "user_login"`.

`message.payload.userId` era atribuído direto a `userData.id` sem checar
tipo, tamanho ou formato. Como o payload vem de `JSON.parse` de dado
arbitrário do cliente, `userId` podia chegar como número, objeto, array,
string vazia ou de milhares de caracteres — testado: um `userId: 12345`
(número) não quebrava nada visivelmente, mas deixava o servidor confiando
num valor de tipo e forma imprevisíveis em toda mensagem subsequente
daquela conexão.

**Alteração:** `userId` passa pela mesma normalização de texto (tipo,
caracteres de controle, tamanho máximo 100) aplicada a `userName`; se
vier vazio ou de tipo errado, o servidor gera um `crypto.randomUUID()` em
vez de aceitar um valor vazio ou colidível. Testado: login com `userId`
numérico não derruba a conexão e o fluxo segue normal.

**O que isso NÃO resolve** (risco residual, ver §4): o cliente ainda
**escolhe** seu próprio `userId` — quem manda um UUID válido pode, em
tese, escolher o mesmo UUID de outra sessão já conectada. Corrigir isso de
verdade exige o servidor emitir e confirmar a identidade (um `login_ack`
que hoje não existe no protocolo), o que é mudança de protocolo, não de
validação — fora do escopo de uma correção segura e sem quebra.

### 2.6 Campo `userColor`/`color` aceito, retransmitido e sem uso — **BAIXO**

**Onde:** `backend/src/server.js`, em cinco pontos (`user_login`,
`user_joined`, `chat_message`, `user_left`, `broadcastUserList`).

O servidor lia `message.payload.userColor` do cliente sem validar,
guardava, e retransmitia para todo mundo em quatro tipos de mensagem
diferentes — sem que **nenhum** consumidor no cliente atual leia esse
campo (a cor de exibição é derivada do `id` no navegador, herança de uma
refatoração anterior que já não envia mais `userColor`). Aceitar e
retransmitir um campo sem consumidor é superfície de ataque desnecessária:
todo campo aceito de um cliente não confiável é algo que precisa ser
validado, e aqui não valia a pena porque nada usa.

**Alteração:** campo removido dos cinco pontos — nem lido, nem armazenado,
nem retransmitido. Testado: nenhuma mudança de comportamento visível
(confirmado — nenhum consumidor existia).

### 2.7 Texto do usuário sem sanitização de caracteres de controle → _log injection_ — **MÉDIO**

**Onde:** `backend/src/server.js`, função `normalizeText`, consumida por
`console.log`/`console.error` em `Cliente desconectado: ${user.name}`.

`normalizeText` fazia só `trim()` + `slice()`. Um nome de usuário com `\n`
ou `\r` embutido — ex.: `"Marina\n[FORJADO] admin logou"` — passava
integralmente para `console.log` na desconexão, forjando uma segunda linha
de log que parece ter vindo do próprio processo. Isso compromete a
**integridade dos logs**: quem audita depois não consegue mais confiar que
cada linha do log representa um evento real do sistema. É um vetor
conhecido (OWASP: log injection / log forging) e relevante para
ISO/IEC 27001 A.12.4 (registro e monitoramento).

**Alteração:** `normalizeText` remove caracteres de controle (`\x00`–`\x1f`,
`\x7f`, o que inclui `\n` e `\r`) antes de aparar e truncar — afeta
`userName`, `userId` e o conteúdo da mensagem, então cobre todo texto que
chega a um log. Testado com dois clientes reais (um observador, um
"atacante"): o nome `"Marina\n[FORJADO] admin logou\r\nsegunda linha"`
chegou ao observador como uma única linha, sem quebra alguma.

### 2.8 Sem allowlist de `Origin` no WebSocket — **MÉDIO** (não corrigido por padrão, ver §4)

**Onde:** `backend/src/server.js`, criação do `WebSocketServer`.

Qualquer site na internet pode incluir um script que abre conexão
WebSocket com este servidor — não há verificação de `Origin` no handshake.
Como não há sessão/cookie (a identidade é autodeclarada por mensagem), o
risco clássico de CSWSH (sequestro de sessão) não se aplica integralmente,
mas o risco real é **abuso de recursos por terceiros**: qualquer site pode
embutir um script que conecta e consome CPU/memória/rede do seu backend
sem o usuário saber.

**Alteração:** capacidade de allowlist via `ALLOWED_ORIGINS` (variável de
ambiente, lista separada por vírgula), **opcional** e **desligada por
padrão** — preserva o comportamento atual exatamente como está. Não
travei uma origem "chutada": eu não sei o domínio real de produção deste
projeto, e travar o valor errado derrubaria o serviço para todo mundo, o
que é pior do que o risco que estou tentando reduzir. Documentado em
`.env.example`. **Isso significa que o risco continua aberto até você
configurar a variável** — ver recomendação em §5.

### 2.9 Sem teto de conexões simultâneas — **MÉDIO**

**Onde:** `backend/src/server.js`.

Sem limite, um flood de conexões (mesmo sem enviar nenhuma mensagem)
cresce `wss.clients` sem teto, cada conexão consumindo memória e um
socket do processo. Disponibilidade.

**Alteração:** teto global de 500 conexões simultâneas — acima disso, a
conexão é recusada com código `1013` ("tente novamente"). Deliberadamente
**não** implementei limite por IP: se o deploy estiver atrás de um proxy
reverso (comum em plataformas como a mencionada no histórico do projeto),
`remoteAddress` seria o IP do proxy — um "limite por IP" nessas condições
vira, sem avisar, um teto global reduzido disfarçado de coisa mais
granular. E confiar em `X-Forwarded-For` sem saber se existe de fato um
proxy na frente é confiar num cabeçalho que o próprio cliente pode
forjar livremente. Prefiro nenhum controle a um controle que parece
funcionar e não funciona — ver recomendação em §5.

### 2.11 Nenhuma Content-Security-Policy — **MÉDIO**

**Onde:** `frontend/index.html`, `<head>`.

O frontend não declarava nenhum controle de CSP. Hoje não há vetor de XSS
conhecido no código (renderização é só `textContent`/`createElement`, sem
`innerHTML`), mas CSP é defesa em profundidade: reduz o dano de um XSS que
apareça no futuro (por exemplo, numa dependência de terceiro comprometida)
em vez de depender só de "hoje não tem bug".

**Alteração:** `<meta http-equiv="Content-Security-Policy">` restringindo
script a origem própria mais o hash exato do único script inline do
projeto (o bootstrap de tema, que precisa rodar antes da primeira pintura
para não piscar o tema errado); estilo e fonte só para origem própria e
Google Fonts; `connect-src` aceitando `ws:`/`wss:` de qualquer host porque
o endereço do servidor é definido por `VITE_SOCKET_URL` em tempo de
implantação, não fixo em tempo de build; `object-src 'none'`; `base-uri` e
`form-action` restritos à própria origem.

**Verificado, não presumido** — inclusive um bug que a própria verificação
encontrou: o primeiro hash que calculei manualmente estava errado e
bloqueava silenciosamente o script de tema (teria quebrado a experiência
de quem tem tema claro salvo, sem gerar nenhum erro visível na tela).
Corrigido usando o hash que o navegador real confirmou como correto, e
testado de duas formas:

- com preferência "light" salva em `localStorage`, o `data-theme` muda
  para `light` depois do reload — prova que o script inline **executa de
  verdade**, não só que a página carrega;
- um script injetado dinamicamente via `document.head.appendChild` (o
  mesmo padrão que um XSS real usaria) foi **bloqueado pela CSP**,
  confirmando que a política tem efeito prático, não é só decorativa.

**Limitação real, documentada no próprio HTML, não escondida:** CSP
entregue via `<meta>` **ignora** as diretivas `frame-ancestors` (proteção
contra clickjacking) e `upgrade-insecure-requests`, e HSTS nunca funciona
por `<meta>` — essas três só têm efeito quando enviadas como cabeçalho
HTTP real, o que depende da camada de hospedagem em produção, fora do
alcance de um arquivo estático neste repositório. Ver recomendação em §5.

### 2.12 `ALLOWED_ORIGINS` documentada mas nunca testada de fato — **achado de processo, corrigido**

**Onde:** verificação, não código — o código de `backend/src/server.js` já
estava correto desde a rodada anterior.

Na primeira rodada desta auditoria eu implementei e documentei a allowlist
de `Origin` como funcional, mas só testei o caminho **desligado**
(`ALLOWED_ORIGINS` vazio, comportamento preservado). Nunca tinha
verificado, com um servidor real, que o caminho **ligado** de fato
bloqueia. Corrigido agora: subi o servidor com
`ALLOWED_ORIGINS=https://meuchat.exemplo` e confirmei — uma conexão com
`Origin: https://site-malicioso.exemplo` recebe **HTTP 403** no handshake
e nunca chega a abrir; uma conexão com a origem permitida conecta
normalmente. A capacidade documentada na rodada anterior realmente
funciona quando configurada, não é uma afirmação não verificada.

### 2.10 `permissions` ausente no workflow de CI — **BAIXO**

**Onde:** `.github/workflows/ci.yml`.

O job `verificar` não declarava bloco `permissions`, então o
`GITHUB_TOKEN` herda o padrão do repositório — que pode ser mais amplo do
que o job precisa (o job só lê o código e roda checagens; nunca escreve,
comenta ou publica nada). Viola o princípio de privilégio mínimo
(ISO/IEC 27001 A.9, controle de acesso): se uma dependência de dev
comprometida rodar código durante `npm ci`/`npm run lint`/`npm run build`,
o raio de dano do token disponível fica maior do que precisa.

**Alteração:** `permissions: contents: read` explícito no job. Note que
`codeql.yml` já fazia isso corretamente — a inconsistência estava só no
`ci.yml`.

---

## 3. Verificação de segredos no histórico do Git

Não me limitei ao estado atual. Rodei sobre **todos os 68 commits, todos
os branches, cada blob que já existiu** (`git rev-list --objects --all` +
`git grep` sobre cada revisão), não só `git log -p` do estado atual:

| Verificação                                                                                                         | Resultado                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `.env` (ou qualquer variante) já rastreado alguma vez                                                               | **Nunca.** Zero commits que adicionaram um `.env`.               |
| Chaves privadas (`-----BEGIN...PRIVATE KEY`), `.pem`, `.key`, `id_rsa`                                              | **Nenhum**, em nome de arquivo ou conteúdo, em qualquer revisão. |
| Padrões de token de provedor (AWS `AKIA...`, GitHub `ghp_`/`gho_`/`github_pat_`, Slack `xox...`, OpenAI `sk-`, JWT) | **Nenhum**, em nenhum blob.                                      |
| `usuário:senha@` embutido em URL                                                                                    | **Nenhum**.                                                      |
| Atribuições tipo `senha =`/`secret =`/`token =` seguidas de literal                                                 | **Nenhuma**.                                                     |
| Credenciais em `resolved:` dos lockfiles (vetor comum e esquecido)                                                  | **Nenhuma** — só `registry.npmjs.org`, o registro oficial.       |
| Scripts `preinstall`/`postinstall` (execução arbitrária ao instalar)                                                | **Nenhum**, em nenhum dos dois `package.json`.                   |
| `.npmrc` (registry customizado, token)                                                                              | **Nunca existiu no projeto.**                                    |

**Conclusão desta seção: não há segredo hoje nem jamais houve segredo
versionado neste repositório.** Não há nada a revogar ou rotacionar —
essa recomendação do pedido (item 3.4) não se aplica porque a premissa
(segredo exposto) não ocorreu.

O único dado que o histórico do Git expõe publicamente é **e-mail de
autor** (`100307080+https-shini@users.noreply.github.com` e
`guilhermedesouzacruz80@gmail.com`, este último em commits anteriores à
sessão atual) — comportamento padrão e esperado de qualquer repositório
Git com o nome real do mantenedor, não uma falha de configuração.

---

## 4. Riscos residuais — o que continua existindo após as correções

| Risco                                                                                                         | Nível       | Por que não foi eliminado                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CVEs do Vite/esbuild (dev-server apenas)                                                                      | Baixo/Médio | Correção definitiva exige major bump (6→8), não testado com segurança dentro desta auditoria; risco só existe no servidor de desenvolvimento, nunca no build de produção.                                                                               |
| Ausência de allowlist de `Origin` **enquanto `ALLOWED_ORIGINS` não for configurada**                          | Médio       | A capacidade existe; o valor correto depende do domínio real de produção, que não está documentado no repositório.                                                                                                                                      |
| `userId` continua escolhido pelo cliente (só validado em forma, não em posse)                                 | Médio       | Resolver de verdade exige mudança de protocolo (servidor confirmar identidade), não apenas validação — fora do escopo de correção segura sem quebra.                                                                                                    |
| Sem limite por IP de conexões simultâneas                                                                     | Médio       | Depende de saber a topologia real de deploy (atrás de proxy ou não); um limite mal calibrado quebraria disponibilidade para usuários legítimos atrás do mesmo NAT/proxy — decisão consciente de não implementar às cegas.                               |
| `messageHistory` em memória (até 1000 mensagens) sobrevive a reinício do processo, não a reinício do servidor | Baixo       | Já documentado no README como comportamento intencional (chat "efêmero" = não persiste em disco, mas persiste em memória até o processo reiniciar); não é uma falha nova, é o design declarado.                                                         |
| Logs do servidor (`console.log`/`console.error`) incluem nome de usuário normalizado                          | Baixo       | Dado de exibição pública dentro do próprio chat (todo mundo na sala já vê o nome); não é PII sensível nem segredo. Mantido porque é operacionalmente útil (saber quem conectou/desconectou) e o conteúdo agora está protegido contra forjamento (§2.7). |

---

## 5. Recomendações que não posso aplicar automaticamente

1. **Configure `ALLOWED_ORIGINS`** no ambiente de produção assim que souber
   o domínio real do frontend publicado. Sem isso, a allowlist existe no
   código mas está inerte.
2. **Se o deploy estiver atrás de um proxy reverso** (load balancer, CDN),
   configure o limite de conexões por IP **na camada de infraestrutura**
   (o proxy ou o provedor de hospedagem), que sabe com certeza qual é o IP
   real do cliente — é o lugar correto para esse controle, não o processo
   Node por trás do proxy.
3. **Avalie o upgrade do Vite para uma major mais recente** (6.x/7.x/8.x)
   como tarefa própria, com tempo para testar o pipeline de build inteiro
   — não durante uma auditoria de segurança, para não misturar risco de
   regressão funcional com correção de vulnerabilidade.
4. **Considere HTTPS/WSS obrigatório em produção** — o servidor hoje aceita
   `ws://` (não criptografado) se for exposto assim; normalmente quem
   termina TLS é a plataforma de hospedagem, mas vale confirmar que não há
   caminho de acesso direto ao processo Node sem TLS.
5. **Se este projeto crescer para exigir identidade confiável** (não é o
   caso hoje — é uma sala anônima e efêmera por design), a mudança de
   protocolo mencionada em §2.5 e §4 (servidor emite e confirma a
   identidade) precisa entrar como entrega própria, coordenada entre
   cliente e servidor.
6. **Considere `npm audit` como etapa do CI** para as duas árvores de
   dependência (raiz e `backend/`) — hoje a checagem de dependências é
   manual; automatizá-la pega regressões de segurança em PRs futuros antes
   do merge.
7. **Configure `frame-ancestors` e HSTS na camada de hospedagem/proxy**
   quando o domínio de produção estiver definido — a CSP entregue por
   `<meta>` (§2.11) não consegue aplicar essas duas diretivas; elas só
   funcionam como cabeçalho HTTP real (`Content-Security-Policy:
frame-ancestors 'none'` e `Strict-Transport-Security`), configurado na
   plataforma que serve o site, não no repositório.
8. **Se o repositório precisar ficar inacessível para o público**, isso é
   configuração de visibilidade da conta/organização no GitHub (Settings →
   General → Danger Zone), não uma mudança de arquivo — nenhum arquivo
   deste projeto contém segredo que justifique isso por si só, mas pode
   haver outras razões (institucionais, de produto) para tornar o
   repositório privado que fogem do escopo desta auditoria.

---

## 6. Conclusão

**Não há evidência de exposição de segredo, credencial ou informação
sensível que exija ação imediata de revogação.** A varredura cobriu todo o
histórico do Git (68 commits, todos os blobs) e o conteúdo atual, com
padrões para os formatos de segredo mais comuns — nada foi encontrado, e
essa é uma conclusão negativa verificada por comando, não presumida.

O que existia era risco de **disponibilidade** (nenhum limite de tamanho
de mensagem, nenhum limite de taxa, nenhum teto de conexões — os três
corrigidos), risco de **integridade** (log injection via nome de usuário —
corrigido; identidade validada em forma mas não em posse — parcialmente
mitigado, residual documentado), risco de **confidencialidade** (CVE de
divulgação de memória não inicializada no `ws` — corrigido), e ausência de
defesa em profundidade no navegador (nenhuma CSP — corrigido, §2.11).

Uma segunda rodada desta mesma auditoria também verificou, com testes
reais, duas coisas que a primeira rodada tinha deixado como afirmação não
testada: a allowlist de `Origin` (§2.12) de fato bloqueia quando
configurada — testei os dois lados, permitido e recusado — e o hash da CSP
que eu mesmo calculei estava errado na primeira tentativa, o que teria
quebrado silenciosamente o tema para quem tem preferência clara salva; o
teste pegou isso antes do commit.

Todas as correções foram testadas contra o servidor e o frontend rodando
de verdade — fluxo normal, payload gigante, flood de mensagens, digitação
humana sob o limitador, injeção de log com dois clientes reais, script
injetado dinamicamente bloqueado pela CSP, tema mudando de verdade com
preferência salva, origem não permitida recebendo 403 — não apenas lidas
ou inferidas do código. `npm audit` no backend foi de 1 vulnerabilidade
alta para **0**. O comportamento do produto para uso legítimo não mudou em
nenhum teste realizado, nas duas rodadas.
