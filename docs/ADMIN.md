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

**Modo sencillo** (el de por defecto; «Modo avanzado» lleva a la línea de tiempo completa de abajo):
- a la izquierda, la lista de frases (★ si tiene palabras doradas); al hacer clic, la frase llena el lienzo con cada
  sílaba como un bloque con su texto, a la altura de su nota, sobre la curva de la voz real;
- arriba, las **palabras de la frase como botones**: un clic elige sus sílabas; **★ Dorada** las marca (dan más puntos)
  y se ven en amarillo;
- toda la frase: «▶ Escuchar la frase» (con «Repetir frase», en bucle), anterior/siguiente (o ← →), antes/después
  (~50 ms), más corta/más larga (5 %) y «Ver en el juego desde aquí»;
- la sílaba o palabra elegida: acortar, alargar (sin pisar la siguiente), subir/bajar tono, mover, dorada; los bordes
  de los bloques también se arrastran.
- **Frases**: con palabras elegidas, «✂ Separar en otra frase» las deja en una frase aparte; si están al principio o al
  final de la frase, «⤒ Pasar a la frase anterior» / «⤓ Pasar a la frase siguiente»; «Unir con la siguiente» junta la
  frase con la de después.
- **Trozo sin cantar** (un solo, una parte instrumental): «⌇ Marcar trozo sin cantar» y arrastrar sobre él (también
  arrastrando sobre la forma de onda, en los dos modos); se puede escuchar y, con «Dejar sin cantar», las sílabas que
  caían dentro se aprietan antes o después del trozo (según a qué frase pertenecen o, si la frase lo cruza, según su
  mitad) y queda un corte de frase en el hueco. Esc cancela.
- Las canciones en preparación tienen **«Volver a encajar»**: rehace las notas desde su audio y su letra con el método
  actual (lo editado queda en Versiones).

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

El apartado **Creación** es el taller completo: cola de trabajos, **Borradores** (descargadas de Spotify a falta de la
letra) y **En preparación** (creadas sin publicar), con «✎ Editar», «▶ Ver en el juego», «Publicar» y «Descartar».
Una canción en preparación se edita dentro de Creación y se publica desde allí o desde el propio editor.

- **Ver en el juego**: el editor abre la app de la tele de verdad en una ventana (`/app/?preview=1`, sin sala ni
  móviles) con la canción **tal como está en el editor, aunque no esté guardada**: desde el principio o desde el cursor,
  con pausa. La app carga también las canciones en preparación (`/api/songs?preparacion=1`, solo con sesión de admin).
- **Tiempos** (en el editor): desplazar todo desde el cursor (± ms), estirar o encoger una selección (%, para cuando
  se va desfasando poco a poco) y cambiar el BPM sin mover nada de sitio (rejilla más fina o más gruesa).
- **Publicar** con duplicado: si ya hay otra canción con el mismo artista y título, se pregunta. *Sustituir* = la
  nueva ocupa la carpeta de la antigua (se queda con su historial: veces cantada, récords, Novedades) y la antigua va a
  Retiradas («… (sustituida fecha)»); o *publicar las dos*.

**«✨ Crear canción»** (en *Canciones* o en *Creación*): artista, título, idioma, año, audio y la letra con **una frase por línea**.
El trabajo va a una cola que atiende el **trabajador** (`tools/trabajador/`, servicio `gramola-trabajador` en el mismo servidor, con prioridad mínima): separa la voz, encaja la letra
sílaba a sílaba, saca las notas y devuelve el `.txt`. El servidor la instala **sin publicar** (`borrador.json` en la
carpeta: no sale en la tele; filtro «Sin publicar» en Canciones), le pone la primera portada de iTunes, iguala el volumen y busca el estribillo del Megamix.
Al terminar, un aviso en cualquier apartado lleva al editor para revisarla; se **publica** desde el editor o desde
Creación (entrando en Novedades). El botón de los formularios es **«Editar»**: no publica nada; pasa al editor, que muestra el avance mientras se
encaja la letra (unos 5 minutos) y se abre solo con la canción al terminar.

En una canción de prueba con su `.txt` hecho a mano: los inicios de palabra a una mediana de 65 ms (el 92 % a menos de
150 ms) y el 76 % de las notas a ±1 semitono. Tarda unos 5 minutos por canción en el servidor.

### Importar desde Spotify

En **«✨ Crear canción»**, pestaña **«Importar desde Spotify»**: se pega el enlace de **una canción** (`…/track/…`;
álbumes, listas, artistas y vídeos se rechazan) y «Descargar». El trabajador la baja con el mismo motor que el antiguo
Gramola (zotify + librespot parcheados y la cuenta de `credentials.json`, en `/opt/gramola-trabajador/spotify`, con
su propio Python 3.14): MP3 a 320 kbps con su carátula, título, artista, disco y año. Tarda unos segundos y pasa por
delante de las creaciones en la cola.

La canción queda en **Borradores** (apartado *Creación*) con su audio para escucharla y un aviso si ya está en la
biblioteca. **«Continuar»** abre los datos y la letra: «Guardar y seguir luego» la deja en Borradores; **«Crear»** la manda
a la cola de creación (y al instalarla usa la carátula de Spotify).

### Letras

Al descargar de Spotify la letra **se busca sola**; en los formularios hay además **«Buscar la letra»** (por artista y
título, `GET /api/admin/letras`). Fuentes, en orden: **LRCLIB** (base abierta, sin clave; a menudo sincronizada por
líneas, y con la duración se elige la versión que encaja), **Genius** y **songlyrics** (dos de las fuentes de
[SimonIT/spotifylyrics](https://github.com/SimonIT/spotifylyrics)). Se limpia a una frase por línea, sin marcas como
«[Estribillo]» ni cabeceras de la web. Conviene revisarla: cada línea será una frase en la tele. Si es sincronizada,
el LRC se guarda junto al trabajo (`letra.lrc`) y **guía el encaje**: primero se alinea toda la canción, se mide el
desfase entre la letra sincronizada y el audio (puede ser de otra versión: disco, videoclip con intro…) y, si casa
con un desfase constante en al menos el 60 % de las líneas, cada línea se busca solo en su zona corregida (así no se
confunden estribillos repetidos ni se cuelan frases en los solos). Si no casa, se queda la alineación global.

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
