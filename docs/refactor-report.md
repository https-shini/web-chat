# Relatório de refatoração · web-chat

Antes → depois, medido. Toda linha desta página ou é saída de comando ou é
contagem sobre a árvore. Onde não pude medir, está dito que não pude.

Base de comparação: `main` no commit `1468a8c`.

---

## 1. Critérios de pronto — saída dos comandos

| #   | Comando                                       | Esperado                  | Medido                                                                   |
| --- | --------------------------------------------- | ------------------------- | ------------------------------------------------------------------------ |
| 1   | cores fora de `tokens.css`                    | vazio                     | **0 ocorrências**                                                        |
| 2   | densidade fora de token                       | só exceções justificadas  | **0 ocorrências** — não há exceção a justificar                          |
| 3   | `!important`                                  | só sob movimento reduzido | **4**, todas no bloco `prefers-reduced-motion` de `tokens.css`           |
| 4   | `innerHTML` / `insertAdjacentHTML`            | vazio                     | **0**                                                                    |
| 5   | `websocket` em `ui/` e `state/`               | vazio                     | **0**                                                                    |
| 6   | `document.` / `querySelector` em `transport/` | vazio                     | **0**                                                                    |
| 7   | classe de tema (`light-mode` / `dark-mode`)   | vazio                     | **0** — o tema tem um seletor só, `[data-theme="light"]` em `tokens.css` |
| 8   | `node scripts/check-contrast.mjs`             | exit 0                    | **exit 0**, 42 pares × 2 temas                                           |
| 9   | `aria-` / `role=` em `index.html`             | > 0                       | **17** (era 0)                                                           |

O comando 2 é heurístico e o prompt previa falso positivo legítimo. **Não houve
nenhum**: os componentes consomem apenas `var(--…)` em `padding`, `margin`,
`gap`, `border-radius` e `font-size`, e os literais de `@media` não usam essas
propriedades. A régua não foi relaxada — o regex do prompt está intacto.

Além dos nove, verificado em CI: `eslint`, `stylelint`, `tsc -p jsconfig.json`,
`prettier --check` e `vite build`, todos limpos.

---

## 2. Contraste — antes → depois

Todos os valores saem de `scripts/check-contrast.mjs`. Cores translúcidas foram
**compostas sobre a superfície real antes de medir**, como a regra 9 exige.

| Par                                  |                        Antes |                               Depois | Mínimo | Critério             |
| ------------------------------------ | ---------------------------: | -----------------------------------: | -----: | -------------------- |
| Texto sobre preenchimento de marca   |                  **4.47** ❌ | **9.19** (escuro) / **6.10** (claro) |    4.5 | 1.4.3                |
| Contorno de campo / superfície       |                  **1.34** ❌ | **4.04** (escuro) / **4.55** (claro) |    3.0 | 1.4.11               |
| Anel de foco / superfície            |                  **1.12** ❌ | **9.19** (escuro) / **6.10** (claro) |    3.0 | 2.4.11 · 1.4.11      |
| Degrau de elevação entre superfícies |                  **1.07** ❌ | **1.27** (escuro) / **1.24** (claro) |    1.2 | elevação perceptível |
| Cor de remetente, pior caso          | **4.22** ❌ (`mediumpurple`) |       **5.59** (pior dos 12 valores) |    4.5 | 1.4.3                |
| Texto principal / superfície         |                     15.24 ✅ |                **16.36** / **16.29** |    4.5 | 1.4.3                |
| Texto secundário / superfície        |                      6.66 ✅ |                  **8.82** / **6.97** |    4.5 | 1.4.3                |
| Estado de erro / superfície          |                      4.53 ⚠️ |                  **6.95** / **5.86** |    4.5 | 1.4.3                |
| Preenchimento de marca / superfície  |                      3.82 ✅ |                  **9.19** / **6.10** |    3.0 | 1.4.11               |

**O par mais apertado do sistema novo é 4.74:1** (erro sobre superfície elevada,
tema claro), contra o mínimo de 4.5. Antes, três pares reprovavam e um passava
por 0,03.

