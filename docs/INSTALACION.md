# Instalación

## Requisitos

- **Node.js 22+** (solo usa la librería `ws`).
- Un **dominio con HTTPS** para jugar con móviles (los navegadores solo dejan usar el micro en páginas seguras).

## En local (para desarrollar)

```bash
cd server
npm install
npm start                 # http://localhost:8877
```

Variables de entorno:

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `8877` | Puerto de escucha. |
| `HOST` | `127.0.0.1` | Interfaz. Usa `0.0.0.0` para entrar desde otros equipos de la red. |
| `WEB_DIR` | `../web` | Carpeta de la web. |
| `SONGS_DIR` | `$WEB_DIR/songs` | Carpeta de canciones. |
| `SERVE_STATIC` | `1` | Con `0`, el servidor solo atiende `/api` y `/ws` (si los estáticos los sirve nginx). |
| `DATA_DIR` | `server/data` | Dónde se guardan los récords (`records.json`). |

En `localhost` el micro funciona porque los navegadores lo tratan como seguro, así que puedes probar la web del micro
en el mismo ordenador (`http://localhost:8877/m/`).

## En un servidor

### 1. Ficheros

```bash
sudo mkdir -p /var/www/vhosts/DOMINIO/app
sudo rsync -a server web /var/www/vhosts/DOMINIO/app/
cd /var/www/vhosts/DOMINIO/app/server && sudo -u USUARIO npm ci --omit=dev
```

### 2. Servicio systemd

Copia `deploy/gramola.service` a `/etc/systemd/system/`, cambia `USUARIO` y `DOMINIO`, crea la carpeta de datos
(`app/data`, donde se guardan los récords) y:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gramola
curl -s http://127.0.0.1:8877/api/health
```

### 3. Proxy con WebSocket

**Plesk con Apache**: pega `deploy/apache-gramola.conf` en *Configuración de Apache y nginx → Directivas adicionales
para HTTPS* (necesita `mod_proxy_wstunnel`). **nginx**: `proxy_pass` a `127.0.0.1:8877` con las cabeceras `Upgrade` y
`Connection "upgrade"` en `/ws`.

### 4. HTTPS y Cloudflare

- Certificado Let's Encrypt para el dominio (y `www`).
- Con Cloudflare en modo proxy los WebSocket funcionan sin cambios (el servidor envía pings cada 25 s).
  Si el modo SSL es «Full (strict)», emite el certificado con el registro en «solo DNS» y activa el proxy después.

### 5. Canciones

Sube las carpetas UltraStar a `SONGS_DIR` (por SFTP). Aparecen en menos de 5 s, sin reiniciar nada.

### 6. Diseño

Si cambia el diseño de la tele: copia la exportación nueva en `diseno/` y ejecuta `python3 tools/build-tv.py`.
