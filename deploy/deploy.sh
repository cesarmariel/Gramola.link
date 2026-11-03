#!/usr/bin/env bash
# Despliega server/ y web/ al servidor indicado en deploy/deploy.env y reinicia el servicio.
# No borra canciones del servidor (web/songs se sincroniza sin --delete).
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/deploy.env
# Opciones extra de SSH (por ejemplo una conexión maestra ya abierta: -o ControlPath=…)
SSH="ssh ${DEPLOY_SSH_OPTS:-}"
rsync -az -e "$SSH" --delete --exclude node_modules --exclude data server/ "$DEPLOY_HOST:$DEPLOY_DIR/server/"
rsync -az -e "$SSH" --delete --exclude songs web/ "$DEPLOY_HOST:$DEPLOY_DIR/web/"
# Herramientas de canciones (el admin las usa para el Megamix y el volumen; necesitan python3 y ffmpeg en el servidor)
rsync -az -e "$SSH" --delete --exclude __pycache__ tools/ "$DEPLOY_HOST:$DEPLOY_DIR/tools/"
# Las canciones NO se despliegan desde aquí (tienen derechos y se suben aparte con tools/subir-canciones.sh)
# El trabajador de creación importa tools/trabajador/crear.py al arrancar: si existe su servicio, se reinicia también
# (un trabajo a medias vuelve a la cola una vez)
$SSH "$DEPLOY_HOST" "mkdir -p $DEPLOY_DIR/data && cd $DEPLOY_DIR/server && npm ci --omit=dev --silent && chown -R $DEPLOY_USER:psacln $DEPLOY_DIR && systemctl restart gramola && systemctl try-restart gramola-trabajador 2>/dev/null; sleep 1 && curl -fsS http://127.0.0.1:8877/api/health"
echo
echo "Desplegado."
