# Protocolo WebSocket

Una conexión WebSocket en `/ws` por dispositivo; mensajes JSON con `type`.

## Comunes

| Mensaje | Sentido | Descripción |
|---|---|---|
| `{type:"ping", t}` → `{type:"pong", t}` | cliente ↔ servidor | Latencia: cada cliente estima su media latencia como mediana de 9 RTT / 2. |

## Tele

| Mensaje | Sentido | Descripción |
|---|---|---|
| `{type:"host", code?, token?}` | tele → servidor | Abre sala, o recupera la suya con `code` + `token` (recarga, corte de red). |
| `{type:"room", code, token, recovered, players}` | servidor → tele | Sala lista. `recovered:false` tras una reconexión = sala perdida (se avisa en pantalla). |
| `{type:"players", players:[{id,slot,name,color,online,bot}]}` | servidor → tele | Lista de jugadores (cada cambio). `slot` 1–8 = color J1–J8. |
| `{type:"pitch", p, n, v, lat}` | servidor → tele | Voz del jugador `p`: nota MIDI decimal o `null`, volumen 0–1, media latencia del móvil (ms). |
| `{type:"input", p, key}` | servidor → tele | Botón del móvil: `up/down/left/right/ok/back/y`. |
| `{type:"full-attempt", name}` | servidor → tele | Alguien intentó entrar con la sala llena. |
| `{type:"state", screen, singers, turn?, mode?, song?}` | tele → servidor → móviles | Pantalla actual y quién canta (los móviles muestran el micro solo a quien le toca). `mode` y `song:{title,artist}` son para la administración. |
| `{type:"admin", action, text?}` | servidor → tele | Desde la administración: `toast` (aviso en pantalla) o `reload` (recargar la app). |
| `{type:"bot"}` | tele → servidor | «Simular jugador»: ocupa un color libre y canta desde la tele. |
| `{type:"kick", p}` · `{type:"new-code"}` | tele → servidor | Expulsar jugador · cerrar la sala y abrir otra. |
| `{type:"photo", p, data}` | servidor → tele | Foto del jugador `p` (JPEG 200×200 en `data:`, o vacío para quitarla). Al reconectar la tele se reenvían todas. |

## Móvil

| Mensaje | Sentido | Descripción |
|---|---|---|
| `{type:"peek", code, token?}` → `{type:"peek", code, taken:[{slot,name}], mySlot, full, hostOnline, colors}` | móvil ↔ servidor | Antes de elegir color: qué colores están ocupados. |
| `{type:"join", code, name, slot, token?}` | móvil → servidor | Entrar con el color `slot`. Con `token` se recupera el mismo jugador. |
| `{type:"joined", id, slot, token, name, color, code, hostOnline}` | servidor → móvil | Dentro. |
| `{type:"error", code, msg}` | servidor → móvil | `no-room`, `full`, `color-taken` (con `taken`). |
| `{type:"pitch", n, v, lat}` · `{type:"input", key}` · `{type:"leave"}` | móvil → servidor | Voz (25/s), mando, salir. |
| `{type:"photo", data}` | móvil → servidor | Foto del jugador (cámara frontal, ≤48 KB). Solo se guarda en memoria mientras dura la sala. |
| `{type:"roster", players}` · `{type:"host", online}` · `{type:"kicked"}` · `{type:"closed"}` | servidor → móvil | Lista de la sala, tele conectada o no, expulsado, sala cerrada. |
| `{type:"admin", action:"toast", text}` | servidor → móvil | Aviso desde la administración (franja arriba unos segundos). |

## Límites

Máximo 8 jugadores; mensajes de 16 KB; códigos consonante-vocal-consonante-vocal (tipo «MOKA», sin palabras feas);
la sala dura 15 min sin tele; ping de WebSocket cada 25 s.

## HTTP

| Ruta | Descripción |
|---|---|
| `GET /api/songs` | Canciones: id, título, artista, año, idioma, género, duración, dificultad 1–3, dúo, rutas. |
| `GET /api/records` | `{songs:{id:{score,name,date,title,artist}}, singers:{nombre:{songs,best,streak}}, plays:{id:n}}`. |
| `POST /api/records` | `{code, token, song, title, artist, players:[{name,score,streak,bot}]}`. Solo con el token de una sala abierta. |
| `GET /api/health` | Estado. |
| `/api/admin/*` | Solo en el subdominio `admin.` y con sesión de Touch ID. Ver [ADMIN.md](ADMIN.md). |
