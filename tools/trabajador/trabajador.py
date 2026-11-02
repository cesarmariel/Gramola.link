#!/usr/bin/env python3
"""Trabajador de creación de canciones: corre en el servidor (servicio gramola-trabajador) y atiende la cola del admin.

    python trabajador.py            # bucle: pide trabajo cada 10 s
    python trabajador.py --una      # atiende como mucho un trabajo y sale (para probar)

Configuración (GRAMOLA_TRABAJADOR_CFG o ~/.gramola-trabajador.json):
    {"url": "http://127.0.0.1:8877", "host": "admin.TU-DOMINIO", "token": "…"}
«host» hace falta cuando se habla con el servidor por dentro (127.0.0.1): el admin solo responde en su subdominio.
La clave se genera en el admin, apartado Creación → «Clave del trabajador».
"""
import json
import os
import platform
import shutil
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crear  # noqa: E402

VERSION = '1.0'
CFG = json.load(open(os.environ.get('GRAMOLA_TRABAJADOR_CFG') or os.path.expanduser('~/.gramola-trabajador.json')))
BASE = CFG['url'].rstrip('/') + '/api/worker'


def pedir(method, ruta, data=None, raw=None, timeout=60):
    h = {'Authorization': 'Bearer ' + CFG['token'], 'User-Agent': 'gramola-trabajador/' + VERSION}
    if CFG.get('host'):
        h['Host'] = CFG['host']
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        h['Content-Type'] = 'application/json'
    elif raw is not None:
        body = raw
        h['Content-Type'] = 'application/octet-stream'
    req = urllib.request.Request(BASE + ruta, data=body, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        b = r.read()
        return json.loads(b) if r.headers.get('content-type', '').startswith('application/json') else b


def atender(j):
    tmp = tempfile.mkdtemp(prefix='gramola-')
    try:
        def progreso(p, msg):
            crear.log(f'  {p}% {msg}')
            try:
                r = pedir('POST', f'/jobs/{j["id"]}/progress', {'p': p, 'msg': msg})
                if r.get('cancel'):
                    raise KeyboardInterrupt('cancelado desde el admin')
            except urllib.error.URLError:
                pass
        progreso(1, 'Descargando el audio')
        audio = os.path.join(tmp, 'audio.mp3')
        open(audio, 'wb').write(pedir('GET', f'/jobs/{j["id"]}/input', timeout=300))
        out = os.path.join(tmp, 'salida')
        if j['kind'] == 'analizar':
            crear.analizar(audio, out, progreso)
            nombres = ['voz.mp3', 'voz-tono.json']
            msg = 'Voz analizada'
        else:
            txt = crear.crear(audio, j['letra'], out, j['titulo'], j['artista'], j.get('idioma') or 'es', j.get('anio') or None, j['audioName'], progreso)
            nombres = ['cancion.txt', 'voz.mp3', 'voz-tono.json']
            msg = f'{sum(1 for l in txt.splitlines() if l[:1] in ":*FRG")} notas'
        for n in nombres:
            pedir('PUT', f'/jobs/{j["id"]}/result/{n}', raw=open(os.path.join(out, n), 'rb').read(), timeout=300)
        pedir('POST', f'/jobs/{j["id"]}/done', {'ok': True, 'msg': msg})
        crear.log('✓ Hecho:', j.get('artista'), '-', j.get('titulo'))
    except BaseException as e:
        err = ''.join(traceback.format_exception_only(type(e), e)).strip()
        crear.log('✗ Error:', err)
        try:
            pedir('POST', f'/jobs/{j["id"]}/done', {'ok': False, 'error': err[-1500:]})
        except Exception:
            pass
        if isinstance(e, SystemExit):
            raise
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    una = '--una' in sys.argv
    crear.log(f'Trabajador de Gramola {VERSION} · {BASE}')
    espera = 10
    while True:
        try:
            j = pedir('POST', '/next', {'host': platform.node(), 'version': VERSION})
            espera = 10
            if j and j.get('id'):
                crear.log(f'→ {j["kind"]}: {j.get("artista")} - {j.get("titulo")}')
                atender(j)
                continue
            if una:
                return
        except urllib.error.HTTPError as e:
            crear.log('Servidor:', e.code, e.read()[:200])
            espera = 60 if e.code == 401 else 30
        except Exception as e:
            crear.log('Sin conexión:', e)
            espera = 30
        time.sleep(espera)


if __name__ == '__main__':
    main()
