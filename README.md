<img width=100% src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=24&height=120&section=header"/>

<h1 align="center">💬 Web Chat</h1>

<p align="center">
  Aplicação de chat em tempo real com salas, moderação e privacidade — sem salvar mensagens no servidor.
</p>

<div align="center">

  [![Demo](https://img.shields.io/badge/🌐%20Acessar%20Projeto-2482FF?style=for-the-badge)](https://chat-frontend-g42t.onrender.com)
  [![Código](https://img.shields.io/badge/Ver%20Código-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/https-shini/web-chat)
  [![Licença](https://img.shields.io/badge/Licença-MIT-green?style=for-the-badge)](./LICENSE)

</div>

---

## 📌 O que é este projeto?

O **Web Chat** é uma aplicação de mensagens instantâneas que funciona direto no navegador. Os usuários entram com um nome, escolhem uma sala e conversam em tempo real com qualquer pessoa conectada.

O projeto segue uma filosofia de **privacidade por padrão**: as mensagens não são salvas no servidor — quando todos saem da sala, o histórico desaparece. Mensagens importantes podem ser fixadas localmente pelo próprio usuário, sem que o servidor tenha acesso a elas.

---

## 🌐 Experimente agora

Você pode usar o projeto sem precisar baixar nada:

👉 **[https://chat-frontend-g42t.onrender.com](https://chat-frontend-g42t.onrender.com)**

Basta abrir o link, digitar um nome de usuário e começar a conversar!

---

## ✨ Funcionalidades

- Entrar no chat com um **nome de usuário**
- **Salas de chat** criadas e gerenciadas pelo administrador
- **Chat efêmero** — mensagens não são salvas no servidor
- **Fixar mensagens** localmente via `localStorage`, sem envolver o servidor
- **Moderação** — administrador pode excluir mensagens de qualquer usuário
- **Indicador de digitação** em tempo real
- **Timestamps** em todas as mensagens
- **Notificações** do navegador para novas mensagens
- Proteção contra **XSS** com sanitização de conteúdo
- **Reconexão automática** em caso de falha de rede

---

## 🛠️ Tecnologias utilizadas

**Front-end**
- **HTML5** — estrutura da interface
- **CSS3** — estilização responsiva
- **JavaScript** — interatividade e comunicação em tempo real
- **Google Fonts** — tipografia

**Back-end**
- **Node.js** — servidor da aplicação
- **WebSocket (ws)** — comunicação bidirecional em tempo real
- **dotenv** — variáveis de ambiente

---

## 🗂️ Estrutura de arquivos

```
web-chat/
│
├── frontend/
│   ├── index.html       → Estrutura da página (login e área de chat)
│   ├── style.css        → Estilização responsiva da interface
│   └── script.js        → Conexão WebSocket, envio e exibição de mensagens
│
├── backend/
│   └── server.js        → Servidor WebSocket, salas e moderação
│
├── .env                 → Variáveis de ambiente (porta, configurações)
├── CONTRIBUTING.md      → Guia de contribuição
├── LICENSE              → Licença MIT
└── read-model/
    └── MODEL.md         → Documentação técnica aprofundada
```

---

## ⚙️ Como funciona

1. O usuário acessa o app e informa seu nome no formulário de login
2. Após entrar, visualiza as salas disponíveis e escolhe uma
3. As mensagens digitadas são enviadas ao servidor via **WebSocket**
4. O servidor retransmite a mensagem para todos os usuários conectados na sala
5. A interface é atualizada em tempo real para todos os participantes
6. Ao sair, as mensagens somem — o chat é efêmero por design

---

## 🔒 Segurança e privacidade

| Recurso | Descrição |
|---|---|
| **Chat efêmero** | Mensagens não são armazenadas no servidor |
| **Sanitização XSS** | Todo conteúdo é sanitizado antes de ser exibido |
| **Mensagens fixadas** | Salvas apenas no `localStorage` do usuário, sem passar pelo servidor |
| **Moderação** | Admin pode excluir mensagens para manter o ambiente seguro |
| **Validação** | Dados inválidos e spam são bloqueados antes do envio |

---

## 📈 Melhorias implementadas

A versão atual evoluiu significativamente em relação à versão original:

| Aspecto | Antes | Depois |
|---|---|---|
| **Persistência** | Nenhuma | Chat efêmero por design |
| **Armazenamento** | Nenhum | Mensagens fixadas via `localStorage` |
| **Moderação** | Nenhuma | Admin pode excluir mensagens |
| **Segurança** | Vulnerável a XSS | Sanitização e validação completas |
| **Salas de chat** | Nenhuma | Criadas e gerenciadas pelo admin |
| **Indicador de digitação** | Não | Sim, em tempo real |
| **Interface** | Simples | Moderna e otimizada |

---

## 🔮 Próximos passos

**Curto prazo**
- Criptografia de ponta a ponta nas mensagens
- Sistema de autenticação (login e registro)
- Rate limiting para evitar spam

**Médio prazo**
- Compartilhamento de arquivos e imagens
- Sistema de emojis e reações às mensagens

---

## 🚀 Como rodar localmente

**Pré-requisitos:** Node.js e Yarn instalados.

**1. Clone o repositório**
```bash
git clone https://github.com/https-shini/web-chat.git
cd web-chat
```

**2. Instale as dependências**
```bash
yarn
```

**3. Inicie o servidor**
```bash
yarn dev
```

**4. Acesse no navegador**
```
http://localhost:3000
```

---

## 🤝 Como contribuir

Consulte o arquivo [CONTRIBUTING.md](./CONTRIBUTING.md) para o passo a passo completo.

```bash
git checkout -b minha-feature
git commit -m "feat: minha nova feature"
git push origin minha-feature
# Abra um Pull Request 🚀
```

---

## 📄 Licença

Este projeto está sob a licença **MIT**. Veja o arquivo [LICENSE](./LICENSE) para mais detalhes.

---

<div align="center">

Feito com 💙 — converse em tempo real com privacidade!

⭐ Se gostou, deixe uma estrela no repositório!

</div>

<img width=100% src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=24&height=120&section=footer"/>
