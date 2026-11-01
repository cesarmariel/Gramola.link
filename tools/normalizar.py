#!/usr/bin/env python3
"""Iguala el volumen de las canciones (sonoridad EBU R128) para que no haya unas altísimas y otras flojas.

    python3 tools/normalizar.py CARPETA_DE_CANCIONES [--objetivo -12] [--margen 1.5] [--hilos 6]

Para cada canción mide la sonoridad integrada (LUFS). Si se aleja del objetivo más que el margen, la reescribe
con el filtro loudnorm de ffmpeg en dos pasadas (ganancia lineal si cabe; picos limitados a -1 dBTP) y MP3 192k,
con el mismo nombre de fichero (el .txt no cambia). Guarda volumen.json con la medida anterior y rehace el tramo
del Megamix (megamix.mp3) a partir del audio igualado.
"""
import concurrent.futures as cf
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import megamix  # noqa: E402


def arg(nombre, defecto):
    return type(defecto)(sys.argv[sys.argv.index(nombre) + 1]) if nombre in sys.argv else defecto


OBJ, MARGEN, HILOS = arg('--objetivo', -12.0), arg('--margen', 1.5), arg('--hilos', 6)


def audio_de(carpeta):
    ts = [f for f in os.listdir(carpeta) if f.lower().endswith('.txt')]
    if not ts:
        return None
    h = megamix.leer_txt(os.path.join(carpeta, min(ts, key=len)))
    a = h.get('MP3') or h.get('AUDIO')
    return os.path.join(carpeta, a) if a and os.path.exists(os.path.join(carpeta, a)) else None


def medir(path, extra=''):
    af = f'loudnorm=I={OBJ}:TP=-1:LRA=11:print_format=json' + extra
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-vn', '-af', af, '-f', 'null', '-'],
                       capture_output=True, text=True, errors='replace')
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr, re.S)
    return json.loads(m.group(0)) if m else None


def una(carpeta):
    nombre = os.path.basename(carpeta)
    a = audio_de(carpeta)
    if not a:
        return nombre, 'sin audio'
    m = medir(a)
    if not m:
        return nombre, 'no se pudo medir'
    i = float(m['input_i'])
    if abs(i - OBJ) <= MARGEN:
        return nombre, f'{i:.1f} LUFS · bien'
    af = (f"loudnorm=I={OBJ}:TP=-1:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    tmp = a + '.norm.mp3'
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', a, '-vn', '-af', af, '-ar', '44100',
                        '-c:a', 'libmp3lame', '-b:a', '192k', tmp], capture_output=True)
    if r.returncode != 0 or os.path.getsize(tmp) < 100000:
        return nombre, 'ffmpeg falló'
    os.replace(tmp, a)
    json.dump({'antes_lufs': i, 'objetivo_lufs': OBJ}, open(os.path.join(carpeta, 'volumen.json'), 'w'))
    mm = megamix.preparar(carpeta, forzar=True, auto=True) if os.path.exists(os.path.join(carpeta, 'megamix.json')) else '-'
    return nombre, f'{i:.1f} → {OBJ:.0f} LUFS' + (' · megamix rehecho' if mm.startswith('ok') else '')


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--') and not re.match(r'^-?\d+(\.\d+)?$', x)]
    if not args:
        print(__doc__); sys.exit(1)
    raiz = args[0]
    dirs = sorted(os.path.join(raiz, d) for d in os.listdir(raiz) if os.path.isdir(os.path.join(raiz, d)))
    cambiadas = 0
    with cf.ThreadPoolExecutor(HILOS) as ex:
        for nombre, res in ex.map(una, dirs):
            cambiadas += '→' in res
            print(f'{nombre}: {res}', flush=True)
    print(f'— {cambiadas} de {len(dirs)} canciones igualadas a {OBJ:.0f} LUFS')


if __name__ == '__main__':
    main()
