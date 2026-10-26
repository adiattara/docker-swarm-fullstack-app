# 🐳 DockerSwarmStack

> **A fullstack playground, containerised from zero to Docker Swarm.**

[![Angular](https://img.shields.io/badge/Angular-19-DD0031?logo=angular&logoColor=white)](https://angular.dev)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![Docker Swarm](https://img.shields.io/badge/Swarm-orchestrated-1D63ED?logo=docker&logoColor=white)](https://docs.docker.com/engine/swarm/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**DockerSwarmStack** is a deliberately small fullstack application — a mushroom catalogue — used as a realistic
support to learn and demonstrate **containerisation and orchestration**: Postgres in a container, Compose
stacks, secrets, multi-stage builds, an nginx-served Angular bundle, a private registry, a production stack,
and rolling updates with rollback on **Docker Swarm**.

Small surface, full lifecycle. 🚀

> **Status:** 🚧 early stage. The application runs; the Docker/Swarm packaging is being built step by step
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
                  │  back    (Node.js 20 / Express 4)        │
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
| Backend | Node.js 20, Express 4, `pg` | REST API and DB pool |
| Database | PostgreSQL | Single `items` table, seeded with mushrooms |
| Dev | Docker Compose + Adminer | Local stack and DB inspection |
| Prod | Docker Swarm + nginx | Orchestration, static serving, rollback |

---

## 🚀 Quick start (current state)

> Docker packaging is on the roadmap; for now, run the services manually.

**1. Database**

```sh
docker run -d --name dockerswarmstack-pg \
  -e POSTGRES_USER=fullstack_user \
  -e POSTGRES_PASSWORD=fullstack_password \
  -e POSTGRES_DB=fullstack \
  -p 5432:5432 \
  -v "$PWD/sql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
  postgres:16-alpine
```

**2. Backend** — http://localhost:3000

```sh
cd back
npm ci
node server.js
```

**3. Frontend** — http://localhost:4200

```sh
cd front
npm ci
npm start
```

> ⚠️ The API URL is currently hardcoded in `my-component.component.ts` and must point to the backend
> (`8364` in the workshop compose, `3000` here). Making it configurable is part of the roadmap.

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

- [ ] **01** — Postgres in a container, seeded from `sql/init.sql`
- [ ] **02** — `compose.pg.yml` + Adminer on a shared network
- [ ] **03** — Backend image, `.dockerignore`, healthcheck, `compose.dev.yaml`
- [ ] **04** — Secrets everywhere: no credential in code or compose
- [ ] **05** — Frontend in dev (`ng serve`) with proper network segregation
- [ ] **06** — Multi-stage build served by nginx
- [ ] **07** — Semantic versioning and registry push
- [ ] **08** — Production compose using registry images
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
│   ├── server.js         # routes + PostgreSQL pool
│   └── package.json
├── front/                # Angular 19 application
│   └── src/app/
│       ├── app.component.*
│       └── my-component/ # item list
├── sql/
│   └── init.sql          # schema + seed data
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
