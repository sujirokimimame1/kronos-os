FROM node:18

WORKDIR /app

# Copiar package.json do backend
COPY backend/package*.json ./

# Instalar dependências
RUN npm install --omit=dev

# Copiar todo o projeto
COPY . .

# Criar pasta de dados persistente
RUN mkdir -p /data

# Configurar ambiente
ENV DB_PATH=/data/kronos.db
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Iniciar servidor
CMD ["node", "backend/server.js"]