// Lector del formato UltraStar (.txt). Devuelve la canción con tiempos en milisegundos.
// Formato: cabeceras "#CLAVE:valor" y líneas de notas:
//   ": inicio duración tono sílaba"   normal      "*" dorada   "F" libre   "R"/"G" rap
//   "- inicio [fin]"                  salto de frase
//   "P1" / "P2"                       cambio de cantante (duetos)
//   "E"                               fin
// Tono 0 = Do4 (MIDI 60). Duración de un pulso = 60000 / (BPM * 4) ms.

export function decodeText(buf) {
  const bytes = new Uint8Array(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

const num = s => parseFloat(String(s).replace(',', '.'));

export function parseUltraStar(text) {
  const head = {};
  const tracks = [[], []]; // P1, P2 (en canciones normales solo P1)
  let track = 0;
  let line = null;
  let relOffset = 0;
  let relative = false;

  const newLine = () => {
    line = { notes: [] };
    tracks[track].push(line);
  };

  for (const raw of text.split(/\r?\n/)) {
    // OJO: no recortar los espacios del final; en UltraStar separan las palabras ("ces " + "en ")
    const l = raw.replace(/\r$/, '');
    if (!l.trim()) continue;
    if (l[0] === '#') {
      const i = l.indexOf(':');
      if (i > 0) head[l.slice(1, i).trim().toUpperCase()] = l.slice(i + 1).trim();
      if (head.RELATIVE && head.RELATIVE.toUpperCase() === 'YES') relative = true;
      continue;
    }
    if (l.trim() === 'E') break;
    if (/^P\s*\d/.test(l)) {
      track = Math.min(1, parseInt(l.replace(/\D/g, ''), 10) - 1 || 0);
      line = null;
      relOffset = 0;
      continue;
    }
    if (l[0] === '-') {
      const p = l.slice(1).trim().split(/\s+/).map(Number);
      if (relative) relOffset += p.length > 1 ? p[1] : p[0];
      line = null;
      continue;
    }
    const m = l.match(/^([:*FRG])\s*(-?\d+)\s+(\d+)\s+(-?\d+) ?(.*)$/);
    if (!m) continue;
    if (!line) newLine();
    const type = { ':': 'normal', '*': 'golden', F: 'free', R: 'rap', G: 'rapgolden' }[m[1]];
    line.notes.push({ type, beat: +m[2] + (relative ? relOffset : 0), len: +m[3], pitch: +m[4], text: m[5] });
  }

  const bpm = num(head.BPM || '0');
  if (!bpm) throw new Error('La canción no tiene #BPM');
  const beatMs = 60000 / (bpm * 4);
  const gap = num(head.GAP || '0');
  const t = b => gap + b * beatMs;

  const build = notesLines => notesLines.filter(l => l.notes.length).map(l => {
    const notes = l.notes.map(n => ({
      ...n,
      start: t(n.beat),
      end: t(n.beat + n.len),
      midi: 60 + n.pitch,
      weight: n.type === 'golden' || n.type === 'rapgolden' ? 2 : n.type === 'free' ? 0 : 1,
    }));
    return { notes, start: notes[0].start, end: notes[notes.length - 1].end, text: notes.map(n => n.text).join('') };
  });

  const t1 = build(tracks[0]);
  const t2 = build(tracks[1]);
  const all = t1.flatMap(l => l.notes).filter(n => n.weight);
  return {
    head,
    title: head.TITLE || 'Sin título',
    artist: head.ARTIST || '',
    audio: head.AUDIO || head.MP3 || '',
    video: head.VIDEO || '',
    videoGap: num(head.VIDEOGAP || '0') * 1000,
    background: head.BACKGROUND || '',
    cover: head.COVER || '',
    start: num(head.START || '0') * 1000,
    beatMs,
    tracks: t2.length ? [t1, t2] : [t1],
    lines: t1,
    minMidi: Math.min(...all.map(n => n.midi)),
    maxMidi: Math.max(...all.map(n => n.midi)),
    totalWeight: all.reduce((s, n) => s + (n.end - n.start) * n.weight, 0),
  };
}
