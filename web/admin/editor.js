// Gramola · Editor de canciones (UltraStar) dentro del admin.
// Línea de tiempo con las notas a la altura de su tono, forma de onda (de la voz sola si existe), curva de la voz
// real, reproducción (también lenta) con tono guía, prueba cantando con el micro y guardado con versiones.
(() => {
  'use strict';
  const RED = '#ec3013', INK = '#201e1d', GOLD = '#e8a900', BLUE = '#2c6fd6', GREEN = '#1f9d55';
  const NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
  // Tono: en UltraStar 0 = Do4, pero muchos .txt usan la numeración MIDI (60 = Do4). Se decide por canción.
  let MIDI0 = 60;   // número que corresponde a Do4 en la canción abierta
  const noteName = p => NAMES[((p % 12) + 12) % 12] + (Math.floor((p - MIDI0) / 12) + 4);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = ms => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`; };

  // ------------------------------------------------------------------ UltraStar: leer y escribir
  function parse(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    const head = [];
    let i = 0;
    for (; i < lines.length; i++) {
      const L = lines[i];
      const m = L.match(/^#([^:]+):(.*)$/);
      if (m) { head.push([m[1].toUpperCase(), m[2].trim()]); continue; }
      if (!L.trim()) continue;
      break;
    }
    const hv = k => (head.find(h => h[0] === k) || [])[1];
    const relative = /^yes$/i.test(hv('RELATIVE') || '');
    const tracks = [];
    let tr = null, off = 0;
    const need = () => { if (!tr) { tr = { name: 'P1', notes: [], breaks: [], br2: {} }; tracks.push(tr); } return tr; };
    for (; i < lines.length; i++) {
      const L = lines[i];
      if (!L.trim()) continue;
      if (/^E\s*$/.test(L)) break;
      const p = L.match(/^P\s*(\d)/);
      if (p) { tr = { name: 'P' + p[1], notes: [], breaks: [], br2: {} }; tracks.push(tr); off = 0; continue; }
      const n = L.match(/^([:*FRG])\s*(-?\d+)\s+(\d+)\s+(-?\d+)(?: (.*))?$/);
      if (n) { need().notes.push({ t: n[1], b: +n[2] + off, l: +n[3], p: +n[4], s: n[5] ?? '' }); continue; }
      const br = L.match(/^-\s*(-?\d+)(?:\s+(-?\d+))?/);
      if (br) {
        need().breaks.push(+br[1] + off);
        if (!relative && br[2] != null) tr.br2[+br[1]] = +br[2];   // segundo número (solo cuenta en formato relativo): se conserva tal cual
        if (relative) off += br[2] != null ? +br[2] : +br[1];
      }
    }
    if (!tracks.length) tracks.push({ name: 'P1', notes: [], breaks: [], br2: {} });
    for (const t of tracks) { t.notes.sort((a, b) => a.b - b.b); t.breaks.sort((a, b) => a - b); }
    return { head: head.filter(h => h[0] !== 'RELATIVE'), tracks, wasRelative: relative };
  }
  function serialize(doc) {
    const out = doc.head.map(([k, v]) => `#${k}:${v}`);
    const multi = doc.tracks.length > 1;
    for (const t of doc.tracks) {
      if (multi) out.push(t.name);
      const notes = t.notes.slice().sort((a, b) => a.b - b.b);
      const brs = t.breaks.slice().sort((a, b) => a - b);
      let bi = 0;
      notes.forEach((n, k) => {
        // Un corte de frase va antes de la primera nota que empieza en él o después (nunca antes de la primera nota)
        while (bi < brs.length && k > 0 && brs[bi] <= n.b) { const b2 = t.br2 && t.br2[brs[bi]]; out.push(b2 != null ? `- ${brs[bi]} ${b2}` : `- ${brs[bi]}`); bi++; }
        if (k === 0) while (bi < brs.length && brs[bi] <= n.b) bi++;
        out.push(`${n.t} ${n.b} ${n.l} ${n.p} ${n.s}`);
      });
      for (; bi < brs.length; bi++) { const b2 = t.br2 && t.br2[brs[bi]]; out.push(b2 != null ? `- ${brs[bi]} ${b2}` : `- ${brs[bi]}`); }   // cortes tras la última nota
    }
    out.push('E');
    return out.join('\n') + '\n';
  }
  // Frases de una pista: [{start, end, notes:[...]}] según los cortes
  function phrasesOf(t) {
    const notes = t.notes.slice().sort((a, b) => a.b - b.b), brs = t.breaks.slice().sort((a, b) => a - b), out = [];
    let cur = [], bi = 0;
    for (const n of notes) {
      while (bi < brs.length && brs[bi] <= n.b) { if (cur.length) { out.push(cur); cur = []; } bi++; }
      cur.push(n);
    }
    if (cur.length) out.push(cur);
    return out.map(ns => ({ notes: ns, start: ns[0].b, end: ns[ns.length - 1].b + ns[ns.length - 1].l }));
  }

  // ------------------------------------------------------------------ el editor
  async function open(view, id, api, toast) {
    const fail = e => toast(e.message || String(e), true);
    const data = await api('/songs/' + encodeURIComponent(id) + '/chart');
    let doc = parse(data.text);
    const hv = k => (doc.head.find(h => h[0] === k) || [])[1];
    const setHead = (k, v) => { const h = doc.head.find(x => x[0] === k); if (h) h[1] = String(v); else doc.head.push([k, String(v)]); };
    const num = v => parseFloat(String(v || '0').replace(',', '.')) || 0;
    let bpm = num(hv('BPM')), gap = num(hv('GAP'));
    const midiStyle = () => { const ps = doc.tracks.flatMap(t => t.notes).map(n => n.p).sort((a, b) => a - b); MIDI0 = ps.length && ps[ps.length >> 1] > 35 ? 60 : 0; };
    midiStyle();
    if (!bpm) throw new Error('La canción no tiene BPM');
    const beatMs = () => 60000 / (bpm * 4);
    const b2ms = b => gap + b * beatMs();
    const ms2b = ms => (ms - gap) / beatMs();
    let ti = 0;                               // pista que se edita (dúos)
    const T = () => doc.tracks[ti];

    view.innerHTML = `<div class="ed">
      <div class="ed-top">
        <button class="btn ghost sm" data-go="canciones/${esc(encodeURIComponent(id))}">← Ficha</button>
        <div class="ed-title"><b>${esc(hv('TITLE') || id)}</b> <span>${esc(hv('ARTIST') || '')}</span></div>
        <span class="ed-dirty" id="ed-dirty" hidden>sin guardar</span>
        <span class="grow"></span>
        <select class="inp sm" id="ed-ver" title="Versiones guardadas"><option value="">Versiones…</option></select>
        <button class="btn sm" id="ed-undo" title="⌘Z">Deshacer</button><button class="btn sm" id="ed-redo" title="⇧⌘Z">Rehacer</button>
        <button class="btn red" id="ed-save">Guardar (⌘S)</button>
      </div>
      <div class="ed-bar">
        <button class="btn dark" id="ed-play" title="Espacio">▶</button>
        <span class="mono ed-time" id="ed-time">0:00.00</span>
        <select class="inp sm" id="ed-rate" title="Velocidad"><option value="1">1×</option><option value="0.75">0,75×</option><option value="0.5">0,5×</option></select>
        <label class="ed-ck"><input type="checkbox" id="ed-guide"> Tono guía</label>
        <label class="ed-ck"><input type="checkbox" id="ed-loop"> Repetir frase</label>
        <label class="ed-ck"><input type="checkbox" id="ed-mic"> Probar con micro</label>
        <span class="ed-sep"></span>
        <span class="small muted">GAP</span><button class="btn sm ghost" data-gap="-50">−50</button><button class="btn sm ghost" data-gap="-10">−10</button>
        <input class="inp sm mono" id="ed-gap" size="7"><button class="btn sm ghost" data-gap="10">+10</button><button class="btn sm ghost" data-gap="50">+50</button>
        <span class="small muted">BPM <b class="mono" id="ed-bpm"></b></span>
        ${doc.tracks.length > 1 ? `<select class="inp sm" id="ed-track">${doc.tracks.map((t, i) => `<option value="${i}">Voz ${i + 1}</option>`).join('')}</select>` : ''}
        <span class="grow"></span>
        <span class="small muted">Zoom</span><input type="range" id="ed-zoom" min="0" max="100" value="45">
        <label class="ed-ck"><input type="checkbox" id="ed-wv" ${data.vocals ? 'checked' : 'disabled'}> Voz sola</label>
      </div>
      <canvas id="ed-mini" class="ed-mini" height="34"></canvas>
      <div class="ed-wrap" id="ed-wrap"><canvas id="ed-cv"></canvas></div>
      <div class="ed-under">
        <div class="ed-kara" id="ed-kara"></div>
        <div class="ed-info" id="ed-info"></div>
      </div>
      <div class="ed-low">
        <div><h2 class="sec" style="margin-top:6px">Frases</h2><div class="ed-phr" id="ed-phr"></div></div>
        <div><h2 class="sec" style="margin-top:6px">Atajos</h2><div class="ed-help">
          <b>Clic</b> elegir · <b>⇧ clic</b> añadir · <b>arrastrar fondo</b> elegir varias · <b>arrastrar nota</b> mover (tiempo y tono) · <b>bordes</b> alargar o acortar ·
          <b>doble clic</b> en nota: cambiar sílaba; en el fondo: nota nueva · <b>← →</b> mover 1 tiempo (⇧ 10) · <b>↑ ↓</b> tono (⇧ octava) · <b>⌥ ← →</b> acortar / alargar ·
          <b>S</b> partir · <b>M</b> unir con la siguiente · <b>B</b> corte de frase antes de la nota · <b>G</b> dorada · <b>F</b> libre · <b>R</b> rap · <b>N</b> normal ·
          <b>Supr</b> borrar · <b>⌘A</b> todas · <b>Espacio</b> reproducir · <b>Inicio</b> al principio · arrastrar las <span style="color:${RED}">líneas rojas</span> mueve los cortes de frase ·
          rueda: desplazar · <b>⌘ rueda</b> zoom · clic en la regla: saltar ahí</div>
          <div class="ed-score" id="ed-score"></div></div>
      </div>
    </div>`;
    const $ = s => view.querySelector(s);
    const cv = $('#ed-cv'), cx = cv.getContext('2d'), mini = $('#ed-mini'), mx = mini.getContext('2d'), wrap = $('#ed-wrap');

    // ---------------- audio
    const audio = new Audio();
    audio.preload = 'auto'; audio.preservesPitch = true; audio.src = data.audio;
    let peaks = null, vpeaks = null, durMs = 0, pitchCurve = null;
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    async function peaksOf(url) {
      const buf = await (await fetch(url)).arrayBuffer();
      const ab = await actx.decodeAudioData(buf);
      const ch = ab.getChannelData(0), per = Math.max(1, Math.floor(ab.sampleRate / 100)), n = Math.floor(ch.length / per), p = new Float32Array(n);
      for (let i = 0; i < n; i++) { let mxv = 0; for (let j = i * per, e = j + per; j < e; j++) { const v = Math.abs(ch[j]); if (v > mxv) mxv = v; } p[i] = mxv; }
      return { p, dur: ab.duration * 1000 };
    }
    peaksOf(data.audio).then(r => { peaks = r.p; durMs = r.dur; draw(); }).catch(() => {});
    if (data.vocals) peaksOf(data.vocals).then(r => { vpeaks = r.p; draw(); }).catch(() => {});
    if (data.pitch) fetch(data.pitch).then(r => r.json()).then(j => { pitchCurve = j; draw(); }).catch(() => {});
    audio.addEventListener('loadedmetadata', () => { if (!durMs) durMs = audio.duration * 1000; draw(); });

    // ---------------- vista
    let pxPerMs = 0.12, viewMs = 0, H = 520, W = 1000;
    let sel = new Set(), hist = [], fut = [], dirty = false, drag = null, hover = null;
    const zoomFrom = v => 0.015 * Math.pow(1.06, v);   // 0..100 → 0.015..5 px/ms
    pxPerMs = zoomFrom(+$('#ed-zoom').value);
    const RULER = 26, WAVE = 80, PAD = 8;
    let pMin = 0, pMax = 12;
    function range() {
      const all = doc.tracks.flatMap(t => t.notes).map(n => n.p);
      pMin = all.length ? Math.min(...all) - 3 : -5; pMax = all.length ? Math.max(...all) + 3 : 15;
      if (pMax - pMin < 14) { const c = (pMax + pMin) / 2; pMin = Math.floor(c - 7); pMax = Math.ceil(c + 7); }
    }
    range();
    const rowH = () => (H - RULER - WAVE - PAD * 2) / (pMax - pMin + 1);
    const yOf = p => RULER + PAD + (pMax - p + 0.5) * rowH();
    const pOf = y => Math.round(pMax + 0.5 - (y - RULER - PAD) / rowH());
    const xOf = ms => (ms - viewMs) * pxPerMs;
    const msOf = x => x / pxPerMs + viewMs;
    function resize() {
      const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      W = Math.max(400, r.width); H = Math.max(360, Math.min(innerHeight - 330, 640));
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mini.width = W * dpr; mini.style.width = W + 'px'; mini.height = 34 * dpr; mx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    const ro = new ResizeObserver(resize); ro.observe(wrap);

    // ---------------- historia
    const snap = () => JSON.stringify({ tracks: doc.tracks, gap, head: doc.head });
    function push() { hist.push(snap()); if (hist.length > 300) hist.shift(); fut = []; setDirty(true); }
    function restore(s) { const o = JSON.parse(s); doc.tracks = o.tracks; doc.head = o.head; gap = num(hv('GAP')); sel.clear(); range(); refresh(); }
    function undo() { if (!hist.length) return; fut.push(snap()); restore(hist.pop()); setDirty(true); }
    function redo() { if (!fut.length) return; hist.push(snap()); restore(fut.pop()); setDirty(true); }
    function setDirty(v) { dirty = v; $('#ed-dirty').hidden = !v; }
    const onLeave = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', onLeave);

    // ---------------- dibujo
    let raf = 0;
    function draw() { if (!raf) raf = requestAnimationFrame(paint); }
    function paint() {
      raf = 0;
      const now = audio.currentTime * 1000;
      cx.clearRect(0, 0, W, H);
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, W, H);
      // filas de tono
      const rh = rowH();
      for (let p = pMin; p <= pMax; p++) {
        const y = yOf(p);
        const black = [1, 3, 6, 8, 10].includes(((p % 12) + 12) % 12);
        cx.fillStyle = black ? '#f4f2f2' : '#fff'; cx.fillRect(0, y - rh / 2, W, rh);
        if (((p % 12) + 12) % 12 === 0) { cx.fillStyle = '#e2dede'; cx.fillRect(0, y + rh / 2 - 1, W, 1); }
      }
      // regla (segundos) y tiempos
      cx.fillStyle = '#f7f6f6'; cx.fillRect(0, 0, W, RULER); cx.fillStyle = INK; cx.fillRect(0, RULER - 1, W, 1);
      const stepS = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60].find(s => s * 1000 * pxPerMs > 70) || 60;
      cx.font = '11px Archivo, sans-serif'; cx.fillStyle = '#605d5d';
      for (let s = Math.floor(msOf(0) / 1000 / stepS) * stepS; s * 1000 < msOf(W); s += stepS) {
        const x = xOf(s * 1000); cx.fillRect(x, RULER - 7, 1, 6); cx.fillText(fmt(s * 1000).replace(/\.00$/, ''), x + 3, 12);
      }
      // líneas de tiempo (beats) si hay zoom
      if (beatMs() * pxPerMs > 6) {
        cx.fillStyle = 'rgba(32,30,29,.05)';
        for (let b = Math.floor(ms2b(msOf(0))); b2ms(b) < msOf(W); b++) { const x = xOf(b2ms(b)); cx.fillRect(x, RULER, 1, H - RULER - WAVE); }
      }
      // forma de onda
      const wp = $('#ed-wv').checked && vpeaks ? vpeaks : peaks;
      const wy = H - WAVE;
      cx.fillStyle = '#f7f6f6'; cx.fillRect(0, wy, W, WAVE); cx.fillStyle = INK; cx.fillRect(0, wy, W, 1);
      if (wp) {
        cx.fillStyle = wp === vpeaks ? 'rgba(44,111,214,.55)' : 'rgba(32,30,29,.35)';
        for (let x = 0; x < W; x++) {
          const a = Math.floor(msOf(x) / 10), b = Math.max(a + 1, Math.floor(msOf(x + 1) / 10));
          let m = 0; for (let i = a; i < b && i < wp.length; i++) if (i >= 0 && wp[i] > m) m = wp[i];
          const h = Math.min(1, m * 1.4) * (WAVE - 10); cx.fillRect(x, wy + WAVE / 2 - h / 2, 1, Math.max(1, h));
        }
      }
      // otras pistas (dúo), en gris
      doc.tracks.forEach((t, k) => { if (k !== ti) for (const n of t.notes) box(n, false, true); });
      // cortes de frase
      for (const b of T().breaks) {
        const x = xOf(b2ms(b));
        if (x < -10 || x > W + 10) continue;
        cx.strokeStyle = RED; cx.setLineDash([4, 4]); cx.beginPath(); cx.moveTo(x + .5, RULER); cx.lineTo(x + .5, wy); cx.stroke(); cx.setLineDash([]);
        cx.fillStyle = RED; cx.beginPath(); cx.moveTo(x - 6, RULER); cx.lineTo(x + 6, RULER); cx.lineTo(x, RULER + 9); cx.fill();
      }
      // curva de la voz real (análisis) y del micro
      if (pitchCurve) curve(pitchCurve, 'rgba(44,111,214,.85)', 2);
      if (micTrace.length) curve(micTrace, 'rgba(31,157,85,.95)', 2.5);
      // notas
      const cur = curNote(now);
      for (const n of T().notes) box(n, sel.has(n), false, n === cur);
      // cabezal
      const px = xOf(now);
      cx.fillStyle = RED; cx.fillRect(px - 1, 0, 2, H);
      // marquesina
      if (drag && drag.kind === 'marquee') { cx.strokeStyle = RED; cx.fillStyle = 'rgba(236,48,19,.08)'; const r = rectOf(drag); cx.fillRect(r.x, r.y, r.w, r.h); cx.strokeRect(r.x + .5, r.y + .5, r.w, r.h); }
      // etiquetas de tono a la izquierda
      cx.font = '10px Archivo, sans-serif'; cx.fillStyle = '#9b9797';
      for (let p = pMin; p <= pMax; p++) if (rh > 11 || ((p % 12) + 12) % 12 === 0) cx.fillText(noteName(p), 3, yOf(p) + 3);
      paintMini(now);
      $('#ed-time').textContent = fmt(now);
      karaoke(now);
      if (!audio.paused || drag) draw();
    }
    function curve(arr, color, w) {
      // La curva es MIDI y puede venir una octava arriba o abajo: cada punto se acerca a la nota que toca en ese
      // momento (o a la última que sonó), que es como puntúa el juego.
      const ns = T().notes;
      let k = 0;
      cx.strokeStyle = color; cx.lineWidth = w; cx.beginPath();
      let pen = false, lastMs = -1e9, lastY = 0;
      const a0 = msOf(-20), a1 = msOf(W + 20);
      for (const [ms, midi] of arr) {
        if (ms < a0) continue; if (ms > a1) break;
        if (midi == null || ms - lastMs > 60) pen = false;
        lastMs = ms;
        if (midi == null) continue;
        const b = ms2b(ms);
        while (k + 1 < ns.length && ns[k + 1].b <= b) k++;
        const ref = ns[k] ? ns[k].p - MIDI0 + 60 : (pMin + pMax) / 2 - MIDI0 + 60;
        let m = midi; while (m - ref > 6) m -= 12; while (ref - m > 6) m += 12;
        const x = xOf(ms), y = yOf(m - 60 + MIDI0);
        if (pen && Math.abs(y - lastY) > rowH() * 7) pen = false;   // sin trazos verticales en los saltos
        if (!pen) { cx.moveTo(x, y); pen = true; } else cx.lineTo(x, y);
        lastY = y;
      }
      cx.stroke(); cx.lineWidth = 1;
    }
    function box(n, on, ghost, playing) {
      const x = xOf(b2ms(n.b)), w = Math.max(2, n.l * beatMs() * pxPerMs), rh = rowH(), y = yOf(n.p) - rh / 2;
      if (x > W || x + w < 0) return;
      const h = Math.max(6, rh);
      if (ghost) { cx.fillStyle = 'rgba(155,151,151,.25)'; cx.fillRect(x, y, w, h); return; }
      cx.fillStyle = on ? RED : n.t === '*' || n.t === 'G' ? GOLD : n.t === 'F' ? '#d7d3d3' : n.t === 'R' ? '#6b6767' : playing ? '#3a3736' : INK;
      if (n.t === 'F') { cx.setLineDash([3, 3]); cx.strokeStyle = INK; cx.strokeRect(x + .5, y + .5, w - 1, h - 1); cx.setLineDash([]); cx.globalAlpha = .5; cx.fillRect(x, y, w, h); cx.globalAlpha = 1; }
      else cx.fillRect(x, y, w, h);
      if (playing && !on) { cx.strokeStyle = RED; cx.lineWidth = 2; cx.strokeRect(x + 1, y + 1, w - 2, h - 2); cx.lineWidth = 1; }
      if (w > 14) {
        cx.font = '600 12px Archivo, sans-serif'; cx.fillStyle = INK;
        const s = n.s.replace(/^ /, '·');
        cx.save(); cx.beginPath(); cx.rect(x, 0, Math.max(w, 60), H); cx.clip(); cx.fillText(s, x + 2, y + h + 12); cx.restore();
      }
    }
    function paintMini(now) {
      const Wm = W, len = Math.max(durMs, b2ms(Math.max(0, ...T().notes.map(n => n.b + n.l))) + 2000);
      const sx = Wm / len;
      mx.clearRect(0, 0, Wm, 34); mx.fillStyle = '#f7f6f6'; mx.fillRect(0, 0, Wm, 34);
      if (peaks) { mx.fillStyle = 'rgba(32,30,29,.25)'; for (let x = 0; x < Wm; x++) { const i = Math.floor(x / sx / 10); const h = Math.min(1, (peaks[i] || 0) * 1.4) * 30; mx.fillRect(x, 17 - h / 2, 1, h); } }
      mx.fillStyle = INK; for (const n of T().notes) mx.fillRect(b2ms(n.b) * sx, 30, Math.max(1, n.l * beatMs() * sx), 3);
      mx.strokeStyle = RED; mx.lineWidth = 2; mx.strokeRect(viewMs * sx, 1, W / pxPerMs * sx, 32); mx.lineWidth = 1;
      mx.fillStyle = RED; mx.fillRect(now * sx, 0, 2, 34);
    }
    function curNote(now) { const b = ms2b(now); return T().notes.find(n => b >= n.b && b < n.b + n.l) || null; }
    function karaoke(now) {
      const ph = phrasesOf(T()), b = ms2b(now);
      let k = ph.findIndex(p => b < p.end + 2);
      if (k < 0) k = ph.length - 1;
      const line = p => p ? p.notes.map(n => `<span class="${b >= n.b + n.l ? 'done' : b >= n.b ? 'on' : ''}${n.t === '*' || n.t === 'G' ? ' gold' : ''}">${esc(n.s)}</span>`).join('') : '';
      const html = `<div class="k1">${line(ph[k])}</div><div class="k2">${line(ph[k + 1])}</div>`;
      if (html !== karaoke.last) { $('#ed-kara').innerHTML = html; karaoke.last = html; }
    }

    // ---------------- interacción con el ratón
    const at = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function hit(x, y) {
      for (const n of T().notes.slice().reverse()) {
        const nx = xOf(b2ms(n.b)), w = Math.max(4, n.l * beatMs() * pxPerMs), rh = Math.max(6, rowH()), ny = yOf(n.p) - rh / 2;
        if (x >= nx - 3 && x <= nx + w + 3 && y >= ny - 2 && y <= ny + rh + 2) {
          const edge = w > 14 ? (x < nx + 5 ? 'l' : x > nx + w - 5 ? 'r' : null) : (x > nx + w - 3 ? 'r' : null);
          return { n, edge };
        }
      }
      return null;
    }
    function hitBreak(x, y) { if (y > RULER + 14) return null; for (const [i, b] of T().breaks.entries()) if (Math.abs(xOf(b2ms(b)) - x) < 7) return i; return null; }
    const rectOf = d => ({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) });
    cv.addEventListener('mousedown', e => {
      const { x, y } = at(e);
      actx.resume();
      if (y < RULER) {
        const bi = hitBreak(x, y);
        if (bi != null) { push(); drag = { kind: 'break', i: bi }; return; }
        seek(msOf(x)); return;
      }
      if (y > H - WAVE) { seek(msOf(x)); return; }
      const bi = hitBreak(x, RULER);
      const h = hit(x, y);
      if (!h && bi != null && Math.abs(xOf(b2ms(T().breaks[bi])) - x) < 4) { push(); drag = { kind: 'break', i: bi }; return; }
      if (h) {
        if (e.shiftKey) { sel.has(h.n) ? sel.delete(h.n) : sel.add(h.n); draw(); info(); return; }
        if (!sel.has(h.n)) { sel = new Set([h.n]); }
        const wasDirty = dirty;
        push();
        drag = { wasDirty, kind: h.edge ? 'resize-' + h.edge : 'move', x0: x, y0: y, orig: [...sel].map(n => ({ n, b: n.b, l: n.l, p: n.p })), moved: false };
        info(); draw(); return;
      }
      if (!e.shiftKey) sel.clear();
      drag = { kind: 'marquee', x0: x, y0: y, x1: x, y1: y, base: new Set(sel) };
      draw(); info();
    });
    addEventListener('mousemove', onMove);
    function onMove(e) {
      if (!cv.isConnected) return cleanup();
      const { x, y } = at(e);
      if (!drag) {
        const h = y > RULER && y < H - WAVE ? hit(x, y) : null;
        cv.style.cursor = (y < RULER + 14 && hitBreak(x, y) != null) ? 'ew-resize' : h ? (h.edge ? 'ew-resize' : 'grab') : y < RULER || y > H - WAVE ? 'pointer' : 'crosshair';
        return;
      }
      const dB = Math.round((x - (drag.x0 ?? x)) / pxPerMs / beatMs());
      if (drag.kind === 'move') {
        const dP = Math.round(((drag.y0 ?? y) - y) / rowH());
        for (const o of drag.orig) { o.n.b = o.b + dB; o.n.p = o.p + dP; }
        drag.moved = drag.moved || dB !== 0 || dP !== 0;
      } else if (drag.kind === 'resize-r') {
        for (const o of drag.orig) o.n.l = Math.max(1, o.l + dB);
        drag.moved = true;
      } else if (drag.kind === 'resize-l') {
        for (const o of drag.orig) { const nb = Math.min(o.b + o.l - 1, o.b + dB); o.n.l = o.l + (o.b - nb); o.n.b = nb; }
        drag.moved = true;
      } else if (drag.kind === 'break') {
        T().breaks[drag.i] = Math.round(ms2b(msOf(x)));
      } else if (drag.kind === 'marquee') {
        drag.x1 = x; drag.y1 = y;
        const r = rectOf(drag); sel = new Set(drag.base);
        for (const n of T().notes) {
          const nx = xOf(b2ms(n.b)), w = n.l * beatMs() * pxPerMs, ny = yOf(n.p);
          if (nx + w >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h) sel.add(n);
        }
      }
      info(); draw();
    }
    addEventListener('mouseup', onUp);
    function onUp() {
      if (!drag) return;
      if ((drag.kind === 'move' || drag.kind.startsWith('resize')) && !drag.moved) { hist.pop(); setDirty(drag.wasDirty); }
      if (drag.kind === 'break') T().breaks.sort((a, b) => a - b);
      if (drag.kind === 'move') { T().notes.sort((a, b) => a.b - b.b); range(); }
      drag = null; refresh();
    }
    cv.addEventListener('dblclick', e => {
      const { x, y } = at(e);
      if (y < RULER || y > H - WAVE) return;
      const h = hit(x, y);
      if (h) return editText(h.n);
      push();
      const n = { t: ':', b: Math.round(ms2b(msOf(x))), l: 4, p: pOf(y), s: '~' };
      T().notes.push(n); T().notes.sort((a, b) => a.b - b.b); sel = new Set([n]); refresh(); editText(n);
    });
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        const { x } = at(e), at0 = msOf(x);
        const z = clamp(+$('#ed-zoom').value + (e.deltaY < 0 ? 3 : -3), 0, 100); $('#ed-zoom').value = z; pxPerMs = zoomFrom(z);
        viewMs = at0 - x / pxPerMs;
      } else viewMs += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / pxPerMs;
      viewMs = Math.max(-2000, viewMs); draw();
    }, { passive: false });
    mini.addEventListener('mousedown', e => {
      const len = Math.max(durMs, 1), r = mini.getBoundingClientRect();
      const go = ev => { viewMs = Math.max(-2000, (ev.clientX - r.left) / W * len - (W / pxPerMs) / 2); draw(); };
      go(e); const mv = ev => go(ev), up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    function editText(n) {
      const r = cv.getBoundingClientRect(), x = xOf(b2ms(n.b)), y = yOf(n.p) + rowH();
      const inp = document.createElement('input');
      inp.className = 'ed-inp'; inp.value = n.s; inp.style.left = (r.left + scrollX + x) + 'px'; inp.style.top = (r.top + scrollY + y + 4) + 'px';
      document.body.appendChild(inp); inp.focus(); inp.select();
      const done = ok => { if (ok && inp.value !== n.s) { push(); n.s = inp.value; } inp.remove(); refresh(); };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
      inp.onblur = () => done(true);
    }

    // ---------------- teclado
    function onKey(e) {
      if (!cv.isConnected) return cleanup();
      if (e.target.closest && e.target.closest('input, select, textarea') && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
      const k = e.key, mod = e.metaKey || e.ctrlKey, S = [...sel];
      const act = (fn, msg) => { e.preventDefault(); if (S.length || msg === 'any') { push(); fn(); T().notes.sort((a, b) => a.b - b.b); range(); refresh(); } };
      if (mod && k.toLowerCase() === 's') { e.preventDefault(); return save(); }
      if (mod && k.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
      if (mod && k.toLowerCase() === 'a') { e.preventDefault(); sel = new Set(T().notes); return refresh(); }
      if (k === ' ') { e.preventDefault(); return toggle(); }
      if (k === 'Home') { e.preventDefault(); return seek(Math.max(0, b2ms(T().notes[0] ? T().notes[0].b : 0) - 2000)); }
      if (k === 'Escape') { sel.clear(); return refresh(); }
      if (!S.length) return;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const d = (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1);
        return e.altKey ? act(() => S.forEach(n => (n.l = Math.max(1, n.l + d)))) : act(() => S.forEach(n => (n.b += d)));
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') { const d = (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 12 : 1); return act(() => S.forEach(n => (n.p += d))); }
      if (k === 'Delete' || k === 'Backspace') return act(() => { T().notes = T().notes.filter(n => !sel.has(n)); sel.clear(); });
      const kk = k.toLowerCase();
      if (kk === 'g') return act(() => S.forEach(n => (n.t = n.t === '*' ? ':' : '*')));
      if (kk === 'f') return act(() => S.forEach(n => (n.t = n.t === 'F' ? ':' : 'F')));
      if (kk === 'r') return act(() => S.forEach(n => (n.t = n.t === 'R' ? ':' : 'R')));
      if (kk === 'n') return act(() => S.forEach(n => (n.t = ':')));
      if (kk === 's') return act(() => {
        const nn = [];
        for (const n of S) { if (n.l < 2) continue; const a = Math.floor(n.l / 2); const m = { ...n, b: n.b + a, l: n.l - a, s: '~' }; n.l = a; T().notes.push(m); nn.push(m); }
        nn.forEach(m => sel.add(m));
      });
      if (kk === 'm') return act(() => {
        const ns = T().notes.slice().sort((a, b) => a.b - b.b);
        for (const n of S.sort((a, b) => a.b - b.b)) {
          const i = ns.indexOf(n), nx = ns[i + 1]; if (!nx || !T().notes.includes(n)) continue;
          n.l = nx.b + nx.l - n.b; n.s = n.s + nx.s.replace(/^~/, ''); T().notes = T().notes.filter(x => x !== nx); ns.splice(i + 1, 1); sel.delete(nx);
        }
      });
      if (kk === 'b') return act(() => {
        const n = S.sort((a, b) => a.b - b.b)[0], ns = T().notes.slice().sort((a, b) => a.b - b.b), i = ns.indexOf(n);
        const ex = T().breaks.findIndex(b => b > (i > 0 ? ns[i - 1].b : -1e9) && b <= n.b);
        if (ex >= 0) T().breaks.splice(ex, 1);
        else if (i > 0) T().breaks.push(Math.min(n.b, ns[i - 1].b + ns[i - 1].l + 2));
        T().breaks.sort((a, b) => a - b);
      });
    }
    addEventListener('keydown', onKey);

    // ---------------- reproducción, tono guía, micro
    let osc = null, og = null, loopPh = null;
    function seek(ms) { audio.currentTime = Math.max(0, ms / 1000); if (ms < viewMs || ms > msOf(W)) viewMs = ms - W / pxPerMs * 0.2; draw(); }
    async function toggle() {
      await actx.resume();
      if (audio.paused) {
        const b = ms2b(audio.currentTime * 1000);
        loopPh = $('#ed-loop').checked ? phrasesOf(T()).find(p => b < p.end) || null : null;
        if (loopPh && b < loopPh.start - 4) audio.currentTime = Math.max(0, b2ms(loopPh.start) / 1000 - 1);
        audio.playbackRate = +$('#ed-rate').value;
        await audio.play();
        if ($('#ed-mic').checked) startMic();
      } else { audio.pause(); stopMic(); }
      $('#ed-play').textContent = audio.paused ? '▶' : '❚❚';
      draw();
    }
    audio.addEventListener('pause', () => { $('#ed-play').textContent = '▶'; guide(null); });
    audio.addEventListener('ended', () => { stopMic(); });
    function guide(n) {
      if (!$('#ed-guide').checked || !n || n.t === 'F') { if (og) og.gain.setTargetAtTime(0, actx.currentTime, 0.02); return; }
      if (!osc) { osc = actx.createOscillator(); og = actx.createGain(); osc.type = 'triangle'; og.gain.value = 0; osc.connect(og).connect(actx.destination); osc.start(); }
      osc.frequency.setTargetAtTime(440 * Math.pow(2, (n.p - MIDI0 + 60 - 69) / 12), actx.currentTime, 0.01);
      og.gain.setTargetAtTime(0.12, actx.currentTime, 0.02);
    }
    let lastGuide = null;
    function tick() {
      if (!cv.isConnected) return cleanup();
      if (!audio.paused) {
        const now = audio.currentTime * 1000;
        if (now > msOf(W * 0.85)) viewMs = now - W / pxPerMs * 0.15;
        const n = curNote(now); if (n !== lastGuide) { guide(n); lastGuide = n; }
        if (loopPh && ms2b(now) > loopPh.end + 4) { audio.currentTime = Math.max(0, b2ms(loopPh.start) / 1000 - 1); micTrace = []; }
        draw();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    let micTrace = [], mic = null;
    async function startMic() {
      try {
        const { yin, hzToMidi } = await import('/js/pitch.js');
        if (!mic) {
          const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
          const src = actx.createMediaStreamSource(st), an = actx.createAnalyser(); an.fftSize = 2048; src.connect(an);
          mic = { st, an, buf: new Float32Array(2048), yin, hzToMidi };
        }
        micTrace = [];
        const lat = ((actx.outputLatency || 0) + (actx.baseLatency || 0)) * 1000;
        mic.timer = setInterval(() => {
          if (audio.paused) return;
          mic.an.getFloatTimeDomainData(mic.buf);
          let rms = 0; for (const v of mic.buf) rms += v * v; rms = Math.sqrt(rms / mic.buf.length);
          const r = rms > 0.01 ? mic.yin(mic.buf, actx.sampleRate) : null;
          micTrace.push([audio.currentTime * 1000 - lat, r && r.clarity > 0.6 ? mic.hzToMidi(r.hz) : null]);
        }, 25);
      } catch (e) { $('#ed-mic').checked = false; fail(new Error('No se pudo usar el micro: ' + e.message)); }
    }
    function stopMic() {
      if (mic && mic.timer) { clearInterval(mic.timer); mic.timer = null; score(); }
    }
    // Puntuación de la prueba: por nota, qué parte del tiempo se canta a menos de un semitono (sin importar la octava)
    function score() {
      if (!micTrace.length) return;
      let hitN = 0, tot = 0; const per = [];
      for (const p of phrasesOf(T())) {
        let h = 0, t = 0;
        for (const n of p.notes) {
          if (n.t === 'F') continue;
          const a = b2ms(n.b), b = b2ms(n.b + n.l);
          const sm = micTrace.filter(([ms]) => ms >= a && ms < b);
          if (!sm.length) continue;
          t += sm.length;
          h += sm.filter(([, m]) => m != null && Math.abs((((m - 60 - n.p) % 12) + 18) % 12 - 6) <= 1).length;
        }
        if (t) per.push({ txt: p.notes.map(n => n.s).join('').trim(), pct: Math.round(h / t * 100) });
        hitN += h; tot += t;
      }
      if (!tot) return;
      $('#ed-score').innerHTML = `<h2 class="sec">Prueba con micro: ${Math.round(hitN / tot * 100)} %</h2>` + per.map(x => `<div class="ed-sc"><span style="width:${x.pct}%"></span><b>${x.pct} %</b> ${esc(x.txt.slice(0, 60))}</div>`).join('');
    }

    // ---------------- paneles
    function info() {
      const S = [...sel];
      $('#ed-info').innerHTML = !S.length ? '<span class="muted small">Ninguna nota elegida</span>'
        : S.length === 1 ? (n => `<b>«${esc(n.s)}»</b> · ${noteName(n.p)} (${n.p}) · inicio ${n.b} (${fmt(b2ms(n.b))}) · dura ${n.l} tiempos (${Math.round(n.l * beatMs())} ms) · ${{ ':': 'normal', '*': 'dorada', F: 'libre', R: 'rap', G: 'rap dorada' }[n.t]}`)(S[0])
          : `<b>${S.length} notas</b> · de ${fmt(b2ms(Math.min(...S.map(n => n.b))))} a ${fmt(b2ms(Math.max(...S.map(n => n.b + n.l))))}`;
    }
    function phrasesPanel() {
      const ph = phrasesOf(T());
      $('#ed-phr').innerHTML = ph.map((p, i) => `<div class="ed-p" data-i="${i}"><span class="mono">${fmt(b2ms(p.start))}</span> ${esc(p.notes.map(n => n.s).join('').trim() || '—')}</div>`).join('');
    }
    $('#ed-phr').onclick = e => {
      const d = e.target.closest('[data-i]'); if (!d) return;
      const p = phrasesOf(T())[+d.dataset.i]; sel = new Set(p.notes);
      viewMs = b2ms(p.start) - 1500; audio.currentTime = Math.max(0, (b2ms(p.start) - 1000) / 1000); refresh();
    };
    function refresh() { $('#ed-gap').value = Math.round(gap); $('#ed-bpm').textContent = bpm; info(); phrasesPanel(); draw(); }
    // GAP
    const setGap = v => { push(); gap = Math.round(v); setHead('GAP', gap); refresh(); };
    view.querySelectorAll('[data-gap]').forEach(b => (b.onclick = () => setGap(gap + +b.dataset.gap)));
    $('#ed-gap').onchange = () => setGap(num($('#ed-gap').value));
    $('#ed-zoom').oninput = () => { const c = msOf(W / 2); pxPerMs = zoomFrom(+$('#ed-zoom').value); viewMs = c - W / 2 / pxPerMs; draw(); };
    $('#ed-play').onclick = toggle;
    $('#ed-rate').onchange = () => (audio.playbackRate = +$('#ed-rate').value);
    $('#ed-wv').onchange = draw;
    $('#ed-mic').onchange = () => { if (!$('#ed-mic').checked) { stopMic(); micTrace = []; draw(); } };
    if ($('#ed-track')) $('#ed-track').onchange = () => { ti = +$('#ed-track').value; sel.clear(); refresh(); };
    $('#ed-undo').onclick = undo; $('#ed-redo').onclick = redo;

    // ---------------- guardar y versiones
    async function save() {
      try {
        await api('/songs/' + encodeURIComponent(id) + '/chart', { method: 'PUT', json: { text: serialize(doc), note: 'editor' } });
        setDirty(false); toast('Guardado');
        // El tramo del Megamix depende de los tiempos: si no es manual, se vuelve a cortar
        if (data.megamix && data.megamix.origen !== 'manual') api('/songs/' + encodeURIComponent(id) + '/megamix', { method: 'POST', json: { mode: 'auto' } }).catch(() => {});
        loadVersions();
      } catch (e) { fail(e); }
    }
    $('#ed-save').onclick = save;
    async function loadVersions() {
      try {
        const l = await api('/songs/' + encodeURIComponent(id) + '/versions');
        $('#ed-ver').innerHTML = `<option value="">Versiones (${l.length})…</option>` + l.map(v => `<option value="${esc(v.name)}">${esc(v.name.replace(/T(\d\d)-(\d\d)-(\d\d).*/, ' $1:$2:$3').replace(/^(\d{4})-(\d\d)-(\d\d)/, '$3/$2/$1'))}</option>`).join('');
      } catch {}
    }
    $('#ed-ver').onchange = async () => {
      const n = $('#ed-ver').value; if (!n) return;
      try {
        const v = await api('/songs/' + encodeURIComponent(id) + '/versions/' + encodeURIComponent(n));
        push(); doc = parse(v.text); bpm = num(hv('BPM')); gap = num(hv('GAP')); midiStyle(); ti = 0; sel.clear(); range(); refresh();
        toast('Versión cargada: guarda para dejarla como actual');
      } catch (e) { fail(e); }
      $('#ed-ver').value = '';
    };
    loadVersions();
    if (doc.wasRelative) toast('La canción venía en formato relativo: se guardará en formato normal');

    let cleaned = false;
    function cleanup() {
      if (cleaned) return; cleaned = true;
      removeEventListener('keydown', onKey); removeEventListener('mousemove', onMove); removeEventListener('mouseup', onUp); removeEventListener('beforeunload', onLeave);
      ro.disconnect(); audio.pause(); audio.src = ''; stopMic(); if (mic) mic.st.getTracks().forEach(t => t.stop()); actx.close().catch(() => {});
    }
    // Al salir del editor (cambio de apartado) se para todo
    const mo = new MutationObserver(() => { if (!view.contains(cv)) { mo.disconnect(); cleanup(); } });
    mo.observe(view, { childList: true });
    viewMs = Math.max(-500, b2ms(T().notes[0] ? T().notes[0].b : 0) - 2000);
    resize(); refresh();
    return { isDirty: () => dirty };
  }

  window.GramolaEditor = { open, parse, serialize, phrasesOf };
})();
