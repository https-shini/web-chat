# Testes manuais com leitores de tela

> Roteiro para NVDA, VoiceOver e TalkBack. Os testes automáticos — o axe e o
> roteiro só de teclado em `e2e/05-teclado.mjs` — **não substituem** este
> roteiro: eles não dizem se a conversa faz sentido ouvida, só que a estrutura
> está correta. A acessibilidade só pode ser declarada depois de este roteiro ser
> executado, com os resultados registrados no fim do documento.

## O que já é verificado automaticamente

Os itens abaixo são conferidos a cada PR pelo job `navegador`
(`npm run test:e2e`). Os leitores de tela continuam precisando do roteiro manual
para dizer se a experiência faz sentido ouvida.

- `05-teclado`:
    - skip link;
    - foco visível em todo o percurso;
    - foco no título do início e no campo ao abrir uma conversa;
    - cartão e diálogo com Escape devolvendo o foco;
    - foco preso no diálogo.
- `07-celular`:
    - a gaveta lateral prende o foco: Tab e Shift+Tab circulam dentro dela;
    - o conteúdo de trás e o skip link ficam inertes;
    - Escape devolve o foco ao botão de menu;
    - os botões têm área de toque de pelo menos 24 × 24 px;
    - não há rolagem horizontal a 375 px.
- `03-reconexao`: depois de uma queda, o foco continua no campo de mensagem e o texto meio escrito continua lá.
- axe sem violações sérias no início, na sala, na privada, no celular e com a gaveta aberta.

## Ambientes

| Leitor              | Sistema              | Navegador        | Modo                                 |
| ------------------- | -------------------- | ---------------- | ------------------------------------ |
| NVDA (versão atual) | Windows 11           | Firefox e Chrome | Navegação (setas) e foco (Tab)       |
| VoiceOver           | macOS (versão atual) | Safari           | Rotor (VO+U), navegação por VO+setas |
| VoiceOver           | iOS                  | Safari           | Gestos de deslizar; rotor            |
| TalkBack            | Android              | Chrome           | Gestos de deslizar; menu de leitura  |

Use **duas pessoas** (ou duas abas, em perfis diferentes) para ter conversa de
verdade. Use o ambiente local (`npm run dev`) ou a produção, com contas
temporárias. Não use dados reais.

## Como registrar

Para cada passo, anote: **o que foi lido** (palavra por palavra quando
importar), **onde o foco ficou**, e o resultado — ✅ (como esperado), ⚠️
(funciona, mas confuso) ou ❌ (impede o uso).

## Roteiro

### 1. Entrada e navegação geral

1. Abra o site. O primeiro Tab deve chegar a **"Ir para a conversa"**.
2. Liste os marcos/regiões pelo rotor ou pela lista de elementos do leitor.
   Devem aparecer "Conversas e atalhos" (barra lateral) e o conteúdo principal.
3. Preencha nome e @ e entre. Esperado:
    - a mudança para o **início** é anunciada;
    - o foco vai para o título "Olá, …";
    - erros de nome e @ são lidos junto com o campo.

### 2. Início e conversas

1. Percorra os três formulários do início: "Nova sala", "Entrar com código" e
   "Conversa privada". Cada campo deve ter rótulo lido.
2. Digite um código inválido e envie. O erro deve ser lido, e o campo deve ser
   marcado como inválido.
3. Crie uma sala. Esperado: anúncio de que a conversa foi aberta e o foco no
   campo de mensagem.
4. Na barra lateral, ouça um item de conversa. Ele deve dizer o **nome**, o
   **tipo** (sala ou @ da pessoa), a **presença** (numa privada) e as **não
   lidas** ("2 não lidas"). O número visual não deve ser lido duas vezes.

### 3. Leitura de mensagens

1. Com a outra pessoa escrevendo, confirme que cada mensagem nova é anunciada
   **uma vez** (região de log), com o nome de quem escreveu.
