# Administración

Portal para ver y controlar todo el juego. Lo sirve el mismo servidor (`server/admin.js` + `web/admin/`) en el
subdominio que empiece por **`admin.`** (o en el host de la variable `ADMIN_HOST`). En cualquier otro host
`/api/admin/*` no existe.

## Entrada: solo Touch ID

No hay contraseñas: se entra con **passkeys (WebAuthn)**, Touch ID en el Mac o Face ID en el iPhone.

- **Primera llave** (o si te quedas sin ninguna): en el servidor, enlace de un solo uso válido 30 minutos:
  ```bash
  cd /ruta/app/server && sudo -u USUARIO DATA_DIR=/ruta/app/data node alta.js https://admin.TU-DOMINIO
  ```
  Al abrirlo, «Dar de alta con Touch ID» guarda la llave y deja la sesión abierta.
- **Más llaves**: en *Seguridad*, con una entrada de hace menos de 10 minutos.
- Sesiones de 12 horas; en la base solo se guarda el hash de la cookie (`data/admin.json`). Cookies `HttpOnly`,
  `Secure` y `SameSite=Strict`; las peticiones que cambian algo tienen que venir de la propia página.

## Qué se ve y qué se puede hacer

| Apartado | Ver | Hacer |
|---|---|---|
| **Resumen** | Salas, teles, jugadores y quién canta ahora; hoy (salas, jugadores, canciones, teles, audio servido, picos); gráfico de 30 días; lo más cantado; totales | — |
| **Salas en directo** | Cada sala: código, tele (aparato y país), pantalla actual, modo y canción; jugadores con color, foto, conexión, aparato, latencia y volumen al cantar | Mensaje a la tele (y móviles), recargar la tele, echar a un jugador, cerrar la sala, aviso a todas las teles |
| **Canciones** | Lista paginada (25, 50, 100 o todas) con búsqueda, filtros (sin Megamix, volumen sin igualar, portada original, dúos, nunca cantadas…) y orden por cualquier columna | Ficha: escuchar, carátula (buscar en **iTunes y Deezer** y elegir, subir una propia, usar una imagen de la carpeta, volver a la anterior), Megamix (detectar, marcar el tramo a mano con el reproductor o quitar), medir e igualar el volumen, editar la cabecera del `.txt`, subir y borrar ficheros, renombrar la carpeta, retirar |
| **Novedades** | Botón «★ Novedades» junto a «Retiradas»: solo las marcadas | Seleccionar canciones con las casillas (también todas las de la página) y «Marcar como Novedades» o «Quitar de Novedades»; o desde la ficha. En la tele salen primero, en el grupo «★» y con la etiqueta NUEVA (`data/novedades.json`) |
| **Editor** y **Creación** | Ver abajo | Encajar notas y frases a mano; crear canciones desde audio + letra |
| **Canción nueva** | — | Subir los ficheros UltraStar (`.txt`, audio, portada); iguala el volumen y busca el estribillo |
| **Retiradas** | Canciones fuera del juego (`data/retiradas/`) | Restaurar o borrar para siempre |
| **Récords** | Cantantes y récord por canción | Renombrar o fusionar cantantes, borrar, vaciar el Salón de la fama (con copia) |
| **Actividad** | Registro de salas, jugadores, canciones cantadas y acciones del admin (`data/events.json`) | Filtrar |
| **Servidor** | Versión, encendido, conexiones, carga, memoria, disco, tamaños, telemetría de las teles | Descargar copia de los datos, reiniciar el servicio |
| **Seguridad** | Llaves y sesiones abiertas | Añadir y borrar llaves, cerrar las demás sesiones |

Las estadísticas por día se guardan en `data/stats.json` (último año).

## Editor de canciones

Desde la ficha, **«✎ Abrir en el editor»** (`#editor/<carpeta>`). Edita el mismo `.txt` que lee la tele.

