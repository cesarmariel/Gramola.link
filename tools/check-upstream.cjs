'use strict';
// Solo descarga referencias y muestra diferencias. No cambia la rama de trabajo ni ejecuta el código remoto.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
const git = args => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
git(['fetch', '--no-tags', 'upstream']);
const reviewed = git(['rev-parse', 'upstream-reviewed']).trim();
const latest = git(['rev-parse', 'upstream/main']).trim();
if (reviewed === latest) console.log('Sin cambios desde la última revisión: ' + reviewed);
else {
  // Un historial reescrito requiere revisión explícita; no se asume que sea una actualización normal.
  git(['merge-base', '--is-ancestor', reviewed, latest]);
  console.log('Pendiente de revisión: ' + reviewed + ' -> ' + latest);
  console.log(git(['log', '--oneline', reviewed + '..' + latest]));
  console.log(git(['diff', '--no-ext-diff', '--no-textconv', '--stat', reviewed, latest]));
  console.log('Revisar el diff, las dependencias y las pruebas antes de mover upstream-reviewed o incorporar cambios.');
}
