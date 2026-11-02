#!/usr/bin/env python3
"""Crea una canción UltraStar a partir del audio y la letra (y analiza la voz de canciones que ya existen).

    python crear.py crear AUDIO.mp3 LETRA.txt SALIDA/ --titulo T --artista A --idioma es [--anio 1999]
    python crear.py analizar AUDIO.mp3 SALIDA/

Pasos (todo en local, en el Mac):
  1. Separa la voz de la música con Demucs (htdemucs) → voz.mp3
  2. Mide el tono de la voz cada 10 ms con CREPE (pYIN de reserva) → voz-tono.json ([[ms, midi|null], …])
  3. (crear) Alinea la letra sobre la voz con el alineador forzado multilingüe MMS (wav2vec2): cada letra de la
     letra recibe su instante exacto. No transcribe: coloca el texto que se le da.
  4. (crear) Parte las palabras en sílabas (pyphen, según el idioma), da a cada sílaba su inicio y su fin, y su
     nota (mediana del tono cantado). Las sílabas largas que cambian de nota se parten en varias notas («~»).
  5. (crear) Escribe cancion.txt en formato UltraStar: una frase por línea de la letra.
Requisitos: ver tools/trabajador/LEEME.md (torch y torchaudio 2.8, demucs, torchcrepe, librosa, pyphen, soundfile; ffmpeg).
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys
import unicodedata

import numpy as np

SR = 44100
LANGS = {  # código → (pyphen, nombre en la cabecera)
    'es': ('es', 'Spanish'), 'en': ('en_US', 'English'), 'ca': ('ca', 'Catalan'), 'fr': ('fr', 'French'),
    'it': ('it_IT', 'Italian'), 'pt': ('pt_PT', 'Portuguese'), 'de': ('de_DE', 'German'), 'gl': ('gl', 'Galician'), 'eu': ('eu', 'Basque'),
}
BPM = 400                      # resolución: un tiempo = 60000 / (BPM·4) = 37,5 ms
BEAT = 60000 / (BPM * 4)


def log(*a):
    print(*a, flush=True)


def device():
    import torch
    return 'mps' if torch.backends.mps.is_available() else 'cpu'


def liberar():
    """Suelta la memoria de los modelos entre paso y paso (en el servidor la memoria es justa)."""
    import gc
    gc.collect()


# ---------------------------------------------------------------------------- audio
def leer_audio(path, sr=SR, canales=2):
    """Audio en float32 (canales, n) con ffmpeg."""
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(canales), '-ar', str(sr), '-'],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(out, dtype=np.float32)
    return a.reshape(-1, canales).T.copy()


def guardar_mp3(x, sr, path, kbps=128):
    """x mono float32 → mp3."""
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '1', '-i', '-',
                          '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', path], stdin=subprocess.PIPE)
    p.communicate(x.astype(np.float32).tobytes())
    if p.returncode:
        raise RuntimeError('ffmpeg no pudo guardar ' + path)


# ---------------------------------------------------------------------------- 1. voz
def separar_voz(path):
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model
    log('· Separando la voz (Demucs)…')
    wav = leer_audio(path)
    model = get_model('htdemucs')
    model.eval()
    ref = wav.mean(0)
    x = torch.from_numpy((wav - ref.mean()) / (ref.std() + 1e-8))
    dev = device()
    with torch.no_grad():
        try:
            out = apply_model(model, x[None], device=dev, split=True, overlap=0.25, progress=False)[0]
        except Exception:   # por si MPS no soporta alguna operación
            out = apply_model(model, x[None], device='cpu', split=True, overlap=0.25, progress=False)[0]
    out = out * (ref.std() + 1e-8) + ref.mean()
    voz = out[model.sources.index('vocals')].mean(0).cpu().numpy().astype(np.float32)
    del model, out, x
    liberar()
    return voz


# ---------------------------------------------------------------------------- 2. tono
def medir_tono(voz, sr=SR):
    """Tono cada 10 ms con CREPE (modelo pequeño: en Shine acierta como el grande, 77 % frente al 54 % de pYIN,
    y tarda ~7 s). Si CREPE no está o falla, pYIN."""
    log('· Midiendo el tono de la voz…')
    try:
        import torch
        import torchcrepe
        import librosa
        y = librosa.resample(voz, orig_sr=sr, target_sr=16000).astype(np.float32)
        f0, per = torchcrepe.predict(torch.from_numpy(y)[None], 16000, hop_length=160, fmin=65, fmax=1050, model='tiny',
                                     decoder=torchcrepe.decode.viterbi, return_periodicity=True, batch_size=1024, device=device())
        per = torchcrepe.filter.median(per, 3)
        f0 = torchcrepe.filter.mean(f0, 3)
        f0, per = f0[0].cpu().numpy(), per[0].cpu().numpy()
        liberar()
        rms = np.sqrt(np.convolve(y ** 2, np.ones(400) / 400, 'same'))[::160]
        n = min(len(f0), len(per), len(rms))   # a veces difieren en una trama según la duración
        f0, per, rms = f0[:n], per[:n], rms[:n]
        umbral = max(1e-4, np.percentile(rms, 30) * 1.5)
        midi = np.where((per > 0.45) & (rms > umbral), 69 + 12 * np.log2(np.maximum(f0, 1) / 440), np.nan)
        return np.arange(len(f0)) * 0.01, midi
    except Exception as e:
        log('  (CREPE no disponible, uso pYIN:', e, ')')
    import librosa
    y = librosa.resample(voz, orig_sr=sr, target_sr=22050)
    f0, voiced, prob = librosa.pyin(y, fmin=65, fmax=1050, sr=22050, frame_length=2048, hop_length=220)
    t = librosa.times_like(f0, sr=22050, hop_length=220)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=220)[0]
    umbral = max(1e-4, np.percentile(rms, 30) * 1.5)
    midi = np.where(voiced & (prob > 0.3) & (rms[:len(f0)] > umbral), 69 + 12 * np.log2(np.where(f0 > 0, f0, 1) / 440), np.nan)
    return t, midi


def curva_json(t, midi):
    return [[int(round(a * 1000)), (None if math.isnan(m) else round(float(m), 2))] for a, m in zip(t, midi)]


# ---------------------------------------------------------------------------- 3. alinear la letra
def normalizar(c):
    c = unicodedata.normalize('NFD', c.lower())
    c = ''.join(x for x in c if not unicodedata.combining(x))
    return {'ñ': 'n', 'ç': 'c', 'ß': 's', 'æ': 'ae', 'œ': 'oe', '’': "'", '`': "'"}.get(c, c)


def palabras_de(lineas):
    """[(linea, palabra_original, [índice normalizado o None por letra], texto_normalizado)]"""
    out = []
    for li, linea in enumerate(lineas):
        for w in linea.split():
            idx, norm = [], ''
            for ch in w:
                n = ''.join(x for x in normalizar(ch) if x in "abcdefghijklmnopqrstuvwxyz'")
                if n:
                    idx.append(len(norm))
                    norm += n
                else:
                    idx.append(None)
            out.append((li, w, idx, norm))
    return out


def ventanas_lrc(lineas, lrc, dur):
    """Con una letra sincronizada (LRC), la zona de la canción donde cae cada línea: {línea: (ini, fin)} en segundos.
    Las líneas se emparejan por su texto (la letra puede estar retocada); las que no casan quedan entre sus vecinas."""
    import difflib
    import re
    marcas = []
    for L in (lrc or '').splitlines():
        ts = re.findall(r'\[(\d+):(\d+(?:[.:]\d+)?)\]', L)
        txt = re.sub(r'\[[^\]]*\]', '', L).strip()
        for mm, ss in ts:
            if txt:
                marcas.append((int(mm) * 60 + float(ss.replace(':', '.')), txt))
    marcas.sort()
    if len(marcas) < 3:
        return {}
    n = lambda s: re.sub(r'[^a-z0-9]', '', ''.join(normalizar(c) for c in s))
    a, b = [n(x) for x in lineas], [n(x[1]) for x in marcas]
    ini = {}
    for blk in difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks():
        for k in range(blk.size):
            ini[blk.a + k] = marcas[blk.b + k][0]
    if len(ini) < len(lineas) * 0.5:   # la letra no se parece a la sincronizada: mejor sin ventanas
        return {}
    ord_ = sorted(ini)
    out = {}
    for k, li in enumerate(ord_):
        sig = next((ini[x] for x in ord_[k + 1:] if ini[x] > ini[li]), dur)
        out[li] = (max(0, ini[li] - 1.0), min(dur, sig + 1.5), ini[li])   # con margen: las LRC no son exactas
    # Las líneas sin marca: entre la anterior y la siguiente que sí tienen
    for li in range(len(lineas)):
        if li in out:
            continue
        prev = max((x for x in out if x < li), default=None)
        nxt = min((x for x in out if x > li), default=None)
        out[li] = (out[prev][0] if prev is not None else 0.0, out[nxt][1] if nxt is not None else dur, None)
    return out


def alinear(voz, sr, palabras, ventanas=None):
    import torch
    import torchaudio
    from torchaudio.pipelines import MMS_FA as bundle
    log('· Alineando la letra con la voz (MMS)…')
    y = torch.from_numpy(voz)[None]
    y = torchaudio.functional.resample(y, sr, bundle.sample_rate)
    model = bundle.get_model(with_star=False).eval()
    # Emisiones por trozos de 20 s con 1 s de margen a cada lado (el modelo no cabe entero con canciones largas)
    paso, margen, sr16 = 20 * bundle.sample_rate, bundle.sample_rate, bundle.sample_rate
    trozos = []
    with torch.inference_mode():
        for a in range(0, y.shape[1], paso):
            i0, i1 = max(0, a - margen), min(y.shape[1], a + paso + margen)
            e, _ = model(y[:, i0:i1])
            fps = e.shape[1] / ((i1 - i0) / sr16)
            s0 = int(round((a - i0) / sr16 * fps))
            s1 = s0 + int(round(min(paso, y.shape[1] - a) / sr16 * fps))
            trozos.append(e[:, s0:s1])
    em = torch.cat(trozos, 1)
    del model, trozos
    liberar()
    seg_por_trama = y.shape[1] / sr16 / em.shape[1]
    validas = [p for p in palabras if p[3]]
    tokenizar, alineador = bundle.get_tokenizer(), bundle.get_aligner()
    tiempos = {}
    # Primero, alineación de toda la canción de una vez
    tok = tokenizar([p[3] for p in validas])
    for p, sp in zip(validas, alineador(em[0], tok)):
        tiempos[id(p)] = [(s.start * seg_por_trama, s.end * seg_por_trama, float(s.score)) for s in sp]
    if ventanas:
        # La letra sincronizada puede ser de otra versión (disco, videoclip con intro…): se mide el desfase con lo
        # alineado. Si es constante, se corrige y cada línea se vuelve a buscar solo en su zona (así no se confunden
        # estribillos repetidos ni se meten frases en los solos); si no casa, se queda la alineación global.
        dif = []
        for li in sorted({p[0] for p in validas}):
            w = ventanas.get(li)
            p0 = next((p for p in validas if p[0] == li), None)
            if w and w[2] is not None and p0 and tiempos.get(id(p0)):
                dif.append(tiempos[id(p0)][0][0] - w[2])
        if len(dif) < 4:
            return tiempos
        d = float(np.median(dif))
        casan = sum(abs(x - d) < 1.5 for x in dif) / len(dif)
        log(f'  (letra sincronizada: desfase {d:+.1f} s, casan {casan:.0%} de las líneas)')
        if casan < 0.6:
            return tiempos
        ventanas = {k: (max(0, a + d), b + d, s) for k, (a, b, s) in ventanas.items()}
        globales = dict(tiempos)
        tiempos = {}
        try:
            for li in sorted({p[0] for p in validas}):
                ps = [p for p in validas if p[0] == li]
                a, b, _ = ventanas[li]
                f0, f1 = max(0, int(a / seg_por_trama)), min(em.shape[1], int(b / seg_por_trama))
                tok = tokenizar([p[3] for p in ps])
                if f1 - f0 < sum(len(x) for x in tok) * 2:
                    raise ValueError('ventana corta')
                for p, sp in zip(ps, alineador(em[0, f0:f1], tok)):
                    tiempos[id(p)] = [((s.start + f0) * seg_por_trama, (s.end + f0) * seg_por_trama, float(s.score)) for s in sp]
            return tiempos
        except Exception as e:
            log('  (sin ventanas:', e, ')')
            return globales
    return tiempos


# ---------------------------------------------------------------------------- 4. sílabas y notas
def silabas(palabra, idioma):
    import pyphen
    h = pyphen.Pyphen(lang=LANGS.get(idioma, ('es',))[0])
    partes = h.inserted(palabra, hyphen='\u0001').split('\u0001')
    return [x for x in partes if x]


def construir(lineas, palabras, tiempos, t, midi, idioma):
    """Notas: [{linea, ini, fin (s), texto, midi}]"""
    notas = []
    primera_de_linea = set()
    for li in range(len(lineas)):
        ws = [p for p in palabras if p[0] == li]
        if ws:
            primera_de_linea.add(id(ws[0]))
    for p in palabras:
        li, w, idx, norm = p
        sp = tiempos.get(id(p))
        sil = silabas(w, idioma)
        pos = 0
        for k, s in enumerate(sil):
            ini = fin = None
            for j in range(pos, pos + len(s)):
                n = idx[j] if j < len(idx) else None
                if n is not None and sp and n < len(sp):
                    a, b, _ = sp[n]
                    ini = a if ini is None else min(ini, a)
                    fin = b if fin is None else max(fin, b)
            pos += len(s)
            texto = ((' ' if k == 0 and id(p) not in primera_de_linea else '') + s)
            if ini is None:   # sin letras alineables (números, signos): se pega a la sílaba anterior
                if notas and notas[-1]['linea'] == li:
                    notas[-1]['texto'] += texto
                continue
            notas.append({'linea': li, 'ini': ini, 'fin': fin, 'texto': texto})
    # Duraciones: hasta la siguiente sílaba si está cerca o mientras siga sonando la voz
    sonando = ~np.isnan(midi)
    for i, n in enumerate(notas):
        sig = notas[i + 1]['ini'] if i + 1 < len(notas) else n['fin'] + 2
        fin = max(n['fin'], n['ini'] + 0.12)
        if sig - fin < 0.35:
            fin = sig - 0.02
        else:
            j = np.searchsorted(t, fin)
            while j < len(t) and t[j] < sig - 0.05 and sonando[j]:
                j += 1
            fin = max(fin, t[min(j, len(t) - 1)])
        n['fin'] = max(n['ini'] + 0.06, min(fin, sig - 0.02))
    # Tono: mediana de lo cantado en la sílaba; las largas con cambios de nota estables se parten
    out = []
    ultimo = None
    for n in notas:
        sel = (t >= n['ini']) & (t < n['fin'])
        m = midi[sel]
        m = m[~np.isnan(m)]
        if not len(m):
            n['midi'] = ultimo if ultimo is not None else 60
            out.append(n)
            continue
        n['midi'] = int(round(float(np.median(m))))
        ultimo = n['midi']
        seg = tramos(t[sel], midi[sel])
        if n['fin'] - n['ini'] > 0.45 and len(seg) > 1:
            for k, (a, b, p) in enumerate(seg):
                out.append({'linea': n['linea'], 'ini': a, 'fin': b, 'texto': n['texto'] if k == 0 else '~', 'midi': p})
            ultimo = seg[-1][2]
        else:
            out.append(n)
    return out


def tramos(ts, ms, minimo=0.16):
    """Tramos estables de una misma nota dentro de una sílaba: [(ini, fin, midi)]."""
    r = np.round(ms)
    segs = []
    i = 0
    while i < len(r):
        if np.isnan(r[i]):
            i += 1
            continue
        j = i
        while j + 1 < len(r) and (np.isnan(r[j + 1]) or r[j + 1] == r[i]):
            j += 1
        segs.append([ts[i], ts[j] + 0.01, int(r[i])])
        i = j + 1
    segs = [s for s in segs if s[1] - s[0] >= minimo]
    fus = []
    for s in segs:
        if fus and fus[-1][2] == s[2]:
            fus[-1][1] = s[1]
        else:
            fus.append(s)
    if len(fus) > 1:   # sin huecos: cada tramo llega hasta el siguiente
        for a, b in zip(fus, fus[1:]):
            a[1] = b[0]
    return [tuple(s) for s in fus]


# ---------------------------------------------------------------------------- 5. UltraStar
def ultrastar(notas, titulo, artista, idioma, anio, mp3, portada=None):
    gap = int(round(notas[0]['ini'] * 1000))
    beat = lambda s: int(round((s * 1000 - gap) / BEAT))
    head = [f'#TITLE:{titulo}', f'#ARTIST:{artista}', f'#LANGUAGE:{LANGS.get(idioma, ("", idioma))[1]}']
    if anio:
        head.append(f'#YEAR:{anio}')
    head += [f'#MP3:{mp3}', f'#AUDIO:{mp3}']
    if portada:
        head.append(f'#COVER:{portada}')
    head += [f'#BPM:{BPM}', f'#GAP:{gap}', '#CREATOR:Gramola']
    body = []
    prev_fin = None
    for i, n in enumerate(notas):
        b, l = beat(n['ini']), max(1, int(round((n['fin'] - n['ini']) * 1000 / BEAT)))
        if prev_fin is not None and b < prev_fin:
            b = prev_fin
        if i and n['linea'] != notas[i - 1]['linea']:
            hueco = b - prev_fin
            body.append(f'- {prev_fin + max(0, min(8, hueco // 2))}')
        texto = n['texto'].replace('\n', ' ')
        body.append(f": {b} {l} {n['midi']} {texto}")
        prev_fin = b + l
    return '\n'.join(head + body + ['E']) + '\n'


# ---------------------------------------------------------------------------- órdenes
def analizar(audio, salida, progreso=lambda p, m: None):
    os.makedirs(salida, exist_ok=True)
    progreso(5, 'Separando la voz')
    voz = separar_voz(audio)
    progreso(55, 'Guardando la voz')
    guardar_mp3(voz, SR, os.path.join(salida, 'voz.mp3'))
    progreso(65, 'Midiendo el tono')
    t, midi = medir_tono(voz)
    json.dump(curva_json(t, midi), open(os.path.join(salida, 'voz-tono.json'), 'w'), separators=(',', ':'))
    return voz, t, midi


def crear(audio, letra, salida, titulo, artista, idioma='es', anio=None, mp3='audio.mp3', progreso=lambda p, m: None, lrc=None):
    lineas = [l.strip() for l in letra.replace('\r', '').split('\n') if l.strip()]
    if not lineas:
        raise ValueError('La letra está vacía')
    voz, t, midi = analizar(audio, salida, progreso)
    progreso(75, 'Alineando la letra')
    pal = palabras_de(lineas)
    ven = ventanas_lrc(lineas, lrc, len(voz) / SR) if lrc else None
    tiempos = alinear(voz, SR, pal, ven)
    progreso(90, 'Sílabas y notas')
    notas = construir(lineas, pal, tiempos, t, midi, idioma)
    txt = ultrastar(notas, titulo, artista, idioma, anio, mp3)
    open(os.path.join(salida, 'cancion.txt'), 'w', encoding='utf-8').write(txt)
    progreso(100, f'{len(notas)} notas en {len(lineas)} frases')
    return txt


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('orden', choices=['crear', 'analizar'])
    ap.add_argument('audio')
    ap.add_argument('resto', nargs='+')
    ap.add_argument('--titulo', default='Sin título')
    ap.add_argument('--artista', default='Desconocido')
    ap.add_argument('--idioma', default='es')
    ap.add_argument('--anio')
    ap.add_argument('--lrc', help='letra sincronizada (LRC) para guiar el encaje')
    a = ap.parse_args()
    if a.orden == 'analizar':
        analizar(a.audio, a.resto[0], lambda p, m: log(f'{p}% {m}'))
    else:
        letra = open(a.resto[0], encoding='utf-8').read()
        crear(a.audio, letra, a.resto[1], a.titulo, a.artista, a.idioma, a.anio, os.path.basename(a.audio), lambda p, m: log(f'{p}% {m}'),
              open(a.lrc, encoding='utf-8').read() if a.lrc else None)
