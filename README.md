# 🐳 DockerSwarmStack

> **A fullstack playground, containerised from zero to Docker Swarm.**

[![Angular](https://img.shields.io/badge/Angular-19-DD0031?logo=angular&logoColor=white)](https://angular.dev)
[![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![Docker Swarm](https://img.shields.io/badge/Swarm-orchestrated-1D63ED?logo=docker&logoColor=white)](https://docs.docker.com/engine/swarm/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**DockerSwarmStack** is a deliberately small fullstack application — a mushroom catalogue — used as a realistic
support to learn and demonstrate **containerisation and orchestration**: Postgres in a container, Compose
stacks, secrets, multi-stage builds, an nginx-served Angular bundle, a private registry, a production stack,
and rolling updates with rollback on **Docker Swarm**.

Small surface, full lifecycle. 🚀

> **Status:** steps 01 to 08 of the roadmap are done — the application runs on Compose from images
> published to a private registry, and the production stack is ready for Swarm. Step 09 is next
> (see [Roadmap](#-roadmap)).

---

## ✨ Why another fullstack app?

Because deploying is where most tutorials stop. DockerSwarmStack keeps the business logic trivial (one table,
four endpoints) so the focus stays on **what actually matters in production**:

- 🔐 **No secret in the image** — database passwords injected through Docker secrets
- 🧱 **Reproducible builds** — `npm ci`, `.dockerignore`, cached layers
- 🌐 **Network isolation** — the front can never reach Postgres directly
- 📦 **Multi-stage build** — Angular compiled once, served as static files by nginx
- 🔁 **Zero-downtime updates** — healthchecks, rolling update, one-command rollback
- 🧭 **Real orchestration** — Swarm services, placements, replicas, persistent volumes

---

## 🏗️ Architecture

```
                  ┌──────────────────────────────────────────┐
   Browser ──────►│  front   (Angular 19 → nginx)            │
                  └──────────────────┬───────────────────────┘
                                     │  front-back network
                                     ▼
                  ┌──────────────────────────────────────────┐
                  │  back    (Node.js 24 / Express 4)        │
                  └──────────────────┬───────────────────────┘
                                     │  back-pg network (private)
                                     ▼
                  ┌──────────────────────────────────────────┐
                  │  postgres  ◄── named volume (persistent) │
                  └──────────────────────────────────────────┘
```

Key rules:

| Rule | Why |
|---|---|
| Two isolated networks (`front-back`, `back-pg`) | Least privilege: the front never talks to the database |
| Password read from a file (`*_FILE` env vars) | Compatible with Docker Compose/Swarm secrets |
| Named volume + pinned placement | Data survives redeploys and rescheduling |
| `/health` endpoint | Swarm only routes traffic to a ready container |

---

## 🧰 Stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | Angular 19 (standalone, signals-ready) | SPA consuming the REST API |
| Backend | Node.js 24, Express 4, `pg` | REST API and DB pool |
| Database | PostgreSQL | Single `items` table, seeded with mushrooms |
| Dev | Docker Compose + Adminer | Local stack and DB inspection |
| Prod | Docker Swarm + nginx | Orchestration, static serving, rollback |

---

## 🚀 Quick start

**Prerequisites:** Docker Engine 24+, Docker Compose v2, and a login to the registry that holds the
images (`docker login ghcr.io`). The packages are private, so an anonymous `pull` is refused.

**1. Create the database secret**

The password never lives in a compose file or an image; it is read from a file that Docker mounts at
`/run/secrets/db_password`.

```sh
mkdir -p secrets
printf 'fullstack_password' > secrets/db_password.txt
chmod 600 secrets/db_password.txt
```

> ⚠️ PostgreSQL applies this password only when the data directory is **first** initialised.
> Changing the file on an existing volume changes nothing.

**2. Development stack** — sources mounted and rebuilt locally (Angular dev server, hot reload)

```sh
docker compose -f compose.pg.yml -f compose.dev.yml up -d --build
docker compose -f compose.adminer.yml up -d          # optional: DB inspector on :8080
```

| Service | URL |
|---|---|
| Front (`ng serve`) | http://localhost:4200 |
| Back | http://localhost:8364 |
| Adminer | http://localhost:8080 |

**3. Production stack** — registry images only, nothing is built

```sh
docker compose -f compose.prod.yml up -d --scale front=1
```

`--scale front=1` is required: the file declares `deploy.replicas: 2` for Swarm, and Compose honours
it, but two containers cannot publish the same host port without the routing mesh.

| Service | URL |
|---|---|
| Front (nginx) | http://localhost:4200 |
| Back | not published — reached only through nginx at `/api` |

**4. Back to the development stack**

`target` is a *build-time* setting, so switching back needs `--build`, otherwise Compose reuses the
nginx image:

```sh
docker compose -f compose.prod.yml down
docker compose -f compose.pg.yml -f compose.dev.yml up -d --build
```

---

## 📦 Images

| Image | Tags | Size | Content |
|---|---|---|---|
| `ghcr.io/adiattara/docker-swarm-fullstack-app/back` | `1.0.0` | 176 MB | Node 24, production dependencies, non-root |
| `ghcr.io/adiattara/docker-swarm-fullstack-app/front` | `1.0.1`, `1.0`, `latest` | 53 MB | nginx + the compiled Angular bundle |

`1.0.0` of the front is kept on purpose: it is the image **without** the healthcheck and without the
DNS resolver, which makes it the natural target for the rollback demonstration.

Deploy a **pinned** tag, never `latest`: a rollback has to restore something predictable.

```sh
docker build --target prod -f front/Dockerfile -t ghcr.io/adiattara/docker-swarm-fullstack-app/front:1.0.1 front
docker build -f back/Dockerfile -t ghcr.io/adiattara/docker-swarm-fullstack-app/back:1.0.0 back
docker push --all-tags ghcr.io/adiattara/docker-swarm-fullstack-app/front
```

---

## 🐝 Swarm deployment

`compose.prod.yml` carries the `deploy:` blocks, so the same file serves Compose and Swarm. Swarm
ignores `depends_on`, so the stack converges through healthchecks and restarts.

```sh
docker swarm init                                     # single node: manager and worker
docker secret create db_password secrets/db_password.txt

docker compose -f compose.prod.yml down               # free the ports and container names
docker stack deploy -c compose.prod.yml --with-registry-auth fullstack
```

`--with-registry-auth` is mandatory: the packages are private, and each node must be able to pull.

```sh
docker stack services fullstack        # REPLICAS 2/2 on front means the stack converged
docker stack ps fullstack              # one line per task, with the failure reason if any
docker service logs -f fullstack_front
```

What the file asks for:

| Service | Replicas | Policy |
|---|---|---|
| `db` | 1 | pinned to the node holding the volume, `stop-first` on update |
| `back` | 1 | `start-first`, rollback on failure, no placement (stateless) |
| `front` | 2 | `start-first`, `parallelism: 1`, rollback on failure |

**This is not high availability.** A single-node swarm has a single point of failure, and Postgres
remains a single writer on a single volume: two replicas of it would corrupt the data, not protect it.
The two front replicas demonstrate the routing mesh and zero-downtime replacement, nothing more.

**Known limitation:** `sql/init.sql` is bind-mounted from the host. That file exists only on the node
that has the repository. On a real multi-node cluster it must become a Swarm `config`.

---

## 🔌 API

Base path: `/api`

| Method | Route | Body | Result |
|---|---|---|---|
| `GET` | `/api/items` | — | List every item |
| `POST` | `/api/items` | `{ "name": "...", "description": "..." }` | Created item |
| `PUT` | `/api/items/:id` | `{ "name": "...", "description": "..." }` | Updated item (`404` if missing) |
| `DELETE` | `/api/items/:id` | — | Deleted item (`404` if missing) |

```sh
curl http://localhost:3000/api/items
```

---

## 🗺️ Roadmap

The containerisation journey, one validated step at a time:

- [x] **01** — Postgres in a container, seeded from `sql/init.sql`
- [x] **02** — `compose.pg.yml` + Adminer on a shared network
- [x] **03** — Backend image, `.dockerignore`, healthcheck, `compose.dev.yaml`
- [x] **04** — Secrets everywhere: no credential in code or compose
- [x] **05** — Frontend in dev (`ng serve`) with proper network segregation
- [x] **06** — Multi-stage build served by nginx
- [x] **07** — Semantic versioning and registry push
- [x] **08** — Production compose using registry images
- [ ] **09** — Swarm stack, pinned Postgres, 2 front replicas
- [ ] **10** — Rolling update and rollback

Application-level improvements tracked alongside:

- [ ] Parse JSON bodies (`express.json()`) and align SQL schema with the API (`name` column)
- [ ] Configurable API URL (`environment.ts` / proxy) — no `localhost` in the browser
- [ ] Typed `Item` model, `track item.id`, loading and error states
- [ ] Graceful shutdown (`SIGTERM`) for clean rolling updates

---

## 📁 Project structure

```
.
├── back/                 # Express API
│   ├── Dockerfile        # single stage, non-root, healthcheck
│   ├── server.js         # routes + PostgreSQL pool
│   └── package.json
├── front/                # Angular 19 application
│   ├── Dockerfile        # deps → build → dev → prod (prod last = default)
│   ├── nginx.conf        # SPA fallback, caching, /api proxy with resolver
│   ├── proxy.conf.json   # same /api proxy for the dev server
│   └── src/app/
│       ├── app.component.*
│       └── my-component/ # item list
├── sql/
│   └── init.sql          # schema + seed data
├── compose.pg.yml        # database only (dev), port 5432 published
├── compose.dev.yml       # front + back for development, target: dev
├── compose.prod.yml      # registry images, deploy blocks, self-contained
├── compose.adminer.yml   # optional DB inspector
├── Documentation.md      # full architecture & workshop guide
└── LICENSE
```

---

## 🧪 Contributing

This repository is primarily a learning sandbox, but issues and suggestions are welcome.
Open an issue, fork, branch, and keep changes focused.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  <sub>Built with 🍄, ☕ and a healthy obsession for reproducible deployments.</sub>
</p>
