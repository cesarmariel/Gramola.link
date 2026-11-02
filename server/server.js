// Servidor de salas de Gramola (karaoke: la tele es el escenario, el móvil es el micro).
// - WebSocket /ws: une la pantalla de la tele (host) con los móviles (micros).
// - GET  /api/songs:   canciones UltraStar de SONGS_DIR (con datos para filtros).
// - GET  /api/records: salón de la fama.  POST /api/records: la tele guarda una partida.
// - Ficheros estáticos de la web (con Range para el audio).
// El protocolo está descrito en docs/PROTOCOLO.md.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8877);
const HOST = process.env.HOST || '127.0.0.1';
const WEB_DIR = process.env.WEB_DIR || path.join(__dirname, '..', 'web');
const SONGS_DIR = process.env.SONGS_DIR || path.join(WEB_DIR, 'songs');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SERVE_STATIC = process.env.SERVE_STATIC !== '0';
const MAX_PLAYERS = 8;
const ROOM_TTL_MS = 15 * 60 * 1000; // la sala aguanta 15 min sin tele conectada
// Un color por micro: J1..J8
const COLORS = ['#ff4fa3', '#3fd0ff', '#ffd23f', '#7cff6b', '#b38cff', '#ff8a3d', '#4fffd8', '#ff5a5a'];

// ======================================================================= canciones
function readText(file) {
  const buf = fs.readFileSync(file);
  const utf8 = buf.toString('utf8');
  // Muchos .txt de UltraStar van en Windows-1252: si el UTF-8 tiene caracteres rotos, usar latin1.
  return utf8.includes('�') ? buf.toString('latin1') : utf8.replace(/^﻿/, '');
}

const num = s => parseFloat(String(s || '0').replace(',', '.')) || 0;
let songsCache = { at: 0, list: [] };
// Novedades: canciones marcadas desde la administración para que salgan primero en la tele ({ id: fecha })
const NEW_FILE = path.join(DATA_DIR, 'novedades.json');
let novedades = {}, novedadesMtime = 0;
try { novedades = JSON.parse(fs.readFileSync(NEW_FILE, 'utf8')) || {}; } catch {}
function saveNovedades() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(NEW_FILE + '.tmp', JSON.stringify(novedades));
  fs.renameSync(NEW_FILE + '.tmp', NEW_FILE);
  try { novedadesMtime = fs.statSync(NEW_FILE).mtimeMs; } catch {}
  songsCache.at = 0;
}

// Tramo para el Megamix: megamix.mp3 (estribillo recortado por tools/megamix.py) + megamix.json con los tiempos
function mtimeOf(f) { try { return Math.round(fs.statSync(f).mtimeMs / 1000).toString(36); } catch { return '0'; } }

function megamixOf(dir, base) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'megamix.json'), 'utf8'));
    if (!fs.existsSync(path.join(dir, j.file || 'megamix.mp3'))) return null;
    return { url: base + encodeURIComponent(j.file || 'megamix.mp3'), offset: j.offset, start: j.start, end: j.end };
  } catch { return null; }
}