2. Mensagens agrupadas, em sequência da mesma pessoa, devem continuar dizendo
   o nome. Ele fica oculto na tela, mas presente para o leitor.
3. Troque de conversa e volte. O histórico **não** deve ser reanunciado
   inteiro.
4. Com mais de 500 mensagens numa conversa (use comandos `/roll` repetidos ou
   um script), confirme que a remoção das mais antigas não dispara leitura.

### 4. Estados de envio

1. Envie uma mensagem. O estado "enviando…" e, depois, **"enviada"** (o ✓
   tem texto para o leitor) devem estar disponíveis ao navegar até a mensagem.
2. Desligue a rede, envie e religue. Esperado: "enviando…" e, se não houver
   confirmação, **"não enviada"** com o botão **"Tentar de novo"** alcançável
   e lido. Ao tentar de novo, deve ser lido "reenviando… (tentativa 2)".
3. Peça a quem modera que silencie você e envie algo. Esperado: o anúncio
   "Sua mensagem não foi enviada (…) e voltou para o campo de texto", com o
   texto de volta no campo.

### 5. Notificações

1. No painel "você", o botão deve ser lido como **"Ativar notificações,
   botão de alternância, não pressionado"** (ou equivalente).
2. Ative. O pedido de permissão do navegador deve aparecer só agora. O estado
   deve passar a "pressionado", e a confirmação deve ser lida.
3. Negue a permissão em outro perfil. A explicação de como liberar deve ser
   lida uma vez, e o botão deve continuar não pressionado.
4. Com a aba em segundo plano, a notificação do sistema deve dizer só "Nova
   mensagem" e onde. Numa privada, só "Conversa privada".

### 6. Conversas não lidas

1. Com duas salas, receba mensagens na que não está aberta. O rótulo do item
   deve passar a dizer "1 não lida", "2 não lidas"…
2. O título da aba ("(2) web-chat · …") é lido por alguns leitores ao trocar
   de aba. Confirme que o total faz sentido.
3. Abra a conversa: as não lidas devem zerar, e o rótulo deve mudar.

### 7. Diálogos

1. Em "Sair da sala", o diálogo deve ser lido com o **título e o texto**, e o
   foco deve ficar dentro dele (Tab não sai para a página).
2. Escape cancela e devolve o foco ao botão "Sair da sala".
3. Repita com "Encerrar conversa" e "Bloquear" numa conversa privada.

### 8. Indicadores de saída ("saiu")

1. Peça à outra pessoa que saia da sala. As mensagens dela devem passar a ter
   o selo **"saiu"**, lido como texto junto ao nome.
2. A troca **não** deve reanunciar as mensagens.
3. Quando a pessoa voltar com o mesmo número, o selo deve sumir. Se outra
   pessoa pegar o mesmo @, ela **não** pode herdar nem apagar a marca da
   anterior.

### 9. Foco depois de reconexão

1. Com o foco no campo de mensagem e um texto meio escrito, derrube a rede por
   uns 15 s e religue.
2. Esperado:
    - os estados "reconectando…" e "Conexão restabelecida." são anunciados uma
      vez cada, não a cada tentativa;
    - o foco **continua no campo**;
    - o texto escrito continua lá;
    - as mensagens que chegaram durante a queda são lidas uma vez.
3. Reinicie o servidor (ambiente local). Esperado: a ida ao início é
   anunciada, o foco vai para o título e o motivo é lido.

### 10. Telas pequenas (TalkBack e VoiceOver no iOS)

1. Em retrato, a gaveta lateral deve abrir pelo botão "Abrir barra lateral".
   O foco deve ficar preso nela, e "voltar" ou Escape deve fechá-la.
2. Itens de conversa e botões devem ter área de toque suficiente e ser lidos
   com o mesmo nome do desktop.

## Registro de execuções

| Data | Leitor / sistema / navegador | Quem executou | Resultado           | Problemas abertos |
| ---- | ---------------------------- | ------------- | ------------------- | ----------------- |
| —    | —                            | —             | Ainda não executado | —                 |
