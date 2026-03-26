FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma/ ./prisma/

RUN npm ci

RUN ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

COPY . .

EXPOSE 3001

CMD ["node", "backend/src/server.js"]
