# Shared dependency stage: installed once, reused by every stage below.
# No NODE_ENV=production here, otherwise npm would skip the Angular CLI.
FROM node:24-alpine AS deps
WORKDIR /usr/src/app

# The Angular tooling writes caches here, so the non-root user must own it.
RUN chown node:node /usr/src/app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci && npm cache clean --force

# Stage 1: build the app into static files (dist/front/browser).
FROM deps AS build
COPY --chown=node:node . .
RUN npx ng build --configuration=production

# Stage 2: development server, used by compose.dev.yml through `target: dev`.
FROM deps AS dev
COPY --chown=node:node . .

EXPOSE 1234

# --host 0.0.0.0 makes the server reachable from outside the container,
# --proxy-config forwards /api to the back like nginx does in production.
CMD ["npx", "ng", "serve", "--port", "1234", "--host", "0.0.0.0", "--watch", "false", "--proxy-config", "proxy.conf.json"]

# Stage 3: serve the static build with nginx. Node and the sources stay out
# of this image: only the 300 kB produced by the build stage are copied in.
# Last stage on purpose: `docker build ./front` with no target builds prod.
FROM nginx:alpine AS prod
COPY --from=build /usr/src/app/dist/front/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
