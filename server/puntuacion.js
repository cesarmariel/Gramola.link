'use strict';
// Puntuación en el servidor: la misma regla que la tele (docs/PUNTUACION.md), calculada con la voz que pasa por aquí.
//
// La tele sigue puntuando y dibujando en directo (sin esperar a la red); el servidor lleva su propia cuenta con los
// mismos mensajes de voz que reenvía a la tele y, al guardar el récord, no acepta más de lo que él ha visto cantar
// (con un margen por el vibrato y los pequeños desfases de reloj). Así una sala no puede inventarse un récord.
//
//   tele → {type:'sing', song, duo, delay, singers:[{id, part, tol}]}   al empezar la canción
//   tele → {type:'clock', pos, playing, lat}                           cada segundo (y al pausar o seguir)
//   móvil → {type:'pitch', n, v, lat}                                  ya se reenvía a la tele; aquí también se puntúa
const SL = 0.04;            // ranura de 40 ms (como la tele)
const TIME_MARGIN = 0.07;   // la voz cuenta aunque llegue unos ms antes o después de la nota (como la tele)
const HOLD = 0.16;          // la tele usa la última lectura del móvil hasta 160 ms (si el siguiente mensaje tarda)
const STEP = 0.02;          // paso con el que se recorre lo que cubre cada lectura
const MARGEN = { factor: 1.25, puntos: 200, racha: 3 };   // lo que se admite por encima de lo visto (vibrato, desfases)

// Partitura → notas con ranuras, igual que G.chartFor en la tele (gramola-bridge.js)
function buildChart(song, duo) {
  const duet = song.tracks.length > 1;
  const tracks = duo && duet ? [[song.tracks[0], [0]], [song.tracks[1], [1]]] : [[song.tracks[0], null]];
  const notes = [];
  const start = +song.start || 0;   // #START (ms): como la tele, las notas anteriores no se cantan
  const endMs = parseFloat(String((song.head && song.head.END) || '0').replace(',', '.')) || 0;   // #END (ms)
  for (const [lines, fixed] of tracks) {
    lines.forEach((l, li) => {
      const parts = fixed || (duo ? [li % 2] : [0, 1]);   // canción normal en Dúo: una frase cada uno
      for (const u of l.notes) {
        if (start && u.end <= start) continue;
        const type = u.type === 'golden' ? 'gold' : u.type === 'free' ? 'free' : u.type === 'rap' || u.type === 'rapgolden' ? 'rap' : 'n';
        const dur = Math.max(0.06, (u.end - u.start) / 1000);
        notes.push({ midi: u.midi, start: u.start / 1000, dur, type, parts, slots: type === 'free' ? 0 : Math.max(1, Math.ceil(dur / SL)) });
      }
    });
  }
  notes.sort((a, b) => a.start - b.start);
  let cend = 0;
  notes.forEach((n, i) => { cend = Math.max(cend, n.start + n.dur); n.i = i; n.cend = cend; });   // fin máximo hasta aquí (para el cursor)
  const unitP = [0, 1].map(q => { let tot = 0; for (const n of notes) if (n.slots && n.parts.includes(q)) tot += n.slots * (n.type === 'gold' ? 2 : 1); return tot ? 10000 / tot : 0; });
  let end = notes.length ? Math.max(...notes.map(n => n.start + n.dur)) : 0;
  if (endMs > 0) end = Math.min(end, endMs / 1000);
  return { notes, unitP, end };
}