function scanSongs(force) {
  if (!force && Date.now() - songsCache.at < 5000) return songsCache.list;
  // Si novedades.json se ha cambiado por fuera (por ejemplo, al subir canciones por SSH), se vuelve a leer
  try { const m = fs.statSync(NEW_FILE).mtimeMs; if (m !== novedadesMtime) { novedades = JSON.parse(fs.readFileSync(NEW_FILE, 'utf8')) || {}; novedadesMtime = m; } } catch {}
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(SONGS_DIR, { withFileTypes: true }).filter(d => d.isDirectory()); } catch { dirs = []; }
  for (const d of dirs) {
    const dir = path.join(SONGS_DIR, d.name);
    let txt;
    try { txt = fs.readdirSync(dir).find(f => f.toLowerCase().endsWith('.txt')); } catch { continue; }
    if (!txt) continue;
    let text;
    try { text = readText(path.join(dir, txt)); } catch { continue; }
    const head = {};
    let notes = 0, lastBeat = 0, minP = Infinity, maxP = -Infinity, duet = false, sumLen = 0;
    for (const line of text.split(/\r?\n/)) {
      const h = line.match(/^#([A-Z0-9]+):(.*)$/i);
      if (h) { head[h[1].toUpperCase()] = h[2].trim(); continue; }
      if (/^P\s*2/.test(line)) duet = true;
      const m = line.match(/^[:*FRG]\s*(-?\d+)\s+(\d+)\s+(-?\d+)/);
      if (m) {
        notes++;
        lastBeat = Math.max(lastBeat, +m[1] + +m[2]);
        minP = Math.min(minP, +m[3]); maxP = Math.max(maxP, +m[3]);
        sumLen += +m[2];
      }
    }
    const bpm = num(head.BPM);
    const beatMs = bpm ? 60000 / (bpm * 4) : 0;
    const durationMs = beatMs ? num(head.GAP) + lastBeat * beatMs + 4000 : 0;
    // Dificultad 1–3: notas por segundo y amplitud del registro
    const nps = durationMs ? notes / (durationMs / 1000) : 0;
    const range = isFinite(maxP) ? maxP - minP : 0;
    const difficulty = Math.max(1, Math.min(3, Math.round(nps / 1.4 + range / 12)));
    const base = 'songs/' + encodeURIComponent(d.name) + '/';
    out.push({
      id: d.name,
      title: head.TITLE || d.name,
      artist: head.ARTIST || '',
      year: parseInt(head.YEAR, 10) || null,
      language: head.LANGUAGE || '',
      genre: head.GENRE || '',
      duration: Math.round(durationMs / 1000),
      difficulty,
      notes,
      duet: duet || !!head.P1 || !!head.DUETSINGERP1,
      txt: base + encodeURIComponent(txt),
      // ?v=fecha del fichero: si cambia la portada (mismo nombre), cambia la dirección y la tele no tira de caché
      cover: head.COVER ? base + encodeURIComponent(head.COVER) + '?v=' + mtimeOf(path.join(dir, head.COVER)) : null,
      hasVideo: !!head.VIDEO,
      megamix: megamixOf(dir, base),
      isNew: !!novedades[d.name],
      draft: fs.existsSync(path.join(dir, 'borrador.json')),
      newAt: novedades[d.name] || null,
    });
  }
  out.sort((a, b) => a.title.localeCompare(b.title, 'es'));
  songsCache = { at: Date.now(), list: out };
  return out;
}

// ======================================================================= récords
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
let records = { songs: {}, singers: {}, plays: {} };
try { records = { ...records, ...JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf8')) }; } catch {}

function saveRecords() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = RECORDS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(records));
  fs.renameSync(tmp, RECORDS_FILE);
}

const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);

function addRecord(body) {
  const songId = clean(body.song, 200);
  if (!songId || !Array.isArray(body.players)) return null;
  const now = new Date().toISOString().slice(0, 10);
  const best = records.songs[songId] || null;
  let isNew = false;
  records.plays[songId] = (records.plays[songId] || 0) + 1;
  for (const p of body.players.slice(0, MAX_PLAYERS)) {
    const name = clean(p.name, 16);
    const score = Math.max(0, Math.min(10000, Math.round(+p.score || 0)));
    const streak = Math.max(0, Math.min(10000, Math.round(+p.streak || 0)));
    if (!name || p.bot) continue;
    const s = records.singers[name] || { songs: 0, best: 0, streak: 0 };
    s.songs++;
    s.best = Math.max(s.best, score);
    s.streak = Math.max(s.streak, streak);
    records.singers[name] = s;
    const cur = records.songs[songId];
    if (!cur || score > cur.score) {
      records.songs[songId] = { score, name, date: now, title: clean(body.title, 80), artist: clean(body.artist, 80) };
      if (score > 0) isNew = true;
    }
  }
  saveRecords();
  return { isNew, previous: best, record: records.songs[songId] };
}

// ======================================================================= salas
const rooms = new Map(); // code -> room

