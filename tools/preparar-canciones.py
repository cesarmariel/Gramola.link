#!/usr/bin/env python3
"""Prepara carpetas UltraStar para Gramola (sin tocar los originales).

    python3 tools/preparar-canciones.py ORIGEN DESTINO [--con-video]

Para cada carpeta de ORIGEN crea una copia lista en DESTINO:
  - Nombres de fichero y carpeta normalizados (Unicode NFC): en el Mac las tildes se guardan de otra forma
    y en el servidor los .txt no encontrarían su audio.
  - Cabeceras #MP3/#AUDIO, #COVER y #VIDEO apuntando a los ficheros que hay de verdad en la carpeta
    (un .mp3/.ogg/.m4a, un .jpg/.png y un vídeo), aunque el .txt diga otro nombre.
  - .txt pasado a UTF-8. Solo se reescriben las cabeceras: las notas y la letra no se modifican.
  - Sin vídeo por defecto (algunas teles no reproducen videoclips junto a la canción). Con --con-video, los vídeos
    que la tele no lee (.avi, .mkv…) se convierten a MP4 H.264 de hasta 720p y sin sonido.
Si el .txt trae el estribillo marcado (#MEDLEYSTARTBEAT/#MEDLEYENDBEAT), crea también el tramo del Megamix.
No muestra ni registra el contenido de las letras.
"""
import os
import re
import shutil
import subprocess
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import megamix  # noqa: E402

AUDIO = ('.mp3', '.ogg', '.m4a', '.opus', '.wav')
IMG = ('.jpg', '.jpeg', '.png', '.webp')
VIDEO_OK = ('.mp4', '.webm')
VIDEO_CONV = ('.avi', '.mkv', '.flv', '.divx', '.mpg', '.mpeg', '.mov', '.wmv', '.m4v')
nfc = lambda s: unicodedata.normalize('NFC', s)


def pick(files, exts, prefer=None):
    c = [f for f in files if f.lower().endswith(exts)]
    if prefer:
        for f in c:
            if nfc(f) == nfc(prefer): return f
    # portada: preferir la que no es fondo
    c.sort(key=lambda f: ('[bg]' in f.lower() or 'back' in f.lower(), len(f)))
    return c[0] if c else None


def convertir_video(src, dst):
    vf = "scale='min(1280,iw)':-2"
    base = ['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-vf', vf, '-an', '-movflags', '+faststart', '-pix_fmt', 'yuv420p']
    for enc in (['-c:v', 'h264_videotoolbox', '-b:v', '2500k'], ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24']):
        r = subprocess.run(base + enc + [dst], capture_output=True)
        if r.returncode == 0 and os.path.getsize(dst) > 10000:
            return True
    return False


def codec(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name',
                        '-of', 'csv=p=0', path], capture_output=True, text=True)
    return r.stdout.strip() or None


