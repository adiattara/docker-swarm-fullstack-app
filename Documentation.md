# Documentation du Projet Fullstack

## 1. Introduction et objectif

Ce projet est une application web fullstack composée de trois parties :

- **Frontend** : application Angular 19 servie en développement par `ng serve`, puis par nginx en production.
- **Backend** : serveur Node.js / Express 4 exposant une API REST sur la table `items`.
- **Base de données** : PostgreSQL (image officielle `postgres`), initialisée par `sql/init.sql`.

L'objectif de l'atelier « From Zero to Swarm » est de **dockeriser cette application étape par étape** : Postgres, compose, image backend, secrets, image front, multi-stage build, registry, compose de production, déploiement dans un cluster Docker Swarm, puis mise à jour et rollback.

> L'atelier n'est pas guidé : le code fourni peut et doit être modifié (paramétrage, Dockerfiles, compose, etc.) pour répondre aux exigences de chaque étape.

---

## 2. Architecture cible

```
Navigateur
    │  HTTP (port publié du front)
    ▼
┌──────────────┐      réseau front→back      ┌──────────────┐
│   front      │ ──────────────────────────► │    back      │
│ Angular/nginx│                             │ Node/Express │
└──────────────┘                             └──────┬───────┘
                                                    │ réseau back→pg
                                                    ▼
                                             ┌──────────────┐
                                             │   postgres   │◄── volume persistant
                                             └──────────────┘
```

Contraintes d'architecture :

- **Ségrégation réseau** : le front ne doit pas pouvoir joindre Postgres directement. Deux réseaux distincts : `front-back` et `back-pg`.
- **Persistance** : Postgres monte un volume nommé ; en Swarm, le service doit être placé sur un nœud fixe pour réutiliser le même volume.
- **Secrets** : le mot de passe de la base est fourni via un secret Docker (fichier), partagé entre `back` et `postgres`.
- **CORS** : désactivé volontairement côté back pour simplifier l'atelier (à traiter en bonus).

---

## 3. Structure du dépôt

```
.
├── back/                  # API Node.js / Express
│   ├── package.json
│   └── server.js          # serveur + pool pg + routes REST
├── front/                 # application Angular 19
│   ├── angular.json
│   ├── package.json
│   └── src/
│       ├── app/
│       │   ├── app.component.{ts,html,css}
│       │   ├── app.config.ts      # providers (router, HttpClient)
│       │   ├── app.routes.ts
│       │   └── my-component/      # composant qui liste les items
│       ├── index.html
│       ├── main.ts
│       └── styles.css
├── sql/
│   └── init.sql           # création de la table items + données initiales
├── .gitignore             # règles Git communes au dépôt
└── Documentation.md
```

Fichiers à produire pendant l'atelier : `compose.pg.yml`, `compose.adminer.yml`, `back/Dockerfile`, `back/.dockerignore`, `front/Dockerfile`, `front/.dockerignore`, `compose.dev.yaml`, `nginx.conf` (si proxy), `compose.prod.yaml`, `secrets/`.

---

## 4. État actuel du code applicatif

### 4.1 Backend — `back/server.js`

**Dépendances** (`back/package.json`) : `express ^4.21.2`, `cors ^2.8.5`, `pg ^8.13.2`. Aucun script `start`, pas de `nodemon`, pas de `.env`.

**Routes exposées**

| Méthode | Chemin | Corps attendu | Réponse |
|---|---|---|---|
| `GET` | `/api/items` | — | `200` + tableau d'items |
| `POST` | `/api/items` | `{ name, description }` | `200` + item créé |
| `PUT` | `/api/items/:id` | `{ name, description }` | `200` + item modifié, `404` si absent |
| `DELETE` | `/api/items/:id` | — | `200` + item supprimé, `404` si absent |

**Configuration actuelle**

