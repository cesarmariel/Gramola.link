#!/usr/bin/env python3
"""Recorta el tramo del Megamix de cada canción UltraStar que tenga el estribillo marcado.

    python3 tools/megamix.py CARPETA_DE_CANCIONES [--forzar] [--auto]

Para cada carpeta cuyo .txt tenga #MEDLEYSTARTBEAT y #MEDLEYENDBEAT crea:
  - megamix.mp3: desde ANTES s antes del estribillo hasta DESPUES s después (corte exacto con ffmpeg),
    para que la tele pueda fundir una canción con la siguiente.
  - megamix.json: {"file", "offset", "start", "end"} en ms del audio original
    (offset = dónde empieza el recorte; start/end = el estribillo).
Con --auto, a las canciones sin marcas se les busca el estribillo: el bloque de frases (2 o más) que se repite
igual (al menos dos veces) más largo, de 10 a 45 s; se usa su primera aparición. Contrastado con los
estribillos marcados: acierta en ~8 de cada 10. Se compara el texto de las frases
para encontrar repeticiones, pero no se muestra ni se guarda.
"""
import json
import os
import re
import subprocess
import sys

ANTES, DESPUES = 5000, 3000  # ms


def leer_txt(path):
    raw = open(path, 'rb').read()
    try:
        t = raw.decode('utf-8').lstrip('﻿')
    except UnicodeDecodeError:
        t = raw.decode('cp1252')
    return {m.group(1).upper(): m.group(2).strip() for m in re.finditer(r'^#([A-Za-z0-9]+):(.*)$', t, re.M)}


num = lambda v: float(str(v).replace(',', '.') or 0)


def tramo(head):
    """(offset, start, end) en ms, o None si la canción no tiene el estribillo marcado."""
    if 'MEDLEYSTARTBEAT' not in head or 'MEDLEYENDBEAT' not in head:
        return None
    if head.get('RELATIVE', '').upper() == 'YES':
        return None
    bpm = num(head.get('BPM', 0))
    if not bpm:
        return None
    beat = 60000 / (bpm * 4)
    gap = num(head.get('GAP', 0))
    a = gap + int(num(head['MEDLEYSTARTBEAT'])) * beat
    b = gap + int(num(head['MEDLEYENDBEAT'])) * beat
    if b - a < 5000:
        return None
    return round(max(0, a - ANTES)), round(a), round(b)


def leer_frases(path):
    raw = open(path, 'rb').read()
    try:
        t = raw.decode('utf-8').lstrip('\ufeff')
    except UnicodeDecodeError:
        t = raw.decode('cp1252')
    frases, cur = [], []
    for L in t.splitlines():
        if L[:1] in ':*FRG':
            p = L.split(' ', 4)
            if len(p) >= 5:
                try: cur.append((int(p[1]), int(p[2]), p[4]))
                except ValueError: pass
        elif L[:1] == '-':
            if cur: frases.append(cur); cur = []
        elif L[:1] == 'E':
            break
        elif L[:1] == 'P':
            if frases or cur: break          # dúo: solo la primera voz
    if cur: frases.append(cur)
    return frases


def estribillo_auto(path, head):
    """(start, end) en ms del bloque que más se repite, o None."""
    if head.get('RELATIVE', '').upper() == 'YES':
        return None
    bpm = num(head.get('BPM', 0))
    if not bpm:
        return None
    beat, gap = 60000 / (bpm * 4), num(head.get('GAP', 0))
    ph = leer_frases(path)
    norm = lambda s: re.sub(r'[^a-z0-9ñ]', '', s.lower())
    txt = [norm(''.join(n[2] for n in p)) for p in ph]
    mejor = None   # (duración, veces, -i, i, k)
    for i in range(len(ph)):
        for k in range(2, 11):
            if i + k > len(ph) or any(len(txt[i + q]) <= 3 for q in range(k)):
                break
            blk = txt[i:i + k]
            a, b = gap + ph[i][0][0] * beat, gap + (ph[i + k - 1][-1][0] + ph[i + k - 1][-1][1]) * beat
            if not 10000 <= b - a <= 45000:
                continue
            veces, j = 1, i + k
            while j + k <= len(ph):
                if txt[j:j + k] == blk: veces += 1; j += k
                else: j += 1
            if veces < 2:
                continue
            cand = (b - a, veces, -i, i, k)          # el bloque repetido más largo (calibrado con los marcados)
            if mejor is None or cand[:3] > mejor[:3]:
                mejor = cand
    if not mejor:
        return None
    i, k = mejor[3], mejor[4]
    return round(gap + ph[i][0][0] * beat), round(gap + (ph[i + k - 1][-1][0] + ph[i + k - 1][-1][1]) * beat)


def preparar(carpeta, forzar=False, auto=False):
    files = os.listdir(carpeta)
    txt = min((f for f in files if f.lower().endswith('.txt')), key=len, default=None)   # la normal antes que la [MULTI]
    if not txt:
        return 'sin .txt'
    head = leer_txt(os.path.join(carpeta, txt))
    t = tramo(head)
    origen = 'marcado'
    if not t and auto:
        e = estribillo_auto(os.path.join(carpeta, txt), head)
        if e:
            t, origen = (max(0, e[0] - ANTES), e[0], e[1]), 'detectado'
    if not t:
        return 'sin estribillo marcado'
    audio = head.get('MP3') or head.get('AUDIO')
    if not audio or not os.path.exists(os.path.join(carpeta, audio)):
        return 'sin audio'
    out = os.path.join(carpeta, 'megamix.mp3')
    off, a, b = t
    if forzar or not os.path.exists(out):
        # -ss/-to después de -i: corte exacto (decodifica desde el principio)
        r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(carpeta, audio),
                            '-ss', f'{off / 1000:.3f}', '-to', f'{(b + DESPUES) / 1000:.3f}',
                            '-vn', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '192k', out], capture_output=True)
        if r.returncode != 0:
            return 'ffmpeg falló'
    json.dump({'file': 'megamix.mp3', 'offset': off, 'start': a, 'end': b, 'origen': origen}, open(os.path.join(carpeta, 'megamix.json'), 'w'))
    return f'ok · estribillo {origen} {(b - a) / 1000:.0f} s'


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    raiz, forzar, auto = sys.argv[1], '--forzar' in sys.argv, '--auto' in sys.argv
    dirs = sorted(d for d in os.listdir(raiz) if os.path.isdir(os.path.join(raiz, d)))
    ok = 0
    for d in dirs:
        r = preparar(os.path.join(raiz, d), forzar, auto)
        ok += r.startswith('ok')
        print(f'{d}: {r}', flush=True)
    print(f'— {ok} de {len(dirs)} canciones con tramo de Megamix')


if __name__ == '__main__':
    main()
