#!/usr/bin/env bash
# Sube canciones ya preparadas (tools/preparar-canciones.py) a la carpeta de canciones del servidor.
#   tools/subir-canciones.sh CARPETA_PREPARADA
# Usa deploy/deploy.env (DEPLOY_HOST, DEPLOY_DIR, DEPLOY_USER, DEPLOY_SSH_OPTS). No borra canciones del servidor.
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/deploy.env
SRC="${1:?Indica la carpeta de canciones preparadas}"
SSH="ssh ${DEPLOY_SSH_OPTS:-}"
rsync -a --info=progress2 -e "$SSH" "$SRC"/ "$DEPLOY_HOST:$DEPLOY_DIR/web/songs/" 2>/dev/null || rsync -a -e "$SSH" "$SRC"/ "$DEPLOY_HOST:$DEPLOY_DIR/web/songs/"
$SSH "$DEPLOY_HOST" "chown -R $DEPLOY_USER:psacln $DEPLOY_DIR/web/songs && ls $DEPLOY_DIR/web/songs | wc -l"
