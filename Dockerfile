FROM node:22-slim

# Chromium do sistema para a análise com navegador real
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-noto fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# Relatórios salvos (SQLite + imagens). Monte um disco/volume em /app/data.
RUN mkdir -p /app/data && chmod +x docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
