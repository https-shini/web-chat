# WebChat Melhorado

Uma aplicação de chat em tempo real com funcionalidades avançadas, construída com Node.js e WebSockets.

## 🚀 Funcionalidades Implementadas

### ✅ Melhorias Essenciais (Nível 1)
- **Persistência de Mensagens**: Histórico mantido em memória durante a sessão
- **Lista de Usuários Online**: Visualização em tempo real dos usuários conectados
- **Timestamps**: Horário de envio em todas as mensagens
- **Sanitização de Conteúdo**: Prevenção básica contra XSS
- **Tratamento de Erros**: Reconexão automática e notificações de erro

### ✅ Melhorias Importantes (Nível 2)
- **Indicador de "Digitando..."**: Mostra quando outros usuários estão digitando
- **Notificações do Navegador**: Alertas para novas mensagens quando a aba não está ativa
- **Histórico para Novos Usuários**: Últimas 50 mensagens são enviadas ao conectar
- **Validação de Entrada**: Limitação de caracteres e validação de conteúdo
- **Interface Melhorada**: Design moderno e responsivo

### 🎨 Melhorias Visuais
- **Design Moderno**: Interface escura com gradientes e animações
- **Responsividade**: Adaptável a dispositivos móveis
- **Animações Suaves**: Transições e efeitos visuais
- **Indicadores Visuais**: Status de conexão e atividade dos usuários
- **Notificações Toast**: Feedback visual para ações do usuário

## 🛠️ Tecnologias Utilizadas

### Backend
- **Node.js**: Runtime JavaScript
- **WebSocket (ws)**: Comunicação em tempo real
- **dotenv**: Gerenciamento de variáveis de ambiente
- **crypto**: Geração de IDs únicos

### Frontend
- **HTML5**: Estrutura semântica
- **CSS3**: Estilização moderna com variáveis CSS
- **JavaScript ES6+**: Lógica do cliente
- **WebSocket API**: Comunicação com o servidor

## 📁 Estrutura do Projeto

```
webchat_melhorado/
├── backend/
│   ├── src/
│   │   └── server.js          # Servidor WebSocket melhorado
│   ├── package.json           # Dependências do backend
│   └── node_modules/          # Módulos Node.js
├── frontend/
│   ├── css/
│   │   ├── style.css          # Estilos melhorados
│   │   └── style_original.css # Backup do CSS original
│   ├── js/
│   │   ├── script.js          # JavaScript melhorado
│   │   └── script_original.js # Backup do JS original
│   ├── images/                # Recursos visuais
│   └── index.html             # Interface melhorada
└── README.md                  # Esta documentação
```

## 🚀 Como Executar

### Pré-requisitos
- Node.js (versão 14 ou superior)
- npm (gerenciador de pacotes)

### Instalação e Execução

1. **Clone ou baixe o projeto**
   ```bash
   cd webchat_melhorado
   ```

2. **Instale as dependências do backend**
   ```bash
   cd backend
   npm install
   ```

3. **Inicie o servidor**
   ```bash
   npm start
   # ou para desenvolvimento com auto-reload:
   npm run dev
   ```

4. **Abra o frontend**
   - Abra o arquivo `frontend/index.html` em um navegador
   - Ou use um servidor local (recomendado):
   ```bash
   # Na pasta frontend
   python -m http.server 3000
   # ou
   npx serve .
   ```

5. **Acesse a aplicação**
   - Frontend: `http://localhost:3000`
   - Backend: `ws://localhost:8080`

## 🔧 Configuração

### Variáveis de Ambiente
Crie um arquivo `.env` na pasta `backend/` (opcional):
```env
PORT=8080
```

### Configuração do Frontend
No arquivo `frontend/js/script.js`, ajuste a URL do WebSocket se necessário:
```javascript
websocket = new WebSocket("ws://localhost:8080");
```

## 📱 Funcionalidades Detalhadas

### Sistema de Mensagens
- **Mensagens em Tempo Real**: Entrega instantânea via WebSockets
- **Histórico Persistente**: Últimas mensagens salvas em memória
- **Timestamps**: Horário de envio formatado
- **Sanitização**: Prevenção contra ataques XSS

### Gerenciamento de Usuários
- **Lista Online**: Usuários conectados em tempo real
- **Cores Únicas**: Identificação visual por cores
- **Status de Conexão**: Indicadores visuais de conectividade
- **Notificações de Entrada/Saída**: Mensagens do sistema

### Indicadores de Atividade
- **"Digitando..."**: Mostra quando usuários estão digitando
- **Status de Conexão**: Conectado/Desconectado
- **Contador de Usuários**: Número de pessoas online

### Interface do Usuário
- **Design Responsivo**: Funciona em desktop e mobile
- **Tema Escuro**: Interface moderna e confortável
- **Animações**: Transições suaves e feedback visual
- **Notificações**: Alertas do navegador para novas mensagens

## 🔒 Segurança Implementada

- **Sanitização de Entrada**: Prevenção básica contra XSS
- **Validação de Dados**: Verificação de tipos e tamanhos
- **Limitação de Caracteres**: Máximo de 1000 caracteres por mensagem
- **Tratamento de Erros**: Captura e tratamento de exceções

## 🚧 Próximas Melhorias Sugeridas

### Nível 3 - Avançadas
- [ ] Sistema de salas/canais
- [ ] Compartilhamento de arquivos/imagens
- [ ] Emojis e reações
- [ ] Mensagens privadas
- [ ] Perfis de usuário com avatares

### Nível 4 - Profissionais
- [ ] Autenticação e autorização
- [ ] Banco de dados persistente
- [ ] Criptografia end-to-end
- [ ] API REST para integração
- [ ] Aplicativo mobile

## 🐛 Problemas Conhecidos

- Mensagens são perdidas ao reiniciar o servidor (sem banco de dados)
- Limite de usuários simultâneos não implementado
- Sem moderação de conteúdo
- Reconexão pode falhar em redes instáveis

## 📄 Licença

Este projeto é de código aberto e está disponível sob a licença MIT.

## 🤝 Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para:
- Reportar bugs
- Sugerir melhorias
- Enviar pull requests
- Melhorar a documentação

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique a documentação
2. Consulte os logs do servidor
3. Teste em diferentes navegadores
4. Verifique a conexão de rede

---

**Desenvolvido com ❤️ para demonstrar as capacidades de um chat em tempo real moderno.**