**Prova de que o script lê os tokens:** rodado contra um `tokens.css` montado com
a paleta antiga, ele reprova 12 pares, entre eles o documentado `4.47 / 4.5`
(branco sobre o indigo anterior). Se passasse de primeira, não estaria lendo nada.

**Composição das translúcidas antigas:**

| Valor                                | Sobre     | Composto  |    Ratio |
| ------------------------------------ | --------- | --------- | -------: |
| `rgba(255,255,255,0.1)` (borda, 11×) | `#1a1a2e` | `#313143` | **1.34** |
| `rgba(255,255,255,0.1)` (borda)      | `#16213e` | `#2d3751` | **1.34** |
| `rgba(99,102,241,0.1)` (foco)        | `#16213e` | `#1e2850` | **1.12** |

---

## 3. Literais eliminados, por categoria

| Categoria                             | Antes                                                   | Depois                                                                                          |
| ------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Custom properties                     | **10**, todas nomeadas por aparência (`--surface-dark`) | **146**, em três camadas, nomeadas por papel                                                    |
| Tokens semânticos de cor              | 0                                                       | **45** (dois temas)                                                                             |
| Hex fora de token                     | `#16213e` 2×, `#8b5cf6` 1×                              | **0**                                                                                           |
| `rgba()` repetido como borda          | **11×** o mesmo valor                                   | **0**                                                                                           |
| Valores de `px` distintos, sem escala | **23**                                                  | **0** fora de `tokens.css`                                                                      |
| Escala de espaço                      | inexistente                                             | base 4px, 13 degraus                                                                            |
| Escalas fechadas                      | nenhuma                                                 | raio, traço, sombra, duração, easing, opacidade, z-index, breakpoint, alvo de toque, tipografia |
| `z-index` literal                     | `1000`                                                  | `var(--z-toast)`                                                                                |
| Breakpoints                           | **1** (`768px`)                                         | 3 declarados (`480`, `768`, `1024`) + `pointer: coarse`                                         |
| Temas                                 | 1 (escuro)                                              | 2, com **um** seletor de tema no projeto                                                        |

---

## 4. Arquivos

| Antes                                                                      | Depois                                                                                              |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `style.css` — **452 linhas**, arquivo único                                | **22** arquivos CSS; o maior componente tem **82** linhas, e o maior arquivo é `tokens.css` com 247 |
| `script.js` — **311 linhas**, transporte + estado + renderização trançados | **21** módulos ES; `main.js` (raiz de composição) tem **196** linhas                                |
| `aria-*`: 0 · `role=`: 0 · `<label>`: 0                                    | **17** atributos de acessibilidade; todo input rotulado                                             |
| `:focus-visible`: 0 · `prefers-reduced-motion`: 0                          | anel global + bloco de movimento reduzido                                                           |
| `backend/node_modules` versionado (30 arquivos)                            | `.gitignore`; `git ls-files \| grep node_modules` vazio                                             |
| Sem build, lint, formatador ou teste de tipo                               | Vite, ESLint, Stylelint, Prettier, `tsc --checkJs`, tudo na CI                                      |
| URL `wss://…onrender.com` hardcoded                                        | `VITE_SOCKET_URL` com fallback local derivado do host                                               |
| Licença `ISC` no manifesto, `MIT` no `LICENSE`                             | MIT nos dois                                                                                        |

---

## 5. Critérios WCAG fechados

