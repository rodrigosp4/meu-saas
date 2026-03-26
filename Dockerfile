FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma/ ./prisma/

RUN npm ci

RUN ./node_modules/.bin/prisma generate --schema=./prisma/schema.prisma

COPY . .

EXPOSE 3001

CMD ["node", "backend/src/server.js"]
