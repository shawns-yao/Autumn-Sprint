FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS frontend
COPY index.html tsconfig*.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=8787 \
    DB_PATH=/app/data/autumn-sprint.sqlite
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json server.mjs ./
COPY server ./server
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]

FROM caddy:2-alpine AS web
COPY Config/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend /app/dist /srv
