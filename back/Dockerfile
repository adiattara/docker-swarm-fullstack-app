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

CMD ["node", "server.js"]