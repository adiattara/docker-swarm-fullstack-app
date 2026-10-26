FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /usr/src/app

# Install dependencies first so the layer cache survives source changes
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy sources with the non-root user ownership
COPY --chown=node:node . .

# Never run the application as root
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "server.js"]