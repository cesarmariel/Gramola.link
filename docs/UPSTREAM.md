# Seguimiento del desarrollador

Original: https://github.com/nuvolacat/Gramola.link
Fork: https://github.com/cesarmariel/Gramola.link

`upstream/main` refleja lo descargado del autor. `upstream-reviewed` marca la última revisión completada. `main` parte del original; `codex/local-setup` contiene los cambios propios para instalar y probar en local. El remoto upstream tiene el envío deshabilitado localmente.

## Revisión del 2 de noviembre de 2026

Base de auditoría inicial: 20efe66db603a15b30e922625851d93136417f59.
Nuevo commit revisado: 864d319f1681af9553393cf33053b83356f70dfa.

Solo modifica PS4: Makefile, arranque e interfaz, reloj, módulos, diagnóstico de mando/audio y una imagen. La inspección no encontró nuevos destinos de red, credenciales ni comandos de instalación. Añade más registro de diagnóstico local. No se compiló ni probó en PS4; esa validación sigue pendiente. Se incorporó por fast-forward antes de los cambios locales.

## Procedimiento

Monitor diario configurado en Codex a las 09:00, zona Europe/Madrid. Revisa y avisa de novedades relevantes; no incorpora ni ejecuta automáticamente cambios. Requiere que el entorno local de Codex pueda ejecutar la revisión programada.

En Terminal del Mac, cuenta cesarmariel, desde la carpeta de este fork: `npm run upstream:check`.

Ese comando hace fetch y muestra los commits y archivos pendientes sin mezclarlos. Revisar el diff completo, dependencias, scripts de instalación, red, permisos y compatibilidad con nuestros cambios. Registrar conclusiones aquí y ejecutar las pruebas pertinentes. Solo entonces incorporar cambios y avanzar la referencia upstream-reviewed. Nunca ejecutar automáticamente código recién descargado.


## Candidata del 4 de noviembre de 2026

Por petición del usuario de mantener actualizado el proyecto, se ha preparado `codex/upstream-2026-11-04` desde `codex/local-setup`, incorporando por merge `89e33e368a5d0288ded972de206bf88a22defd5d` (26 commits nuevos en la línea actual del autor). Se conserva la edición PS4/Mac existente en el fork; el retroceso del original no obliga a borrarla para integrar sus mejoras web. No se atribuye intención al cambio de historial.

Conflictos resueltos: servidor, autenticación y comando de pruebas. Se adoptan las correcciones del autor y se mantiene la telemetría desactivada por defecto con ENABLE_TELEMETRY=0. Los tests del autor habilitan explícitamente esa opción en su servidor temporal para comprobar sus permisos. La prueba propia ahora comprueba que el servidor rechaza un récord presentado sin haber cantado; el test del autor verifica el guardado de una partida completa.

Validación: 12 pruebas HTTP/WebSocket correctas con datos temporales. Se han revisado los puntos de ejecución y red del servidor, puntuación, persistencia de salas, pruebas y scripts críticos. No hay nuevas dependencias Node ni cambios de su lockfile; se reutilizaron las dependencias ya instaladas, sin instalar otras. No se ha ejecutado el despliegue, el trabajador IA ni el editor en un navegador para esta candidata. La revisión completa de las funciones nuevas del editor, su reconocimiento y la pila Python sigue pendiente: no equivale a repetir ni cerrar toda la auditoría inicial.

Esta candidata queda en una PR en borrador. La instalación de trabajo y main no cambian todavía; upstream-reviewed conserva la última referencia de revisión completa. La receta Python mantiene torch 2.8 y añade faster-whisper con rango abierto: siguen siendo pendientes antes de instalar esa parte.

A partir de esta petición, el seguimiento puede preparar candidatas aisladas tras revisar los cambios y ejecutar las pruebas apropiadas, conservando nuestros ajustes. No incorpora automáticamente a main ni despliega. Debe consultar las candidatas existentes para no repetir la misma actualización. Una retirada de historial ya documentada se trata conservando el código propio; las divergencias nuevas requieren explicación explícita.

## Seguimiento del 5 de noviembre de 2026

Extremo: 260f58c0322d5d0bb9b902cef7500b6727448dd5, descendiente directo de la candidata anterior (sin nueva reescritura). Solo cambia deploy/deploy.sh: grupo y servicios pasan a ser configurables. Revisado el diff completo y el script resultante, sin ejecutarlo ni leer deploy.env. No cambia dependencias, endpoints, acceso a credenciales ni aplicación. Atención antes de cualquier despliegue futuro: el grupo por defecto cambia de psacln al nombre de DEPLOY_USER; los nombres configurados se interpolan en una orden remota y deben proceder de configuración local de confianza, sin espacios ni metacaracteres. No es una aprobación para desplegar.

Se actualiza la candidata existente y su PR #2, sin crear otra. Se incorporan también las mejoras propias de teclado 48d3d49, conservando créditos, puntero, símbolos del mando del autor y la edición PS4/Mac. Resueltos los conflictos del HTML y del puente. Validación: 15 pruebas con datos temporales correctas; bash -n del despliegue y node --check de ambos módulos de teclado/puente correctos. Dependencias existentes mediante NODE_PATH; sin instalaciones. La revisión completa del editor/trabajador IA y pruebas de navegador de esta combinación siguen pendientes. upstream-reviewed y la instalación activa no se modifican.
