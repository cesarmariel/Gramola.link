// Gramola · Admin — todo el juego a la vista y bajo control. Entrada con Touch ID.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = encodeURIComponent;
  const params = new URLSearchParams(location.search);
  const setup = params.get('setup');

  // ------------------------------------------------------------------ utilidades
  async function api(path, opts = {}) {
    const o = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.json !== undefined) { o.headers['content-type'] = 'application/json'; o.body = JSON.stringify(opts.json); }
    if (opts.raw) { o.body = opts.raw; o.headers['content-type'] = opts.type || 'application/octet-stream'; }
    const r = await fetch('/api/admin' + path, o);
    if (r.status === 401 && !path.startsWith('/auth/')) { showLogin(); throw new Error('Sesión caducada'); }
    const j = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
    if (!r.ok) throw new Error((j && j.error) || 'Error ' + r.status);
    return j;
  }
  let toastT;
  function toast(t, err) {
    const el = $('toast'); el.textContent = t; el.className = 'toast' + (err ? ' err' : ''); el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), err ? 5000 : 2600);
  }
  const fail = e => toast(e.message || String(e), true);
  const mb = b => b == null ? '—' : b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B';
  const nf = n => (n ?? 0).toLocaleString('es-ES');
  const dur = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} h ${m} min` : m ? `${m} min` : `${s} s`; };
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const ago = t => { if (!t) return '—'; const s = (Date.now() - t) / 1000; return s < 60 ? 'hace ' + Math.round(s) + ' s' : s < 3600 ? 'hace ' + Math.round(s / 60) + ' min' : s < 86400 ? 'hace ' + Math.round(s / 3600) + ' h' : new Date(t).toLocaleDateString('es-ES'); };
  const hhmm = t => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const flag = c => c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map(x => 127397 + x.charCodeAt(0))) + ' ' + c : '';
  const device = ua => {
    ua = ua || '';
    if (/Web0S|webOS/i.test(ua)) return 'Tele LG (webOS)';
    if (/Tizen/i.test(ua)) return 'Tele Samsung';
    if (/Android TV|AFT|BRAVIA|GoogleTV/i.test(ua)) return 'Android TV';
    if (/Xbox/i.test(ua)) return 'Xbox';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';
    return ua ? ua.slice(0, 40) : '—';
  };
  const SCREENS = { splash: 'Arrancando', boot: 'Arrancando', welcome: 'Bienvenida', lobby: 'Sala (esperando jugadores)', menu: 'Menú', songs: 'Eligiendo canción', prepare: 'Preparando canción', countdown: 'Cuenta atrás', sing: 'Cantando', results: 'Resultados', records: 'Salón de la fama', settings: 'Ajustes', calibrate: 'Calibrando', party: 'Pásalo', duel: 'Duelo', megamix: 'Megamix', jukebox: 'Jukebox', pause: 'Pausa' };
  const scr = s => SCREENS[s] || s || '—';
  const MODES = { sing: 'Cantar', duel: 'Duelo', megamix: 'Megamix', party: 'Pásalo', jukebox: 'Jukebox' };
  // Idioma en corto para la lista (el nombre completo va en el título al pasar el ratón)
  const LANG = { español: 'ES', spanish: 'ES', castellano: 'ES', inglés: 'EN', ingles: 'EN', english: 'EN', catalán: 'CA', catala: 'CA', català: 'CA', catalan: 'CA', francés: 'FR', french: 'FR', italiano: 'IT', italian: 'IT', alemán: 'DE', german: 'DE', portugués: 'PT', portuguese: 'PT', gallego: 'GL', euskera: 'EU', japonés: 'JA', japanese: 'JA' };
  const langShort = l => { if (!l) return '—'; const k = String(l).trim().toLowerCase(); return LANG[k] || String(l).slice(0, 2).toUpperCase(); };
  const fechaHora = t => new Date(t).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const cover = s => s && s.cover ? '/' + s.cover : '/assets/logo/simbolo-rojo.png';
  function modal(html) { $('modal-box').innerHTML = html; $('modal').hidden = false; return $('modal-box'); }
  function closeModal() { $('modal').hidden = true; $('modal-box').innerHTML = ''; }
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
  function ask(title, text, okText = 'Sí, hazlo', danger = true) {
    return new Promise(res => {
      const b = modal(`<h3>${esc(title)}</h3><p>${text}</p><div class="row" style="margin-top:18px"><button class="btn ${danger ? 'red' : 'dark'}" data-ok>${esc(okText)}</button><button class="btn ghost" data-no>Cancelar</button></div>`);
      b.querySelector('[data-ok]').onclick = () => { closeModal(); res(true); };
      b.querySelector('[data-no]').onclick = () => { closeModal(); res(false); };
    });
  }
  function prompt2(title, label, value = '', okText = 'Guardar') {
    return new Promise(res => {
      const b = modal(`<h3>${esc(title)}</h3><label class="lbl">${esc(label)}</label><input class="inp" data-v value="${esc(value)}"><div class="row" style="margin-top:18px"><button class="btn red" data-ok>${esc(okText)}</button><button class="btn ghost" data-no>Cancelar</button></div>`);
      const i = b.querySelector('[data-v]'); i.focus(); i.select();
      const ok = () => { const v = i.value; closeModal(); res(v); };
      b.querySelector('[data-ok]').onclick = ok; i.onkeydown = e => { if (e.key === 'Enter') ok(); };
      b.querySelector('[data-no]').onclick = () => { closeModal(); res(null); };
    });
  }

  // ------------------------------------------------------------------ entrada con Touch ID
  function showLogin(st) {
    stopTimers();
    $('app').hidden = true; $('login').hidden = false;
    const alta = st ? (st.setupValid || !st.hasKeys) : false;
    $('login-alta').hidden = !(st && st.setupValid);
    $('btn-login').hidden = !!(st && st.setupValid) || (st && !st.hasKeys);
    $('login-title').innerHTML = st && st.setupValid ? 'Da de alta<br><b>este Mac.</b>' : 'Entra con<br><b>Touch ID.</b>';
    if (st && !st.hasKeys && !st.setupValid) $('login-msg').textContent = 'Aún no hay ninguna llave. Genera un enlace de alta por SSH (server/alta.js).';
    if (st && setup && !st.setupValid) $('login-msg').textContent = 'El enlace de alta ha caducado o ya se usó.';
    void alta;
  }
  $('btn-login').onclick = async () => {
    $('login-msg').textContent = '';
    try {
      const o = await api('/auth/login/options', { method: 'POST', json: {} });
      const response = await WebAuthn.login(o);
      await api('/auth/login/verify', { method: 'POST', json: { response } });
      start();
    } catch (e) { $('login-msg').textContent = e.name === 'NotAllowedError' ? 'Cancelado.' : e.message; }
  };
  $('btn-alta').onclick = async () => {
    $('login-msg').textContent = '';
    try {
      const o = await api('/auth/register/options', { method: 'POST', json: { setup } });
      const response = await WebAuthn.register(o);
      await api('/auth/register/verify', { method: 'POST', json: { setup, response, name: $('key-name').value } });
      history.replaceState(null, '', '/');
      start();
    } catch (e) { $('login-msg').textContent = e.name === 'NotAllowedError' ? 'Cancelado.' : e.message; }
  };
  $('btn-out').onclick = async () => { await api('/auth/logout', { method: 'POST', json: {} }).catch(() => {}); location.reload(); };

  // ------------------------------------------------------------------ navegación
  let timers = [];
  const stopTimers = () => { timers.forEach(clearInterval); timers = []; };
  const every = (fn, ms) => { const g = viewGen, run = () => Promise.resolve().then(fn).catch(e => { if (g === viewGen) fail(e); }); run(); timers.push(setInterval(run, ms)); };
  const VIEWS = {};
  let viewGen = 0;
  let editor = null, skipRoute = false;
  function route() {
    if (skipRoute) { skipRoute = false; return; }
    // Cambios sin guardar en el editor: se pregunta antes de salir
    if (editor && editor.isDirty() && !location.hash.startsWith('#editor/') && !confirm('Hay cambios sin guardar en el editor. ¿Salir igualmente?')) {
      skipRoute = true; history.back(); return;
    }
    editor = null;
    stopTimers();
    const gen = ++viewGen;
    const [v, ...rest] = (location.hash.slice(1) || 'resumen').split('/');
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
    const fn = VIEWS[v] || VIEWS.resumen;
    $('view').innerHTML = '';
    window.scrollTo(0, 0);
    // Si se cambia de apartado mientras el anterior aún carga, su error (ya no tiene dónde pintar) se ignora
    fn(rest.map(decodeURIComponent)).catch(e => { if (gen === viewGen) fail(e); });
  }
  addEventListener('hashchange', route);
  document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) location.hash = g.dataset.go; });
  async function start() {
    const st = await api('/auth/status' + (setup ? '?setup=' + enc(setup) : ''));
    if (!st.authenticated || st.setupValid) return showLogin(st);
    $('login').hidden = true; $('app').hidden = false;
    route();
    // Contadores del menú, siempre al día
    const side = async () => {
      try {
        const l = await api('/live');
        const b = $('nav-live'); b.textContent = l.counts.rooms || ''; b.className = l.counts.rooms ? 'live' : '';
      } catch {}
    };
    side(); setInterval(side, 10000);
    api('/server').then(s => ($('ver').textContent = 'v' + s.version)).catch(() => {});
  }

  // ------------------------------------------------------------------ 01 · Resumen
  VIEWS.resumen = async () => {
    const v = $('view');
    v.innerHTML = `<div class="head"><h1>Resumen</h1><span class="sub" id="r-now"></span></div>
      <div class="kpis" id="r-live"></div>
      <h2 class="sec">Hoy</h2><div class="kpis" id="r-today"></div>
      <h2 class="sec">Últimos 30 días</h2><div class="card"><div class="chart" id="r-chart"></div><div class="chart-x" id="r-cx"></div>
        <div class="legend"><span><i></i>Canciones cantadas</span><span><i class="b"></i>Salas abiertas</span></div></div>
      <div class="grid2" style="margin-top:16px"><div><h2 class="sec">Lo más cantado</h2><div id="r-top"></div></div>
      <div><h2 class="sec">Ahora mismo</h2><div class="evs" id="r-ev" style="max-height:420px"></div></div></div>
      <h2 class="sec">Desde siempre</h2><div class="kpis" id="r-tot"></div>`;
    const ov = await api('/overview');
    const t = ov.totals;
    $('r-tot').innerHTML = [
      ['Salas', nf(t.rooms)], ['Jugadores', nf(t.joins)], ['Canciones cantadas', nf(ov.totalPlays)], ['Cantantes', nf(ov.singers)],
      ['Audio servido', mb(t.songBytes)], ['Canciones', nf(ov.songs)], ['Entradas al admin', nf(t.admin)],
    ].map(([k, x]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${x}</div></div>`).join('');
    // 30 días
    const days = []; const map = Object.fromEntries(ov.days.map(d => [d.day, d]));
    for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push(map[d] || { day: d }); }
    const mx = Math.max(1, ...days.map(d => Math.max(d.plays || 0, d.rooms || 0)));
    $('r-chart').innerHTML = days.map(d => `<div class="bar" data-t="${d.day.slice(8)}/${d.day.slice(5, 7)}\n${d.plays || 0} canciones · ${d.rooms || 0} salas\n${d.joins || 0} jugadores · ${mb(d.songBytes || 0)}"><i style="height:${(d.plays || 0) / mx * 100}%"></i><i class="b" style="height:${(d.rooms || 0) / mx * 100}%"></i></div>`).join('');
    $('r-cx').innerHTML = `<span>${days[0].day.slice(8)}/${days[0].day.slice(5, 7)}</span><span>hoy</span>`;
    $('r-top').innerHTML = ov.top.length ? `<table class="tbl">${ov.top.map((x, i) => `<tr class="click" data-id="${esc(x.id)}"><td class="r muted">${i + 1}</td><td><div class="t-title">${esc(x.title)}</div><div class="t-art">${esc(x.artist)}${x.exists ? '' : ' · <span class="red-t">retirada</span>'}</div></td><td class="r"><b>${x.n}</b></td></tr>`).join('')}</table>` : '<div class="empty">Aún no se ha cantado nada.</div>';
    $('r-top').onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = 'canciones/' + enc(tr.dataset.id); };
    every(async () => {
      const l = await api('/live');
      $('r-now').textContent = new Date(l.now).toLocaleTimeString('es-ES');
      $('r-live').innerHTML = [
        ['Salas abiertas', l.counts.rooms, `${l.counts.tvs} con la tele conectada`, l.counts.rooms > 0],
        ['Jugadores conectados', l.counts.players, 'móviles en salas', false],
        ['Cantando ahora', l.counts.singing, 'con voz en los últimos 3 s', l.counts.singing > 0],
      ].map(([k, x, s, hot]) => `<div class="kpi ${hot ? 'hot' : ''}"><div class="k">${k}</div><div class="v">${x}</div><div class="s">${s}</div></div>`).join('');
      const d = l.today;
      $('r-today').innerHTML = [
        ['Salas', d.rooms], ['Jugadores', d.joins], ['Canciones', d.plays], ['Teles', d.tvs], ['Audio servido', mb(d.songBytes)], ['Pico de salas', d.peakRooms], ['Pico de jugadores', d.peakPlayers],
      ].map(([k, x]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${typeof x === 'number' ? nf(x) : x}</div></div>`).join('');
      $('r-ev').innerHTML = evRows(l.lastEvents) || '<div class="empty">Sin actividad.</div>';
    }, 3000);
  };
  const KIND = { room: 'Sala', player: 'Jugador', play: 'Canción', admin: 'Admin', songs: 'Biblioteca', records: 'Récords' };
  const evRows = list => list.map(e => `<div class="ev"><span class="w">${hhmm(e.t)}</span><span class="k-${esc(e.kind)}"><b>${esc(KIND[e.kind] || e.kind)}</b></span><span>${esc(e.text)}${e.ip ? ` <span class="muted small">· ${esc(e.ip)}</span>` : ''}</span></div>`).join('');

  // ------------------------------------------------------------------ 02 · Salas en directo
  VIEWS.directo = async () => {
    const v = $('view');
    v.innerHTML = `<div class="head"><h1>Salas en directo</h1><span class="sub" id="d-sub"></span></div>
      <div class="card" style="margin-bottom:18px"><div class="row"><span class="kicker">Aviso a todas las teles</span>
        <input class="inp grow" id="d-msg" maxlength="140" placeholder="Por ejemplo: en 5 minutos reiniciamos el servidor">
        <label class="row small"><input type="checkbox" id="d-ph"> también a los móviles</label>
        <button class="btn red" id="d-send">Enviar</button></div></div>
      <div class="rooms" id="d-rooms"></div>`;
    $('d-send').onclick = async () => {
      const text = $('d-msg').value.trim(); if (!text) return;
      try { const r = await api('/broadcast', { method: 'POST', json: { text, phones: $('d-ph').checked } }); toast(`Enviado a ${r.tvs} teles`); $('d-msg').value = ''; } catch (e) { fail(e); }
    };
    $('d-rooms').onclick = async e => {
      const b = e.target.closest('button[data-a]'); if (!b) return;
      const code = b.dataset.code, a = b.dataset.a;
      try {
        if (a === 'close') { if (await ask(`¿Cerrar la sala ${code}?`, 'La tele y todos los móviles salen de la sala.')) { await api(`/rooms/${code}/close`, { method: 'POST', json: {} }); toast('Sala cerrada'); } }
        else if (a === 'reload') { await api(`/rooms/${code}/reload`, { method: 'POST', json: {} }); toast('Recargando la tele'); }
        else if (a === 'kick') { if (await ask(`¿Echar a ${b.dataset.name}?`, 'Su móvil sale de la sala; puede volver a entrar con el código.')) { await api(`/rooms/${code}/kick`, { method: 'POST', json: { p: +b.dataset.p } }); toast('Fuera'); } }
        else if (a === 'msg') {
          const t = await prompt2(`Mensaje a la sala ${code}`, 'Aparece en la tele (y en los móviles)', '', 'Enviar');
          if (t) { await api(`/rooms/${code}/message`, { method: 'POST', json: { text: t, phones: true } }); toast('Mensaje enviado'); }
        } else if (a === 'photo') {
          modal(`<h3>${esc(b.dataset.name)}</h3><img src="/api/admin/rooms/${code}/photo/${b.dataset.p}?t=${Date.now()}" style="max-width:100%;border:2px solid var(--ink)">`);
        }
        draw();
      } catch (err) { fail(err); }
    };
    let busy = false;
    async function draw() {
      if (busy) return; busy = true;
      try {
        const l = await api('/live');
        $('d-sub').textContent = `${l.counts.rooms} salas · ${l.counts.players} jugadores · ${l.counts.singing} cantando`;
        $('d-rooms').innerHTML = l.rooms.length ? l.rooms.sort((a, b) => b.createdAt - a.createdAt).map(roomCard).join('') : '<div class="empty">No hay ninguna sala abierta ahora mismo.</div>';
      } finally { busy = false; }
    }
    every(draw, 1500);
  };
  function roomCard(r) {
    const st = r.state;
    const song = st && st.song ? `<b>${esc(st.song.title)}</b> · ${esc(st.song.artist || '')}` : '';
    return `<div class="room">
      <div class="room-h"><span class="dot ${r.hostOnline ? 'on' : ''}" title="${r.hostOnline ? 'Tele conectada' : 'Tele desconectada'}"></span><span class="room-code">${esc(r.code)}</span>
        <div class="room-meta grow">${r.hostOnline ? 'Tele conectada' : `<span class="red-t">Tele desconectada ${ago(r.emptySince)}</span>`}<br>
        ${esc(device(r.host && r.host.ua))} ${flag(r.host && r.host.country)} · abierta ${ago(r.createdAt)}</div></div>
      <div class="room-st">${st ? `<b>${esc(scr(st.screen))}</b>${st.mode ? ' · ' + esc(MODES[st.mode] || st.mode) : ''}${st.turn ? ' · turno de ' + esc(st.turn) : ''}${song ? '<br>' + song : ''}` : '<span class="muted">Sin estado todavía</span>'}${r.stateAt ? ` <span class="muted small">· ${ago(r.stateAt)}</span>` : ''}</div>
      ${r.players.map(p => `<div class="pl"><span class="pl-sw" style="background:${p.color}"></span>
        ${p.photo ? `<img class="pl-ph" src="/api/admin/rooms/${r.code}/photo/${p.id}?v=${r.code}" alt="">` : `<span class="pl-ph none">J${p.slot}</span>`}
        <div class="grow"><div class="pl-n"><span class="dot ${p.singing ? 'sing' : p.online || p.bot ? 'on' : ''}"></span> ${esc(p.name)}${p.bot ? ' <span class="badge no">simulado</span>' : ''}</div>
        <div class="pl-x">${p.bot ? 'Canta desde la tele' : `${p.online ? 'Conectado' : 'Sin conexión'} · ${esc(device(p.info && p.info.ua))} ${flag(p.info && p.info.country)} · entró ${ago(p.joinedAt)}${p.lat != null ? ` · ${p.lat} ms` : ''}`}</div></div>
        ${p.singing ? `<span class="vu" title="Volumen"><i style="width:${Math.min(100, (p.vol || 0) * 250)}%"></i></span>` : ''}
        ${p.photo ? `<button class="btn sm ghost" data-a="photo" data-code="${r.code}" data-p="${p.id}" data-name="${esc(p.name)}">Foto</button>` : ''}
        <button class="btn sm danger" data-a="kick" data-code="${r.code}" data-p="${p.id}" data-name="${esc(p.name)}">Echar</button></div>`).join('') || '<div class="pl muted small">Sin jugadores todavía</div>'}
      <div class="room-a"><button class="btn sm" data-a="msg" data-code="${r.code}">Mensaje</button><button class="btn sm" data-a="reload" data-code="${r.code}" ${r.hostOnline ? '' : 'disabled'}>Recargar la tele</button><button class="btn sm danger" data-a="close" data-code="${r.code}">Cerrar sala</button></div>
    </div>`;
  }

  // ------------------------------------------------------------------ 03 · Canciones
  let songs = null;
  const picked = new Set();   // canciones seleccionadas en la lista (se mantiene entre páginas)
  const sState = { q: '', f: 'todas', sort: 'title', dir: 1, page: 1, per: (() => { try { const v = localStorage.getItem('adm-per'); return v === null ? 50 : +v; } catch { return 50; } })() };
  const FILTERS = { todas: 'Todas', borradores: 'Sin publicar', sinmegamix: 'Sin Megamix', sinnorm: 'Volumen sin igualar', portada: 'Portada original', duo: 'Dúos', nunca: 'Nunca cantadas', video: 'Con vídeo' };
  VIEWS.canciones = async ([id]) => {
    if (id === 'retiradas') return retiradas();
    if (id) return songSheet(id);
    const v = $('view');
    v.innerHTML = `<div class="head"><h1>Canciones</h1><span class="sub" id="c-sub"></span></div>
      <div class="tools"><input class="inp" id="c-q" placeholder="Buscar título, artista, año, carpeta…" value="${esc(sState.q)}">
        <div class="chips" id="c-f">${Object.entries(FILTERS).map(([k, t]) => `<button class="chip ${sState.f === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}</div>
        <span class="grow"></span><button class="btn ${sState.f === 'novedades' ? 'dark' : ''}" id="c-nov">★ Novedades <b id="c-nn"></b></button><button class="btn" id="c-ret">Retiradas</button><button class="btn" id="c-new">Subir UltraStar</button><button class="btn red" id="c-crear">✨ Crear canción</button></div>
      <div class="selbar" id="c-sel" hidden><b id="c-seln"></b><button class="btn sm red" data-nv="1">★ Marcar como Novedades</button><button class="btn sm" data-nv="0">Quitar de Novedades</button><button class="link small" data-nv="x">Deseleccionar</button></div>
      <div class="pager" id="c-pg1"></div><div id="c-list"></div><div class="pager" id="c-pg2"></div>`;
    $('c-q').oninput = () => { sState.q = $('c-q').value; sState.page = 1; draw(); };
    $('c-f').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; sState.f = b.dataset.f; sState.page = 1; $('c-nov').classList.toggle('dark', sState.f === 'novedades'); $('c-f').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); draw(); };
    $('c-ret').onclick = () => (location.hash = 'canciones/retiradas');
    $('c-nov').onclick = () => {
      sState.f = sState.f === 'novedades' ? 'todas' : 'novedades'; sState.page = 1;
      $('c-nov').classList.toggle('dark', sState.f === 'novedades');
      $('c-f').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x.dataset.f === sState.f));
      draw();
    };
    $('c-sel').onclick = async e => {
      const b = e.target.closest('[data-nv]'); if (!b) return;
      if (b.dataset.nv === 'x') { picked.clear(); return draw(); }
      try {
        const on = b.dataset.nv === '1';
        await api('/novedades', { method: 'POST', json: { ids: [...picked], on } });
        toast(`${picked.size} ${picked.size === 1 ? 'canción' : 'canciones'} ${on ? 'marcadas como Novedades' : 'quitadas de Novedades'}`);
        picked.clear();
        songs = await api('/songs'); draw();
      } catch (err) { fail(err); }
    };
    $('c-new').onclick = newSong;
    $('c-crear').onclick = crearCancion;
    songs = await api('/songs');
    $('nav-songs').textContent = songs.length;
    function draw() {
      const q = sState.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      let l = songs.filter(s => !q || norm(`${s.title} ${s.artist} ${s.year} ${s.id} ${s.genre} ${s.language}`).includes(q));
      const F = { borradores: s => s.draft, novedades: s => s.isNew, sinmegamix: s => !s.megamix, sinnorm: s => !s.normalized, portada: s => s.coverSource === 'original', duo: s => s.duet, nunca: s => !s.plays, video: s => s.hasVideo };
      if (F[sState.f]) l = l.filter(F[sState.f]);
      const k = sState.sort, d = sState.dir;
      const val = s => k === 'record' ? (s.record ? s.record.score : -1) : k === 'megamix' ? (s.megamix ? 1 : 0) : s[k];
      l.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y, 'es') : (x ?? -1) - (y ?? -1)) * d; });
      $('c-sub').textContent = `${l.length} de ${songs.length} · ${mb(l.reduce((a, s) => a + s.size, 0))}`;
      const nn = songs.filter(s => s.isNew).length; $('c-nn').textContent = nn ? `(${nn})` : '';
      for (const id of [...picked]) if (!songs.some(s => s.id === id)) picked.delete(id);
      $('c-sel').hidden = !picked.size; $('c-seln').textContent = `${picked.size} ${picked.size === 1 ? 'seleccionada' : 'seleccionadas'}`;
      // Paginación
      const per = sState.per || l.length || 1, pages = Math.max(1, Math.ceil(l.length / per));
      sState.page = Math.min(Math.max(1, sState.page), pages);
      const from = (sState.page - 1) * per, all = l.length;
      l = sState.per ? l.slice(from, from + per) : l;
      const pager = () => {
        const p = sState.page, nums = [];
        for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - p) <= 2) nums.push(i); else if (nums[nums.length - 1] !== '…') nums.push('…');
        return `<span class="small muted">${all ? `${from + 1}–${from + l.length} de ${all}` : 'Sin resultados'}</span><span class="grow"></span>
          ${pages > 1 ? `<button class="btn sm ghost" data-pg="${p - 1}" ${p === 1 ? 'disabled' : ''}>‹ Anterior</button>
          ${nums.map(n => n === '…' ? '<span class="muted">…</span>' : `<button class="btn sm ${n === p ? 'dark' : 'ghost'}" data-pg="${n}">${n}</button>`).join('')}
          <button class="btn sm ghost" data-pg="${p + 1}" ${p === pages ? 'disabled' : ''}>Siguiente ›</button>` : ''}
          <select class="inp sm" data-per>${[25, 50, 100, 0].map(n => `<option value="${n}" ${n === sState.per ? 'selected' : ''}>${n ? n + ' por página' : 'Todas'}</option>`).join('')}</select>`;
      };
      $('c-pg1').innerHTML = $('c-pg2').innerHTML = pager();
      const th = (key, t, cls = '') => `<th class="s ${cls}" data-s="${key}">${t}${sState.sort === key ? (sState.dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
      const allOn = l.length && l.every(s => picked.has(s.id));
      $('c-list').innerHTML = `<table class="tbl"><thead><tr><th class="ck"><input type="checkbox" data-all ${allOn ? 'checked' : ''} title="Seleccionar las de esta página"></th><th></th>${th('title', 'Canción')}${th('year', 'Año', 'r hide-m')}${th('language', 'Idioma', 'hide-m lang')}${th('duration', 'Dur.', 'r hide-m')}${th('difficulty', 'Dif.', 'hide-m')}${th('megamix', 'Megamix', 'hide-m')}${th('lufs', 'Volumen', 'r hide-m')}${th('plays', 'Cantada', 'r')}${th('record', 'Récord', 'r hide-m')}${th('size', 'Tamaño', 'r hide-m')}${th('added', 'Añadida', 'r hide-m when')}</tr></thead><tbody>
        ${l.map(s => `<tr class="click ${picked.has(s.id) ? 'picked' : ''}" data-id="${esc(s.id)}"><td class="ck"><input type="checkbox" data-pick ${picked.has(s.id) ? 'checked' : ''}></td><td><img class="cov" loading="lazy" src="${esc(cover(s))}" alt=""></td>
          <td><div class="t-title">${esc(s.title)}${s.draft ? ' <span class="badge warn">sin publicar</span>' : ''}${s.isNew ? ' <span class="badge red">★ nueva</span>' : ''}${s.duet ? ' <span class="badge warn">dúo</span>' : ''}${s.hasVideo ? ' <span class="badge no">vídeo</span>' : ''}</div><div class="t-art">${esc(s.artist)}</div></td>
          <td class="r hide-m">${s.year || '—'}</td><td class="hide-m small lang" title="${esc(s.language || '')}">${esc(langShort(s.language))}</td><td class="r hide-m">${s.duration ? mmss(s.duration) : '—'}</td>
          <td class="hide-m"><span class="diff">${'●'.repeat(s.difficulty)}${'○'.repeat(3 - s.difficulty)}</span></td>
          <td class="hide-m">${s.megamix ? `<span class="badge ${s.megamixOrigin === 'detectado' ? 'warn' : 'ok'}">${esc(s.megamixOrigin || 'sí')}</span>` : '<span class="badge no">no</span>'}</td>
          <td class="r hide-m small">${s.normalized ? '<span class="badge ok">igualado</span>' : '<span class="badge no">original</span>'}</td>
          <td class="r">${s.plays || '—'}</td><td class="r hide-m small">${s.record ? `${nf(s.record.score)}<br><span class="muted">${esc(s.record.name)}</span>` : '—'}</td>
          <td class="r hide-m small">${mb(s.size)}</td><td class="r hide-m small when">${fechaHora(s.added)}</td></tr>`).join('')}</tbody></table>`;
    }
    $('c-list').onclick = e => {
      // Casillas: seleccionar sin abrir la ficha
      const ck = e.target.closest('td.ck, th.ck');
      if (ck) {
        const all = e.target.closest('[data-all]');
        if (all) { const ids = [...$('c-list').querySelectorAll('tr[data-id]')].map(r => r.dataset.id); ids.forEach(id => all.checked ? picked.add(id) : picked.delete(id)); return draw(); }
        const tr = ck.closest('tr[data-id]'); if (!tr) return;
        const box = tr.querySelector('[data-pick]'); if (e.target !== box) box.checked = !box.checked;
        box.checked ? picked.add(tr.dataset.id) : picked.delete(tr.dataset.id);
        return draw();
      }
      const h = e.target.closest('th[data-s]');
      if (h) { sState.page = 1; if (sState.sort === h.dataset.s) sState.dir *= -1; else { sState.sort = h.dataset.s; sState.dir = ['plays', 'size', 'added', 'record', 'year', 'lufs'].includes(h.dataset.s) ? -1 : 1; } return draw(); }
      const tr = e.target.closest('tr[data-id]'); if (tr) location.hash = 'canciones/' + enc(tr.dataset.id);
    };
    for (const pg of [$('c-pg1'), $('c-pg2')]) {
      pg.onclick = e => { const b = e.target.closest('[data-pg]'); if (!b) return; sState.page = +b.dataset.pg; draw(); if (pg.id === 'c-pg2') $('c-pg1').scrollIntoView({ block: 'start' }); };
      pg.onchange = e => { if (!e.target.matches('[data-per]')) return; sState.per = +e.target.value; sState.page = 1; try { localStorage.setItem('adm-per', sState.per); } catch {} draw(); };
    }
    draw();
  };

  async function songSheet(id) {
    const v = $('view');
    const d = await api('/songs/' + enc(id));
    const s = d.song || { title: d.header.TITLE || id, artist: d.header.ARTIST || '' };
    const h = d.header, audio = h.MP3 || h.AUDIO;
    const audioUrl = audio ? `/songs/${enc(id)}/${enc(audio)}` : null;
    const mm = d.megamixInfo;
    const imgs = d.files.filter(f => /\.(jpe?g|png|webp)$/i.test(f.name));
    v.innerHTML = `<button class="btn ghost sm back" data-go="canciones">← Canciones</button>
      <div class="head"><h1>${esc(s.title)}</h1><span class="sub">${esc(s.artist)}</span></div>
      <div class="sheet"><div>
        <img class="cover-big" id="s-img" src="${esc(cover(s) + (cover(s).includes('?') ? '&' : '?') + 't=' + Date.now())}" alt="">
        <div class="row" style="margin-top:10px"><button class="btn red grow" id="s-cov">Cambiar carátula</button></div>
        <div class="row" style="margin-top:6px"><label class="btn ghost sm grow">Subir imagen<input type="file" id="s-up" accept="image/jpeg,image/png,image/webp" hidden></label>
          ${d.caratula && d.caratula.antes ? '<button class="btn ghost sm grow" id="s-rest">Volver a la anterior</button>' : ''}</div>
        <p class="small muted">Portada: ${d.caratula ? esc(d.caratula.origen || 'itunes') + (d.caratula.disco ? ' · ' + esc(d.caratula.disco) : '') + (d.caratula.año ? ' (' + esc(d.caratula.año) + ')' : '') : 'la original de la canción'}</p>
        <dl class="facts">
          <dt>Carpeta</dt><dd>${esc(id)}</dd>
          <dt>Duración</dt><dd>${s.duration ? mmss(s.duration) : '—'}</dd>
          <dt>Notas</dt><dd>${nf(s.notes)}</dd>
          <dt>Dificultad</dt><dd><span class="diff">${'●'.repeat(s.difficulty || 1)}${'○'.repeat(3 - (s.difficulty || 1))}</span></dd>
          <dt>Dúo</dt><dd>${s.duet ? 'Sí' : 'No'}</dd>
          <dt>Cantada</dt><dd>${d.plays} veces ${d.plays ? '<button class="link small" id="s-p0">poner a 0</button>' : ''}</dd>
          <dt>Récord</dt><dd>${d.record ? `${nf(d.record.score)} · ${esc(d.record.name)} · ${esc(d.record.date)} <button class="link small" id="s-r0">borrar</button>` : '—'}</dd>
          <dt>Tamaño</dt><dd>${mb(d.size)}</dd>
          <dt>Volumen</dt><dd>${d.volumen ? `igualado (antes ${d.volumen.antes_lufs.toFixed(1)} LUFS)` : 'original'}</dd>
        </dl>
        <div class="row" style="margin-top:14px"><button class="btn sm ${s.isNew ? 'dark' : ''}" id="s-nov">${s.isNew ? '★ Novedad · quitar' : '★ Marcar como novedad'}</button><button class="btn sm" id="s-ren">Renombrar carpeta</button><button class="btn sm danger" id="s-ret">Retirar</button></div>
      </div><div>
        ${d.files.some(f => f.name === 'borrador.json') ? `<div class="card" style="border-color:var(--warn);margin-bottom:12px"><b>Sin publicar:</b> creada automáticamente; no sale en la tele hasta que la publiques. Revísala en el editor.
          <div class="row" style="margin-top:8px"><button class="btn red" id="s-pub">Publicar</button><label class="row small"><input type="checkbox" id="s-pubnv" checked> y ponerla en Novedades</label></div></div>` : ''}
        <div class="row" style="margin-bottom:6px"><a class="btn dark" href="#editor/${enc(id)}">✎ Abrir en el editor</a><button class="btn" id="s-voz">${d.files.some(f => f.name === 'voz-tono.json') ? 'Volver a analizar la voz' : 'Analizar la voz'}</button><span class="small muted">La voz sola y su tono ayudan a encajar las notas en el editor</span></div>
        <h2 class="sec" style="margin-top:8px">Escuchar</h2>
        ${audioUrl ? `<audio id="s-audio" controls preload="metadata" src="${audioUrl}"></audio>` : '<p class="red-t">Sin audio</p>'}
        <h2 class="sec">Megamix</h2>
        ${mm ? `<p>Estribillo de <b>${mmss(mm.start / 1000)}</b> a <b>${mmss(mm.end / 1000)}</b> (${Math.round((mm.end - mm.start) / 1000)} s) · <span class="badge ${mm.origen === 'detectado' ? 'warn' : 'ok'}">${esc(mm.origen || 'marcado')}</span></p>
          <audio controls preload="none" src="/songs/${enc(id)}/megamix.mp3?t=${Date.now()}"></audio>` : '<p class="muted">Esta canción no está en el Megamix.</p>'}
        <div class="row"><span class="small muted">Inicio</span><input class="inp sm" id="mm-a" size="6" value="${mm ? mmss(mm.start / 1000) : ''}" placeholder="1:05"><button class="btn sm ghost" id="mm-ah" title="Posición actual del reproductor">◉ ahora</button>
          <span class="small muted">Fin</span><input class="inp sm" id="mm-b" size="6" value="${mm ? mmss(mm.end / 1000) : ''}" placeholder="1:35"><button class="btn sm ghost" id="mm-bh">◉ ahora</button>
          <button class="btn sm dark" id="mm-set">Usar este tramo</button><button class="btn sm" id="mm-auto">Detectar solo</button>${mm ? '<button class="btn sm danger" id="mm-off">Quitar del Megamix</button>' : ''}</div>
        <h2 class="sec">Volumen</h2>
        <div class="row"><button class="btn sm" id="v-me">Medir</button><button class="btn sm dark" id="v-no">Igualar a −12 LUFS</button><span class="small muted" id="v-out"></span></div>
        <h2 class="sec">Datos de la canción (cabecera del .txt)</h2>
        <div class="tags" id="s-tags">${Object.entries(h).map(([k, x]) => tagRow(k, x)).join('')}</div>
        <div class="row" style="margin-top:10px"><button class="btn sm ghost" id="t-add">+ Añadir dato</button><span class="grow"></span><button class="btn red" id="t-save">Guardar cambios</button></div>
        <p class="small muted">Se cambia en ${d.txts.map(esc).join(' y ')}. Vaciar un dato lo quita.</p>
        <h2 class="sec">Ficheros</h2>
        <table class="tbl files"><tbody>${d.files.map(f => `<tr><td><a href="/songs/${enc(id)}/${enc(f.name)}" target="_blank" rel="noopener">${esc(f.name)}</a>${imgs.includes(f) && f.name !== h.COVER ? ` <button class="link small" data-cover="${esc(f.name)}">usar de portada</button>` : ''}${f.name === h.COVER ? ' <span class="badge ok">portada</span>' : ''}${f.name === audio ? ' <span class="badge ok">audio</span>' : ''}</td><td class="r">${mb(f.size)}</td><td class="r small muted">${new Date(f.mtime).toLocaleString('es-ES')}</td><td class="r"><button class="btn sm danger" data-del="${esc(f.name)}">Borrar</button></td></tr>`).join('')}</tbody></table>
        <div class="row" style="margin-top:8px"><label class="btn sm">Subir ficheros<input type="file" id="f-up" multiple hidden></label><span id="f-prog" class="small muted"></span></div>
      </div></div>`;
    $('s-img').addEventListener('error', function () { this.src = '/assets/logo/simbolo-rojo.png'; }, { once: true });
    const reload = () => songSheet(id).catch(fail);
    const act = async (p, fn) => { try { await p; toast(fn || 'Hecho'); reload(); } catch (e) { fail(e); } };
    $('s-cov').onclick = () => coverPicker(id, s);
    $('s-up').onchange = async e => { const f = e.target.files[0]; if (!f) return; act(api(`/songs/${enc(id)}/cover-upload`, { method: 'PUT', raw: f, type: f.type }), 'Portada subida'); };
    if ($('s-rest')) $('s-rest').onclick = () => act(api(`/songs/${enc(id)}/cover`, { method: 'POST', json: { restore: true } }), 'Portada anterior recuperada');
    if ($('s-p0')) $('s-p0').onclick = async () => { if (await ask('¿Poner a 0 las veces cantada?', esc(s.title))) act(api('/records/plays/' + enc(id), { method: 'DELETE' })); };
    if ($('s-r0')) $('s-r0').onclick = async () => { if (await ask('¿Borrar el récord de esta canción?', esc(s.title))) act(api('/records/song/' + enc(id), { method: 'DELETE' })); };
    if ($('s-pub')) $('s-pub').onclick = () => act(api(`/songs/${enc(id)}/publish`, { method: 'POST', json: { novedad: $('s-pubnv').checked } }), 'Publicada');
    $('s-voz').onclick = async () => { try { await api('/jobs', { method: 'POST', json: { kind: 'analizar', song: id } }); toast('En la cola de creación'); location.hash = 'creacion'; } catch (e) { fail(e); } };
    $('s-nov').onclick = () => act(api('/novedades', { method: 'POST', json: { ids: [id], on: !s.isNew } }), s.isNew ? 'Quitada de Novedades' : 'Marcada como novedad');
    $('s-ren').onclick = async () => { const to = await prompt2('Renombrar carpeta', 'Nombre nuevo de la carpeta', id); if (to && to !== id) try { const r = await api(`/songs/${enc(id)}/rename`, { method: 'POST', json: { to } }); toast('Renombrada'); location.hash = 'canciones/' + enc(r.id); } catch (e) { fail(e); } };
    $('s-ret').onclick = async () => { if (await ask(`¿Retirar «${s.title}»?`, 'Deja de salir en el juego. Se guarda en «Retiradas» y se puede restaurar.', 'Retirar')) try { await api(`/songs/${enc(id)}/retire`, { method: 'POST', json: {} }); toast('Retirada'); location.hash = 'canciones'; } catch (e) { fail(e); } };
    const parseT = t => { const m = String(t).trim().match(/^(\d+):(\d{1,2}(?:\.\d+)?)$|^(\d+(?:\.\d+)?)$/); return m ? Math.round((m[3] ? +m[3] : +m[1] * 60 + +m[2]) * 1000) : NaN; };
    const now = () => { const a = $('s-audio'); return a ? mmss(a.currentTime) : ''; };
    $('mm-ah').onclick = () => ($('mm-a').value = now());
    $('mm-bh').onclick = () => ($('mm-b').value = now());
    const mmRun = async (json, msg) => { try { toast('Cortando el tramo…'); const r = await api(`/songs/${enc(id)}/megamix`, { method: 'POST', json }); toast(msg || r.result); reload(); } catch (e) { fail(e); } };
    $('mm-set').onclick = () => { const a = parseT($('mm-a').value), b = parseT($('mm-b').value); if (!(a >= 0 && b > a)) return toast('Pon inicio y fin (m:ss)', true); mmRun({ mode: 'manual', start: a, end: b }); };
    $('mm-auto').onclick = () => mmRun({ mode: 'auto' });
    if ($('mm-off')) $('mm-off').onclick = async () => { if (await ask('¿Quitar del Megamix?', esc(s.title))) mmRun({ mode: 'none' }, 'Fuera del Megamix'); };
    $('v-me').onclick = async () => { $('v-out').textContent = 'Midiendo…'; try { const r = await api(`/songs/${enc(id)}/measure`, { method: 'POST', json: {} }); $('v-out').textContent = `${(+r.input_i).toFixed(1)} LUFS · pico ${(+r.input_tp).toFixed(1)} dBTP · rango ${(+r.input_lra).toFixed(1)} LU`; } catch (e) { $('v-out').textContent = ''; fail(e); } };
    $('v-no').onclick = async () => { $('v-out').textContent = 'Igualando (tarda un poco)…'; try { const r = await api(`/songs/${enc(id)}/normalize`, { method: 'POST', json: {} }); toast(r.result); reload(); } catch (e) { $('v-out').textContent = ''; fail(e); } };
    $('t-add').onclick = async () => { const k = await prompt2('Añadir dato', 'Nombre del dato (p. ej. GENRE, EDITION, VIDEO)', ''); if (k) $('s-tags').insertAdjacentHTML('beforeend', tagRow(k.toUpperCase().replace(/[^A-Z0-9]/g, ''), '')); };
    $('s-tags').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) b.previousElementSibling.value = ''; };
    $('t-save').onclick = () => {
      const tags = {};
      $('s-tags').querySelectorAll('input[data-k]').forEach(i => { if (i.value !== (h[i.dataset.k] ?? '')) tags[i.dataset.k] = i.value; });
      if (!Object.keys(tags).length) return toast('No hay cambios');
      act(api(`/songs/${enc(id)}/header`, { method: 'PATCH', json: { tags } }), 'Guardado');
    };
    v.querySelector('.files').onclick = async e => {
      const del = e.target.closest('[data-del]'), cv = e.target.closest('[data-cover]');
      if (del && await ask(`¿Borrar ${del.dataset.del}?`, 'Se borra del servidor y no se puede deshacer.')) act(api(`/songs/${enc(id)}/files/${enc(del.dataset.del)}`, { method: 'DELETE' }), 'Borrado');
      if (cv) act(api(`/songs/${enc(id)}/cover`, { method: 'POST', json: { file: cv.dataset.cover } }), 'Portada cambiada');
    };
    $('f-up').onchange = async e => { await upload(id, [...e.target.files], $('f-prog')); reload(); };
  }
  const tagRow = (k, x) => `<span class="k">#${esc(k)}</span><input class="inp sm" style="width:100%" data-k="${esc(k)}" value="${esc(x)}"><button class="btn sm ghost" data-rm title="Vaciar">×</button>`;

  async function upload(id, files, prog) {
    for (const [i, f] of files.entries()) {
      prog.textContent = `Subiendo ${i + 1}/${files.length}: ${f.name} (${mb(f.size)})…`;
      try { await api(`/songs/${enc(id)}/files/${enc(f.name)}`, { method: 'PUT', raw: f }); } catch (e) { fail(e); prog.textContent = ''; return false; }
    }
    prog.textContent = `${files.length} ficheros subidos`;
    toast('Subido');
    return true;
  }

  // Elegir carátula: iTunes y Deezer a la vez (o por separado)
  function coverPicker(id, s) {
    const b = modal(`<h3>Carátula de «${esc(s.title)}»</h3>
      <div class="row"><input class="inp grow" id="cp-q" value="${esc(((s.artist || '') + ' ' + (s.title || '')).trim())}">
        <div class="chips" id="cp-src"><button class="chip on" data-s="">iTunes + Deezer</button><button class="chip" data-s="itunes">iTunes</button><button class="chip" data-s="deezer">Deezer</button></div>
        <button class="btn red" id="cp-go">Buscar</button></div>
      <p class="small muted" id="cp-n">Elige una para cambiarla.</p><div class="covers" id="cp-res"></div>
      <div class="row" style="margin-top:14px"><button class="btn ghost" id="cp-x">Cerrar</button></div>`);
    let src = '', res = [];
    const go = async () => {
      $('cp-n').textContent = 'Buscando…'; $('cp-res').innerHTML = '';
      try {
        res = await api(`/covers/search?q=${enc($('cp-q').value)}&src=${src}`);
        $('cp-n').textContent = res.length ? `${res.length} resultados · elige una` : 'Sin resultados. Prueba con otro texto (solo el disco o el artista).';
        $('cp-res').innerHTML = res.map((r, i) => `<button class="cv" data-i="${i}"><span class="src ${r.source}">${r.source}</span><img loading="lazy" src="${esc(r.thumb)}" alt=""><div class="t"><b>${esc(r.album)}</b>${r.year ? ' (' + esc(r.year) + ')' : ''}<br><span class="muted">${esc(r.artist)} · ${esc(r.track)}</span></div></button>`).join('');
      } catch (e) { $('cp-n').textContent = ''; fail(e); }
    };
    b.querySelector('#cp-src').onclick = e => { const c = e.target.closest('[data-s]'); if (!c) return; src = c.dataset.s; b.querySelectorAll('#cp-src .chip').forEach(x => x.classList.toggle('on', x === c)); go(); };
    $('cp-go').onclick = go; $('cp-q').onkeydown = e => { if (e.key === 'Enter') go(); };
    $('cp-x').onclick = closeModal;
    $('cp-res').onclick = async e => {
      const c = e.target.closest('.cv'); if (!c) return;
      const r = res[+c.dataset.i];
      c.classList.add('sel'); $('cp-n').textContent = 'Descargando y aplicando…';
      try { await api(`/songs/${enc(id)}/cover`, { method: 'POST', json: { url: r.art, album: r.album, year: r.year } }); closeModal(); toast('Carátula cambiada'); songSheet(id).catch(fail); } catch (err) { fail(err); }
    };
    go();
  }

  // Canción nueva: carpeta + ficheros (.txt UltraStar, audio, portada…). Después, Megamix y volumen.
  function newSong() {
    const b = modal(`<h3>Canción nueva</h3>
      <p class="small muted">Elige los ficheros de la canción en formato UltraStar: el <b>.txt</b>, el audio (<b>.mp3</b>) y, si hay, la portada y el vídeo. La carpeta se llama «Artista - Título».</p>
      <label class="lbl">Ficheros</label><input type="file" id="n-f" multiple class="inp">
      <label class="lbl">Carpeta</label><input class="inp" id="n-id" placeholder="Artista - Título">
      <label class="row small" style="margin-top:12px"><input type="checkbox" id="n-mm" checked> Detectar el estribillo para el Megamix</label>
      <label class="row small"><input type="checkbox" id="n-no" checked> Igualar el volumen (−12 LUFS)</label>
      <div class="progress"><i id="n-p"></i></div><p class="small muted" id="n-st"></p>
      <div class="row" style="margin-top:14px"><button class="btn red" id="n-go">Subir</button><button class="btn ghost" id="n-x">Cancelar</button></div>`);
    $('n-x').onclick = closeModal;
    $('n-f').onchange = async () => {
      const txt = [...$('n-f').files].find(f => /\.txt$/i.test(f.name));
      if (!txt || $('n-id').value) return;
      const t = await txt.text();
      const g = k => (t.match(new RegExp('^#' + k + ':(.*)$', 'mi')) || [])[1]?.trim();
      if (g('ARTIST') && g('TITLE')) $('n-id').value = `${g('ARTIST')} - ${g('TITLE')}`.replace(/[\/\\]/g, '-');
    };
    $('n-go').onclick = async () => {
      const files = [...$('n-f').files], id = $('n-id').value.trim();
      if (!files.length || !id) return toast('Elige ficheros y nombre de carpeta', true);
      if (!files.some(f => /\.txt$/i.test(f.name))) return toast('Falta el .txt de la canción', true);
      if (songs && songs.some(s => s.id === id)) return toast('Ya existe una canción con esa carpeta', true);
      $('n-go').disabled = true;
      const total = files.reduce((a, f) => a + f.size, 0); let done = 0;
      for (const f of files) {
        $('n-st').textContent = `Subiendo ${f.name}…`;
        try { await api(`/songs/${enc(id)}/files/${enc(f.name)}`, { method: 'PUT', raw: f }); } catch (e) { fail(e); $('n-go').disabled = false; return; }
        done += f.size; $('n-p').style.width = (done / total * 100) + '%';
      }
      try {
        if ($('n-no').checked) { $('n-st').textContent = 'Igualando el volumen…'; await api(`/songs/${enc(id)}/normalize`, { method: 'POST', json: {} }); }
        if ($('n-mm').checked) { $('n-st').textContent = 'Buscando el estribillo…'; await api(`/songs/${enc(id)}/megamix`, { method: 'POST', json: { mode: 'auto' } }).catch(() => {}); }
      } catch (e) { fail(e); }
      closeModal(); toast('Canción añadida'); location.hash = 'canciones/' + enc(id);
    };
  }

  async function retiradas() {
    const v = $('view');
    v.innerHTML = `<button class="btn ghost sm back" data-go="canciones">← Canciones</button><div class="head"><h1>Retiradas</h1><span class="sub" id="rt-sub"></span></div><div id="rt"></div>`;
    const draw = async () => {
      const l = await api('/retired');
      $('rt-sub').textContent = `${l.length} canciones · ${mb(l.reduce((a, x) => a + x.size, 0))}`;
      $('rt').innerHTML = l.length ? `<table class="tbl"><tbody>${l.map(x => `<tr><td><div class="t-title">${esc(x.title)}</div><div class="t-art">${esc(x.artist)} · ${esc(x.id)}</div></td><td class="r small">${mb(x.size)}</td><td class="r small muted">${new Date(x.at).toLocaleString('es-ES')}</td><td class="r"><button class="btn sm" data-r="${esc(x.id)}">Restaurar</button> <button class="btn sm danger" data-d="${esc(x.id)}">Borrar para siempre</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">No hay canciones retiradas.</div>';
    };
    $('rt').onclick = async e => {
      const r = e.target.closest('[data-r]'), d = e.target.closest('[data-d]');
      try {
        if (r) { await api(`/retired/${enc(r.dataset.r)}/restore`, { method: 'POST', json: {} }); toast('Restaurada'); }
        if (d && await ask('¿Borrar para siempre?', `«${esc(d.dataset.d)}» se borra del servidor. No se puede deshacer.`, 'Borrar')) { await api(`/retired/${enc(d.dataset.d)}`, { method: 'DELETE' }); toast('Borrada'); }
        draw();
      } catch (err) { fail(err); }
    };
    draw();
  }

  // ------------------------------------------------------------------ Creación de canciones (trabajador en el propio servidor)
  const IDIOMAS = { es: 'Castellano', en: 'Inglés', ca: 'Catalán', fr: 'Francés', it: 'Italiano', pt: 'Portugués', de: 'Alemán', gl: 'Gallego', eu: 'Euskera' };
  // Buscar la letra (LRCLIB y, de reserva, Genius y songlyrics) y ponerla en el cuadro
  async function buscarLetraUI(dur) {
    const a = $('k-art').value.trim(), ti = $('k-tit').value.trim(), box = $('k-letra'), st = $('k-lst');
    if (!a || !ti) return toast('Pon antes el artista y el título', true);
    if (box.value.trim() && !confirm('¿Cambiar la letra que hay por la que se encuentre?')) return;
    st.textContent = 'Buscando…';
    try {
      const r = await api(`/letras?artista=${enc(a)}&titulo=${enc(ti)}${dur ? '&duracion=' + dur : ''}`);
      box.value = r.texto;
      st.textContent = `Encontrada en ${r.fuente}${r.sincronizada ? ' (sincronizada)' : ''} · ${r.texto.split('\n').length} líneas. Revísala: cada línea será una frase en la tele.`;
    } catch (e) { st.textContent = e.message; }
  }

  // Importar desde Spotify: SOLO una canción suelta; se descarga y queda en Borradores (en Creación)
  function importarSpotify() {
    modal(`<h3>Crear canción</h3>
      <div class="chips" style="margin:6px 0 14px"><button class="chip" id="t-up">Subir audio</button><button class="chip on">Importar desde Spotify</button></div>
      <p class="small muted">Pega el enlace de <b>una canción</b> de Spotify (en la app: Compartir → Copiar enlace de la canción). No se admiten álbumes, listas ni artistas.
      La canción se descarga y queda en <b>Borradores</b>, en el apartado Creación, para seguir cuando quieras (falta pegar la letra).</p>
      <label class="lbl">Enlace de la canción</label><input class="inp" id="sp-url" placeholder="https://open.spotify.com/track/…">
      <p class="small muted" id="sp-st"></p>
      <div class="row" style="margin-top:12px"><button class="btn red" id="sp-go">Descargar</button><button class="btn ghost" id="sp-x">Cancelar</button></div>`);
    $('t-up').onclick = crearCancion; $('sp-x').onclick = closeModal; $('sp-url').focus();
    const ok = u => /^(https?:\/\/open\.spotify\.com\/(intl-[a-z-]+\/)?track\/|spotify:track:)[A-Za-z0-9]{22}/.test(u.trim());
    $('sp-url').oninput = () => { const u = $('sp-url').value.trim(); $('sp-st').textContent = !u || ok(u) ? '' : /spotify/i.test(u) ? 'Solo enlaces de una canción (…/track/…), no de álbum, lista ni artista.' : 'No parece un enlace de Spotify.'; };
    const go = async () => {
      const url = $('sp-url').value.trim();
      if (!ok(url)) return toast('Pega el enlace de una canción de Spotify', true);
      $('sp-go').disabled = true;
      try { await api('/jobs', { method: 'POST', json: { kind: 'spotify', url } }); closeModal(); toast('Descargando: quedará en Borradores'); location.hash = 'creacion'; }
      catch (e) { fail(e); $('sp-go').disabled = false; }
    };
    $('sp-go').onclick = go; $('sp-url').onkeydown = e => { if (e.key === 'Enter') go(); };
  }
  // Continuar un borrador (audio ya descargado): datos + letra → a la cola de creación
  async function continuarBorrador(j) {
    let letra = '';
    try { letra = await (await fetch(`/api/admin/jobs/${j.id}/letra`)).text(); if (letra.startsWith('{')) letra = ''; } catch {}
    modal(`<h3>Continuar: ${esc(j.titulo)}</h3>
      <div class="row" style="align-items:flex-start;gap:14px"><img src="/api/admin/jobs/${j.id}/portada" style="width:120px;height:120px;object-fit:cover;border:2px solid var(--ink);background:var(--n2)" alt="">
        <div class="grow"><p class="small muted" style="margin:0 0 6px">De Spotify${j.album ? ' · ' + esc(j.album) : ''}${j.duracion ? ' · ' + mmss(j.duracion) : ''}</p>
        <audio controls preload="none" src="/api/admin/jobs/${j.id}/audio"></audio>
        ${j.dup ? `<p class="small red-t">Ya hay una canción igual en la biblioteca: <a href="#canciones/${enc(j.dup)}">${esc(j.dup)}</a></p>` : ''}</div></div>
      <div class="grid2"><div><label class="lbl">Artista</label><input class="inp" id="k-art" value="${esc(j.artista)}"></div><div><label class="lbl">Título</label><input class="inp" id="k-tit" value="${esc(j.titulo)}"></div></div>
      <div class="grid2"><div><label class="lbl">Idioma de la letra</label><select class="inp" id="k-lang">${Object.entries(IDIOMAS).map(([k, v]) => `<option value="${k}" ${k === (j.idioma || 'es') ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div><label class="lbl">Año</label><input class="inp" id="k-year" maxlength="4" value="${esc(j.anio || '')}"></div></div>
      <div class="row" style="justify-content:space-between;align-items:flex-end"><label class="lbl">Letra · una frase por línea (como se verá en la tele)</label><button class="btn sm" id="k-buscar" type="button">Buscar la letra</button></div><p class="small muted" id="k-lst" style="margin:0 0 6px"></p><textarea class="inp" id="k-letra" rows="12">${esc(letra)}</textarea>
      <div class="row" style="margin-top:12px"><button class="btn red" id="k-go">Crear</button><button class="btn" id="k-save">Guardar y seguir luego</button><button class="btn ghost" id="k-x">Cerrar</button></div>`);
    $('k-buscar').onclick = () => buscarLetraUI(j.duracion);
    if (j.letraFuente && letra) $('k-lst').textContent = `Letra encontrada en ${j.letraFuente}. Revísala: cada línea será una frase en la tele.`;
    else if (!letra) $('k-lst').textContent = 'No se encontró la letra automáticamente: pulsa «Buscar la letra» o pégala.';
    const datos = () => ({ artista: $('k-art').value, titulo: $('k-tit').value, idioma: $('k-lang').value, anio: $('k-year').value, letra: $('k-letra').value });
    $('k-x').onclick = closeModal;
    $('k-save').onclick = async () => { try { await api(`/jobs/${j.id}`, { method: 'PATCH', json: datos() }); closeModal(); toast('Guardado en Borradores'); route(); } catch (e) { fail(e); } };
    $('k-go').onclick = async () => { try { await api(`/jobs/${j.id}/continuar`, { method: 'POST', json: datos() }); closeModal(); toast('En la cola de creación'); route(); } catch (e) { fail(e); } };
  }
  function crearCancion() {
    const b = modal(`<h3>Crear canción</h3>
      <div class="chips" style="margin:6px 0 14px"><button class="chip on">Subir audio</button><button class="chip" id="t-sp">Importar desde Spotify</button></div>
      <p class="small muted">Sube el audio y pega la letra: el servidor separa la voz, encaja cada sílaba en su sitio y saca las notas. Queda <b>sin publicar</b> para revisarla en el editor antes de que salga en la tele.</p>
      <div class="grid2"><div><label class="lbl">Artista</label><input class="inp" id="k-art"></div><div><label class="lbl">Título</label><input class="inp" id="k-tit"></div></div>
      <div class="grid2"><div><label class="lbl">Idioma de la letra</label><select class="inp" id="k-lang">${Object.entries(IDIOMAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div><div><label class="lbl">Año</label><input class="inp" id="k-year" maxlength="4" placeholder="opcional"></div></div>
      <label class="lbl">Audio (MP3, M4A, WAV…)</label><input type="file" id="k-audio" accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg" class="inp">
      <div class="row" style="justify-content:space-between;align-items:flex-end"><label class="lbl">Letra · una frase por línea (como se verá en la tele)</label><button class="btn sm" id="k-buscar" type="button">Buscar la letra</button></div><p class="small muted" id="k-lst" style="margin:0 0 6px"></p><textarea class="inp" id="k-letra" rows="12" placeholder="Cada línea será una frase en pantalla.
Las líneas vacías no cuentan."></textarea>
      <div class="progress"><i id="k-p"></i></div><p class="small muted" id="k-st"></p>
      <div class="row" style="margin-top:12px"><button class="btn red" id="k-go">Crear</button><button class="btn ghost" id="k-x">Cancelar</button></div>`);
    $('k-x').onclick = closeModal;
    $('t-sp').onclick = importarSpotify;
    $('k-buscar').onclick = () => buscarLetraUI(0);
    $('k-audio').onchange = () => {
      const f = $('k-audio').files[0]; if (!f || $('k-tit').value) return;
      const m = f.name.replace(/\.[^.]+$/, '').split(/\s+-\s+/);
      if (m.length >= 2) { $('k-art').value = $('k-art').value || m[0]; $('k-tit').value = m.slice(1).join(' - '); }
    };
    $('k-go').onclick = async () => {
      const f = $('k-audio').files[0];
      if (!f) return toast('Elige el audio', true);
      $('k-go').disabled = true;
      try {
        $('k-st').textContent = 'Creando el trabajo…';
        const j = await api('/jobs', { method: 'POST', json: { kind: 'crear', artista: $('k-art').value, titulo: $('k-tit').value, idioma: $('k-lang').value, anio: $('k-year').value, letra: $('k-letra').value } });
        $('k-st').textContent = `Subiendo el audio (${mb(f.size)})…`;
        await new Promise((res, rej) => {   // con barra de progreso
          const x = new XMLHttpRequest(); x.open('PUT', `/api/admin/jobs/${j.id}/audio`); x.setRequestHeader('x-name', f.name);
          x.upload.onprogress = e => { if (e.lengthComputable) $('k-p').style.width = (e.loaded / e.total * 100) + '%'; };
          x.onload = () => x.status < 300 ? res() : rej(new Error((JSON.parse(x.responseText || '{}').error) || 'Error ' + x.status)); x.onerror = () => rej(new Error('Sin conexión'));
          x.send(f);
        });
        closeModal(); toast('En la cola de creación'); location.hash = 'creacion';
      } catch (e) { fail(e); $('k-go').disabled = false; }
    };
  }
  const ESTADO = { borrador: ['Borrador', 'warn'], subiendo: ['Subiendo', 'no'], pendiente: ['En cola', 'warn'], procesando: ['Procesando', 'red'], hecho: ['Hecho', 'ok'], error: ['Error', 'red'] };
  VIEWS.creacion = async () => {
    const v = $('view');
    v.innerHTML = `<div class="head"><h1>Creación</h1><span class="sub"><button class="btn red" id="j-new">✨ Crear canción</button></span></div>
      <div class="card" id="j-w"></div><h2 class="sec">Borradores</h2><div id="j-b"></div><h2 class="sec">Trabajos</h2><div id="j-l"></div>`;
    $('j-new').onclick = crearCancion;
    v.onclick = async e => {
      const b = e.target.closest('[data-j]'); if (!b) return;
      const id = b.dataset.j, a = b.dataset.a;
      try {
        if (a === 'cont') { const d = await api('/jobs'); const j = d.jobs.find(x => x.id === id); if (j) continuarBorrador(j); return; }
        if (a === 'retry') await api(`/jobs/${id}/retry`, { method: 'POST', json: {} });
        if (a === 'del' && await ask('¿Borrar este trabajo?', 'Se borra de la cola con sus ficheros (la canción, si ya se creó, se queda).')) await api(`/jobs/${id}`, { method: 'DELETE' });
        if (a === 'token') {
          if (!await ask('¿Clave nueva para el trabajador?', 'La anterior deja de valer: habrá que ponerla en la configuración del trabajador (/opt/gramola-trabajador/config.json).', 'Generar', false)) return;
          const r = await api('/worker/token', { method: 'POST', json: {} });
          modal(`<h3>Clave del trabajador</h3><p class="small">Cópiala ahora: no se vuelve a mostrar.</p><pre class="out">${esc(r.token)}</pre><button class="btn" data-go="creacion">Cerrar</button>`);
          $('modal-box').querySelector('[data-go]').onclick = closeModal;
        }
        draw();
      } catch (err) { fail(err); }
    };
    async function draw() {
      const d = await api('/jobs'), w = d.worker, vivo = w.seen && Date.now() - w.seen < 45000;
      $('nav-jobs').textContent = d.jobs.filter(j => ['pendiente', 'procesando'].includes(j.state)).length || '';
      $('j-w').innerHTML = `<div class="row"><span class="dot ${vivo ? 'on' : ''}"></span><b>${vivo ? 'Trabajador conectado' : 'Trabajador sin conexión'}</b>
        <span class="muted small">${w.seen ? `${esc(w.host || 'servidor')} · último contacto ${ago(w.seen)}${w.version ? ' · v' + esc(w.version) : ''}` : w.configured ? 'Aún no se ha conectado' : 'Sin clave configurada'}</span>
        <span class="grow"></span><button class="btn sm ghost" data-j="-" data-a="token">Clave del trabajador</button></div>
        ${vivo ? '' : '<p class="small muted" style="margin:8px 0 0">El trabajador corre en el propio servidor (servicio gramola-trabajador). Si no está conectado, los trabajos esperan en la cola.</p>'}`;
      const bor = d.jobs.filter(j => j.state === 'borrador'), resto = d.jobs.filter(j => j.state !== 'borrador');
      const firmaB = JSON.stringify(bor.map(j => [j.id, j.titulo, j.artista, j.dup, j.updated, j.letraFuente]));
      if (firmaB !== draw.firmaB) {   // no se repinta si no cambia (para no cortar el audio de la vista previa)
        draw.firmaB = firmaB;
        $('j-b').innerHTML = bor.length ? `<table class="tbl"><tbody>${bor.map(j => `<tr><td style="width:64px"><img class="cov" style="width:52px;height:52px" src="/api/admin/jobs/${j.id}/portada" alt=""></td>
          <td><div class="t-title">${esc(j.titulo)}</div><div class="t-art">${esc(j.artista)}${j.album ? ' · ' + esc(j.album) : ''}${j.anio ? ' (' + esc(j.anio) + ')' : ''}</div>${j.dup ? `<div class="small red-t">Ya está en la biblioteca: ${esc(j.dup)}</div>` : ''}</td>
          <td class="small muted">De Spotify · ${ago(j.finished || j.created)}<br>${j.letraFuente ? 'Letra: ' + esc(j.letraFuente) : '<span class="red-t">Sin letra</span>'}</td>
          <td class="r"><button class="btn sm red" data-j="${j.id}" data-a="cont">Continuar</button> <button class="btn sm danger" data-j="${j.id}" data-a="del">Borrar</button></td></tr>`).join('')}</tbody></table>`
          : '<div class="empty">No hay borradores. «Crear canción → Importar desde Spotify» deja aquí la canción descargada para seguir cuando quieras.</div>';
      }
      d.jobs = resto;
      $('j-l').innerHTML = d.jobs.length ? `<table class="tbl"><thead><tr><th>Canción</th><th>Tipo</th><th>Estado</th><th>Pedido</th><th></th></tr></thead><tbody>${d.jobs.map(j => {
        const [et, ec] = ESTADO[j.state] || [j.state, 'no'];
        return `<tr><td><div class="t-title">${esc(j.titulo)}</div><div class="t-art">${esc(j.artista)}${j.idioma ? ' · ' + esc(IDIOMAS[j.idioma] || j.idioma) : ''}</div></td>
          <td class="small">${j.kind === 'crear' ? 'Crear canción' + (j.origen === 'spotify' ? ' (Spotify)' : '') : j.kind === 'spotify' ? 'Descargar de Spotify' : 'Analizar voz'}</td>
          <td style="min-width:220px"><span class="badge ${ec}">${et}</span> ${j.state === 'procesando' ? `<div class="progress" style="margin-top:6px"><i style="width:${j.progress || 0}%"></i></div><span class="small muted">${esc(j.msg || '')}</span>` : j.state === 'error' ? `<div class="small red-t" style="margin-top:4px;max-width:420px;overflow-wrap:anywhere">${esc((j.error || '').slice(-300))}</div>` : j.state === 'hecho' ? `<span class="small muted">${esc(j.msg || '')}${j.finished && j.started ? ' · ' + dur((j.finished - j.started) / 1000) : ''}</span>` : ''}</td>
          <td class="small muted">${ago(j.created)}</td>
          <td class="r">${j.state === 'hecho' && j.song ? `<a class="btn sm dark" href="#editor/${enc(j.song)}">Editor</a> <a class="btn sm" href="#canciones/${enc(j.song)}">Ficha</a> ` : ''}${j.state === 'error' ? `<button class="btn sm" data-j="${j.id}" data-a="retry">Reintentar</button> ` : ''}<button class="btn sm danger" data-j="${j.id}" data-a="del">Borrar</button></td></tr>`;
      }).join('')}</tbody></table>` : '<div class="empty">No hay trabajos. Pulsa «Crear canción» para empezar.</div>';
    }
    every(draw, 3000);
  };

  // ------------------------------------------------------------------ Editor de canciones
  VIEWS.editor = async ([id]) => {
    if (!id) { location.hash = 'canciones'; return; }
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === 'canciones'));
    editor = await GramolaEditor.open($('view'), id, api, toast);
  };

  // ------------------------------------------------------------------ 04 · Récords
  VIEWS.records = async () => {
    const v = $('view');
    v.innerHTML = `<div class="head"><h1>Récords</h1><span class="sub"><button class="btn sm danger" id="rc-reset">Vaciar el Salón de la fama</button></span></div>
      <div class="grid2"><div><h2 class="sec" style="margin-top:0">Cantantes</h2><input class="inp" id="rc-q" placeholder="Buscar cantante" style="margin-bottom:10px"><div id="rc-s"></div></div>
      <div><h2 class="sec" style="margin-top:0">Récord por canción</h2><div id="rc-r"></div></div></div>`;
    let rec;
    const draw = async () => {
      rec = await api('/records');
      const q = ($('rc-q').value || '').toLowerCase();
      const sg = Object.entries(rec.singers || {}).filter(([n]) => n.toLowerCase().includes(q)).sort((a, b) => b[1].best - a[1].best);
      $('rc-s').innerHTML = sg.length ? `<table class="tbl"><thead><tr><th>Cantante</th><th class="r">Canciones</th><th class="r">Mejor</th><th class="r">Racha</th><th></th></tr></thead><tbody>${sg.map(([n, x]) => `<tr><td class="t-title">${esc(n)}</td><td class="r">${x.songs}</td><td class="r">${nf(x.best)}</td><td class="r">${x.streak}</td><td class="r"><button class="btn sm ghost" data-ren="${esc(n)}">Renombrar</button> <button class="btn sm danger" data-del="${esc(n)}">Borrar</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin cantantes.</div>';
      const rs = Object.entries(rec.songs || {}).filter(([, x]) => x).sort((a, b) => b[1].score - a[1].score);
      $('rc-r').innerHTML = rs.length ? `<table class="tbl"><thead><tr><th>Canción</th><th>Quién</th><th class="r">Puntos</th><th></th></tr></thead><tbody>${rs.map(([id, x]) => `<tr><td><div class="t-title">${esc(x.title || id)}</div><div class="t-art">${esc(x.artist || '')} · ${esc(x.date)}</div></td><td>${esc(x.name)}</td><td class="r">${nf(x.score)}</td><td class="r"><button class="btn sm danger" data-rs="${esc(id)}">Borrar</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin récords.</div>';
    };
    $('rc-q').oninput = draw;
    v.onclick = async e => {
      const ren = e.target.closest('[data-ren]'), del = e.target.closest('[data-del]'), rs = e.target.closest('[data-rs]');
      try {
        if (ren) { const to = await prompt2('Renombrar cantante', 'Nombre nuevo (si ya existe, se fusionan)', ren.dataset.ren); if (to && to !== ren.dataset.ren) { await api('/records/rename-singer', { method: 'POST', json: { from: ren.dataset.ren, to } }); toast('Renombrado'); draw(); } }
        if (del && await ask(`¿Borrar a ${del.dataset.del}?`, 'Se borra del Salón de la fama con sus récords de canción.')) { await api('/records/singer/' + enc(del.dataset.del), { method: 'DELETE' }); toast('Borrado'); draw(); }
        if (rs && await ask('¿Borrar este récord?', esc(rs.dataset.rs))) { await api('/records/song/' + enc(rs.dataset.rs), { method: 'DELETE' }); toast('Borrado'); draw(); }
        if (e.target.id === 'rc-reset') {
          const c = await prompt2('Vaciar el Salón de la fama', 'Escribe BORRAR para confirmar (se guarda una copia en los datos del servidor)', '', 'Vaciar');
          if (c) { await api('/records/reset', { method: 'POST', json: { confirm: c } }); toast('Vaciado'); draw(); }
        }
      } catch (err) { fail(err); }
    };
    draw();
  };

  // ------------------------------------------------------------------ 05 · Actividad
  VIEWS.actividad = async () => {
    const v = $('view');
    let kind = '';
    v.innerHTML = `<div class="head"><h1>Actividad</h1><span class="sub" id="a-sub"></span></div>
      <div class="tools"><div class="chips" id="a-k"><button class="chip on" data-k="">Todo</button>${Object.entries(KIND).map(([k, t]) => `<button class="chip" data-k="${k}">${t}</button>`).join('')}</div><input class="inp" id="a-q" placeholder="Filtrar texto"></div>
      <div class="evs" id="a-l"></div>`;
    let all = [];
    const draw = () => { const q = $('a-q').value.toLowerCase(); const l = all.filter(e => (!kind || e.kind === kind) && (!q || e.text.toLowerCase().includes(q))); $('a-sub').textContent = `${l.length} eventos`; $('a-l').innerHTML = evRows(l) || '<div class="empty">Nada.</div>'; };
    $('a-k').onclick = e => { const c = e.target.closest('[data-k]'); if (!c) return; kind = c.dataset.k; $('a-k').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); draw(); };
    $('a-q').oninput = draw;
    every(async () => { all = await api('/events'); draw(); }, 5000);
  };

  // ------------------------------------------------------------------ 06 · Servidor
  VIEWS.servidor = async () => {
    const v = $('view');
    v.innerHTML = `<div class="head"><h1>Servidor</h1><span class="sub"><a class="btn sm" href="/api/admin/backup">Descargar copia de los datos</a> <button class="btn sm danger" id="sv-rs">Reiniciar el servicio</button></span></div>
      <div class="kpis" id="sv-k"></div><h2 class="sec">Detalles</h2><div class="card"><dl class="facts" id="sv-d"></dl></div>
      <h2 class="sec">Rendimiento de las teles (telemetría)</h2><div id="sv-t"></div>`;
    $('sv-rs').onclick = async () => {
      if (!await ask('¿Reiniciar el servicio?', 'Las salas abiertas se pierden: las teles vuelven a crear sala y los móviles tienen que volver a entrar.', 'Reiniciar')) return;
      try { await api('/server/restart', { method: 'POST', json: {} }); toast('Reiniciando…'); setTimeout(route, 4000); } catch (e) { fail(e); }
    };
    every(async () => {
      const s = await api('/server');
      const memUsed = s.memTotal - s.memFree;
      $('sv-k').innerHTML = [
        ['Versión', s.version, ''], ['Encendido', dur(s.uptime), 'desde el último reinicio'], ['Conexiones', s.sockets, 'teles y móviles'],
        ['Carga', s.load[0].toFixed(2), `${s.cpus} núcleos · 5 min ${s.load[1].toFixed(2)}`], ['Memoria del juego', mb(s.rss), `montón ${mb(s.heap)}`],
        ['Memoria de la máquina', Math.round(memUsed / s.memTotal * 100) + ' %', `${mb(memUsed)} de ${mb(s.memTotal)}`],
        ['Disco libre', s.disk ? mb(s.disk.free) : '—', s.disk ? `de ${mb(s.disk.total)}` : ''], ['Canciones', mb(s.sizes.songs), `retiradas ${mb(s.sizes.retired)}`],
      ].map(([k, x, sub]) => `<div class="kpi"><div class="k">${k}</div><div class="v" style="font-size:${String(x).length > 10 ? 20 : 28}px">${x}</div><div class="s">${sub}</div></div>`).join('');
      $('sv-d').innerHTML = [['Máquina', s.host], ['Node', s.node], ['Proceso', s.pid], ['Máquina encendida', dur(s.osUptime)], ['Datos', mb(s.sizes.data)], ['ffmpeg', s.ffmpeg ? 'instalado' : 'no (no se puede cortar Megamix ni igualar volumen)']].map(([k, x]) => `<dt>${k}</dt><dd>${esc(x)}</dd>`).join('');
    }, 5000);
    const t = await api('/telemetry');
    $('sv-t').innerHTML = t.length ? `<table class="tbl"><thead><tr><th>Cuándo</th><th>Pantalla</th><th class="r">FPS</th><th class="r">p95</th><th class="r">Peor</th><th class="r">Memoria</th><th class="r">Cantantes</th><th>Aparato</th></tr></thead><tbody>${t.map(x => `<tr><td class="small">${esc(new Date(x.t).toLocaleString('es-ES'))}</td><td>${esc(x.screen)}</td><td class="r">${esc(x.fps)}</td><td class="r">${esc(x.p95)}</td><td class="r">${esc(x.worst)}</td><td class="r">${esc(x.heap)}</td><td class="r">${esc(x.singers)}</td><td class="small">${esc(device(x.ua))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Sin datos de rendimiento (se envían desde la app de la tele).</div>';
  };

  // ------------------------------------------------------------------ 07 · Seguridad
  VIEWS.seguridad = async () => {
    const v = $('view');
    v.innerHTML = `<div class="head"><h1>Seguridad</h1></div>
      <h2 class="sec" style="margin-top:0">Llaves de Touch ID</h2><div id="k-l"></div>
      <div class="row" style="margin-top:10px"><input class="inp sm" id="k-n" placeholder="Nombre (p. ej. iPhone)"><button class="btn dark" id="k-add">Añadir llave</button><span class="small muted" id="k-h"></span></div>
      <h2 class="sec">Sesiones abiertas</h2><div id="k-s"></div><div class="row" style="margin-top:10px"><button class="btn danger" id="k-rev">Cerrar las demás sesiones</button></div>`;
    const draw = async () => {
      const d = await api('/auth/keys');
      $('k-h').textContent = d.fresh ? '' : 'Para añadir una llave, sal y vuelve a entrar (tiene que ser una entrada de hace menos de 10 min).';
      $('k-add').disabled = !d.fresh;
      $('k-l').innerHTML = `<table class="tbl"><tbody>${d.keys.map(k => `<tr><td class="t-title">${esc(k.name)}${k.current ? ' <span class="badge ok">esta</span>' : ''}</td><td class="small muted">alta ${new Date(k.at).toLocaleString('es-ES')}</td><td class="small muted">último uso ${k.used ? ago(k.used) : '—'}</td><td class="r"><button class="btn sm danger" data-k="${esc(k.id)}">Borrar</button></td></tr>`).join('')}</tbody></table>`;
      $('k-s').innerHTML = `<table class="tbl"><tbody>${d.sessions.map(s => `<tr><td>${esc(device(s.ua))}${s.current ? ' <span class="badge ok">esta</span>' : ''}</td><td class="small">${esc(s.ip)}</td><td class="small muted">entró ${ago(s.at)}</td><td class="small muted">caduca ${new Date(s.exp).toLocaleString('es-ES')}</td></tr>`).join('')}</tbody></table>`;
    };
    $('k-add').onclick = async () => {
      try {
        const o = await api('/auth/register/options', { method: 'POST', json: {} });
        const response = await WebAuthn.register(o);
        await api('/auth/register/verify', { method: 'POST', json: { response, name: $('k-n').value || 'Llave' } });
        toast('Llave añadida'); draw();
      } catch (e) { fail(e.name === 'NotAllowedError' ? new Error('Cancelado') : e); }
    };
    $('k-l').onclick = async e => { const b = e.target.closest('[data-k]'); if (b && await ask('¿Borrar esta llave?', 'Ya no se podrá entrar con ella.')) try { await api('/auth/keys/' + enc(b.dataset.k), { method: 'DELETE' }); toast('Borrada'); draw(); } catch (err) { fail(err); } };
    $('k-rev').onclick = async () => { try { const r = await api('/auth/revoke-others', { method: 'POST', json: {} }); toast(`${r.closed} sesiones cerradas`); draw(); } catch (e) { fail(e); } };
    draw();
  };

  start().catch(e => { $('login').hidden = false; $('login-msg').textContent = e.message; });
})();
