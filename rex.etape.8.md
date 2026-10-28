# REX — Étape 8 : compose de production, préparé pour Swarm

> Retour d'expérience personnel. Ce que j'ai fait, ce que j'ai compris, ce que je retiens.
> Contexte : branche `feat/compose-prod`, registre `ghcr.io/adiattara/docker-swarm-fullstack-app`.

---

## 1. Ce qui a été livré

`compose.prod.yml` ne construit plus rien. Il déploie des images publiées et il porte les directives
que Swarm lira à l'étape 9.

| Changement | Avant | Après |
|---|---|---|
| Origine des images | `build: ./back`, `build: ./front` | `image: …/back:1.0.0`, `…/front:1.0.1` |
| Contenu du fichier | `back` + `front` seulement, dépendait de `compose.pg.yml` | les 3 services, le volume et le secret |
| Postgres | `container_name: postgres_db`, port `5432` publié | plus de nom fixe, plus de port publié |
| Réseaux | `name:` + `driver: bridge` figés | définitions vides, préfixées par le nom de stack |
| Mises à jour | rien | `deploy.update_config` + `rollback_config` |
| Front | aucun test de santé | healthcheck dans l'image |
| Proxy `/api` | UP résolu une fois au démarrage | `resolver` + variable, résolu à chaque requête |

Validation : `grep build:` → rien, `docker stack config -c compose.prod.yml` → ok.

---

## 2. Les idées que je retiens

### Un tag n'est pas une copie

`1.0.0`, `1.0` et `latest` pointent sur le **même digest**. Tagger, c'est coller une étiquette
supplémentaire sur les mêmes octets. `--all-tags` pousse les trois d'un coup.

Et surtout : **déployer `1.0.0`, jamais `latest`**. `latest` bouge ; un rollback vers `latest` ne
ramène rien de prévisible.

### Le digest est la seule identité stable

```
front:1.0.0 → sha256:5b7be365…   (ne bouge jamais)
front:1.0   → sha256:5f8670a2…   (suit le dernier patch)
```

C'est pour ça qu'on a publié `1.0.1` au lieu de reconstruire `1.0.0` par-dessus.

### Le dernier étage du Dockerfile est la cible par défaut

`prod` est en dernier → `docker build ./front` construit la prod. `--target prod` ne change pas le
résultat, il documente l'intention. En script ou en CI, on l'écrit.

Et le legacy builder (sans buildx) **traverse** les étages dans l'ordre du fichier : `--target prod`
exécute `dev` au passage. Ce n'est pas grave — le cache évite de rejouer `npm ci`, et aucun `CMD`
ne s'exécute au build.

### Compose et Swarm ne lisent pas le même dialecte

| Point | Compose | Swarm |
|---|---|---|
| `depends_on` long (`condition:`) | ✅ | ❌ `must be a list` |
| `depends_on` court (`- db`) | ✅ ordre de démarrage | ignoré |
| `restart: unless-stopped` | ✅ | ignoré → `deploy.restart_policy` |
| `container_name` | ✅ | ignoré |
| `driver: bridge` | ✅ | ❌ il faut `overlay` |
| `name:` sur un réseau | ✅ | désactive le préfixe de stack |
| `deploy.replicas` | honoré (et casse sur port publié) | ✅ |
| secret `file:` | ✅ | ❌ introuvable sur les nœuds |
| port publié | sur une machine | sur **tous** les nœuds (routing mesh) |

D'où la règle : laisser les définitions **vides** quand un champ a un bon défaut par orchestrateur.
`network: {}` → bridge en Compose, overlay en Swarm.

### `deploy.replicas: 2` sans mesh, ça casse

Compose v2 honore `deploy.replicas`. Il a donc essayé de créer deux fronts qui publient tous les deux
`4200` :

```
Bind for 0.0.0.0:4200 failed: port is already allocated
```

En Swarm, le port est tenu par le **routing mesh**, pas par la tâche : deux réplicas cohabitent.
C'est la différence la plus concrète entre les deux orchestrateurs.

En local : `docker compose up -d --scale front=1`.

### Un healthcheck observe, il ne répare pas

Il lance une commande dans le conteneur à intervalle régulier. Il ne redémarre rien, ne tue rien. Il
change ce que l'orchestrateur **sait** : `Up` = « le processus existe », `(healthy)` = « il répond ».

Et je corrige ce que j'avais cru au début : le rollback se déclenche sur une tâche qui **échoue**,
donc un nginx qui crashe suffit. Le healthcheck sert surtout à rendre visible un service qui tourne
mais répond 500.

### DNS : `resolver` seul ne sert à rien

nginx résout un nom **au chargement de la config** et garde l'IP. En Compose ça suffisait
(`depends_on` + IP stable). En Swarm :

- le back peut ne pas exister au boot → nginx refuse de démarrer ;
- chaque nouvelle tâche reçoit une **nouvelle IP** → 502 permanent.

La solution tient en deux morceaux, et il faut les deux :

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;   # l'annuaire (DNS interne de Docker)

set $back_upstream http://back:3000;
proxy_pass $back_upstream;                # variable → résolution à chaque requête
```

Testé : sans back, le conteneur reste `(healthy)`, `/` renvoie 200 et `/api/items` renvoie 502 avec
`back could not be resolved`. Il ne crashe plus.

---

## 3. Les pièges rencontrés, dans l'ordre

| Piège | Message / symptôme | Correctif |
|---|---|---|
| `depends_on` en forme longue | `services.back.depends_on must be a list` | forme liste `- db` |
| Secret `external: true` trop tôt | `unsupported external secret db_password` | garder `file:` jusqu'à l'étape 9 |
| Deux réplicas en Compose | `port is already allocated` | `--scale front=1` |
| `driver: bridge` en Swarm | refus du réseau | laisser vide (overlay par défaut) |
| `name:` sur un réseau | collision entre participants | supprimer, le préfixe de stack suffit |
| `container_name` | ignoré en Swarm | supprimer |
| Port `5432` publié | base exposée sur tous les nœuds | retirer `ports:` |
| Healthcheck dans le mauvais endroit | rebuild à chaque réglage | le mettre dans l'image si la sonde décrit l'app |
| Ancien tag après un fix | la correction ne part pas | `1.0.1`, push, tag mis à jour |

---

## 4. Commandes que je réutilise

```bash
# construire et publier une nouvelle version du front
docker build --target prod -f front/Dockerfile \
  -t ghcr.io/adiattara/docker-swarm-fullstack-app/front:1.0.1 \
  -t ghcr.io/adiattara/docker-swarm-fullstack-app/front:1.0 \
  -t ghcr.io/adiattara/docker-swarm-fullstack-app/front:latest front
docker push --all-tags ghcr.io/adiattara/docker-swarm-fullstack-app/front

# valider avant de déployer
docker stack config -c compose.prod.yml > /dev/null && echo ok
docker compose -f compose.prod.yml config > /dev/null && echo ok

# prod locale (images du registry)
docker compose -f compose.prod.yml up -d --scale front=1

# vérifier l'état d'une sonde
docker inspect <conteneur> --format '{{.State.Health.Status}}'
```

---

## 5. Ce qui reste

- **Étape 9** : `docker swarm init`, `docker secret create db_password …`, secret en `external: true`,
  `docker stack deploy --with-registry-auth fullstack`, vérifier `2/2` sur le front.
- **Étape 10** : publier `1.1.0`, déployer, constater le remplacement `start-first`, puis
  `docker service update --rollback`.
- **Limite assumée** : mono-nœud = pas de haute disponibilité ; `init.sql` en bind mount ne survit pas
  à un cluster multi-nœuds (il faudrait un `config`).
