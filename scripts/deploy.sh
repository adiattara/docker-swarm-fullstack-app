#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Configuration non sensible, déclarée une seule fois dans .env
set -a
# shellcheck disable=SC1091
source .env
set +a

# Garde-fou : on refuse de déployer une stack incomplète
: "${POSTGRES_USER:?POSTGRES_USER est requis (voir .env)}"
: "${POSTGRES_DB:?POSTGRES_DB est requis (voir .env)}"
: "${FRONT_PORT:?FRONT_PORT est requis (voir .env)}"

STACK="${1:-fullstack}"

echo "Déploiement de la stack '$STACK'"
echo "  db user : $POSTGRES_USER"
echo "  db name : $POSTGRES_DB"
echo "  front   : :$FRONT_PORT"

docker stack deploy --with-registry-auth -c compose.prod.yml "$STACK"
