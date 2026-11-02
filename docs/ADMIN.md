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
| **Canción nueva** | — | Subir los ficheros UltraStar (`.txt`, audio, portada); iguala el volumen y busca el estribillo |
| **Retiradas** | Canciones fuera del juego (`data/retiradas/`) | Restaurar o borrar para siempre |
| **Récords** | Cantantes y récord por canción | Renombrar o fusionar cantantes, borrar, vaciar el Salón de la fama (con copia) |
| **Actividad** | Registro de salas, jugadores, canciones cantadas y acciones del admin (`data/events.json`) | Filtrar |
| **Servidor** | Versión, encendido, conexiones, carga, memoria, disco, tamaños, telemetría de las teles | Descargar copia de los datos, reiniciar el servicio |
| **Seguridad** | Llaves y sesiones abiertas | Añadir y borrar llaves, cerrar las demás sesiones |

Las estadísticas por día se guardan en `data/stats.json` (último año).

## Requisitos en el servidor

- El servicio necesita escribir en la carpeta de canciones (`ReadWritePaths` de `deploy/gramola.service`).
- `python3` y `ffmpeg` para el Megamix y el volumen (usa `tools/megamix.py` y `tools/normalizar.py`, que `deploy.sh` sube junto al servidor).
- El subdominio `admin.` apuntando al mismo servidor (alias del dominio en Plesk y registro en Cloudflare).

## Mensajes nuevos del protocolo

El servidor manda a la tele `{type:'admin', action:'toast'|'reload', text}` y a los móviles `{type:'admin', action:'toast', text}`.
La tele añade a su estado `mode` y `song` (`{title, artist}`) para que el admin vea qué se canta.
