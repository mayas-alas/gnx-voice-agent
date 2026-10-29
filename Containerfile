# Supply an approved Node 22+ image pinned by digest at build time.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}
ARG NODE_IMAGE
RUN case "$NODE_IMAGE" in *@sha256:*) ;; *) echo 'Pinned NODE_IMAGE required' >&2; exit 1 ;; esac
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY app ./app
COPY config ./config
COPY mcp ./mcp
COPY web ./web
ENV NODE_ENV=production
CMD ["node", "app/server.js"]
