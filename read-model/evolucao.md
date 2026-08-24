# Histórico de mudanças · web-chat

> Este documento foi **reescrito**. A versão anterior descrevia como
> implementadas funcionalidades que não existiam no código — salas com
> administrador, moderação, fixar mensagens via `localStorage` — e apresentava
> uma tabela "antes vs depois" que não correspondia a nenhum commit. O que segue
> descreve apenas o que está no repositório.

## Escopo do projeto

Uma sala. Efêmera. Anônima. Sem salas múltiplas, sem papéis, sem autenticação,
sem upload, sem voz. Isso não é uma limitação temporária: é a definição do
produto. Ver `README.md` para a lista do que existe e do que não existe.

## Refatoração de design e arquitetura

Entrega documentada em `docs/design-system.md` (o plano) e
`docs/refactor-report.md` (o antes → depois medido).

### Design system

- Tokens em três camadas — primitivo, semântico e tema — em
  `frontend/src/css/tokens.css`. De 10 custom properties nomeadas por aparência
  para 146 nomeadas por papel.
- Tema claro e escuro sob **um** seletor, aplicado antes da primeira pintura.
- Escalas fechadas para espaço, raio, traço, sombra, duração, easing, opacidade,
  z-index, breakpoint, alvo de toque e tipografia. Zero literal de densidade
  fora do arquivo de tokens.

### Acessibilidade

De `aria-*: 0`, `role=: 0`, `<label>: 0`, `:focus-visible: 0` e
`prefers-reduced-motion: 0` para estrutura semântica completa, com 42 pares de
contraste medidos por script na CI. Os critérios fechados estão em
`docs/refactor-report.md` §5.

### Arquitetura do frontend

`script.js`, um arquivo de 311 linhas com transporte, estado e renderização
trançados, deu lugar a camadas com fronteira verificável por comando: `ui/` e
`state/` não conhecem o canal de tempo real, e `transport/` não toca no DOM.

### Correções de comportamento

- **Escape duplo**: o servidor escapava entidades HTML e o cliente renderiza com
  `textContent`, então o usuário lia `&#x27;` no lugar do apóstrofo. Corrigido no
  servidor — sanitização pertence a quem renderiza.
- **Reconexão**: era linear e desistia em silêncio após 5 tentativas, deixando a
  interface dizendo "Conectado". Agora é exponencial com teto e jitter, com os
  quatro estados visíveis e caminho manual de volta.
- **Indicador de digitação**: o servidor emitia `user_typing` e o cliente tinha
  um stub vazio. Implementado.
- **`switch` sem bloco**: `const` vazava entre cláusulas no cliente e no
  servidor. Corrigido nos dois.

### Infraestrutura

`.gitignore` (o `node_modules` do backend estava versionado), build com Vite,
URL do servidor por variável de ambiente, ESLint, Stylelint, Prettier,
verificação de tipos por JSDoc e checagem de contraste — tudo na CI.

## O que ainda não foi feito

No servidor, e conscientemente fora desta entrega: allowlist de `Origin`, rate
limit, teto de conexões e validação da identidade que chega no `user_login`.
Detalhado em `docs/refactor-report.md` §7.