// Códigos pronunciables tipo «MOKA» (consonante-vocal-consonante-vocal)
const CONS = 'BCDFGJKLMNPRSTVZ', VOW = 'AEIOU';
const BAD = new Set(['PUTA', 'CACA', 'PEDO', 'CULO', 'MOCO', 'PIPI', 'PENE', 'TETA', 'COCA', 'NAZI']);
function newCode() {
  for (;;) {
    const c = CONS[crypto.randomInt(CONS.length)] + VOW[crypto.randomInt(5)] + CONS[crypto.randomInt(CONS.length)] + VOW[crypto.randomInt(5)];
    if (!rooms.has(c) && !BAD.has(c)) return c;
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function playerList(room) {
  return [...room.players.values()]
    .sort((a, b) => a.slot - b.slot)
    .map(p => ({ id: p.id, slot: p.slot, name: p.name, color: COLORS[p.slot - 1], online: p.bot || !!p.ws, bot: !!p.bot }));
}

function takenSlots(room, exceptId) {
  return [...room.players.values()].filter(p => p.id !== exceptId).map(p => ({ slot: p.slot, name: p.name }));
}

function toHost(room, msg) { send(room.host, msg); }
function toPlayers(room, msg) { for (const p of room.players.values()) send(p.ws, msg); }
function announce(room) {
  const players = playerList(room);
  toHost(room, { type: 'players', players });
  toPlayers(room, { type: 'roster', players });
}

function freeSlot(room) {
  const used = new Set([...room.players.values()].map(p => p.slot));
  for (let s = 1; s <= MAX_PLAYERS; s++) if (!used.has(s)) return s;
  return 0;
}

function createRoom(hostWs) {
  const room = { code: newCode(), hostToken: crypto.randomUUID(), host: hostWs, players: new Map(), nextId: 1, state: null, emptySince: null, createdAt: Date.now(), hostInfo: hostWs && hostWs.info };
  rooms.set(room.code, room);
  admin.count('rooms');
  admin.ev('room', `Sala ${room.code} abierta`, { room: room.code, ...(hostWs && hostWs.info ? { country: hostWs.info.country } : {}) });
  return room;
}

function closeRoom(room) {
  toPlayers(room, { type: 'closed' });
  for (const p of room.players.values()) p.ws && p.ws.close();
  rooms.delete(room.code);
  admin.ev('room', `Sala ${room.code} cerrada (${room.players.size} jugadores, ${Math.round((Date.now() - room.createdAt) / 60000)} min)`, { room: room.code });
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.host && room.emptySince && now - room.emptySince > ROOM_TTL_MS) closeRoom(room);
  }
}, 60 * 1000).unref();

