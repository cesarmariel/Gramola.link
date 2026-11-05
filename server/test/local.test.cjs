'use strict';
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
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gramola-test-'));
  const songs = path.join(dir, 'songs');
  fs.mkdirSync(path.join(songs, 'demo'), { recursive: true });
  fs.writeFileSync(path.join(songs, 'demo', 'demo.txt'), '#TITLE:Demo\n#ARTIST:Test\n#BPM:120\n: 0 4 0 Hola\nE\n');
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: path.join(dir, 'data'), SONGS_DIR: songs, ENABLE_TELEMETRY: '0', ADMIN_HOST: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no arrancó')), 10000);
    let output = '';
    child.stdout.on('data', b => {
      output += b;
      const m = output.match(/escuchando en 127\.0\.0\.1:(\d+)/);
      if (m) { port = Number(m[1]); base = `http://127.0.0.1:${port}`; clearTimeout(timer); resolve(); }
    });
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Salida prematura: ' + code)); });
  });
});
after(async () => {
  for (const ws of sockets) ws.terminate();
  if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});
async function rawRequest(route, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: route, headers }, res => {
      let text = ''; res.on('data', b => { text += b; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject);
  });
}
test('cookies y JSON malformados no interrumpen el servidor', async () => {
  assert.equal((await rawRequest('/api/songs', { cookie: 'gtv=%' })).status, 403);
  assert.equal((await rawRequest('/api/admin/auth/status', { host: `admin.localhost:${port}`, cookie: 'gadm=%' })).status, 200);
  for (const payload of ['null', '[]', '"texto"', '{']) {
    const res = await fetch(base + '/api/tv-pass', { method: 'POST', body: payload });
    assert.equal(res.status, 400);
  }
  assert.equal((await rawRequest('/%E0%A4')).status, 400);
  assert.equal((await fetch(base + '/api/health')).status, 200);
});
test('las rutas codificadas conservan la autorización de canciones', async () => {
  for (const route of ['/songs/demo/demo.txt', '/%73ongs/demo/demo.txt', '/songs%2Fdemo%2Fdemo.txt']) {
    assert.equal((await rawRequest(route)).status, 403);
  }
});
test('telemetría deshabilitada por defecto', async () => {
  assert.equal((await fetch(base + '/api/telemetry')).status, 404);
  assert.equal((await fetch(base + '/api/telemetry', { method: 'POST', body: '{}' })).status, 404);
});
test('sala, catálogo y jugador funcionan; un récord sin canto se rechaza', async () => {
  const host = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(host); await once(host, 'open');
  const reply = once(host, 'message'); host.send(JSON.stringify({ type: 'host' }));
  const room = JSON.parse((await reply)[0]); assert.equal(room.type, 'room');
  const list = await fetch(base + '/api/songs?k=' + room.token); assert.equal(list.status, 200);
  assert.equal((await list.json())[0].title, 'Demo');
  assert.equal((await rawRequest('/%73ongs/demo/demo.txt?k=' + room.token)).status, 200);
  const player = new WebSocket(`ws://127.0.0.1:${port}/ws`); sockets.push(player); await once(player, 'open');
  const joined = once(player, 'message'); player.send(JSON.stringify({ type: 'join', code: room.code, name: 'Prueba' }));
  assert.equal(JSON.parse((await joined)[0]).type, 'joined');
  const invalid = await fetch(base + '/api/records', { method: 'POST', body: JSON.stringify({ code: room.code, token: room.token, players: [null] }) });
  assert.equal(invalid.status, 400);
  const saved = await fetch(base + '/api/records', { method: 'POST', body: JSON.stringify({ code: room.code, token: room.token, song: 'demo', players: [{ name: 'Prueba', score: 1234 }] }) });
  assert.equal(saved.status, 403);
  assert.equal((await saved.json()).error, 'sesion');
  assert.equal((await (await fetch(base + '/api/records')).json()).songs.demo, undefined);
});
