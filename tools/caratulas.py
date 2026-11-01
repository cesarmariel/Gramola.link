#!/usr/bin/env python3
"""Busca portadas de más calidad en iTunes para las canciones UltraStar de una carpeta.

    python3 tools/caratulas.py CARPETA_DE_CANCIONES SALIDA [--tam 600]

Para cada canción busca en la API pública de búsqueda de iTunes (sin clave; ~20 consultas por minuto) la pista
con el mismo artista y título, prefiriendo el disco original frente a recopilatorios y la edición más antigua.
Deja en SALIDA:
  - <carpeta>.jpg con la portada nueva (TAM×TAM px)
  - caratulas.json con lo encontrado (disco, año, enlace) para revisarlo antes de aplicarlo.
No toca las canciones. Para aplicarlas, ver --aplicar en la ayuda de aplicar_caratulas().

    python3 tools/caratulas.py --aplicar CARPETA_DE_CANCIONES SALIDA [--excluir 3,17,40]

copia cada portada como cover-itunes.jpg en su carpeta y cambia solo la línea #COVER del .txt (la portada
anterior se queda en la carpeta y su nombre se guarda en caratula.json para poder volver atrás).
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

RECOPILATORIO = re.compile(r'greatest|grandes|exitos|éxitos|hits|lo mejor|best of|the best|colecci|compil|antolog|'
                           r'esencial|essential|gold|platino|platinum|singles|20 de|now |remaster|karaoke|tribut|'
                           r'live|en vivo|en directo|directo|acústico|unplugged', re.I)


def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'\(.*?\)|\[.*?\]', ' ', s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()


def principal(artista):
    return re.split(r'\s*(?:,|&| y | ft\.?| feat\.?| con | x )\s*', norm(artista))[0]


def leer(carpeta):
    ts = [f for f in os.listdir(carpeta) if f.lower().endswith('.txt')]
    if not ts:
        return None
    raw = open(os.path.join(carpeta, min(ts, key=len)), 'rb').read()
    try:
        t = raw.decode('utf-8').lstrip('﻿')
    except UnicodeDecodeError:
        t = raw.decode('cp1252')
    return {m.group(1).upper(): m.group(2).strip() for m in re.finditer(r'^#([A-Za-z0-9]+):(.*)$', t, re.M)}


def buscar(artista, titulo):
    q = urllib.parse.urlencode({'term': f'{artista} {titulo}', 'entity': 'song', 'limit': 25, 'country': 'ES'})
    for intento in range(3):
        try:
            return json.load(urllib.request.urlopen('https://itunes.apple.com/search?' + q, timeout=20))['results']
        except Exception:
            time.sleep(20 * (intento + 1))
    return []


def elegir(res, artista, titulo):
    a, t = principal(artista), norm(titulo)
    buenos = []
    for r in res:
        ra, rt = norm(r.get('artistName')), norm(r.get('trackName'))
        if not a or a not in ra:
            continue
        if not (t == rt or rt.startswith(t) or t.startswith(rt)):
            continue
        reco = bool(RECOPILATORIO.search(r.get('collectionName', ''))) or 'various' in norm(r.get('collectionArtistName', ''))
        buenos.append((reco, r.get('releaseDate', '9999'), r))
    if not buenos:
        return None
    buenos.sort(key=lambda x: (x[0], x[1]))
    return buenos[0][2]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--aplicar' in sys.argv:
        return aplicar(*args[:2])
    raiz, salida = args[0], args[1]
    tam = int(sys.argv[sys.argv.index('--tam') + 1]) if '--tam' in sys.argv else 600
    os.makedirs(salida, exist_ok=True)
    out_json = os.path.join(salida, 'caratulas.json')
    hecho = json.load(open(out_json)) if os.path.exists(out_json) else {}
    dirs = sorted(d for d in os.listdir(raiz) if os.path.isdir(os.path.join(raiz, d)))
    for n, d in enumerate(dirs, 1):
        if d in hecho:
            continue
        h = leer(os.path.join(raiz, d))
        if not h:
            continue
        r = elegir(buscar(h.get('ARTIST', ''), h.get('TITLE', '')), h.get('ARTIST', ''), h.get('TITLE', ''))
        if r and r.get('artworkUrl100'):
            url = r['artworkUrl100'].replace('100x100bb', f'{tam}x{tam}bb')
            try:
                urllib.request.urlretrieve(url, os.path.join(salida, d + '.jpg'))
                hecho[d] = {'disco': r.get('collectionName'), 'año': (r.get('releaseDate') or '')[:4], 'url': url,
                            'artista': r.get('artistName'), 'pista': r.get('trackName')}
            except Exception:
                hecho[d] = None
        else:
            hecho[d] = None
        json.dump(hecho, open(out_json, 'w'), ensure_ascii=False, indent=1)
        print(f'[{n}/{len(dirs)}] {d}: ' + (f"{hecho[d]['disco']} ({hecho[d]['año']})" if hecho[d] else 'no encontrada'), flush=True)
        time.sleep(3.2)
    print(f'— {sum(1 for v in hecho.values() if v)} de {len(hecho)} portadas encontradas')


def aplicar(raiz, salida):
    excl = set()
    if '--excluir' in sys.argv:
        excl = {int(x) for x in sys.argv[sys.argv.index('--excluir') + 1].split(',') if x.strip()}
    hecho = json.load(open(os.path.join(salida, 'caratulas.json')))
    orden = sorted(d for d, v in hecho.items() if v)
    for n, d in enumerate(orden, 1):
        if n in excl:
            continue
        carpeta = os.path.join(raiz, d)
        ts = [f for f in os.listdir(carpeta) if f.lower().endswith('.txt')]
        if not ts:
            continue
        import shutil
        shutil.copy2(os.path.join(salida, d + '.jpg'), os.path.join(carpeta, 'cover-itunes.jpg'))
        for txt in ts:   # también la versión [MULTI], si la hay
            p = os.path.join(carpeta, txt)
            raw = open(p, 'rb').read()
            try:
                t = raw.decode('utf-8')
            except UnicodeDecodeError:
                t = raw.decode('cp1252')
            m = re.search(r'^#COVER:(.*)$', t, re.M)
            antes = m.group(1).strip() if m else None
            if antes == 'cover-itunes.jpg':
                continue
            if m:
                t = t[:m.start()] + '#COVER:cover-itunes.jpg' + t[m.end():]
            else:
                t = re.sub(r'^(#TITLE:.*)$', r'\1\n#COVER:cover-itunes.jpg', t, count=1, flags=re.M)
            open(p, 'w', encoding='utf-8', newline='').write(t)
            if txt == min(ts, key=len):
                json.dump({'antes': antes, **hecho[d]}, open(os.path.join(carpeta, 'caratula.json'), 'w'), ensure_ascii=False)
        print(f'{n}. {d}')


if __name__ == '__main__':
    main()