| Critério                         | Antes                                             | Depois                                                                                                       |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **1.3.1** Estrutura              | Sem `<h1>`, começava em `<h2>`; sem landmarks     | `<h1>` em cada tela (um exposto por vez), `header`/`main`/`footer`, skip link                                |
| **1.4.1** Uso de cor             | Identidade só por cor, sorteada e inline          | Monograma preenchido/vazado + rótulo "Você" + traço na marca                                                 |
| **1.4.3** Contraste              | 3 pares reprovando                                | 42 pares medidos, todos passando                                                                             |
| **1.4.11** Contraste não textual | Borda 1.34, foco 1.12                             | Contorno ≥3.19, foco ≥4.93, fio ≥4.04 em todos os estados                                                    |
| **2.2.2** / **2.3.3** Movimento  | `pulse` e `typingDots` infinitos, sem media query | `pulse` removido; bloco `prefers-reduced-motion` verificado no navegador (animação com `iteration-count: 1`) |
| **2.4.3** Ordem de foco          | Login → chat trocava `display` sem mover foco     | Foco vai para o composer e a mudança é anunciada                                                             |
| **2.4.7 / 2.4.11** Foco visível  | Nenhum botão com estilo de foco                   | Anel global de 3px com `border-radius: inherit`                                                              |
| **2.5.8** Alvo de toque          | Só `.chat__button` tinha 44px                     | 24px de piso, 44px sob `pointer: coarse`                                                                     |
| **3.3.2** Rótulos                | Ambos os inputs só com `placeholder`              | `<label>` real em todos                                                                                      |
| **4.1.2** Nome acessível         | Botão de envio anunciava "send"                   | Rótulo textual "Enviar"; glifos `aria-hidden`                                                                |
| **4.1.3** Mensagens de status    | Sem `role="log"` nem `aria-live`                  | `role="log"` + `aria-live="polite"` + `aria-relevant="additions"`; `role="status"`; um único `role="alert"`  |

---

## 6. Checagens manuais — todas executadas

Executadas em Chromium via Playwright, contra o servidor real deste repositório.
Cada linha é um resultado observado, não uma expectativa.

| Checagem                                               | Resultado                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Percurso só por teclado: entrar, enviar, alternar tema | ✅ Primeiro `Tab` foca o skip link; segundo, o campo de nome                       |
| Foco na troca de tela                                  | ✅ Vai para `#campo-mensagem`, com anúncio na região live                          |
| `<h1>` único por tela                                  | ✅ "Sala aberta." na entrada, "web-chat" na sala                                   |
| Mensagem anunciada uma vez, sem reler a lista          | ✅ A lista só recebe `appendChild`; o anunciador não repete mensagem               |
| Zoom 200% (≡ 640px) sem overflow horizontal            | ✅ `scrollWidth - clientWidth = 0`                                                 |
| Viewport de 320px sem overflow horizontal              | ✅ `scrollWidth - clientWidth = 0`                                                 |
| `prefers-reduced-motion` ligado                        | ✅ Pontos de digitação com `animation-iteration-count: 1`; `scroll-behavior: auto` |
| Servidor derrubado com a aba aberta                    | ✅ Estado vai a "reconectando" em <1s; fio vira tracejado âmbar                    |
| Mensagem escrita fora do ar                            | ✅ Aviso de fila aparece e a mensagem é entregue ao reconectar                     |
| Servidor volta                                         | ✅ Reconecta sozinho, sem ação do usuário                                          |
| Teto de reconexão estourado                            | ✅ 6 tentativas com atrasos crescentes (1s→5s→6s→11s), "sem conexão" em 25,1s      |
| Caminho manual de volta                                | ✅ Foco vai para o botão; `Enter` reconecta                                        |
| `it's & <b>alerta</b>` na tela                         | ✅ Aparece literalmente; nenhum `<b>` no DOM                                       |
| Zero `style=` inline no DOM renderizado                | ✅ 0 elementos                                                                     |

**Não verificado com leitor de tela real.** A estrutura (`role="log"`,
`aria-live`, `aria-relevant="additions"`, fila com deduplicação) está montada e
foi conferida no DOM, mas não rodei NVDA, JAWS ou VoiceOver — não tenho como
neste ambiente. Fica como a única checagem do Anexo B que não posso afirmar
medida.

---

## 7. O que ficou para o backend

Autorizado e feito nesta entrega:

- **Escape duplo** — `sanitizeContent()` convertia `& < > " '` em entidades e o
  cliente renderiza com `textContent`, então o usuário lia `&#x27;`. Substituído
  por `normalizeText()`, que só apara e limita. Verificado na tela.
- **`switch` sem bloco** — as `const` de um `case` vazavam para as cláusulas
  seguintes em `server.js`. Corrigido junto porque é o mesmo defeito, no mesmo
  arquivo, e é erro em tempo de execução esperando acontecer.

Anotado, **não** feito (fica para outra entrega, como combinado):