class Sesion {
  constructor(songId, song, { duo = false, delay = 0, singers = [] } = {}) {
    this.song = songId;
    this.chart = buildChart(song, !!duo);
    this.delay = Math.max(0, Math.min(2000, +delay || 0)) / 1000;   // ajuste del micro de la tele (ms → s)
    this.clock = null;          // { pos, at, playing, lat }  (pos en s, at = Date.now() de llegada, lat = media latencia tele en s)
    this.startedAt = Date.now();
    this.saved = false;
    this.singers = new Map();
    for (const s of singers) {
      if (s == null || s.id == null) continue;
      const tol = Math.max(0.25, Math.min(6, +s.tol || 2));
      this.singers.set(+s.id, { part: s.part === 1 ? 1 : 0, tol, sl: new Map(), score: 0, cursor: 0, last: null, lastT: -Infinity });
    }
  }
  // Reloj de la canción (s) en este instante, extrapolado desde el último «clock» de la tele
  posAt(now = Date.now()) {
    const c = this.clock;
    if (!c) return null;
    return c.playing ? c.pos + c.lat + (now - c.at) / 1000 : c.pos;
  }
  setClock(m, now = Date.now()) {
    const pos = +m.pos;
    if (!isFinite(pos) || pos < 0) return;
    this.clock = { pos, at: now, playing: m.playing !== false, lat: Math.max(0, Math.min(1, (+m.lat || 0) / 1000)) };
  }
  // Una lectura de voz de un móvil: n = nota MIDI decimal o null, v = volumen 0..1, lat = latencia del móvil (ms)
  sample(id, n, v, lat, now = Date.now()) {
    const s = this.singers.get(id);
    const pos = this.posAt(now);
    if (!s || pos == null) return;
    s.muestras = (s.muestras || 0) + 1;
    // La tele coloca cada lectura en «reloj − (ajuste + latencia del móvil + latencia de la tele)» y la usa hasta que
    // llega la siguiente. Aquí posAt() ya es el reloj de la tele en este instante; la lectura le llegará a la tele media
    // latencia más tarde y ella descuenta esa misma media latencia: se cancelan, así que no se resta otra vez.
    const t = pos - this.delay - Math.max(0, Math.min(2, (+lat || 0) / 1000));
    if (s.last) this.cover(s, s.last, Math.min(t, s.last.t + HOLD));
    s.last = (typeof n === 'number' && isFinite(n) && v > 0.02) ? { t, n } : null;
    if (s.last) this.cover(s, s.last, t + STEP);   // lo que cubre la propia lectura al llegar
  }
  // Marca las ranuras acertadas desde la lectura «last» (en last.t) hasta «hasta»
  cover(s, last, hasta) {
    const { notes, unitP } = this.chart;
    for (let t = last.t; t < hasta; t += STEP) {
      if (t < s.lastT - 1) s.cursor = 0;   // el reloj ha vuelto atrás (pausa, salto): se empieza de nuevo
      s.lastT = t;
      while (s.cursor < notes.length && notes[s.cursor].cend <= t - TIME_MARGIN) s.cursor++;
      // La nota activa: la que contiene t de verdad; si no hay, la que lo alcanza con el margen (como la tele)
      let a = null, near = null;
      for (let i = s.cursor; i < notes.length; i++) {
        const nt = notes[i];
        if (nt.start - TIME_MARGIN > t) break;
        if (!nt.slots || !nt.parts.includes(s.part)) continue;
        if (t >= nt.start && t < nt.start + nt.dur) { a = nt; break; }
        if (!near && t < nt.start + nt.dur + TIME_MARGIN) near = nt;
      }
      if (!a) a = near;
      if (!a) continue;
      const diff = ((last.n - a.midi) % 12 + 18) % 12 - 6;   // octava indiferente
      if (Math.abs(diff) > s.tol + (a.type === 'rap' ? 0.6 : 0)) continue;
      const tt = Math.min(Math.max(t, a.start), a.start + a.dur - 0.001);
      const si = Math.min(a.slots - 1, Math.max(0, Math.floor((tt - a.start) / SL)));
      let sl = s.sl.get(a.i);
      if (!sl) { sl = new Uint8Array(a.slots); s.sl.set(a.i, sl); }
      if (!sl[si]) { sl[si] = 1; s.score += unitP[s.part] * (a.type === 'gold' ? 2 : 1); }
    }
  }
  // Resultado de un cantante: puntos vistos, mejor racha y precisión
  result(id, now = Date.now()) {
    const s = this.singers.get(id);
    if (!s) return null;
    if (s.last) { this.cover(s, s.last, s.last.t + HOLD); s.last = null; }
    let combo = 0, best = 0, hit = 0, tot = 0;
    for (const n of this.chart.notes) {
      if (!n.slots || !n.parts.includes(s.part)) continue;
      const sl = s.sl.get(n.i);
      const h = sl ? sl.reduce((x, y) => x + y, 0) : 0;
      hit += h; tot += n.slots;
      combo = h / n.slots > 0.6 ? combo + 1 : 0;
      best = Math.max(best, combo);
    }
    return { score: Math.round(s.score), streak: best, prec: tot ? hit / tot : 0 };
  }
  // ¿Se ha llegado al final de la canción? (con 2 s de margen por si el último «clock» llegó antes del final)
  complete(now = Date.now()) {
    const pos = this.posAt(now);
    return pos != null && pos >= this.chart.end - 2;
  }
  // Lo que se admite guardar para lo que dice la tele, visto lo que ha visto el servidor
  verify(id, claimedScore, claimedStreak) {
    const r = this.result(id), s = this.singers.get(id);
    if (!r || !s || !s.muestras) return null;   // no ha mandado ni una lectura de voz: sin récord (quien canta y falla cuenta con 0)
    const score = Math.min(Math.max(0, Math.round(+claimedScore || 0)), Math.round(r.score * MARGEN.factor + MARGEN.puntos), 10000);
    const streak = Math.min(Math.max(0, Math.round(+claimedStreak || 0)), r.streak + MARGEN.racha);
    return { score, streak, visto: r };
  }
}

module.exports = { Sesion, buildChart, SL, MARGEN };