- Port : `3000` (en dur).
- Pool `pg` : `fullstack_user` / `fullstack_password` / `fullstack` sur `localhost:5432` (valeurs **en dur**).
- CORS : `origin: true` (toute origine), options `200`.
- Démarrage : `app.listen()` est appelé **avant** la déclaration des routes.

**Points à corriger pendant l'atelier**

1. Ajouter `app.use(express.json())` : sans body parser, `req.body` est `undefined` et `POST`/`PUT` renvoient une 500.
2. Ajouter `GET /health` pour le healthcheck Docker (une 200 sans accès DB suffit, ou un `SELECT 1` avec timeout).
3. Remplacer toutes les valeurs en dur par des variables d'environnement (`PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PORT`) et lire le mot de passe depuis un fichier secret (`fs.readFileSync(process.env.PGPASSWORD_FILE, 'utf8').trim()`).
4. Libérer la connexion de test du pool (`pool.connect()` sans `release()` immobilise un client) ou utiliser `pool.query('SELECT 1')`.
5. Déclarer les routes avant `app.listen()`.
6. Gérer l'arrêt propre (`SIGTERM` → `pool.end()` + `server.close()`), utile en Swarm pour des rolling updates sans coupure.
7. Aligner le schéma SQL avec les colonnes utilisées (voir 4.3).

### 4.2 Frontend — `front/src/app`

