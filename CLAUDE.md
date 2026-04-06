# CLAUDE.md — Guia do Projeto meu-saas

Este arquivo define regras e padrões que devem ser seguidos em **todas** as modificações feitas com IA neste projeto.

---

## Arquitetura Geral

- **Monorepo full-stack:** frontend React em `/src/`, backend Express em `/backend/src/`
- **Frontend:** React 19 + Vite + Tailwind CSS (sem React Router — roteamento manual via estado em `App.jsx`)
- **Backend:** Express.js com ES modules (`import`/`export`, nunca `require`)
- **Banco:** PostgreSQL via Prisma ORM (nunca acesso direto ao banco sem Prisma)
- **Filas assíncronas:** BullMQ + Redis para jobs pesados

---

## Regras que NUNCA devem ser violadas

### Autenticação e Segurança
- Nunca remover ou contornar o middleware de autenticação em `backend/src/middleware/auth.js`
- Nunca expor variáveis de ambiente em logs, respostas de API ou código frontend
- Variáveis do frontend devem ter prefixo `VITE_` — nunca usar variáveis sem esse prefixo no código do Vite/React
- A lista de rotas públicas (`PUBLIC_ROUTES`) em `auth.js` só deve ser ampliada com motivo justificado

### Banco de Dados
- Sempre usar o cliente Prisma singleton em `backend/src/config/prisma.js` — nunca instanciar um novo PrismaClient
- Usar `DATABASE_URL` (pooler PgBouncer) para a aplicação e `DIRECT_URL` apenas para migrações
- Nunca rodar `prisma migrate` em produção sem revisão explícita

### Filas e Workers
- Todos os workers BullMQ são inicializados automaticamente pelo `server.js` — não criar workers que precisem ser iniciados separadamente sem atualizar o `server.js`
- Jobs longos devem atualizar progresso com `job.updateProgress(percentage)`
- A conexão Redis deve respeitar o padrão existente em cada worker (com `tls: {}` em produção)

### Frontend — Roteamento
- O roteamento é **manual** via `activePage` no `App.jsx` com `localStorage` — **não instalar React Router**
- Toda nova página deve ser registrada em `MODULOS` (`/src/constants/recursos.js`) e no controle de acesso `PERMISSIONS_BY_ROLE`
- O controle de acesso usa `canAccess(page)` do `AuthContext` — nunca ignorar isso

### Frontend — Fetch e Autenticação
- Usar o `fetch` global (interceptado pelo `AuthContext`) — ele injeta o token JWT automaticamente
- Nunca fazer chamadas de API sem passar pelo interceptor (não criar instâncias axios separadas no frontend)
- Tratar erros 401 como logout automático (já tratado pelo interceptor)

### Permissões e Multi-tenant
- A estrutura de permissões usa roles: `SUPER_ADMIN`, `OWNER`, `OPERATOR`, `VIEWER`, `SUPPORT`
- Sub-usuários herdam dados do `parentUserId` — nunca quebrar essa herança
- A impersonação (suporte impersonando cliente) usa flags `isImpersonating`, `targetUserId` no token JWT — não remover essas flags

---

## Padrões de código obrigatórios

### Backend — Controllers
```javascript
// Padrão obrigatório em controllers:
const meuMetodo = async (req, res) => {
  const { param } = req.query; // ou req.body

  // Validação com early return
  if (!param) return res.status(400).json({ erro: 'Parâmetro obrigatório' });

  try {
    // Lógica de negócio
    const resultado = await algumService.metodo(param);
    return res.json({ resultado });
  } catch (err) {
    console.error('Descrição do erro:', err.message);
    return res.status(500).json({ erro: 'Mensagem amigável' });
  }
};
```

- Controllers exportam um objeto com métodos nomeados — nunca funções soltas
- Funções utilitárias do controller ficam no mesmo arquivo, no escopo do módulo
- Sem middleware de erro centralizado — cada controller trata seus próprios erros

