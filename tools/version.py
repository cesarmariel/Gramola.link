#!/usr/bin/env python3
"""Pone la versión (esquema 1.AA.MMDD.HHMM, hora real del despliegue) en todos los sitios que la llevan:

    python3 tools/version.py 1.26.1103.1102
    python3 tools/version.py --check      # solo comprueba que todo lleva la misma (lo usa deploy.sh)

- VERSION
- README.md (insignia)
- web/app/index.html (texto «Versión» y ?v= del puente; se regenera desde el diseño con tools/build-tv.py)
- web/m/index.html (?v= de m.css y m.js: así el móvil baja el código nuevo aunque tenga el viejo en caché)
- web/m/sw.js (nombre de la caché del service worker: una caché nueva por versión)
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAT = r'\d+\.\d+\.\d{4}\.\d{4}'


def leer(p): return (ROOT / p).read_text(encoding='utf-8')
def escribir(p, s): (ROOT / p).write_text(s, encoding='utf-8')


def estampar(v):
    escribir('VERSION', v + '\n')
    escribir('README.md', re.sub(r'badge/versi%C3%B3n-[0-9.]+-', 'badge/versi%C3%B3n-' + v + '-', leer('README.md')))
    m = leer('web/m/index.html')
    m = re.sub(r'(/m/m\.(?:css|js))\?v=[^"]*', lambda x: x.group(1) + '?v=' + v, m)
    escribir('web/m/index.html', m)
    escribir('web/m/sw.js', re.sub(r"const CACHE = '[^']*';", f"const CACHE = 'gramola-micro-{v}';", leer('web/m/sw.js')))
    subprocess.run([sys.executable, str(ROOT / 'tools' / 'build-tv.py')], check=True)


def comprobar():
    v = leer('VERSION').strip()
    donde = {
        'README.md': 'badge/versi%C3%B3n-' + v + '-',
        'web/app/index.html': 'Versión ' + v,
        'web/m/index.html': '/m/m.js?v=' + v,
        'web/m/sw.js': f"gramola-micro-{v}",
    }
    mal = [p for p, s in donde.items() if s not in leer(p)]
    if mal:
        print(f'La versión {v} de VERSION no está en: ' + ', '.join(mal) + f'\n  → python3 tools/version.py {v}')
        return 1
    print('versión', v, 'en todos los sitios')
    return 0


if __name__ == '__main__':
    if len(sys.argv) == 2 and sys.argv[1] == '--check':
        sys.exit(comprobar())
    if len(sys.argv) != 2 or not re.fullmatch(PAT, sys.argv[1]):
        print(__doc__); sys.exit(2)
    estampar(sys.argv[1])
    sys.exit(comprobar())
