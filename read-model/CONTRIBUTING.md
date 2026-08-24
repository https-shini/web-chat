<h1 align="center"> Contributing/Contribuindo </h1>

<p align="center">
  <a href="#pt-br">Português</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#en-us-">English</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="https://github.com/https-shini/web-chat">Voltar</a>
</p>

<br>

## PT-BR

Se você deseja contribuir com o projeto, siga estas etapas:

1. **Crie um fork:**
    - No repositório do projeto, clique no botão "Fork" localizado no canto superior direito da página. Isso criará uma cópia do repositório em sua própria conta do GitHub.

2. **Crie sua branch de funcionalidade:**
    - No seu fork do projeto, crie uma nova branch para sua contribuição executando o seguinte comando no terminal:
        ```
        git checkout -b my-new-feature
        ```

3. **Adicione os arquivos modificados:**
    - Faça as alterações desejadas no código-fonte e adicione os arquivos modificados à sua branch executando o seguinte comando:
        ```
        git add .
        ```

4. **Faça um commit com suas alterações:**
    - Faça um commit das alterações com uma mensagem descritiva utilizando o seguinte comando:
        ```
        git commit -m "Add some feature"
        ```

5. **Faça um push da sua branch:**
    - Envie suas alterações para o seu fork do repositório executando o seguinte comando:
        ```
        git push origin my-new-feature
        ```

6. **Envie um Pull Request para esse repositório:**
    - Navegue até a página do seu fork do projeto no GitHub e clique no botão "Pull Request".
    - Adicione um título e uma descrição clara que explique suas alterações e sugestões de maneira detalhada e compreensível.

Ao seguir estas etapas, você estará contribuindo com o projeto e enviando suas sugestões de funcionalidades ou correções de bugs para análise e inclusão no repositório principal. Seus esforços são muito apreciados! 🚀

> Depois que seu pull request for mergeado, você pode apagar sua branch.

> [!NOTE]
> Não se esqueça de favoritar o projeto!

## en-US 🇺🇸

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Add files changed: `git add .`
4. Commit your changes: `git commit -m "Add some feature"`
5. Push to the branch: `git push origin my-new-feature`
6. Submit a pull request

- Add a title os a description that let clear your suggestion :).

**After your pull request is merged**

> After your pull request is merged, you can safely delete your branch.

> [!NOTE]
> Don't forget to favorite the project!.

<br>

## Regras do código

Antes de abrir o Pull Request, rode `npm run lint`. A CI roda o mesmo, e ela
falha — não avisa.

**A regra que governa o CSS:** nenhuma cor, espaço, raio ou duração fora de
`frontend/src/css/tokens.css`. Se faltar um token, crie o token.

O lint garante isso nos componentes: hex, `rgb()`/`hsl()`, `!important` e valores
em `px`/`rem` nas propriedades de densidade são erro. `tokens.css` fica de fora,
porque é onde esses valores devem existir.

Três consequências práticas:

1. **Componente nunca consome primitivo.** Os tokens `--_*` são a escala crua;
   componentes leem só `--color-*`, `--space-*`, `--radius-*` e companhia.
2. **Toda cor nova entra medida.** Declare o par em `scripts/contrast.pairs.json`
   contra a superfície real onde a cor aparece e rode `npm run check:contrast`.
   Se reprovar, muda a cor — não o mínimo. Par não declarado é par não verificado.
3. **Cor com transparência é composta antes de ser medida.** O script recusa cor
   não literal de propósito.

No JavaScript: `textContent` e `createElement`, nunca `innerHTML`; `// @ts-check`
em todo módulo; e as fronteiras entre camadas são verificadas por comando —
`ui/` e `state/` não citam o canal de tempo real, `transport/` não toca no DOM.

O raciocínio por trás de cada uma dessas regras está em `docs/design-system.md`.
