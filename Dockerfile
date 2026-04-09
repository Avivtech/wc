FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY public ./public
COPY src ./src
COPY data ./data
COPY server.js ./server.js

RUN mkdir -p /app/data/cache /app/data/picks && chown -R node:node /app

USER node

EXPOSE 8080

CMD ["node", "server.js"]
