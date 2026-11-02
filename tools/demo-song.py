#!/usr/bin/env python3
"""Genera la canción de demostración de Gramola (melodía y letra originales, sin derechos de terceros).

Crea web/songs/demo-musicbox/ con:
  - demo.txt  (formato UltraStar)
  - demo.mp3  (audio sintetizado: melodía guía + acordes + bajo + percusión)
  - cover.png (portada generada)

Uso:  python3 tools/demo-song.py        (necesita ffmpeg en el PATH para el .mp3 y la portada)
"""
import math
import os
import random
import struct
import subprocess
import sys
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'web', 'songs', 'demo-gramola')
SR = 44100
BPM_US = 240            # BPM en el sentido UltraStar: un "pulso" = 60000/(240*4) = 62,5 ms
BEAT = 60.0 / (BPM_US * 4)
GAP_MS = 4000           # intro antes de la primera frase
random.seed(7)

# Letra y melodía originales. Cada frase: lista de (sílaba, tono, duración en pulsos).
# Tono 0 = Do4. "*" al principio de la sílaba = nota dorada.
Q = 8   # negra (= 0,5 s)
E = 4   # corchea
LINES = [
    [("Lu", 4, E), ("ces ", 4, E), ("en ", 5, E), ("el ", 7, E), ("sa", 7, Q), ("lón", 5, Q)],
    [("sue", 4, E), ("na ", 2, E), ("la ", 0, E), ("can", 0, E), ("ción", 2, Q * 2)],
    [("co", 4, E), ("ge el ", 4, E), ("mó", 5, E), ("vil ", 7, E), ("y ", 9, Q), ("ven", 7, Q)],
    [("can", 5, E), ("ta ", 4, E), ("con ", 2, E), ("el ", 4, E), ("co", 2, E), ("ra", 2, E), ("zón", 0, Q)],
    [("Gra", 9, E), ("mo", 9, E), ("la, ", 7, Q), ("*no ", 9, Q), ("*pa", 11, Q), ("*res", 12, Q)],
    [("cada ", 12, E), ("no", 11, E), ("ta ", 9, E), ("vale ", 7, E), ("un ", 9, Q), ("sol", 7, Q)],
    [("Gra", 9, E), ("mo", 9, E), ("la, ", 7, Q), ("*su", 9, Q), ("*be el ", 11, Q), ("*son", 12, Q)],
    [("que ", 7, E), ("es", 5, E), ("ta ", 4, E), ("no", 2, E), ("che ", 4, Q), ("es ", 2, Q), ("hoy", 0, Q * 2)],
]
CHORDS = [  # un acorde por compás (16 pulsos = 1 compás de 4 negras)
    [0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2],
] * 6


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def build_notes():
    """Coloca las frases en el tiempo, cada una al empezar un compás."""
    notes, txt_lines = [], []
    beat = 0
    for line in LINES:
        start_line = beat
        cur = beat
        out = []
        for syl, pitch, dur in line:
            golden = syl.startswith('*')
            syl = syl.lstrip('*')
            out.append(('*' if golden else ':', cur, dur - 1 if dur > 2 else dur, pitch, syl))
            notes.append((cur, dur, pitch))
            cur += dur
        txt_lines.append(out)
        beat = ((cur + 8 + 15) // 16) * 16  # siguiente frase en el próximo compás, con un respiro
    return notes, txt_lines, beat


def synth(notes, total_beats):
    total_s = GAP_MS / 1000 + total_beats * BEAT + 3
    n = int(total_s * SR)
    buf = [0.0] * n

    def add_tone(t0, dur, hz, amp, harmonics, attack=0.01, release=0.08):
        i0 = int(t0 * SR)
        length = int((dur + release) * SR)
        w = 2 * math.pi * hz / SR
        for k in range(length):
            i = i0 + k
            if i >= n:
                break
            t = k / SR
            env = min(1.0, t / attack) * (1.0 if t < dur else max(0.0, 1 - (t - dur) / release))
            s = 0.0
            for h, a in harmonics:
                s += a * math.sin(w * h * k)
            buf[i] += amp * env * s

    gap = GAP_MS / 1000
    # Melodía guía (tipo flauta suave), una octava por encima
    for beat, dur, pitch in notes:
        add_tone(gap + beat * BEAT, dur * BEAT * 0.92, midi_hz(72 + pitch), 0.16, [(1, 1), (2, 0.25), (3, 0.08)], 0.02, 0.06)
    # Acordes y bajo desde la intro hasta el final
    bar = 16 * BEAT
    first_bar = gap - 4 * bar
    for b, chord in enumerate(CHORDS):
        t0 = first_bar + b * bar
        if t0 < 0 or t0 > total_s - 3:
            continue
        for c in chord:
            add_tone(t0, bar * 0.95, midi_hz(60 + c), 0.045, [(1, 1), (2, 0.4), (4, 0.1)], 0.05, 0.2)
        add_tone(t0, bar * 0.45, midi_hz(36 + chord[0] % 12), 0.12, [(1, 1), (2, 0.3)], 0.01, 0.1)
        add_tone(t0 + bar / 2, bar * 0.45, midi_hz(43 + chord[0] % 12), 0.1, [(1, 1), (2, 0.3)], 0.01, 0.1)
        # Percusión: bombo en 1 y 3, "hi-hat" en corcheas
        for q in range(4):
            tq = t0 + q * bar / 4
            if q % 2 == 0:
                i0 = int(tq * SR)
                for k in range(int(0.15 * SR)):
                    if i0 + k < n:
                        t = k / SR
                        buf[i0 + k] += 0.35 * math.exp(-t * 30) * math.sin(2 * math.pi * (50 + 80 * math.exp(-t * 40)) * t)
            for e in (0, 0.5):
                i0 = int((tq + e * bar / 4) * SR)
                for k in range(int(0.04 * SR)):
                    if i0 + k < n:
                        buf[i0 + k] += 0.04 * math.exp(-k / SR * 90) * (random.random() * 2 - 1)

    peak = max(abs(x) for x in buf) or 1
    return [x / peak * 0.85 for x in buf]


def write_wav(path, samples):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s)) * 32767)) for s in samples))


