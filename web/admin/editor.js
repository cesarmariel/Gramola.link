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
      const n = L.match(/^([:*FRG])\s*(-?\d+)\s+(\d+)\s+(-?\d+)(?:[ \t](.*))?$/);   // (también con tabulador antes de la sílaba)
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
  // Notas en orden, sin tiempos negativos, sin duraciones nulas y sin solaparse (lo que se arrastra, estira o cambia de
  // BPM puede dejar una nota encima de la siguiente; el .txt que se guarda siempre es válido)
  function sanear(t) {
    t.notes.sort((a, b) => a.b - b.b);
    for (let i = 0; i < t.notes.length; i++) {
      const n = t.notes[i], nx = t.notes[i + 1];
      n.b = Math.max(0, Math.round(n.b)); n.l = Math.max(1, Math.round(n.l));
      if (nx) { if (nx.b <= n.b) nx.b = n.b + 1; if (n.b + n.l > nx.b) n.l = Math.max(1, nx.b - n.b); }
    }
  }
  function serialize(doc) {
    const out = doc.head.map(([k, v]) => `#${k}:${v}`);
    const multi = doc.tracks.length > 1;
    for (const t of doc.tracks) {
      if (multi) out.push(t.name);
      sanear(t);
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
  async function open(view, id, api, toast, opts = {}) {
    const fail = e => toast(e.message || String(e), true);
    const data = await api('/songs/' + encodeURIComponent(id) + '/chart');
    if (opts.vivo && !opts.vivo()) return null;   // mientras cargaba se cambió de apartado: no se pinta nada
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

    let modo = (() => { try { return localStorage.getItem('ed-modo') || 'sencillo'; } catch { return 'sencillo'; } })();
    let cur = 0, finFrase = null;   // modo sencillo: frase elegida y fin de la escucha de la frase
    view.innerHTML = `<div class="ed ${modo}">
      <div class="ed-top">
        <button class="btn ghost sm" data-go="${data.draft ? 'creacion' : 'canciones/' + esc(encodeURIComponent(id))}">← ${data.draft ? 'Creación' : 'Ficha'}</button>
        <div class="ed-title"><b>${esc(hv('TITLE') || id)}</b> <span>${esc(hv('ARTIST') || '')}</span></div>
        <span class="ed-dirty" id="ed-dirty" hidden>sin guardar</span>
        ${data.draft ? '<span class="badge warn" id="ed-draft">sin publicar · no sale en la tele</span>' : ''}
        <span class="grow"></span>
        <button class="btn sm" id="ed-modo">${modo === 'sencillo' ? 'Modo avanzado' : 'Modo sencillo'}</button>
        <select class="inp sm" id="ed-ver" title="Versiones guardadas"><option value="">Versiones…</option></select>
        <button class="btn sm" id="ed-undo" title="⌘Z">Deshacer</button><button class="btn sm" id="ed-redo" title="⇧⌘Z">Rehacer</button>
        <button class="btn ${data.draft ? '' : 'red'}" id="ed-save">Guardar (⌘S)</button>
        ${data.draft ? '<button class="btn sm" id="ed-reenc" title="Rehacer las notas desde el audio y la letra (lo actual queda en Versiones)">Volver a encajar</button><button class="btn red" id="ed-pub" title="Guarda los cambios y la pone en la tele (en Novedades)">Publicar</button>' : ''}
      </div>
      <div class="ed-bar">
        <button class="btn dark" id="ed-play" title="Espacio">▶</button>
        <span class="mono ed-time" id="ed-time">0:00.00</span>
        <select class="inp sm" id="ed-rate" title="Velocidad"><option value="1">1×</option><option value="0.75">0,75×</option><option value="0.5">0,5×</option></select>
        <label class="ed-ck"><input type="checkbox" id="ed-guide"> Tono guía</label>
        <label class="ed-ck"><input type="checkbox" id="ed-loop"> Repetir frase</label>
        <label class="ed-ck adv"><input type="checkbox" id="ed-mic"> Probar con micro</label>
        <button class="btn sm dark adv" id="ed-juego" title="La canción tal como está ahora, en la app de la tele">▶ Ver en el juego</button>
        <span class="ed-sep adv"></span><span class="adv-g">
        <span class="small muted">GAP</span><button class="btn sm ghost" data-gap="-50">−50</button><button class="btn sm ghost" data-gap="-10">−10</button>
        <input class="inp sm mono" id="ed-gap" size="7"><button class="btn sm ghost" data-gap="10">+10</button><button class="btn sm ghost" data-gap="50">+50</button>
        <span class="small muted">BPM <b class="mono" id="ed-bpm"></b></span>
        <select class="inp sm" id="ed-tools" title="Herramientas de tiempos"><option value="">Tiempos…</option><option value="shift">Desplazar desde el cursor…</option><option value="stretch">Estirar o encoger la selección…</option><option value="bpm">Cambiar el BPM (sin mover nada)…</option></select>
        </span>${doc.tracks.length > 1 ? `<select class="inp sm" id="ed-track">${doc.tracks.map((t, i) => `<option value="${i}">Voz ${i + 1}</option>`).join('')}</select>` : ''}
        <span class="grow"></span>
        <span class="adv-g"><span class="small muted">Zoom</span><input type="range" id="ed-zoom" min="0" max="100" value="45"></span>
        <label class="ed-ck"><input type="checkbox" id="ed-wv" ${data.vocals ? 'checked' : 'disabled'}> Voz sola</label>
      </div>
      <div class="ed-main">
        <div class="ed-sl smp" id="ed-sl"></div>
        <div class="ed-right">
          <div class="ed-sh smp" id="ed-sh"></div>
          <canvas id="ed-mini" class="ed-mini adv" height="34"></canvas>
          <div class="ed-wrap" id="ed-wrap"><canvas id="ed-cv"></canvas><div class="ed-hb" id="ed-hb" hidden></div></div>
          <div class="ed-sb smp" id="ed-sb"></div>
        </div>
      </div>
      <div class="ed-under">
        <div class="ed-kara" id="ed-kara"></div>
        <div class="ed-info" id="ed-info"></div>
      </div>
      <div class="ed-low adv">
        <div><h2 class="sec" style="margin-top:6px">Frases</h2><div class="ed-phr" id="ed-phr"></div></div>
        <div><h2 class="sec" style="margin-top:6px">Atajos</h2><div class="ed-help">
          <b>Clic</b> elegir · <b>⇧ clic</b> añadir · <b>arrastrar fondo</b> elegir varias · <b>arrastrar nota</b> mover (tiempo y tono) · <b>bordes</b> alargar o acortar ·
          <b>doble clic</b> en nota: cambiar sílaba; en el fondo: nota nueva · <b>← →</b> mover 1 tiempo (⇧ 10) · <b>↑ ↓</b> tono (⇧ octava) · <b>⌥ ← →</b> acortar / alargar ·
          <b>S</b> partir · <b>M</b> unir con la siguiente · <b>B</b> corte de frase antes de la nota · <b>G</b> dorada · <b>F</b> libre · <b>R</b> rap · <b>N</b> normal ·
          <b>Supr</b> borrar · <b>⌘A</b> todas · <b>Espacio</b> reproducir · <b>Inicio</b> al principio · arrastrar las <span style="color:${RED}">líneas rojas</span> mueve los cortes de frase · <b>arrastrar sobre la onda</b> marcar un trozo sin cantar ·
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
    // (si el editor ya se ha cerrado cuando acaba la descarga, no se dibuja nada)
    const vivo = () => view.contains(cv);
    peaksOf(data.audio).then(r => { if (!vivo()) return; peaks = r.p; durMs = r.dur; draw(); }).catch(() => {});
    if (data.vocals) peaksOf(data.vocals).then(r => { if (!vivo()) return; vpeaks = r.p; draw(); }).catch(() => {});
    if (data.pitch) fetch(data.pitch).then(r => r.json()).then(j => { if (!vivo()) return; pitchCurve = j; draw(); }).catch(() => {});
    audio.addEventListener('loadedmetadata', () => { if (!vivo()) return; if (!durMs) durMs = audio.duration * 1000; draw(); });

    // ---------------- vista
    let pxPerMs = 0.12, viewMs = 0, H = 520, W = 1000;
    let sel = new Set(), hist = [], fut = [], dirty = false, drag = null, hover = null;
    let hueco = null, marcando = false;   // trozo sin cantar marcado {a, b} en ms, y si el próximo arrastre lo marca
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
    function restore(s) {
      const o = JSON.parse(s); doc.tracks = o.tracks; doc.head = o.head; gap = num(hv('GAP'));
      bpm = num(hv('BPM')) || bpm;                         // (deshacer un cambio de BPM también devuelve la rejilla)
      ti = Math.min(ti, doc.tracks.length - 1); if ($('#ed-track')) $('#ed-track').value = String(ti);
      sel.clear(); range(); refresh();
    }
    function undo() { if (!hist.length) return; fut.push(snap()); restore(hist.pop()); setDirty(true); }
    function redo() { if (!fut.length) return; hist.push(snap()); restore(fut.pop()); setDirty(true); }
    function setDirty(v) { dirty = v; $('#ed-dirty').hidden = !v; }
    const onLeave = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', onLeave);

    // ---------------- dibujo
    let raf = 0;
    function draw() { if (!raf) raf = requestAnimationFrame(paint); }
    const sencillo = () => modo === 'sencillo';
    const frases = () => phrasesOf(T());
    function encuadre() {
      // Modo sencillo: la frase elegida ocupa el lienzo (tiempo y tonos de sus notas)
      const ph = frases(); if (!ph.length) return;
      cur = clamp(cur, 0, ph.length - 1);
      const p = ph[cur], a = b2ms(p.start) - 700;
      let b = b2ms(p.end) + 700;
      if (marcando || hueco) { const nx = ph[cur + 1]; b = Math.max(b, Math.min(nx ? b2ms(nx.start) + 1500 : durMs || b, b2ms(p.end) + 30000)); if (hueco) b = Math.max(b, hueco.b + 700); }
      pxPerMs = W / Math.max(1000, b - a); viewMs = a;
      const ps = p.notes.map(n => n.p);
      pMin = Math.min(...ps) - 2; pMax = Math.max(...ps) + 2;
      if (pMax - pMin < 9) { const c = (pMin + pMax) / 2; pMin = Math.floor(c - 4.5); pMax = Math.ceil(c + 4.5); }
    }
    function paint() {
      raf = 0;
      const now = audio.currentTime * 1000;
      if (sencillo()) encuadre();
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
      // trozo sin cantar (marcándolo o ya marcado)
      const hz = drag && drag.kind === 'hueco' ? { a: msOf(Math.min(drag.x0, drag.x1)), b: msOf(Math.max(drag.x0, drag.x1)) } : hueco;
      if (hz) {
        const x0 = xOf(hz.a), x1 = xOf(hz.b);
        cx.save(); cx.beginPath(); cx.rect(x0, RULER, x1 - x0, H - RULER); cx.clip();
        cx.fillStyle = 'rgba(32,30,29,.07)'; cx.fillRect(x0, RULER, x1 - x0, H - RULER);
        cx.strokeStyle = 'rgba(32,30,29,.18)'; cx.lineWidth = 1;
        for (let x = x0 - H; x < x1; x += 12) { cx.beginPath(); cx.moveTo(x, H); cx.lineTo(x + H, 0); cx.stroke(); }
        cx.restore();
        cx.fillStyle = INK; cx.fillRect(x0, RULER, 2, H - RULER); cx.fillRect(x1 - 2, RULER, 2, H - RULER);
        cx.font = '800 12px Archivo, sans-serif'; cx.fillText('SIN CANTAR', x0 + 6, RULER + 16);
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
      if (sencillo()) {
        const s = n.s.trim() || '·';
        cx.font = '800 15px Archivo, sans-serif';
        const tw = cx.measureText(s).width;
        if (tw + 8 < w && h >= 18) { cx.fillStyle = n.t === '*' || n.t === 'G' ? INK : '#fff'; cx.fillText(s, x + 4, y + h / 2 + 5); }
        else { cx.fillStyle = INK; cx.fillText(s, x + 2, y + h + 16); }
        // asas para alargar o acortar (bordes)
        if (on) { cx.fillStyle = '#fff'; cx.fillRect(x + 1, y + h / 2 - 7, 3, 14); cx.fillRect(x + w - 4, y + h / 2 - 7, 3, 14); }
        return;
      }
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
        if (bi != null) { const wasDirty = dirty, fut0 = fut.slice(); push(); drag = { kind: 'break', i: bi, b0: T().breaks[bi], wasDirty, fut0 }; return; }
        seek(msOf(x)); return;
      }
      if (y > H - WAVE || marcando) { drag = { kind: 'hueco', x0: x, x1: x, onda: y > H - WAVE }; return; }
      const bi = hitBreak(x, RULER);
      const h = hit(x, y);
      if (!h && bi != null && Math.abs(xOf(b2ms(T().breaks[bi])) - x) < 4) { const wasDirty = dirty, fut0 = fut.slice(); push(); drag = { kind: 'break', i: bi, b0: T().breaks[bi], wasDirty, fut0 }; return; }
      if (h) {
        if (e.shiftKey) { sel.has(h.n) ? sel.delete(h.n) : sel.add(h.n); draw(); info(); return; }
        if (!sel.has(h.n)) { sel = new Set([h.n]); }
        const wasDirty = dirty, fut0 = fut.slice();   // (un clic sin arrastrar no cuenta como cambio ni borra «rehacer»)
        push();
        drag = { wasDirty, fut0, kind: h.edge ? 'resize-' + h.edge : 'move', x0: x, y0: y, orig: [...sel].map(n => ({ n, b: n.b, l: n.l, p: n.p })), moved: false };
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
        cv.style.cursor = marcando && y > RULER ? 'col-resize' : (y < RULER + 14 && hitBreak(x, y) != null) ? 'ew-resize' : h ? (h.edge ? 'ew-resize' : 'grab') : y > H - WAVE ? 'col-resize' : y < RULER ? 'pointer' : 'crosshair';
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
      } else if (drag.kind === 'hueco') {
        drag.x1 = x;
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
      if (drag.kind === 'hueco') {
        const d = drag; drag = null;
        if (Math.abs(d.x1 - d.x0) < 5) { if (d.onda && !marcando) seek(msOf(d.x0)); return draw(); }
        hueco = { a: Math.max(0, msOf(Math.min(d.x0, d.x1))), b: msOf(Math.max(d.x0, d.x1)) }; marcando = false;
        return barraHueco();
      }
      if ((drag.kind === 'move' || drag.kind.startsWith('resize')) && !drag.moved) { hist.pop(); setDirty(drag.wasDirty); fut = drag.fut0; }
      if (drag.kind === 'break' && T().breaks[drag.i] === drag.b0) { hist.pop(); setDirty(drag.wasDirty); fut = drag.fut0; }
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
      if (sencillo()) return;
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
      const done = ok => { if (!inp.isConnected) return; inp.onblur = null; if (ok && inp.value !== n.s) { push(); n.s = inp.value; } inp.remove(); refresh(); };   // (Escape no aplica el texto por el blur)
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
      if (k === 'Escape') { if (hueco || marcando) { hueco = null; marcando = false; barraHueco(); } sel.clear(); return refresh(); }
      if (!S.length && sencillo() && (k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); return irFrase(cur + (k === 'ArrowLeft' ? -1 : 1)); }
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
        if (!sencillo() && now > msOf(W * 0.85)) viewMs = now - W / pxPerMs * 0.15;
        const n = curNote(now); if (n !== lastGuide) { guide(n); lastGuide = n; }
        if (loopPh && ms2b(now) > loopPh.end + 4) { audio.currentTime = Math.max(0, b2ms(loopPh.start) / 1000 - 1); micTrace = []; }
        if (finFrase != null && now > finFrase.fin) {
          if ($('#ed-loop').checked) audio.currentTime = finFrase.ini / 1000; else { audio.pause(); finFrase = null; }
        }
        // Modo sencillo reproduciendo la canción: la frase que suena pasa a ser la elegida
        if (sencillo() && finFrase == null) {
          const b = ms2b(now), ph = frases(), k = ph.findIndex(p => b < p.end + 2);
          if (k >= 0 && k !== cur && b >= ph[k].start - 8) { cur = k; panelSencillo(); }
        }
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
    function refresh() { doc.tracks.forEach(sanear); $('#ed-gap').value = Math.round(gap); $('#ed-bpm').textContent = bpm; info(); phrasesPanel(); if (sencillo()) panelSencillo(); draw(); }

    // ---------------- modo sencillo: frases a la izquierda, la frase grande con sus palabras y botones
    const esOro = n => n.t === '*' || n.t === 'G';
    function palabrasDe(p) {
      const out = [];
      for (const n of p.notes) {
        if (!out.length || /^\s/.test(n.s)) out.push({ txt: '', notas: [] });
        const w = out[out.length - 1]; w.notas.push(n); w.txt += n.s.replace(/~/g, '');
      }
      return out.map(w => ({ ...w, txt: w.txt.trim() || '…', oro: w.notas.every(esOro) }));
    }
    function panelSencillo() {
      const ph = frases(); if (!ph.length) return;
      cur = clamp(cur, 0, ph.length - 1);
      const p = ph[cur];
      $('#ed-sl').innerHTML = ph.map((q, i) => `<div class="ed-sp ${i === cur ? 'on' : ''}" data-f="${i}"><span class="mono">${fmt(b2ms(q.start)).replace(/\.\d+$/, '')}</span>${esc(q.notes.map(n => n.s).join('').replace(/~/g, '').trim() || '—')}${q.notes.some(esOro) ? ' <span class="ed-star">★</span>' : ''}</div>`).join('');
      const on = $('#ed-sl .on'); if (on && !panelSencillo.noScroll) on.scrollIntoView({ block: 'nearest' });
      $('#ed-sh').innerHTML = `<div class="row"><span class="kicker">Frase ${cur + 1} de ${ph.length}</span><span class="small muted mono">${fmt(b2ms(p.start))} – ${fmt(b2ms(p.end))}</span><span class="grow"></span>
          <button class="btn sm" data-s="prev">◀ Anterior</button><button class="btn sm dark" data-s="play">▶ Escuchar la frase</button><button class="btn sm" data-s="next">Siguiente ▶</button></div>
        <div class="ed-words">${palabrasDe(p).map((w, i) => `<button class="ed-w ${w.oro ? 'oro' : ''} ${w.notas.every(n => sel.has(n)) ? 'sel' : ''}" data-w="${i}" title="Elegir la palabra">${esc(w.txt)}</button>`).join('')}</div>
        <div class="row small"><span class="muted">Toda la frase:</span><button class="btn sm" data-s="antes">⟵ Antes</button><button class="btn sm" data-s="despues">Después ⟶</button>
          <button class="btn sm" data-s="corta">Más corta</button><button class="btn sm" data-s="larga">Más larga</button><button class="btn sm dark" data-s="juego">▶ Ver en el juego desde aquí</button>
          <span class="grow"></span>${cur < ph.length - 1 ? '<button class="btn sm" data-s="unir" title="Junta esta frase y la siguiente en una sola">Unir con la siguiente</button>' : ''}
          <button class="btn sm ${marcando ? 'red' : ''}" data-s="hueco" title="Marca un trozo de la canción donde no se canta (un solo, una parte instrumental) y aparta de ahí las sílabas">${marcando ? 'Arrastra sobre el trozo… (Esc cancela)' : '⌇ Marcar trozo sin cantar'}</button></div>`;
      const sp = ubicar([...sel]);
      const S = [...sel].sort((a, b) => a.b - b.b);
      $('#ed-sb').innerHTML = S.length
        ? `<div class="row"><b>«${esc(S.map(n => n.s).join('').replace(/~/g, '').trim())}»</b><span class="small muted">${S.length === 1 ? noteName(S[0].p) + ' · ' + Math.round(S[0].l * beatMs()) + ' ms' : S.length + ' sílabas'}</span><span class="grow"></span>
            <button class="btn sm" data-n="acortar">Acortar</button><button class="btn sm" data-n="alargar">Alargar</button>
            <button class="btn sm" data-n="bajar">Bajar tono</button><button class="btn sm" data-n="subir">Subir tono</button>
            <button class="btn sm" data-n="antes">⟵</button><button class="btn sm" data-n="despues">⟶</button>
            <button class="btn sm ${S.every(esOro) ? 'red' : ''}" data-n="oro">★ Dorada${S.every(esOro) ? ' (quitar)' : ''}</button></div>
          ${sp ? `<div class="row" style="margin-top:6px"><span class="small muted">Frase:</span>
            ${sp.ini && sp.k > 0 ? '<button class="btn sm" data-n="aAnt" title="Estas palabras pasan al final de la frase anterior">⤒ Pasar a la frase anterior</button>' : ''}
            ${!(sp.ini && sp.fin) ? '<button class="btn sm" data-n="separar" title="Estas palabras pasan a ser una frase aparte">✂ Separar en otra frase</button>' : ''}
            ${sp.fin && sp.k < frases().length - 1 ? '<button class="btn sm" data-n="aSig" title="Estas palabras pasan al principio de la frase siguiente">⤓ Pasar a la frase siguiente</button>' : ''}</div>` : ''}`
        : '<p class="small muted" style="margin:0">Haz clic en una sílaba (o en una palabra de arriba) para retocarla: alargar, acortar, tono o dorada. También puedes arrastrar sus bordes con el ratón.</p>';
    }
    function irFrase(i, escuchar) {
      const ph = frases(); if (!ph.length) return;
      cur = clamp(i, 0, ph.length - 1); sel.clear(); finFrase = null;
      audio.pause(); audio.currentTime = Math.max(0, (b2ms(ph[cur].start) - 600) / 1000);
      refresh(); if (escuchar) escucharFrase();
    }
    async function escucharFrase() {
      const p = frases()[cur]; if (!p) return;
      await actx.resume();
      const ini = Math.max(0, b2ms(p.start) - 600);
      finFrase = { ini, fin: b2ms(p.end) + 500 };
      audio.currentTime = ini / 1000; audio.playbackRate = +$('#ed-rate').value;
      await audio.play(); $('#ed-play').textContent = '❚❚'; draw();
    }
    const paso = () => Math.max(1, Math.round(50 / beatMs()));   // ~50 ms
    function cambiar(fn) { push(); fn(); T().notes.sort((a, b) => a.b - b.b); refresh(); }
    // ---- cortes de frase: un corte separa ns[i-1] de ns[i] si cae en (ns[i-1].b, ns[i].b]
    const notasOrden = () => T().notes.slice().sort((a, b) => a.b - b.b);
    function quitaCortes(ns, i) {
      if (i <= 0 || i >= ns.length) return;
      const lo = ns[i - 1].b, hi = ns[i].b;
      T().breaks = T().breaks.filter(b => { const fuera = !(b > lo && b <= hi); if (!fuera && T().br2) delete T().br2[b]; return fuera; });
    }
    function ponCorte(ns, i) {
      if (i <= 0 || i >= ns.length) return;
      const pv = ns[i - 1], nx = ns[i];
      if (T().breaks.some(b => b > pv.b && b <= nx.b)) return;
      T().breaks.push(clamp(pv.b + pv.l, pv.b + 1, nx.b)); T().breaks.sort((a, b) => a - b);
    }
    // Dónde está la selección dentro de su frase (null si no es un trozo seguido de una sola frase)
    function ubicar(S) {
      if (!S.length) return null;
      S = S.slice().sort((a, b) => a.b - b.b);
      const ph = frases(), k = ph.findIndex(p => p.notes.includes(S[0]));
      if (k < 0) return null;
      const ns = ph[k].notes, i = ns.indexOf(S[0]);
      if (!S.every((n, j) => ns[i + j] === n)) return null;
      return { k, ini: i === 0, fin: i + S.length === ns.length };
    }
    // ---- trozo sin cantar: las sílabas que caen dentro se apartan a un lado u otro y queda un corte de frase
    function barraHueco() {
      const hb = $('#ed-hb');
      if (!hueco) { hb.hidden = true; if (sencillo()) panelSencillo(); return draw(); }
      const A = Math.round(ms2b(hueco.a)), B = Math.max(A + 1, Math.round(ms2b(hueco.b))), dentro = T().notes.filter(n => n.b < B && n.b + n.l > A).length;
      hb.innerHTML = `<b>Trozo sin cantar</b> <span class="mono">${fmt(hueco.a)} – ${fmt(hueco.b)}</span> <span class="muted">(${((hueco.b - hueco.a) / 1000).toFixed(1).replace('.', ',')} s · ${dentro ? dentro + (dentro === 1 ? ' sílaba dentro' : ' sílabas dentro') : 'no hay nada cantado'})</span>
        <button class="btn sm" data-h="oir">▶ Escuchar</button><button class="btn sm red" data-h="ok" ${dentro ? '' : 'disabled'}>Dejar sin cantar</button><button class="btn sm ghost" data-h="no">Cancelar</button>`;
      hb.hidden = false;
      if (sencillo()) panelSencillo();
      draw();
    }
    $('#ed-hb').onclick = async e => {
      const b = e.target.closest('[data-h]'); if (!b || !hueco) return;
      if (b.dataset.h === 'no') { hueco = null; return barraHueco(); }
      if (b.dataset.h === 'oir') {
        await actx.resume(); finFrase = { ini: Math.max(0, hueco.a - 1500), fin: hueco.b + 1500 };
        audio.currentTime = finFrase.ini / 1000; audio.playbackRate = +$('#ed-rate').value; await audio.play(); $('#ed-play').textContent = '❚❚'; return draw();
      }
      const n = dejarSinCantar(hueco.a, hueco.b);
      hueco = null; barraHueco();
      toast(n ? `Hecho: ${n} ${n === 1 ? 'sílaba apartada' : 'sílabas apartadas'} del trozo sin cantar` : 'En ese trozo no se cantaba nada');
    };
    function dejarSinCantar(aMs, bMs) {
      const A = Math.round(ms2b(aMs)), B = Math.max(A + 1, Math.round(ms2b(bMs))), mid = (A + B) / 2;
      const toca = n => n.b < B && n.b + n.l > A;
      const ph = frases();
      if (!ph.some(p => p.notes.some(toca))) return 0;
      push();
      const izq = [], der = [];
      for (const p of ph) {
        const t = p.notes.filter(toca); if (!t.length) continue;
        const antes = p.start < A, despues = p.end > B;
        for (const n of t) {
          // la frase manda si solo asoma por un lado; si cruza el trozo entero (o cae dentro), decide el centro de la sílaba
          const lado = antes && !despues ? 'i' : despues && !antes ? 'd' : (n.b + n.l / 2 < mid ? 'i' : 'd');
          (lado === 'i' ? izq : der).push(n);
        }
      }
      const ns = notasOrden(), fuera = ns.filter(n => !izq.includes(n) && !der.includes(n));
      const encaja = (grupo, s0, e0, s1, e1) => {   // lleva [s0, e0] a [s1, e1] proporcionalmente
        const k = e0 > s0 ? (e1 - s1) / (e0 - s0) : 1;
        for (const n of grupo) { const ni = Math.round(s1 + (n.b - s0) * k), nf = Math.round(s1 + (n.b + n.l - s0) * k); n.b = ni; n.l = Math.max(1, nf - ni); }
      };
      if (izq.length) {
        izq.sort((a, b) => a.b - b.b);
        const s0 = izq[0].b, e0 = Math.max(...izq.map(n => n.b + n.l));
        const tope = Math.max(-1e9, ...fuera.filter(n => n.b < s0).map(n => n.b + n.l));
        const s1 = s0 < A ? s0 : Math.max(tope, A - (e0 - s0), A - izq.length * 2);
        encaja(izq, s0, e0, Math.min(s1, A - izq.length), A);
      }
      if (der.length) {
        der.sort((a, b) => a.b - b.b);
        const s0 = der[0].b, e0 = Math.max(...der.map(n => n.b + n.l));
        const sigue = Math.min(1e9, ...fuera.filter(n => n.b >= B).map(n => n.b));
        const e1 = e0 > B ? e0 : Math.min(sigue, B + (e0 - s0));
        encaja(der, s0, e0, B, Math.max(e1, B + der.length));
      }
      // un único corte de frase entre lo de antes y lo de después del trozo
      T().notes.sort((a, b) => a.b - b.b);
      const ns2 = notasOrden(), j = ns2.findIndex(n => n.b >= B);
      if (j > 0) { quitaCortes(ns2, j); ponCorte(ns2, j); }
      range();
      const k = frases().findIndex(p => p.notes.includes(ns2[j])); if (sencillo() && j > 0 && k > 0) cur = k - 1;
      refresh();
      return izq.length + der.length;
    }
    $('#ed-sl').onclick = e => { const d = e.target.closest('[data-f]'); if (d) { panelSencillo.noScroll = true; irFrase(+d.dataset.f); panelSencillo.noScroll = false; } };
    $('#ed-sh').onclick = e => {
      const w = e.target.closest('[data-w]');
      if (w) { const pw = palabrasDe(frases()[cur])[+w.dataset.w]; sel = new Set(pw.notas); return refresh(); }
      const b = e.target.closest('[data-s]'); if (!b) return;
      const a = b.dataset.s, p = frases()[cur];
      if (a === 'prev' || a === 'next') return irFrase(cur + (a === 'prev' ? -1 : 1));
      if (a === 'play') return audio.paused ? escucharFrase() : (audio.pause(), (finFrase = null));
      if (a === 'juego') return verEnJuego(b2ms(p.start));
      if (a === 'hueco') { marcando = !marcando; hueco = null; barraHueco(); return refresh(); }
      if (a === 'unir') return cambiar(() => { const ns = notasOrden(), i = ns.indexOf(p.notes[p.notes.length - 1]); quitaCortes(ns, i + 1); });
      const d = paso();
      if (a === 'antes' || a === 'despues') return cambiar(() => { const s = a === 'antes' ? -d : d; for (const n of p.notes) n.b += s; T().breaks = T().breaks.map(x => (x > p.start - 1 && x <= p.end + 1 ? x + s : x)); });
      if (a === 'corta' || a === 'larga') return cambiar(() => {
        const k = a === 'larga' ? 1.05 : 0.95, a0 = p.start;
        for (const n of p.notes) { const e2 = n.b + n.l; n.b = a0 + Math.round((n.b - a0) * k); n.l = Math.max(1, Math.round(a0 + (e2 - a0) * k) - n.b); }
      });
    };
    $('#ed-sb').onclick = e => {
      const b = e.target.closest('[data-n]'); if (!b) return;
      const S = [...sel].sort((a, b2) => a.b - b2.b), d = paso(), a = b.dataset.n;
      const sig = n => T().notes.filter(x => x !== n && x.b >= n.b && !sel.has(x)).sort((x, y) => x.b - y.b)[0];
      if (a === 'separar' || a === 'aAnt' || a === 'aSig') {
        const sp = ubicar(S); if (!sp) return;
        cambiar(() => {
          const ns = notasOrden(), i0 = ns.indexOf(S[0]), i1 = ns.indexOf(S[S.length - 1]) + 1;   // i1: primera nota tras la selección
          if (a === 'separar') { ponCorte(ns, i0); ponCorte(ns, i1); }
          if (a === 'aAnt') { quitaCortes(ns, i0); ponCorte(ns, i1); }
          if (a === 'aSig') { quitaCortes(ns, i1); ponCorte(ns, i0); }
        });
        const k = frases().findIndex(p => p.notes.includes(S[0])); if (k >= 0) { cur = k; refresh(); }
        return;
      }
      cambiar(() => {
        for (const n of S) {
          if (a === 'alargar') { const nx = sig(n); n.l = nx ? Math.max(n.l, Math.min(n.l + d, nx.b - n.b)) : n.l + d; }
          if (a === 'acortar') n.l = Math.max(1, n.l - d);
          if (a === 'subir') n.p += 1;
          if (a === 'bajar') n.p -= 1;
          if (a === 'antes') n.b -= d;
          if (a === 'despues') n.b += d;
        }
        if (a === 'oro') { const todas = S.every(esOro); for (const n of S) n.t = todas ? (n.t === 'G' ? 'R' : ':') : (n.t === 'R' ? 'G' : '*'); }
      });
    };
    $('#ed-modo').onclick = () => {
      modo = sencillo() ? 'avanzado' : 'sencillo';
      try { localStorage.setItem('ed-modo', modo); } catch {}
      view.querySelector('.ed').classList.toggle('sencillo', sencillo()); view.querySelector('.ed').classList.toggle('avanzado', !sencillo());
      $('#ed-modo').textContent = sencillo() ? 'Modo avanzado' : 'Modo sencillo';
      if (!sencillo()) { range(); pxPerMs = zoomFrom(+$('#ed-zoom').value); viewMs = Math.max(-500, b2ms(frases()[cur] ? frases()[cur].start : 0) - 1500); }
      sel.clear(); resize(); refresh();
    };
    // GAP
    const setGap = v => { push(); gap = Math.round(v); setHead('GAP', gap); refresh(); };
    view.querySelectorAll('[data-gap]').forEach(b => (b.onclick = () => setGap(gap + +b.dataset.gap)));
    $('#ed-gap').onchange = () => { const v = parseFloat(String($('#ed-gap').value).replace(',', '.')); if (!Number.isFinite(v)) return refresh(); setGap(v); };   // (texto que no es un número: se deja como estaba)
    $('#ed-zoom').oninput = () => { const c = msOf(W / 2); pxPerMs = zoomFrom(+$('#ed-zoom').value); viewMs = c - W / 2 / pxPerMs; draw(); };
    $('#ed-play').onclick = toggle;
    $('#ed-rate').onchange = () => (audio.playbackRate = +$('#ed-rate').value);
    $('#ed-wv').onchange = draw;
    $('#ed-mic').onchange = () => { if (!$('#ed-mic').checked) { stopMic(); micTrace = []; draw(); } };
    if ($('#ed-track')) $('#ed-track').onchange = () => { ti = +$('#ed-track').value; sel.clear(); refresh(); };
    $('#ed-undo').onclick = undo; $('#ed-redo').onclick = redo;

    // ---------------- guardar y versiones
    let saving = false;
    async function save() {   // devuelve true si se ha guardado (Publicar y Volver a encajar no siguen si falla)
      if (saving) return false;
      saving = true;
      try {
        await api('/songs/' + encodeURIComponent(id) + '/chart', { method: 'PUT', json: { text: serialize(doc), note: 'editor' } });
        setDirty(false); toast('Guardado');
        // El tramo del Megamix depende de los tiempos: si no es manual, se vuelve a cortar
        if (data.megamix && data.megamix.origen !== 'manual') api('/songs/' + encodeURIComponent(id) + '/megamix', { method: 'POST', json: { mode: 'auto' } }).catch(() => {});
        loadVersions();
        return true;
      } catch (e) { fail(e); return false; } finally { saving = false; }
    }
    $('#ed-save').onclick = save;
    if ($('#ed-reenc')) $('#ed-reenc').onclick = async () => {
      if (!confirm('¿Volver a encajar la letra? Se rehacen las notas desde el audio y la letra (unos 5 minutos). Lo actual queda en Versiones.')) return;
      try { if (dirty && !(await save())) return; const j = await api('/songs/' + encodeURIComponent(id) + '/reencajar', { method: 'POST', json: {} }); setDirty(false); location.hash = 'preparando/' + j.id; } catch (e) { fail(e); }
    };
    if ($('#ed-pub')) $('#ed-pub').onclick = async () => {
      if (!confirm('¿Publicarla? Saldrá en la tele, en Novedades.')) return;
      try {
        if (dirty && !(await save())) return;
        const nid = await window.GramolaAdmin.publicar(id);
        if (!nid) return;
        data.draft = false; $('#ed-pub').remove(); $('#ed-draft').remove(); $('#ed-save').classList.add('red');
        toast('Publicada: ya sale en la tele, en Novedades');
        if (nid !== id) location.hash = 'editor/' + encodeURIComponent(nid);   // sustituyó a la anterior: ahora vive en su carpeta
      } catch (e) { fail(e); }
    };
    // «2026-11-02T12-09-50-262Z-antes-de-reencajar.txt» → «02/11/2026 12:09:50 · antes de reencajar»
    function etiquetaVersion(n) {
      const m = n.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d)-(\d\d)-(\d\d)[^-]*-?\d*Z?-?(.*)\.txt$/);
      if (!m) return n;
      const extra = { ultrasinger: 'UltraSinger', 'antes-de-reencajar': 'antes de volver a encajar' }[m[7]] || m[7].replace(/-/g, ' ');
      return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}${extra ? ' · ' + extra : ''}`;
    }
    async function loadVersions() {
      try {
        const l = await api('/songs/' + encodeURIComponent(id) + '/versions');
        $('#ed-ver').innerHTML = `<option value="">Versiones (${l.length})…</option>` + l.map(v => `<option value="${esc(v.name)}">${esc(etiquetaVersion(v.name))}</option>`).join('');
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

    // ---------------- herramientas de tiempos
    function pedir(titulo, texto, valor) {
      return new Promise(res => {
        const o = document.createElement('div'); o.className = 'ed-dlg';
        o.innerHTML = `<div><h3>${esc(titulo)}</h3><p class="small muted">${texto}</p><input class="inp" value="${esc(valor)}"><div class="row" style="margin-top:12px"><button class="btn red" data-ok>Aplicar</button><button class="btn ghost" data-no>Cancelar</button></div></div>`;
        document.body.appendChild(o);
        const i = o.querySelector('input'); i.focus(); i.select();
        const fin = v => { o.remove(); res(v); };
        o.querySelector('[data-ok]').onclick = () => fin(i.value); o.querySelector('[data-no]').onclick = () => fin(null);
        i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') fin(i.value); if (e.key === 'Escape') fin(null); };
      });
    }
    $('#ed-tools').onchange = async () => {
      const v = $('#ed-tools').value; $('#ed-tools').value = '';
      if (v === 'shift') {
        const desde = Math.round(ms2b(audio.currentTime * 1000));
        const r = await pedir('Desplazar desde el cursor', `Mueve todas las notas y cortes desde ${fmt(audio.currentTime * 1000)} hasta el final. En milisegundos: positivo = más tarde, negativo = antes.`, '250');
        const ms = num(r); if (r == null || !ms) return;
        const d = Math.round(ms / beatMs());
        if (!d) return toast(`Menos de un tiempo (${Math.round(beatMs())} ms): no se mueve nada`, true);
        push(); for (const n of T().notes) if (n.b >= desde) n.b += d;
        T().breaks = T().breaks.map(b => (b >= desde ? b + d : b)); refresh();
        toast(`Movido ${ms > 0 ? '+' : ''}${Math.round(ms)} ms desde ${fmt(audio.currentTime * 1000)}`);
      } else if (v === 'stretch') {
        const S = [...sel].sort((a, b) => a.b - b.b);
        if (S.length < 2) return toast('Elige antes varias notas (arrastrando el fondo o una frase en la lista)', true);
        const r = await pedir('Estirar o encoger la selección', 'Porcentaje, desde la primera nota elegida: 105 = un 5 % más larga (si se va quedando atrás), 95 = un 5 % más corta.', '100');
        const k = num(r) / 100; if (r == null || !(k > 0.3 && k < 3) || k === 1) return;
        const a0 = S[0].b, fin0 = Math.max(...S.map(n => n.b + n.l));
        push();
        for (const n of S) { const e = n.b + n.l; n.b = a0 + Math.round((n.b - a0) * k); n.l = Math.max(1, Math.round(a0 + (e - a0) * k) - n.b); }
        T().breaks = T().breaks.map(b => (b > a0 && b < fin0 ? a0 + Math.round((b - a0) * k) : b)); refresh();
      } else if (v === 'bpm') {
        const r = await pedir('Cambiar el BPM', `Ahora ${bpm}. Las notas se quedan donde están: solo cambia la rejilla (más BPM = pasos más finos para ajustar).`, String(bpm));
        const nb = num(r); if (r == null || !(nb >= 20 && nb <= 2000) || nb === bpm) return;
        const k = nb / bpm;
        push();
        for (const tr of doc.tracks) { for (const n of tr.notes) { const e = n.b + n.l; n.b = Math.round(n.b * k); n.l = Math.max(1, Math.round(e * k) - n.b); } tr.breaks = tr.breaks.map(b => Math.round(b * k)); tr.br2 = {}; }
        bpm = nb; setHead('BPM', String(nb)); refresh();
      }
    };

    // ---------------- ver en el juego (la app de la tele, en una ventana)
    let pv = null;
    // Al cerrar, la ventana se destruye entera (con su audio): nada se queda sonando de fondo
    function cerrarPv() { if (!pv) return; try { pv.querySelector('iframe').src = 'about:blank'; } catch {} pv.remove(); pv = null; }
    function verEnJuego(desdeMs) {
      audio.pause();
      if (!pv) {
        pv = document.createElement('div'); pv.className = 'ed-pv';
        pv.innerHTML = `<div class="ed-pv-box"><div class="ed-pv-bar"><b>Vista como en el juego</b><span class="small muted">lo que hay en el editor ahora, aunque no esté guardado</span><span class="grow"></span>
          <button class="btn sm" data-pv="ini">Desde el principio</button><button class="btn sm" data-pv="cur">Desde el cursor</button><button class="btn sm dark" data-pv="pausa">Pausa</button><button class="btn sm ghost" data-pv="x">Cerrar</button></div>
          <div class="ed-pv-tv"><iframe src="/app/?preview=1" allow="autoplay"></iframe><div class="ed-pv-load">Cargando la tele…</div></div></div>`;
        document.body.appendChild(pv);
        pv.paused = false;
        pv.onclick = e => {
          const b = e.target.closest('[data-pv]'); if (!b) return;
          const a = b.dataset.pv, f = pv.querySelector('iframe').contentWindow;
          if (a === 'x') { cerrarPv(); return; }
          if (a === 'pausa') { pv.paused = !pv.paused; b.textContent = pv.paused ? 'Seguir' : 'Pausa'; f.postMessage({ type: 'gramola-preview-pause', paused: pv.paused }, location.origin); return; }
          enviar(a === 'ini' ? 0 : pv.desde);
        };
      }
      pv.hidden = false; pv.desde = desdeMs;
      const enviar = at => {
        pv.paused = false; pv.querySelector('[data-pv="pausa"]').textContent = 'Pausa';
        pv.querySelector('iframe').contentWindow.postMessage({ type: 'gramola-preview', id, txt: serialize(doc), at: Math.max(0, at - 2000), name: 'Vista previa' }, location.origin);
      };
      pv.enviar = enviar;
      if (pv.ready) enviar(desdeMs); else pv.pend = desdeMs;
    }
    const onPv = e => {
      if (e.origin !== location.origin || !pv) return;
      if (e.data && e.data.type === 'gramola-preview-ready') { pv.ready = true; pv.querySelector('.ed-pv-load').remove(); if (pv.pend != null) { pv.enviar(pv.pend); pv.pend = null; } }
      if (e.data && e.data.type === 'gramola-preview-error') toast(e.data.msg, true);
    };
    addEventListener('message', onPv);
    $('#ed-juego').onclick = () => verEnJuego(audio.currentTime * 1000);
    if (opts.verAlAbrir) setTimeout(() => verEnJuego(0), 300);
    if (doc.wasRelative) toast('La canción venía en formato relativo: se guardará en formato normal');

    let cleaned = false;
    function cleanup() {
      if (cleaned) return; cleaned = true;
      removeEventListener('keydown', onKey); removeEventListener('mousemove', onMove); removeEventListener('mouseup', onUp); removeEventListener('beforeunload', onLeave);
      removeEventListener('message', onPv); cerrarPv();
      ro.disconnect(); audio.pause(); audio.src = ''; stopMic(); if (mic) mic.st.getTracks().forEach(t => t.stop()); actx.close().catch(() => {});
    }
    // Al salir del editor (cambio de apartado) se para todo
    const mo = new MutationObserver(() => { if (!view.contains(cv)) { mo.disconnect(); cleanup(); } });
    mo.observe(view, { childList: true });
    viewMs = Math.max(-500, b2ms(T().notes[0] ? T().notes[0].b : 0) - 2000);
    resize(); refresh();
    return { isDirty: () => dirty, draft: !!data.draft };
  }

  window.GramolaEditor = { open, parse, serialize, phrasesOf };
})();
