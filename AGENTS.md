# Gramola personal

Este fork pertenece a cesarmariel. El original está en el remoto upstream; origin apunta al fork.

- Mantener los cambios del autor separados de los cambios propios. No ejecutar scripts nuevos ni instalar dependencias de upstream antes de revisar el diff.
- upstream-reviewed marca el último commit revisado. Solo moverlo después de dejar una nota en docs/UPSTREAM.md. El usuario autorizó mantener actualizado el fork el 4 de noviembre de 2026: durante la monitorización se pueden preparar ramas candidatas aisladas y PRs en borrador tras revisar y probar. No modificar main, la instalación activa ni desplegar automáticamente. No mover upstream-reviewed si la revisión completa sigue pendiente.
- La copia Gramola.link-audit del directorio padre conserva la base de la auditoría inicial; no modificarla.
- Trabajar inicialmente en localhost. No abrir puertos de Internet, activar servicios del sistema, publicar canciones o desplegar Vercel como consecuencia de una prueba local.
- Spotify y el trabajador IA siguen dentro del objetivo. No introducir credenciales en Git ni instalar la pila vulnerable documentada sin resolver compatibilidad y seguridad.
- Ejecutar npm test desde la raíz tras cambios del servidor. Mantener datos, canciones, logs y credenciales fuera de Git.
- La futura adaptación a Vercel debe consultar documentación vigente y resolver estado compartido, almacenamiento persistente y ejecución del trabajador; no asumir que subir los archivos basta.