### Backend — Rotas
- Rotas mais específicas (com parâmetros fixos) vêm **antes** das genéricas (com `:id`)
- Todas as rotas são montadas em `app.js` e protegidas pelo middleware de auth (exceto as da `PUBLIC_ROUTES`)

### Frontend — Componentes
```javascript
// Padrão obrigatório em componentes:
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function NomeDoComponente() {
  const { usuarioAtual } = useAuth();
  const [estado, setEstado] = useState(null);

  useEffect(() => { /* buscar dados */ }, []);

  return <div className="...">...</div>; // Tailwind para estilo
}
```

- Toda estilização via **Tailwind CSS** — sem CSS modules, styled-components, ou `style={}` exceto para valores dinâmicos pontuais
- Ícones como JSX inline (SVG) — não instalar bibliotecas de ícones sem aprovação explícita
- Contextos globais disponíveis: `AuthContext`, `ContasMLContext` — usar antes de criar estado local desnecessário

### Frontend — Estado Global vs Local
- Estado de autenticação e permissões → `AuthContext`
- Contas ML e conexão Tiny → `ContasMLContext`
- Estado de página e filtros → `useState` local no componente
- Página ativa → `localStorage` via `App.jsx` (não criar outro mecanismo)

---

## Regras de negócio — lógica obrigatória

Estas regras não são óbvias pelo código e devem ser respeitadas em qualquer alteração relacionada a preços ou concorrência:

- **Atualização de preço:** sempre que o preço de um produto for alterado em qualquer parte do sistema, deve-se também enviar a atualização do preço de atacado
- **Concorrência ativada:** para atualizar o preço de um produto que tem a concorrência ativada, é obrigatório **primeiro desativar a concorrência** antes de aplicar o novo preço

---

## O que NÃO fazer

- Não instalar dependências novas sem necessidade clara e aprovação
- Não converter o projeto de ES modules para CommonJS (ou vice-versa)
- Não adicionar Redux, Zustand ou outro gerenciador de estado global
- Não substituir Tailwind por outra solução de CSS
- Não criar arquivos `.css` separados por componente
- Não remover o handler de health check em `/health`
- Não modificar `prisma/schema.prisma` sem revisar impacto nas migrations
- Não commitar arquivos `.env` com credenciais reais
- Não adicionar `console.log` de debug em código de produção

---

## Fluxo de desenvolvimento

### Dev local
```bash
# Terminal 1 — frontend
npm run dev

# Terminal 2 — backend
npm run server
```

### Build e produção
```bash
npm run build   # Gera Prisma client + build do Vite
npm start       # Sobe backend que serve o /dist do frontend
```

O Express serve o SPA em produção — todas as rotas desconhecidas retornam `index.html`.

---

## Integrações externas

| Serviço | Variáveis | Onde é usado |
|---|---|---|
| Mercado Livre API | `ML_APP_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` | OAuth, catálogo, anúncios |
| Tiny ERP | `TINY_API_TOKEN`, `TINY_REDIRECT_URI` | Sync de produtos |
| MercadoPago | `mpAccessToken`, `mpPublicKey` | Assinaturas |
| Redis/Upstash | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | BullMQ |
| Neon PostgreSQL | `DATABASE_URL`, `DIRECT_URL` | Banco de dados |
| Imgur | `imgurClientId`, `imgurClientSecret` | Upload de imagens |
| RemoveBG | chave por usuário | Remoção de fundo |

---

## Arquivos críticos — não modificar sem revisão

- `backend/src/middleware/auth.js` — autenticação e autorização
- `backend/src/config/prisma.js` — cliente de banco de dados
- `backend/src/server.js` — inicialização de workers e handlers globais
- `backend/src/app.js` — montagem de rotas e configuração do Express
- `src/contexts/AuthContext.jsx` — autenticação do frontend e interceptor de fetch
- `src/constants/recursos.js` — MODULOS, RECURSOS_SISTEMA, PERMISSIONS_BY_ROLE
- `src/App.jsx` — roteamento e controle de acesso do frontend
- `prisma/schema.prisma` — schema do banco de dados
