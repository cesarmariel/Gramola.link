'use strict';
// Pruebas del servidor de salas: arranca server.js en un puerto libre con datos temporales y comprueba que las
// peticiones raras no lo tumban, que el pase de tele no se salta con rutas codificadas y que una partida completa
// (sala, jugador, canciones, récord) funciona.   Se ejecutan con:  npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const WebSocket = require('ws');

let child, dir, port, base;
const sockets = [];
const SONG = '#TITLE:Demo\n#ARTIST:Prueba\n#BPM:120\n#GAP:0\n: 0 4 0 Ho\n: 4 4 2 la\nE\n';

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gramola-test-'));
  // Como en producción: las canciones viven dentro de la carpeta web (web/songs)
  const web = path.join(dir, 'web'), songs = path.join(web, 'songs');
  fs.mkdirSync(path.join(songs, 'demo'), { recursive: true });
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>Gramola</title>');
  fs.writeFileSync(path.join(songs, 'demo', 'demo.txt'), SONG);
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', WEB_DIR: web, SONGS_DIR: songs, DATA_DIR: path.join(dir, 'data'), ADMIN_HOST: '', MAX_ROOMS: '3' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no arrancó')), 10000);
    let out = '';
    child.stdout.on('data', b => {
      out += b;
      const m = out.match(/escuchando en 127\.0\.0\.1:(\d+)/);
      if (m) { port = +m[1]; base = `http://127.0.0.1:${port}`; clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', b => process.stderr.write(b));
    child.once('exit', code => { clearTimeout(timer); reject(new Error('El servidor se ha parado: ' + code)); });
  });
});
after(async () => {
  for (const ws of sockets) ws.terminate();
  if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

// Petición en bruto (fetch normaliza «//» y «..» por su cuenta; aquí queremos mandar la ruta tal cual)
function raw(route, headers = {}, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: route, method, headers }, res => {
      let text = ''; res.on('data', b => { text += b; });
      res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
const vivo = async () => assert.equal((await raw('/api/health')).status, 200, 'el servidor tiene que seguir vivo');
const ws = () => { const s = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(s); return s; };
const msg = async s => JSON.parse((await once(s, 'message'))[0]);
async function abrirSala() {
  const host = ws(); await once(host, 'open');
  host.send(JSON.stringify({ type: 'host' }));
  return [host, await msg(host)];
}

test('cookies y cuerpos mal formados no tumban el servidor', async () => {
  assert.equal((await raw('/api/songs', { cookie: 'gtv=%' })).status, 403);
  assert.equal((await raw('/api/admin/auth/status', { host: `admin.localhost:${port}`, cookie: 'gadm=%' })).status, 200);
  for (const body of ['null', '[]', '"texto"', '{', '']) {
    assert.equal((await raw('/api/tv-pass', {}, 'POST', body)).status, 400, 'tv-pass con ' + JSON.stringify(body));
    assert.equal((await raw('/api/records', {}, 'POST', body)).status, 400, 'records con ' + JSON.stringify(body));
  }
  assert.equal((await raw('/%E0%A4')).status, 400);
  assert.equal((await raw('/%00')).status, 400);
  await vivo();
});

test('las canciones solo se sirven con pase de tele, también con rutas codificadas o con «..»', async () => {
  for (const r of ['/songs/demo/demo.txt', '/%73ongs/demo/demo.txt', '//songs/demo/demo.txt', '/app/../songs/demo/demo.txt', '/songs%2Fdemo%2Fdemo.txt', '/./songs/demo/demo.txt']) {
    assert.equal((await raw(r)).status, 403, r);
  }
  assert.equal((await raw('/api/songs')).status, 403);
  assert.equal((await raw('/')).status, 200);
});

test('la telemetría solo la manda una tele con sala y solo la ve el admin', async () => {
  assert.equal((await raw('/api/telemetry', {}, 'POST', '{"fps":60}')).status, 403);
  assert.equal((await raw('/api/telemetry')).status, 401);
});

test('sala, jugador, canciones y récord funcionan juntos', async () => {
  const [host, room] = await abrirSala();
  assert.equal(room.type, 'room');
  assert.match(room.code, /^[A-Z]{4}$/);
  const k = '?k=' + room.token;
  const list = await raw('/api/songs' + k);
  assert.equal(list.status, 200);
  assert.equal(JSON.parse(list.text)[0].title, 'Demo');
  assert.equal((await raw('/songs/demo/demo.txt' + k)).status, 200);
  assert.equal((await raw('/%73ongs/demo/demo.txt' + k)).status, 200);
  assert.equal((await raw('/api/telemetry' + k, {}, 'POST', '{"fps":60,"screen":"sing"}')).status, 200);
  // Jugador
  const player = ws(); await once(player, 'open');
  player.send(JSON.stringify({ type: 'join', code: room.code, name: 'Prueba' }));
  const joined = await msg(player);
  assert.equal(joined.type, 'joined');
  assert.equal((await msg(host)).type, 'players');
  // Récords: solo objetos de jugador y canciones de la biblioteca
  const post = body => raw('/api/records', { 'content-type': 'application/json' }, 'POST', JSON.stringify({ code: room.code, token: room.token, ...body }));
  assert.equal((await post({ song: 'demo', players: [null] })).status, 400);
  assert.equal((await post({ song: 'demo', players: 'nada' })).status, 400);
  assert.equal((await post({ song: 'inventada', players: [{ name: 'Prueba', score: 9999 }] })).status, 400);
  assert.equal((await post({ song: 'demo', title: 'Demo', players: [{ name: 'Prueba', score: 1234, streak: 3 }] })).status, 200);
  const rec = JSON.parse((await raw('/api/records')).text);
  assert.equal(rec.songs.demo.score, 1234);
  assert.equal(rec.singers.Prueba.songs, 1);
  await vivo();
});

test('con el tope de salas alcanzado la tele recibe un error en vez de colgar el servidor', async () => {
  // Una sala ya está abierta por la prueba anterior y el tope es 3
  const [, b] = await abrirSala(); assert.equal(b.type, 'room');
  const [, c] = await abrirSala(); assert.equal(c.type, 'room');
  const [, d] = await abrirSala();
  assert.equal(d.type, 'error');
  assert.equal(d.code, 'busy');
  await vivo();
});

test('al cerrar la sala con «nuevo código» los móviles salen y la tele recibe la sala nueva', async () => {
  for (const s of sockets.splice(0)) s.terminate();
  await new Promise(r => setTimeout(r, 100));   // que el servidor registre los cierres (las salas vacías no se borran, pero el tope es de 3)
  const [host, room] = await abrirSala();
  if (room.type === 'error') return;   // (las salas de antes siguen contando hasta que pasan 15 min: no se puede probar aquí)
  const player = ws(); await once(player, 'open');
  player.send(JSON.stringify({ type: 'join', code: room.code, name: 'Ana' }));
  await msg(player); await msg(host);
  host.send(JSON.stringify({ type: 'new-code' }));
  const closed = await msg(player);
  assert.equal(closed.type, 'closed');
  const nueva = await msg(host);
  assert.equal(nueva.type, 'room');
  assert.notEqual(nueva.code, room.code);
  await vivo();
});
