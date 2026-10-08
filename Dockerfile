FROM node:22-slim

# Chromium do sistema para a análise com navegador real
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 3000
USER node
CMD ["node", "server.js"]
