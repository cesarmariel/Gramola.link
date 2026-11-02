#!/usr/bin/env bash
# Sube a la PS4 (FTP de GoldHEN, puerto 2121) el paquete y, si se indica, canciones.
#   ./subir.sh 192.168.1.50                       → solo el .pkg a /data/pkg
#   ./subir.sh 192.168.1.50 ~/canciones/*         → además, esas carpetas a /data/gramola/canciones
set -euo pipefail
cd "$(dirname "$0")"
IP=${1:?Falta la IP de la PS4}; shift
FTP="ftp://$IP:2121"
PKG=$(ls IV0000-GRAM00001_00-*.pkg | head -1)
echo "· $PKG → /data/pkg/"
curl -s --ftp-create-dirs -T "$PKG" "$FTP/data/pkg/$PKG"
for d in "$@"; do
  [ -d "$d" ] || continue
  n=$(basename "$d")
  echo "· canción: $n"
  find "$d" -maxdepth 1 -type f \( -iname '*.txt' -o -iname '*.mp3' -o -iname '*.jpg' -o -iname '*.png' \) ! -iname 'megamix*' ! -iname 'voz*' -print0 |
    while IFS= read -r -d '' f; do
      curl -s --ftp-create-dirs -T "$f" "$FTP/data/gramola/canciones/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$n")/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$(basename "$f")")"
    done
done
echo "Hecho. Instala el paquete desde GoldHEN (Ajustes de depuración → Juego → Instalador de paquetes)."
