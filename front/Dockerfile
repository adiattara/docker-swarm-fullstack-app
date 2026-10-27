FROM node:24-alpine

# Development image: serves the Angular app with its dev server, with the
# sources baked in. Step 6 replaces this with a multi-stage nginx build.
WORKDIR /usr/src/app

# The dev server writes its cache here, so the non-root user must own it.
RUN chown node:node /usr/src/app
USER node

# Install dependencies first so the layer cache survives source changes.
# `npm ci` without --omit=dev: ng serve needs the Angular CLI.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY --chown=node:node . .

EXPOSE 1234

# --host 0.0.0.0 makes the server reachable from outside the container,
# --watch false keeps the container from doing work nobody asked for.
CMD ["npx", "ng", "serve", "--port", "1234", "--host", "0.0.0.0", "--watch", "false"]
