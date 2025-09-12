<h1 align="center">Chat Web</h1>

<p align="center">
  <a href="#-sobre-o-projeto">Sobre</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#-funcionalidades">Funcionalidades</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#-tecnologias">Tecnologias</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#-como-rodar-localmente">Como Rodar</a>&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
  <a href="#-evolução-do-projeto">Evolução</a>
</p>

<!-- 
<div align="center">
  <img src="https-shini/web-chat/web-chat-4a63f35f8beed46d444a0fe2cfbdd218241382bd/frontend/images/banner.png" alt="Preview do projeto WebChat em desktop e mobile">
</div>
-->

## 📄 Sobre o Projeto

O WebChat é uma aplicação de chat em tempo real construída com uma arquitetura cliente-servidor e o protocolo WebSocket. O projeto original, embora funcional, foi significativamente aprimorado para se tornar uma plataforma mais robusta e segura. As atualizações trouxeram funcionalidades essenciais para uma experiência de usuário moderna, além de melhorias em segurança e na arquitetura técnica.

## ✨ Funcionalidades

O projeto foi transformado de uma aplicação de broadcast simples em uma plataforma com recursos profissionais.

### 🔒 Segurança e Robustez
- **Sanitização de Conteúdo**: Prevenção contra ataques XSS (Cross-Site Scripting).
- **Tratamento de Erros**: Sistema mais robusto com uso de `try-catch` em operações críticas.
- **Validação de Dados**: Previne spam e dados inválidos nas mensagens.
- **Reconexão Automática**: Sistema de reconexão com backoff exponencial para resistir a falhas de rede.

### 💬 Funcionalidades Essenciais
- **Persistência de Mensagens**: Histórico em memória para até 1000 mensagens, permitindo que novos usuários vejam o contexto das conversas.
- **Lista de Usuários Online**: Exibição em tempo real dos usuários conectados.
- **Timestamps**: O horário de envio é exibido em todas as mensagens.
- **Indicador de Digitação**: Feedback visual em tempo real mostrando quando outros usuários estão digitando.
- **Notificações**: Alertas no navegador e toast messages para novas mensagens.

### 🎨 Interface e Design
- **Design Moderno**: Tema escuro com gradientes e variáveis CSS para uma aparência profissional.
- **Responsividade Aprimorada**: Otimizado para funcionar perfeitamente em dispositivos móveis e desktops.
- **Animações e Transições**: Efeitos visuais suaves para uma experiência mais polida.

## 🚀 Tecnologias

- **Frontend**:
  - HTML
  - CSS
  - JavaScript
    
- **Backend**:
  - Node.js
  - **ws**: Biblioteca para o servidor WebSocket
  - **dotenv**: Gerenciamento de variáveis de ambiente

## 💻 Como Rodar Localmente

Para rodar e testar o projeto na sua máquina, siga estas instruções:

1.  **Pré-requisitos**:
    -   Instale o [Node.js (versão LTS)](https://nodejs.org/).
    -   Instale o Yarn globalmente via npm: `npm install --global yarn`.
2.  **Instalação de Dependências**:
    -   Abra o terminal na pasta raiz do projeto.
    -   Execute `yarn` para instalar as dependências do backend e do frontend.
3.  **Inicie o Servidor**:
    -   No terminal, execute o comando `yarn dev`.
    -   O servidor WebSocket será iniciado na porta `8080`.
4.  **Acesse a Aplicação**:
    -   Abra o arquivo `frontend/index.html` em seu navegador.
    -   Digite seu nome na tela de login para começar a interagir.

## 📈 Evolução do Projeto

O projeto segue um roteiro de evolução focado em aprimorar a experiência de chat e a segurança, sempre respeitando a privacidade dos usuários.

- **Nível 1 (Curto Prazo)**:
    - **Criptografia de Ponta a Ponta**: Implementação de criptografia para garantir que as mensagens só possam ser lidas pelos destinatários.
    - **Autenticação**: Sistema de login e registro para gerenciar usuários e atribuir o papel de administrador.
    - **Segurança**: Adicionar **rate limiting** para evitar spam de mensagens.

- **Nível 2 (Médio Prazo)**:
    - **Compartilhamento de Mídia**: Permitir o upload e o compartilhamento de arquivos e imagens.
    - **Interação**: Integrar um sistema de **emojis e reações** às mensagens.
