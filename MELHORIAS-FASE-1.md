# Kronos OS — Fase 1

## O que foi alterado nesta etapa

### Segurança
- senhas novas agora são salvas com hash usando `bcryptjs`;
- logins de usuários antigos em texto puro ainda funcionam e são migrados automaticamente para hash no primeiro login;
- `JWT_SECRET` agora é obrigatório em produção;
- adicionado carregamento de variáveis de ambiente com `.env` local;
- criada proteção simples contra excesso de tentativas de login;
- criação de admin padrão automático ficou restrita ao ambiente local e somente quando `ALLOW_DEFAULT_ADMIN=true`.

### Banco / backend
- debug do banco corrigido para PostgreSQL;
- `db.js` ajustado para usar SSL somente em produção;
- criada tabela `ordens_servico_historico` automaticamente;
- adicionadas colunas de responsável técnico e tempo de resolução, se ainda não existirem.

### Ordens de serviço
- toda OS nova passa a registrar histórico;
- mudança de status agora registra histórico;
- status finalizado calcula `tempo_resolucao_horas`;
- criada rota `GET /api/os/:id/historico`.

## Arquivos principais alterados
- `backend/server.js`
- `backend/db.js`
- `backend/middleware/auth.js`
- `backend/routes/usuarios.js`
- `backend/routes/os.js`
- `backend/package.json`
- `backend/package-lock.json`

## Arquivos novos
- `backend/.env.example`
- `backend/config/env.js`
- `backend/utils/password.js`
- `backend/utils/loginRateLimit.js`

## Como testar localmente
1. copiar `backend/.env.example` para `backend/.env`;
2. ajustar `DATABASE_URL` e `JWT_SECRET`;
3. se quiser criar admin local automático, definir `ALLOW_DEFAULT_ADMIN=true`;
4. no backend, rodar `npm install`;
5. iniciar com `npm start` ou `npm run dev`.

## Observação
Nesta fase eu foquei em **segurança + base de histórico da OS**, sem mexer pesado no frontend para não quebrar o fluxo atual.