- **Línea de tiempo**: notas a la altura de su tono, con la sílaba debajo; cortes de frase (líneas rojas, se arrastran);
  forma de onda de la canción o de **la voz sola**; **curva del tono de la voz real** (azul) si la canción está analizada;
  minimapa de toda la canción; regla en segundos.
- **Ratón**: clic elige, ⇧ clic añade, arrastrar el fondo elige varias; arrastrar una nota la mueve en tiempo y tono;
  sus bordes la alargan o acortan; doble clic cambia la sílaba (o crea una nota en el fondo); rueda desplaza, ⌘ rueda acerca.
- **Teclado**: ← → mover (⇧ 10 tiempos), ↑ ↓ tono (⇧ octava), ⌥ ← → duración, S partir, M unir con la siguiente,
  B corte de frase, G dorada, F libre, R rap, N normal, Supr borrar, ⌘A todas, ⌘Z / ⇧⌘Z deshacer / rehacer, ⌘S guardar, Espacio reproducir.
- **Reproducción** a 1×, 0,75× o 0,5× (sin cambiar el tono), **tono guía** (suena la nota de cada sílaba), **repetir frase**,
  vista de karaoke como en la tele y **prueba con el micro** del ordenador: se dibuja lo que cantas (verde) y da el % por frase.
- **GAP** (retraso de toda la letra) con ±10 / ±50 ms. Al guardar se rehace el tramo del Megamix (salvo si es manual).
- **Versiones**: cada guardado deja la anterior en `data/versiones/<carpeta>/` (las 60 últimas) y se puede volver a cargar.
- El `.txt` se escribe igual que estaba salvo lo que se cambie (probado con las 222 canciones: idénticas al leer y guardar).
  Los `.txt` en formato relativo se guardan en formato normal.

## Creación de canciones

**«✨ Crear canción»** (en *Canciones* o en *Creación*): artista, título, idioma, año, audio y la letra con **una frase por línea**.
El trabajo va a una cola que atiende el **trabajador** (`tools/trabajador/`, servicio `gramola-trabajador` en el mismo servidor, con prioridad mínima): separa la voz, encaja la letra
sílaba a sílaba, saca las notas y devuelve el `.txt`. El servidor la instala como **borrador** (`borrador.json` en la
carpeta: no sale en la tele), le pone la primera portada de iTunes, iguala el volumen y busca el estribillo del Megamix.
Se revisa en el editor y se **publica** desde la ficha (por defecto, entrando en Novedades).

En una canción de prueba con su `.txt` hecho a mano: los inicios de palabra a una mediana de 65 ms (el 92 % a menos de
150 ms) y el 76 % de las notas a ±1 semitono. Tarda unos 5 minutos por canción en el servidor.

**«Analizar la voz»** (en la ficha) hace solo la parte de la voz para una canción que ya existe: deja `voz.mp3` y
`voz-tono.json`, que el editor usa para encajar mejor.

El apartado *Creación* muestra si el trabajador está conectado, la cola con su avance, y permite reintentar o borrar.
La clave del trabajador se genera ahí (en el servidor solo se guarda su huella, `data/trabajador.json`) y va en
`/opt/gramola-trabajador/config.json`. Instalación y servicio en [tools/trabajador/LEEME.md](../tools/trabajador/LEEME.md).

## Requisitos en el servidor

- El servicio necesita escribir en la carpeta de canciones (`ReadWritePaths` de `deploy/gramola.service`).
- `python3` y `ffmpeg` para el Megamix y el volumen (usa `tools/megamix.py` y `tools/normalizar.py`, que `deploy.sh` sube junto al servidor).
- El subdominio `admin.` apuntando al mismo servidor (alias del dominio en Plesk y registro en Cloudflare).

## Mensajes nuevos del protocolo

El servidor manda a la tele `{type:'admin', action:'toast'|'reload', text}` y a los móviles `{type:'admin', action:'toast', text}`.
La tele añade a su estado `mode` y `song` (`{title, artist}`) para que el admin vea qué se canta.
