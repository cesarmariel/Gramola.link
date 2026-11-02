# Desarrollo local en el Mac

Carpeta: `/Users/cesarmariel/Documents/ChatGPT/Karaoke/Gramola.link`.

Las dependencias Node se instalan en server/node_modules con el lockfile y scripts de instalación deshabilitados. El servidor escucha solo en 127.0.0.1; .env.local y .local/ no se publican. La demo WAV usa una composición original sintetizada y no requiere FFmpeg. No equivale a importar Spotify ni a generar un karaoke con IA.

## Comandos

Terminal del Mac, cuenta cesarmariel, desde la carpeta anterior:

- `npm start`: arranca el servidor en primer plano; Ctrl+C lo detiene.
- `npm test`: pruebas HTTP/WebSocket con datos temporales y servidor independiente.
- `npm run demo`: genera la canción de prueba en web/songs/demo-gramola, excluida de Git.
- `npm run upstream:check`: consulta novedades del autor sin mezclarlas.

Tele: http://localhost:8877/app/.
Micro en el ordenador: http://micro.localhost:8877/ (abrir en Chrome e instalar PWA para activar el flujo del micro).
Administración: http://admin.localhost:8877/; conserva WebAuthn, sin contraseña de emergencia ni bypass. El alta se inicia con `node server/alta.js http://admin.localhost:8877` usando `DATA_DIR=.local/data` en esa ejecución. Es una acción local que crea un enlace secreto temporal; no publicarlo.

Un móvil físico no llega al Mac mediante localhost. Para probarlo harán falta una dirección de red y HTTPS confiable en el móvil. Esa configuración y la prueba de permisos/audio reales siguen pendientes.

## Pendientes funcionales

- FFmpeg para Megamix, normalización e importación de audio. No se ha instalado globalmente.
- Pila IA: resolver PyTorch y compatibilidad del alineador, lockfile y modelos; instalar después en entorno separado.
- Spotify: localizar repositorios y parches exactos del motor antes de aportar credenciales.
- Los límites de salas y conexiones, validación exhaustiva de entradas y controles de archivos siguen pendientes antes de exponer el servidor.
- Prueba completa en navegador y móvil: permisos, instalación PWA, canto, puntuación y reconexión.

## Vercel, fase posterior

La documentación consultada el 2 de noviembre de 2026 admite WebSockets, con conexiones sujetas a la duración de las funciones. Las reconexiones pueden alcanzar otra instancia, por lo que las salas no pueden depender exclusivamente del Map actual. Habrá que decidir almacenamiento compartido de salas/récords, biblioteca de canciones y ejecución del trabajador con sus modelos y FFmpeg. No hay despliegue Vercel configurado ni realizado.

Fuente: https://vercel.com/docs/functions/websockets
