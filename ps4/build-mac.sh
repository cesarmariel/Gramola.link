#!/usr/bin/env bash
# Compila la versión de escritorio (Mac) para desarrollar: ./build-mac.sh && GRAMOLA_CANCIONES=… ./gramola-mac
set -euo pipefail
cd "$(dirname "$0")"
clang++ -std=c++17 -O2 -Wall -Wno-unused-function -o gramola-mac src/main.cpp src/gfx.cpp src/audio.cpp src/pitch.cpp src/song.cpp src/plat_sdl.cpp $(sdl2-config --cflags --libs)
