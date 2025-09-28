#!/usr/bin/env bash
set -euo pipefail

# Vous pouvez ajouter ici des vérifications avant le lancement,
# par ex. s’assurer que le socket Docker est présent.
if [[ ! -S /var/run/docker.sock ]]; then
    echo "[ERR]] Le socket Docker n’est pas monté ! Abort."
    exit 1
fi

exec "$@"