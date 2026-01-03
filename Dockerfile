FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev

COPY public/ ./public/
COPY server.js hypermind2.svg LICENSE ./
COPY src/ ./src/

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