| Item                                | Risco                                                 | Onde                                                      |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Sem `Origin` allowlist              | Qualquer página pode abrir conexão                    | `backend/src/server.js`, criação do `WebSocketServer`     |
| Sem rate limit                      | Um cliente satura o broadcast                         | Handler de `chat_message`                                 |
| Sem teto de conexões                | Exaustão de memória                                   | Evento `connection`                                       |
| Identidade sob controle do cliente  | `userId` e `userName` chegam do cliente e são aceitos | `case 'user_login'`                                       |
| `messageHistory` de 1000 em memória | Contradiz "efêmero" se não for documentado            | Já documentado no README; a política em si não foi mudada |

O frontend reduziu parte da superfície do quarto item: parou de enviar
`userColor`, e a cor de cada pessoa passou a ser derivada do id no cliente. O
`userId` continua vindo de quem se conecta — isso é correção de servidor.

---

## 8. Divergências entre o plano do Portão 1 e o que foi entregue

Registradas porque o plano foi aprovado como está e qualquer desvio precisa
aparecer.

1. **`ui/button.js`, `ui/field.js` e `ui/thread.js` não existem.** Botão e campo
   são HTML + CSS, sem comportamento próprio a encapsular; o fio é desenhado por
   CSS e seu estado é escrito por `ui/connection.js`, que já é quem conhece o
   estado da conexão. Criar três módulos vazios só para bater com a tabela seria
   cerimônia. O inventário em `design-system.md` foi corrigido para a realidade.
2. **`state/events.js` e `state/typing.js` entraram fora do plano.** O primeiro
   nasceu porque `main.js` chegou a 320 linhas — perto das 311 do `script.js` que
   a refatoração dissolveu, e pelo mesmo motivo. O segundo guarda o prazo de
   validade de quem está digitando.
3. **Sem foco automático no campo de nome ao carregar.** O plano não falava
   disso; a primeira implementação focava o campo, e o teste de teclado mostrou
   que isso rouba o primeiro `Tab` e torna o skip link inalcançável — item
   obrigatório do Anexo B. Removido.
4. **A tela de entrada não tem cabeçalho**, como no wireframe. O `<h1>` da
   entrada e o wordmark da sala são dois `<h1>` mutuamente exclusivos por
   `hidden`, então há exatamente um exposto por vez.

5. **O matiz 5 de remetente mudou depois de renderizado.** O plano trazia um
   ocre (`#c9be72`); na tela ele era indistinguível do âmbar da marca, o que
   contraria a regra do próprio sistema — "você" não compete com "outra
   pessoa". Trocado por verde-folha (`#8ed36e` / `#3d6b1f`), medido em
   **10.60:1** no escuro e **5.99:1** no claro. Contraste passa; a regra de
   1.4.1 volta a valer de fato, não só no papel.

---

## 9. Defeitos encontrados olhando a interface renderizada

Cinco defeitos passaram por lint, tipos, build e pelos nove critérios, e só
apareceram em captura de tela. Ficam registrados porque são a evidência de que
verificação automatizada não substitui olhar o resultado.

| Defeito                                                        | Causa                                                                                                                                                                       | Onde aparecia                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Monograma preenchido invisível                                 | `background-color: currentcolor` resolve contra a `color` do próprio elemento, e a regra seguinte trocava essa `color` para `--color-on-brand` — fundo e letra da mesma cor | Toda mensagem própria e o chip "Você", nos dois temas |
| Monograma duplicado                                            | O trilho e o cabeçalho da mensagem chamavam `renderIdentity` com monograma                                                                                                  | Toda mensagem                                         |
| Hora em AM/PM                                                  | `toLocaleTimeString` seguia o locale do navegador, não o da interface                                                                                                       | Todo carimbo de hora                                  |
| Toast sobre o alternador de tema                               | Toast fixo no canto superior direito, onde o controle passou a viver                                                                                                        | Ao trocar de tema                                     |
| Mensagem de sistema em coluna de 24px, quebrando letra a letra | O trilho estreito estava repetido em quatro media queries e sobrescrevia a coluna única da variante                                                                         | Somente em ≤480px                                     |

Os três primeiros são invisíveis para qualquer verificação estática: o CSS era
válido, os tipos passavam e o contraste medido dos tokens continuava correto —
o par medido existia, só não era o par que a tela mostrava.
