# Gramola para PS4 (app nativa)

App nativa en C++ para PS4 con GoldHEN, sin servidor: las canciones UltraStar van en la consola
(`/data/gramola/canciones/<carpeta>/` con su `.txt`, el `.mp3` y la portada) y se canta con un micro
de la consola (micro USB o auriculares con micro en el mando).

- `src/plat_ps4.cpp`: PS4 (piglet/OpenGL ES 2 del sistema con su shader precompilado de texturas, ScePad,
  SceAudioOut, SceAudioIn). `src/plat_sdl.cpp`: Mac con SDL2, para desarrollar y sacar capturas.
- `src/main.cpp`: pantallas (arranque, canciones con avance, cantar, pausa, resultados).
- `src/song.cpp` (UltraStar), `src/audio.cpp` (MP3 con minimp3, mezcla a 48 kHz), `src/pitch.cpp` (YIN),
  `src/gfx.cpp` (imágenes con stb_image, texto Archivo con stb_truetype).

## Compilar

- PS4: toolchain de [OpenOrbis](https://github.com/OpenOrbis/OpenOrbis-PS4-Toolchain) y LLVM + lld
  (`brew install llvm lld`); `OO_PS4_TOOLCHAIN=/ruta/PS4Toolchain make` → `IV0000-GRAM00001_00-GRAMOLAKARAOKE00.pkg`.
- Mac: `./build-mac.sh` (SDL2) y `GRAMOLA_CANCIONES=/carpeta ./gramola-mac`. Teclado: flechas, Intro (×),
  Esc (○), P (Options), Q/W (L1/R1). `GRAMOLA_GUION` pulsa botones y guarda capturas a su hora;
  `GRAMOLA_BOT=1` canta solo (para probar la puntuación).

## Pasar a la consola

`./subir.sh <IP de la PS4> [carpetas de canciones…]` (FTP de GoldHEN, puerto 2121): el paquete va a
`/data/pkg` y se instala con el instalador de paquetes de GoldHEN. El registro queda en `/data/gramola/registro.txt`.

Fuente Archivo (OFL, `assets/fonts/OFL.txt`); stb_image, stb_truetype y minimp3 (dominio público / CC0).