// ======================================================================= HTTP
const telemetry = [];
function json(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req, max = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > max) { reject(new Error('too-big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Pase de tele: las canciones (con derechos) solo se sirven a una tele con sala abierta
function cookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function hasTvPass(req) {
  // El pase llega en la cookie o, si la tele no guarda cookies, en el parámetro ?k= (clave de una sala abierta)
  let t = cookie(req, 'gtv');
  if (!t) { try { t = new URL(req.url, 'http://x').searchParams.get('k'); } catch {} }
  if (!t) return false;
  for (const r of rooms.values()) if (r.hostToken === t) return true;
  return false;
}
const MICRO_HOST = /^micro\./i;
const MICRO_FILES = { '/': '/m/index.html', '/manifest.webmanifest': '/m/manifest.webmanifest', '/sw.js': '/m/sw.js', '/m.css': '/m/m.css', '/m.js': '/m/m.js', '/despierto.mp4': '/m/despierto.mp4' };

// ======================================================================= administración (subdominio admin.)
const admin = require('./admin')({
  DATA_DIR, SONGS_DIR, WEB_DIR, rooms, COLORS,
  scanSongs, songsChanged: () => { songsCache.at = 0; },
  novedades: () => novedades, saveNovedades, records: () => records, saveRecords, telemetry: () => telemetry,
  sendTo: send, closeRoom: r => closeRoom(r), announce: r => announce(r), wsCount: () => wss.clients.size,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const host = String(req.headers.host || '');
  if (await admin.handle(req, res, url)) return;
  // Subdominio micro.: la app del micro en la raíz
  if (MICRO_HOST.test(host) && MICRO_FILES[url.pathname] && (req.method === 'GET' || req.method === 'HEAD')) {
    return serveStatic(req, res, MICRO_FILES[url.pathname]);
  }
  // /setup ya no existe: a la portada
  if (!MICRO_HOST.test(host) && (url.pathname === '/setup' || url.pathname.startsWith('/setup/')) && req.method === 'GET') {
    res.writeHead(301, { location: '/' });
    return res.end();
  }
  // La dirección antigua del micro (/m) lleva al subdominio micro. del mismo dominio
  if (!MICRO_HOST.test(host) && (url.pathname === '/m' || url.pathname === '/m/') && req.method === 'GET') {
    res.writeHead(301, { location: 'https://micro.' + host.replace(/^www\./, '').replace(/:\d+$/, '') + '/' + url.search });
    return res.end();
  }
  if (req.method === 'POST' && url.pathname === '/api/tv-pass') {
    let body;
    try { body = JSON.parse(await readBody(req, 1024)); } catch { return json(res, 400, { error: 'json' }); }
    const room = rooms.get(String(body.code || '').toUpperCase());
    if (!room || room.hostToken !== body.token) return json(res, 403, { error: 'sala' });
    admin.count('tvs');
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `gtv=${encodeURIComponent(room.hostToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400` });
    return res.end('{"ok":true}');
  }
  if ((url.pathname === '/api/songs' || url.pathname.startsWith('/songs/')) && !hasTvPass(req) && !admin.isAuthed(req)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Solo para la tele de una sala abierta');
  }
  // Los borradores (canciones creadas sin revisar) no salen en la tele
  // (en la vista previa del admin también las que están en preparación)
  if (req.method === 'GET' && url.pathname === '/api/songs') return json(res, 200, scanSongs().filter(s => !s.draft || (url.searchParams.has('preparacion') && admin.isAuthed(req))));
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, rooms: rooms.size });
  if (req.method === 'GET' && url.pathname === '/api/records') return json(res, 200, records);
  // Telemetría de rendimiento de las pruebas en la tele (solo números; se guarda en memoria, últimas 300)
  if (req.method === 'POST' && url.pathname === '/api/telemetry') {
    let body;
    try { body = JSON.parse(await readBody(req, 4096)); } catch { return json(res, 400, { error: 'json' }); }
    const pick = ['fps', 'p95', 'worst', 'heap', 'screen', 'singers', 'video', 'cam', 'note', 'ua'];
    const row = { t: new Date().toISOString() };
    for (const k of pick) if (body[k] !== undefined) row[k] = typeof body[k] === 'string' ? body[k].slice(0, 160) : body[k];
    telemetry.push(row); if (telemetry.length > 300) telemetry.shift();
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/telemetry') return json(res, 200, telemetry.slice(-100));
  if (req.method === 'POST' && url.pathname === '/api/records') {
    // Solo una tele con sala abierta puede guardar (código + token de la sala)
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'json' }); }
    const room = rooms.get(String(body.code || '').toUpperCase());
    if (!room || room.hostToken !== body.token) return json(res, 403, { error: 'sala' });
    const r = addRecord(body);
    if (r) {
      admin.count('plays');
      const who = (Array.isArray(body.players) ? body.players : []).filter(p => !p.bot).map(p => `${clean(p.name, 16)} ${Math.round(+p.score || 0)}`).join(', ');
      admin.ev('play', `Sala ${room.code}: «${clean(body.title, 80)}»${who ? ' — ' + who : ''}${r.isNew ? ' · ¡récord!' : ''}`, { room: room.code, song: clean(body.song, 200) });
    }
    return r ? json(res, 200, r) : json(res, 400, { error: 'datos' });
  }
  if (SERVE_STATIC && (req.method === 'GET' || req.method === 'HEAD')) return serveStatic(req, res, url.pathname);
  res.writeHead(404); res.end();
});

// ---------- ficheros estáticos (web + canciones), con Range para poder saltar en el audio ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400); return res.end(); }
  const isSong = rel.startsWith('/songs/');
  const root = isSong ? SONGS_DIR : WEB_DIR;
  let file = path.normalize(path.join(root, isSong ? rel.slice(7) : rel));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(301, { location: pathname + '/' }); return res.end(); }
      file = path.join(file, 'index.html');
      return fs.stat(file, (e2, st2) => out(e2, st2));
    }
    out(err, st);
  });
  function out(err, st) {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('No encontrado'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const long = /\/assets\/|\/audio\//.test(rel) || isSong;
    const headers = {
      'content-type': type, 'accept-ranges': 'bytes',
      'cache-control': type.startsWith('text/html') || type.startsWith('text/javascript') ? 'no-cache' : long ? 'public, max-age=86400' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    };
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      const start = m[1] ? +m[1] : st.size - +m[2];
      const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (start > end || start >= st.size || start < 0) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
      if (isSong && req.method === 'GET') admin.count('songBytes', end - start + 1);
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
    }
    // Páginas: la dirección pública (para las vistas previas en redes) sale de la petición, no va escrita en el código
    if (type.startsWith('text/html')) {
      const origin = 'https://' + String(req.headers.host || '').replace(/^micro\./, '');
      const body = Buffer.from(fs.readFileSync(file, 'utf8').replaceAll('%%ORIGEN%%', origin));
      res.writeHead(200, { ...headers, 'content-length': body.length });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    res.writeHead(200, { ...headers, 'content-length': st.size });
    if (isSong && req.method === 'GET') admin.count('songBytes', st.size);
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
  }
}

