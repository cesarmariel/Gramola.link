# Seguimiento del desarrollador

Original: https://github.com/nuvolacat/Gramola.link
Fork: https://github.com/cesarmariel/Gramola.link

`upstream/main` refleja lo descargado del autor. `upstream-reviewed` marca la última revisión completada. `main` parte del original; `codex/local-setup` contiene los cambios propios para instalar y probar en local. El remoto upstream tiene el envío deshabilitado localmente.

## Revisión del 2 de noviembre de 2026

Base de auditoría inicial: 20efe66db603a15b30e922625851d93136417f59.
Nuevo commit revisado: 864d319f1681af9553393cf33053b83356f70dfa.

Solo modifica PS4: Makefile, arranque e interfaz, reloj, módulos, diagnóstico de mando/audio y una imagen. La inspección no encontró nuevos destinos de red, credenciales ni comandos de instalación. Añade más registro de diagnóstico local. No se compiló ni probó en PS4; esa validación sigue pendiente. Se incorporó por fast-forward antes de los cambios locales.

## Procedimiento

En Terminal del Mac, cuenta cesarmariel, desde la carpeta de este fork: `npm run upstream:check`.

Ese comando hace fetch y muestra los commits y archivos pendientes sin mezclarlos. Revisar el diff completo, dependencias, scripts de instalación, red, permisos y compatibilidad con nuestros cambios. Registrar conclusiones aquí y ejecutar las pruebas pertinentes. Solo entonces incorporar cambios y avanzar la referencia upstream-reviewed. Nunca ejecutar automáticamente código recién descargado.