def preparar(src_dir, dst_root, sin_video):
    convertido = False
    name = nfc(os.path.basename(src_dir.rstrip('/')))
    files = [f for f in os.listdir(src_dir) if not f.startswith('.')]
    txt = pick(files, ('.txt',))
    if not txt:
        return name, 'sin .txt'
    raw = open(os.path.join(src_dir, txt), 'rb').read()
    try:
        text = raw.decode('utf-8').lstrip('﻿')
    except UnicodeDecodeError:
        text = raw.decode('cp1252')
    head = {m.group(1).upper(): m.group(2).strip() for m in re.finditer(r'^#([A-Za-z0-9]+):(.*)$', text, re.M)}
    audio = pick(files, AUDIO, head.get('MP3') or head.get('AUDIO'))
    audio_from_video = None
    if not audio:
        # Sin mp3: el audio va dentro del vídeo (el .txt apunta al vídeo como #MP3) → se extrae a mp3
        audio_from_video = pick(files, VIDEO_OK + VIDEO_CONV, head.get('MP3') or head.get('AUDIO') or head.get('VIDEO'))
        if not audio_from_video:
            return name, 'sin audio'
    cover = pick(files, IMG, head.get('COVER'))
    video = pick(files, VIDEO_OK + VIDEO_CONV, head.get('VIDEO'))

    dst = os.path.join(dst_root, name)
    os.makedirs(dst, exist_ok=True)
    if audio_from_video:
        audio = os.path.splitext(nfc(audio_from_video))[0] + '.mp3'
        if not (os.path.exists(os.path.join(dst, audio)) and os.path.getsize(os.path.join(dst, audio)) > 10000):
            r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(src_dir, audio_from_video), '-vn',
                                '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(dst, audio)], capture_output=True)
            if r.returncode != 0:
                return name, 'no se pudo sacar el audio del vídeo'
    else:
        shutil.copy2(os.path.join(src_dir, audio), os.path.join(dst, nfc(audio)))
        # Un .mp3 que por dentro no es MP3 (p. ej. MP2): la tele no lo trata bien → se convierte a MP3 de verdad
        dest = os.path.join(dst, nfc(audio))
        if codec(dest) is None and open(dest, 'rb').read(3) == b'ID3':
            # Etiqueta ID3 pegada delante de otro contenedor (p. ej. un WAV con MP3 dentro): se quita la etiqueta
            raw = open(dest, 'rb').read(); n = 10 + ((raw[6] & 127) << 21 | (raw[7] & 127) << 14 | (raw[8] & 127) << 7 | (raw[9] & 127))
            open(dest + '.sin-id3', 'wb').write(raw[n:])
            if codec(dest + '.sin-id3'):
                os.replace(dest + '.sin-id3', dest + '.tmp-in')
                r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', dest + '.tmp-in', '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-f', 'mp3', dest], capture_output=True)
                os.remove(dest + '.tmp-in'); convertido = r.returncode == 0
            else:
                os.remove(dest + '.sin-id3')
        if audio.lower().endswith('.mp3') and codec(os.path.join(dst, nfc(audio))) not in ('mp3', None):
            tmp = os.path.join(dst, nfc(audio)) + '.tmp.mp3'
            r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(dst, nfc(audio)), '-vn',
                                '-c:a', 'libmp3lame', '-b:a', '192k', tmp], capture_output=True)
            if r.returncode == 0:
                os.replace(tmp, os.path.join(dst, nfc(audio))); convertido = True
            elif os.path.exists(tmp):
                os.remove(tmp)
    new = {'MP3': nfc(audio), 'AUDIO': nfc(audio)}
    if cover:
        shutil.copy2(os.path.join(src_dir, cover), os.path.join(dst, nfc(cover)))
        new['COVER'] = nfc(cover)
    vnote = '-'
    if video and not sin_video:
        if video.lower().endswith(VIDEO_OK):
            shutil.copy2(os.path.join(src_dir, video), os.path.join(dst, nfc(video)))
            new['VIDEO'] = nfc(video); vnote = 'copiado'
        else:
            out = os.path.splitext(nfc(video))[0] + '.mp4'
            if os.path.exists(os.path.join(dst, out)) and os.path.getsize(os.path.join(dst, out)) > 10000:
                ok = True
            else:
                ok = convertir_video(os.path.join(src_dir, video), os.path.join(dst, out))
            if ok: new['VIDEO'] = out; vnote = 'convertido a mp4'
            else: vnote = 'NO se pudo convertir'
    # Reescribir solo las cabeceras (las líneas de notas y letra quedan tal cual)
    out_lines, seen = [], set()
    for line in text.splitlines():
        m = re.match(r'^#([A-Za-z0-9]+):(.*)$', line)
        if m:
            k = m.group(1).upper()
            if k == 'VIDEOGAP' and 'VIDEO' not in new:
                continue  # sin vídeo, el desfase del vídeo sobra
            if k == 'BACKGROUND':
                bg = m.group(2).strip()
                if not any(nfc(f) == nfc(bg) for f in files):
                    continue  # el fondo que nombra no viene en la carpeta: fuera la referencia
                shutil.copy2(os.path.join(src_dir, next(f for f in files if nfc(f) == nfc(bg))), os.path.join(dst, nfc(bg)))
                out_lines.append(f'#BACKGROUND:{nfc(bg)}'); continue
            if k in ('MP3', 'AUDIO', 'COVER', 'VIDEO'):
                if k in new and k not in seen:
                    out_lines.append(f'#{k}:{new[k]}'); seen.add(k)
                continue
        elif new and not line.startswith('#') and len(seen) < len(new):
            for k, v in new.items():
                if k not in seen: out_lines.append(f'#{k}:{v}'); seen.add(k)
        out_lines.append(line)
    with open(os.path.join(dst, os.path.splitext(nfc(txt))[0] + '.txt'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(out_lines) + '\n')
    # Tramo del Megamix (si el .txt trae el estribillo marcado)
    mm = megamix.preparar(dst, auto=True)
    return name, 'ok' + (' · audio sacado del vídeo' if audio_from_video else '') + (f' · vídeo: {vnote}' if vnote != '-' else '') + (' · megamix' if mm.startswith('ok') else '') + (' · audio convertido a MP3' if convertido else '')


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    sin_video = '--con-video' not in sys.argv
    os.makedirs(dst, exist_ok=True)
    dirs = sorted(d for d in os.listdir(src) if os.path.isdir(os.path.join(src, d)))
    for i, d in enumerate(dirs, 1):
        name, res = preparar(os.path.join(src, d), dst, sin_video)
        print(f'[{i}/{len(dirs)}] {name}: {res}', flush=True)


if __name__ == '__main__':
    main()