// ======================================================================= WebSocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });   // (la foto del jugador ~10 KB)

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  // Para el admin: de dónde se conecta (país según Cloudflare) y con qué aparato
  ws.info = { country: String(req.headers['cf-ipcountry'] || ''), ua: String(req.headers['user-agent'] || '').slice(0, 200), at: Date.now() };
  ws.on('pong', () => { ws.isAlive = true; });
  let role = null; // 'host' | 'player'
  let room = null;
  let player = null;

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.type !== 'string') return;

    // Ping de aplicación para medir la latencia (tele y móviles)
    if (m.type === 'ping') return send(ws, { type: 'pong', t: m.t });

    // Un móvil ya dentro de una sala puede consultar otra o cambiarse a otra (escanear otro QR)
    if (role === 'player' && (m.type === 'peek' || m.type === 'join')) {
      const target = String(m.code || '').toUpperCase().trim();
      if (m.type === 'join' && room && target !== room.code) {
        room.players.delete(player.id);
        announce(room);
        role = null; room = null; player = null;
      } else if (m.type === 'peek') {
        const r = rooms.get(target);
        if (!r) return send(ws, { type: 'error', code: 'no-room', msg: 'No hay ninguna sala con ese código' });
        const mine = (player && r === room) ? player : (m.token && [...r.players.values()].find(p => p.token === m.token));
        return send(ws, { type: 'peek', code: r.code, taken: takenSlots(r, mine && mine.id), mySlot: mine ? mine.slot : 0, full: !mine && r.players.size >= MAX_PLAYERS, hostOnline: !!r.host, colors: COLORS });
      } else if (m.type === 'join') {
        role = null; // misma sala: se vuelve a procesar como entrada (cambio de color o de nombre)
      }
    }

    if (!role) {
      if (m.type === 'host') {
        const prev = m.code && rooms.get(String(m.code).toUpperCase());
        if (prev && prev.hostToken === m.token) {
          room = prev;
          if (room.host && room.host !== ws) { send(room.host, { type: 'replaced' }); room.host.close(); }
          room.host = ws;
        } else {
          room = createRoom(ws);
        }
        room.emptySince = null;
        room.hostInfo = ws.info;
        role = 'host';
        send(ws, { type: 'room', code: room.code, token: room.hostToken, recovered: room === prev, players: playerList(room) });
        for (const p of room.players.values()) if (p.photo) send(ws, { type: 'photo', p: p.id, data: p.photo });
        toPlayers(room, { type: 'host', online: true });
        return;
      }
      // El móvil pregunta por la sala antes de elegir color
      if (m.type === 'peek') {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return send(ws, { type: 'error', code: 'no-room', msg: 'No hay ninguna sala con ese código' });
        const mine = m.token && [...r.players.values()].find(p => p.token === m.token);
        return send(ws, { type: 'peek', code: r.code, taken: takenSlots(r, mine && mine.id), mySlot: mine ? mine.slot : 0, full: !mine && r.players.size >= MAX_PLAYERS, hostOnline: !!r.host, colors: COLORS });
      }
      if (m.type === 'join') {
        const code = String(m.code || '').toUpperCase().trim();
        room = rooms.get(code);
        if (!room) return send(ws, { type: 'error', code: 'no-room', msg: 'No hay ninguna sala con ese código' });
        const name = clean(m.name, 16) || 'Cantante';
        let slot = Math.round(+m.slot || 0);
        player = m.token && [...room.players.values()].find(p => p.token === m.token);
        if (!player && room.players.size >= MAX_PLAYERS) {
          toHost(room, { type: 'full-attempt', name });
          room = null;
          return send(ws, { type: 'error', code: 'full', msg: 'La sala está llena (8 jugadores)' });
        }
        const busy = s => [...room.players.values()].some(p => p.slot === s && p !== player);
        if (slot < 1 || slot > MAX_PLAYERS || busy(slot)) {
          if (m.slot) { const r = room; room = null; return send(ws, { type: 'error', code: 'color-taken', msg: 'Ese color ya lo tiene otra persona', taken: takenSlots(r) }); }
          slot = player ? player.slot : freeSlot(room);
        }
        if (player) {
          if (player.ws && player.ws !== ws) player.ws.close();
          Object.assign(player, { ws, name, slot });
        } else {
          player = { id: room.nextId++, token: crypto.randomUUID(), name, slot, ws, joinedAt: Date.now(), info: ws.info };
          room.players.set(player.id, player);
          admin.count('joins');
          admin.ev('player', `${name} entra en la sala ${room.code}`, { room: room.code });
        }
        role = 'player';
        send(ws, { type: 'joined', id: player.id, slot: player.slot, token: player.token, name: player.name, color: COLORS[player.slot - 1], code: room.code, hostOnline: !!room.host });
        if (room.state) send(ws, room.state);
        announce(room);
        return;
      }
      return;
    }

    if (role === 'player') {
      if (m.type === 'pitch') {
        // n = nota MIDI decimal o null; v = volumen 0..1; lat = media latencia del móvil (ms)
        const n = typeof m.n === 'number' && isFinite(m.n) ? Math.round(m.n * 100) / 100 : null;
        const v = typeof m.v === 'number' ? Math.round(Math.max(0, Math.min(1, m.v)) * 1000) / 1000 : 0;
        const lat = typeof m.lat === 'number' ? Math.max(0, Math.min(2000, Math.round(m.lat))) : 0;
        player.lat = lat; player.lastV = v; player.lastN = n;
        if (n !== null && v > 0.02) player.pitchAt = Date.now();
        return toHost(room, { type: 'pitch', p: player.id, n, v, lat });
      }
      if (m.type === 'input') return toHost(room, { type: 'input', p: player.id, key: clean(m.key, 8) });
      // Foto del jugador (cámara frontal, JPEG pequeño): solo en memoria mientras dure la sala
      if (m.type === 'photo') {
        const data = typeof m.data === 'string' && m.data.length <= 48000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(m.data) ? m.data : '';
        player.photo = data;
        return toHost(room, { type: 'photo', p: player.id, data });
      }
      if (m.type === 'leave') {
        admin.ev('player', `${player.name} sale de la sala ${room.code}`, { room: room.code });
        room.players.delete(player.id);
        announce(room);
        return ws.close();
      }
      return;
    }

    if (role === 'host') {
      if (m.type === 'state') {
        room.state = { ...m, type: 'state' };
        room.stateAt = Date.now();
        return toPlayers(room, room.state);
      }
      if (m.type === 'kick') {
        const p = room.players.get(m.p);
        if (p) { send(p.ws, { type: 'kicked' }); p.ws && p.ws.close(); room.players.delete(m.p); }
        return announce(room);
      }
      if (m.type === 'bot') {
        // «Simular jugador»: ocupa un color y canta desde la propia tele
        const slot = freeSlot(room);
        if (!slot) return send(ws, { type: 'error', code: 'full', msg: 'La sala está llena' });
        const names = ['Robo', 'Eco', 'Bip', 'Tono', 'Lila', 'Dino', 'Kiko', 'Nube'];
        const p = { id: room.nextId++, token: crypto.randomUUID(), name: names[slot - 1], slot, ws: null, bot: true };
        room.players.set(p.id, p);
        return announce(room);
      }
      if (m.type === 'new-code') {
        // Ajustes → «Nuevo código de sala»: cierra la sala y abre otra
        closeRoom(room);
        room = createRoom(ws);
        return send(ws, { type: 'room', code: room.code, token: room.hostToken, recovered: false, players: [] });
      }
    }
  });

  ws.on('close', () => {
    if (!room) return;
    if (role === 'host' && room.host === ws) {
      room.host = null;
      room.emptySince = Date.now();
      toPlayers(room, { type: 'host', online: false });
    } else if (role === 'player' && player && player.ws === ws) {
      player.ws = null;
      announce(room);
    }
  });
});

// Mantener vivas las conexiones a través de Cloudflare / proxies
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 25 * 1000).unref();

server.listen(PORT, HOST, () => console.log(`gramola: escuchando en ${HOST}:${PORT}, canciones en ${SONGS_DIR}`));