- `main.ts` : bootstrap via `bootstrapApplication(AppComponent, appConfig)`.
- `app.config.ts` : `provideZoneChangeDetection`, `provideRouter(routes)`, `provideHttpClient()`.
- `app.routes.ts` : tableau `routes` vide (le `<router-outlet />` du template est donc inutile pour l'instant).
- `AppComponent` : titre `front`, importe `MyComponentComponent`.
- `MyComponentComponent` : `ngOnInit()` appelle `GET http://localhost:8364/api/items` (URL **en dur**), stocke la réponse dans `items: any[]`, affiche la liste dans un `<ul>` avec `@for` / `@empty`.
- `app.component.html` : template Angular par défaut (244 lignes, SVG, `<style>` inline) ; `app.component.css` et `my-component.component.css` sont vides.

**Points à corriger pendant l'atelier**

1. **Port incohérent** : le front appelle `8364`, le back écoute sur `3000`. Choisir un port publié (ex. `8364` côté back) ou utiliser un proxy.
2. Externaliser l'URL de l'API (`environment.ts`, `API_URL`) ou passer par un proxy Angular en dev (`proxy.conf.json`) et par nginx en production, pour ne plus coder `localhost` dans le composant.
3. Typer les données (`interface Item { id: number; description: string }`) et utiliser `track item.id` dans le `@for` (`description` n'est pas unique).
4. Afficher un état d'erreur / chargement, aujourd'hui seulement `console.error`.
5. Nettoyer le template par défaut et déplacer les styles inline vers `app.component.css`.

**Commandes**

```sh
npm install
npm start                 # ng serve (port 4200 par défaut)
npx ng build --configuration=production   # sortie : dist/front/browser/
```

### 4.3 Base de données — `sql/init.sql`

```sql
create table items (
  id bigint GENERATED ALWAYS AS IDENTITY,
  description text
);

insert into items (description) values
  ('Pleurote'), ('Shiitake'), ('Champignon de Paris blanc'),
  ('Champignon de Paris brun'), ('Pholiote'), ('Lion`s Mane');
```

| Élément | Valeur |
|---|---|
| Base | `fullstack` |
| Utilisateur | `fullstack_user` |
| Mot de passe | `fullstack_password` (à remplacer par un secret) |
| Table | `items` (`id`, `description`) |
| Port | `5432` |
| Données initiales | 6 champignons |

**Points à corriger**

- La table n'a **pas de `PRIMARY KEY`** sur `id` ni de `NOT NULL` sur `description`.
- Le backend insère et met à jour une colonne **`name` qui n'existe pas** : soit ajouter `name text` au schéma, soit retirer `name` des requêtes.
- Le script est exécuté automatiquement par l'image Postgres (`/docker-entrypoint-initdb.d/`) **uniquement si le volume de données est vide**.

---

## 5. Prérequis

- Docker et Docker Compose (plugin `docker compose`).
- Node.js 20+ et npm (pour lancer le back/front hors conteneur).
- `psql` ou Adminer pour inspecter la base.
- Pour l'étape 5 : `npm install -g @angular/cli` (ou `npx`).
- Pour les étapes 7-10 : accès à la registry fournie et à un nœud du cluster Swarm.

---

## 6. Étapes de l'atelier

### Étape 1 — Mise en place d'un serveur Postgres

**Objectif** : disposer d'un Postgres conteneurisé contenant les données d'initialisation.

**À faire**

- Lancer un conteneur `postgres` avec :
  - variables `POSTGRES_USER=fullstack_user`, `POSTGRES_PASSWORD=fullstack_password`, `POSTGRES_DB=fullstack` ;
  - volume nommé monté sur `/var/lib/postgresql/data` ;
  - port publié (ex. `5432:5432`) ;
  - `sql/init.sql` monté dans `/docker-entrypoint-initdb.d/`.

**Validation**

```sh
docker container exec -it <conteneur> psql -U fullstack_user -d fullstack
```

```sql
SELECT * FROM items;
```

Les 6 lignes doivent apparaître. Si la table n'existe pas, le volume existait déjà avant le montage du script : supprimer le volume et relancer.

---

### Étape 2 — Docker Compose pour la base de données

**Objectif** : rendre Postgres reproductible, puis ajouter un outil d'administration.

**À faire**

- `compose.pg.yml` : service `postgres` (image officielle, env, volume, port, réseau, `init.sql`).
- `compose.adminer.yml` : service `adminer` (image `adminer`), port publié (ex. `8080:8080`), rattaché au **même réseau** que Postgres.
- Créer un réseau dédié (ex. `pg-net`) et adapter les deux fichiers.

**Validation**

```sh
docker compose -f compose.pg.yml -f compose.adminer.yml up -d
```

Ouvrir `http://localhost:8080`, se connecter avec :

| Champ | Valeur |
|---|---|
| Système | PostgreSQL |
| Serveur | `postgres` (nom du service) |
| Utilisateur | `fullstack_user` |
| Mot de passe | `fullstack_password` |
| Base | `fullstack` |

La table `items` et ses 6 lignes doivent être visibles.

---

### Étape 3 — Image du backend

**Objectif** : construire une image du back et la faire tourner sur Postgres.

**À faire**

- `back/Dockerfile` : image de base `node:20-alpine` (ou équivalent), `WORKDIR`, copie de `package*.json`, `npm ci --omit=dev`, puis copie du code. Optimiser l'ordre des couches pour le cache.
- `back/.dockerignore` : `node_modules`, `npm-debug.log*`, `.env`, `.git`, etc.
- `HEALTHCHECK` basé sur `GET /health` (ajouter la route côté code), par ex. avec `wget -qO- http://localhost:3000/health` ou `node -e`.
- `compose.dev.yaml` : service `back`, build par compose, variables d'environnement DB pointant vers le **service Postgres** (`PGHOST=postgres`), dépendance sur Postgres, réseau.

**Validation**

```sh
docker compose -f compose.pg.yml -f compose.dev.yaml up -d --build
docker ps            # le back doit être "healthy"
curl http://localhost:8364/api/items
```

---

### Étape 4 — Paramétrisation et secrets

**Objectif** : supprimer les valeurs en dur (login, mot de passe, host, base, port).

**À faire**

- **Back** : lire le mot de passe depuis un fichier dont le chemin vient d'une variable d'environnement :

  ```js
  const fs = require('node:fs');
  const password = fs.readFileSync(process.env.PGPASSWORD_FILE, 'utf8').trim();
  ```

- Host, port, user, database, port HTTP : variables d'environnement.
- **Postgres** : utiliser `POSTGRES_PASSWORD_FILE` (supporté nativement par l'image) plutôt que `POSTGRES_PASSWORD`.
- **Docker Compose** : déclarer un secret commun aux deux services, monté dans `/run/secrets/`, et passer `PGPASSWORD_FILE=/run/secrets/db_password` côté back.

**Validation**

- Aucun mot de passe en clair dans le code, les Dockerfiles ou les compose.
- Les deux services démarrent avec le secret partagé.
- Changer le secret (et le volume) casse la connexion → preuve que le fichier est bien utilisé.

---

### Étape 5 — Dockerisation du front (dev)

**Objectif** : servir l'app Angular avec le serveur de dev et la connecter au back.

**À faire**

- `front/Dockerfile` (version dev) : image Node, `npm ci`, exposition du port `1234`, commande :

  ```sh
  ng serve --port 1234 --host 0.0.0.0 --watch false
  ```

- `front/.dockerignore` : `node_modules`, `dist`, `.angular`.
- Ajouter le service `front` à `compose.dev.yaml`, le publier (ex. `8364:1234` ou `4200:1234` selon l'URL utilisée par l'app).
- Corriger l'URL de l'API dans le code (relative + proxy, ou host/port réels).
- **Ségrégation réseau** : `front` et `back` sur un réseau `front-back` ; `back` et `postgres` sur un réseau `back-pg` ; le front ne doit **pas** être sur `back-pg`.

**Validation**

- Naviguer sur le front, la liste des champignons s'affiche.
- `docker exec` dans le front : le nom `postgres` ne doit pas être résolvable.

---

### Étape 6 — Multi-stage build

**Objectif** : servir le front statique avec nginx, sans `ng serve`.

**À faire**

- Étape 1 : image Node, `npm ci`, puis `RUN npx ng build --configuration=production`. Sortie : `dist/front/browser/`.
- Étape 2 : `FROM nginx:alpine`, copier `dist/front/browser/` vers `/usr/share/nginx/html`.
- Adapter les appels API : en production, nginx doit proxyfier `/api` vers le service `back` (sinon `localhost` dans le navigateur pointe vers le poste client). Prévoir une config nginx dédiée ou une URL d'API configurable au build.
- Configurer un fallback SPA (`try_files $uri $uri/ /index.html;`) si le routing Angular est utilisé.
- Mettre à jour `compose.dev.yaml` pour construire cette image.

**Validation**

```sh
docker build -t front:dev ./front
docker run --rm front:dev ls /usr/share/nginx/html
```

- Dans le navigateur, l'en-tête `Server: nginx` doit apparaître dans les réponses.

---

### Étape 7 — Déploiement dans la registry

**Objectif** : publier les images.

**À faire**

- Tagger les images avec l'adresse de la registry fournie : `registry.example.com/<votre-nom>/back:1.0.0`, `.../front:1.0.0`.
- Respecter le **versioning sémantique** et pousser tous les tags utiles (`1.0.0`, `1.0`, `latest`).
- Se connecter à la registry (`docker login`) avant le push.

**Validation**

```sh
docker push registry.example.com/<votre-nom>/back:1.0.0
docker push registry.example.com/<votre-nom>/front:1.0.0
```

Les images sont visibles dans la registry.

---

### Étape 8 — Compose de production

**Objectif** : décrire la stack avec les images de la registry.

**À faire**

- `compose.prod.yaml` : plus aucun `build:`, uniquement `image:` avec les noms complets de la registry.
- Conserver secrets, réseaux, volume Postgres, healthchecks, `restart: unless-stopped`.
- Ajouter les contraintes Swarm (voir étape 9) : `deploy.replicas`, `deploy.placement.constraints`, `deploy.update_config` / `rollback_config`.
- Attention aux **ports** et **noms de stack** pour ne pas entrer en collision avec les autres participants.

**Validation**

- Le fichier ne contient aucune référence à un build local.
- `docker stack config -c compose.prod.yaml` ne remonte pas d'erreur.

---

### Étape 9 — Mise en place de la stack Swarm

**Objectif** : déployer l'application dans le cluster.

**À faire**

- `docker stack deploy -c compose.prod.yaml <votre-stack>`.
- Postgres : volume nommé **et** placement sur votre nœud (label ou `node.hostname`), pour retrouver toujours les mêmes données.
- Vérifier que le healthcheck du back conditionne bien le démarrage (ou que les redémarrages convergent).
- Passer le service `front` à **2 réplicas**.

**Validation**

```sh
docker stack services <votre-stack>
docker service ls
docker service logs <votre-stack>_front
```

- Les 3 services sont `Running` (front x2).
- Le site répond et affiche les données.

---

### Étape 10 — Mise à jour et rollback

**Objectif** : livrer une nouvelle version puis revenir en arrière.

**À faire**

1. Modifier le front (ex. `front/src/app/app.component.html`).
2. Recompiler et tester en local avec le compose de dev.
3. Tagger une nouvelle version (`1.0.1`), pousser dans la registry.
4. Mettre à jour `compose.prod.yaml` et redéployer la stack :
   ```sh
   docker stack deploy -c compose.prod.yaml <votre-stack>
   ```
5. Vérifier la nouvelle version dans le navigateur.
6. Rollback :
   ```sh
   docker service rollback <votre-stack>_front
   ```
7. Vérifier que l'ancienne version est bien servie.

---

## 7. Récapitulatif des livrables

| Fichier | Étape | Rôle |
|---|---|---|
| `compose.pg.yml` | 2 | Postgres seul |
| `compose.adminer.yml` | 2 | Adminer + réseau partagé |
| `back/Dockerfile` | 3 | Image backend + healthcheck |
| `back/.dockerignore` | 3 | Contexte de build minimal |
| `compose.dev.yaml` | 3, 5, 6 | Stack de développement (pg + back + front) |
| secret Docker (ex. `secrets/db_password`) | 4 | Mot de passe partagé back/pg |
| `front/Dockerfile` | 5, 6 | Dev (`ng serve`) puis multi-stage nginx |
| `front/.dockerignore` | 5 | Contexte de build minimal |
| config nginx / proxy API | 5, 6 | Routage `/api` vers le back |
| `compose.prod.yaml` | 8 | Stack de production (images registry, deploy) |

---

## 8. Pièges et points d'attention

- **Volume Postgres** : `init.sql` ne s'exécute que sur un volume vide. En cas de doute : `docker compose down -v`.
- **Host dans le conteneur** : `localhost` désigne le conteneur lui-même. Utiliser les noms de services (`postgres`, `back`).
- **`localhost` dans le navigateur** : le code Angular s'exécute côté client ; `http://localhost:8364` vise la machine de l'utilisateur, pas le conteneur. Préférer une URL relative + proxy.
- **`package-lock.json`** : utiliser `npm ci` dans les Dockerfiles et copier les deux fichiers `package*.json` avant le code pour profiter du cache.
- **Secrets** : ne jamais commiter le fichier de secret ; l'ajouter au `.gitignore`. En Swarm, les secrets `external` doivent exister au préalable.
- **Placement Postgres** : sans contrainte, Swarm peut replacer le service sur un autre nœud → nouveau volume → base vide (les données ne sont pas perdues, mais invisibles).
- **Rollback** : ne fonctionne que si l'image précédente est encore disponible dans la registry.
- **Healthcheck** : sans route `/health`, un healthcheck TCP peut déclarer le back prêt avant que Postgres soit joignable.

---

## 9. Conclusion

Ce projet couvre l'ensemble du cycle de vie d'une application fullstack conteneurisée : base de données, build d'images, gestion des secrets, build multi-stage, publication en registry, déploiement orchestré et stratégie de mise à jour. Chaque étape est validable indépendamment, ce qui permet d'avancer de façon incrémentale.