def write_txt(path, txt_lines):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('#TITLE:Luces en el salón\n#ARTIST:Gramola (demo)\n#LANGUAGE:Español\n#GENRE:Pop\n#YEAR:2026\n')
        f.write('#AUDIO:demo.mp3\n#MP3:demo.mp3\n#COVER:cover.png\n#VIDEO:video.mp4\n#VIDEOGAP:0\n')
        f.write(f'#BPM:{BPM_US}\n#GAP:{GAP_MS}\n')
        for li, line in enumerate(txt_lines):
            for kind, beat, dur, pitch, syl in line:
                f.write(f'{kind} {beat} {dur} {pitch} {syl}\n')
            if li < len(txt_lines) - 1:
                last = line[-1]
                f.write(f'- {last[1] + last[2] + 1}\n')  # salto de frase justo después de la última nota
        f.write('E\n')


def main():
    os.makedirs(OUT, exist_ok=True)
    notes, txt_lines, total = build_notes()
    write_txt(os.path.join(OUT, 'demo.txt'), txt_lines)
    wav = os.path.join(OUT, 'demo.wav')
    write_wav(wav, synth(notes, total))
    if '--wav-only' in sys.argv:
        txt = os.path.join(OUT, 'demo.txt')
        with open(txt, encoding='utf-8') as f:
            lines = f.readlines()
        with open(txt, 'w', encoding='utf-8') as f:
            f.writelines(line.replace('demo.mp3', 'demo.wav') for line in lines
                         if not line.startswith(('#COVER:', '#VIDEO:', '#VIDEOGAP:')))
        print('Demo WAV creada en', OUT)
        return
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '128k', os.path.join(OUT, 'demo.mp3')], check=True)
    os.remove(wav)
    # Vídeo de prueba (original): degradado de colores en movimiento, para comprobar el videoclip y su sincronía
    dur = GAP_MS / 1000 + total * BEAT + 3
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
                    f'gradients=s=854x480:c0=0xec3013:c1=0x2fa9d6:c2=0xf2c230:c3=0x201e1d:n=4:speed=0.02:duration={dur:.1f}:rate=25',
                    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
                    os.path.join(OUT, 'video.mp4')], check=True)
    # Portada: degradado nocturno con un círculo de luz
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'lavfi', '-i',
                    'gradients=s=800x800:c0=0x2a1460:c1=0xff4fa3:c2=0x0b3a5c:n=3:type=radial:seed=4,format=rgb24',
                    '-frames:v', '1', os.path.join(OUT, 'cover.png')], check=True)
    print('Demo creada en', OUT)


if __name__ == '__main__':
    main()
