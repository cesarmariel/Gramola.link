#!/usr/bin/env node
'use strict';
/**
 * Enlace de alta de Touch ID para el admin, de un solo uso (30 minutos).
 *   cd server && DATA_DIR=… node alta.js https://admin.TU-DOMINIO
 * Sirve para la primera llave o si te quedas sin ninguna (por ejemplo, al cambiar de Mac).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const file = path.join(DATA_DIR, 'admin-alta.json');
let list = [];
try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const token = crypto.randomBytes(24).toString('base64url');
list = list.filter(t => t.exp > Date.now() && !t.used);
list.push({ token, exp: Date.now() + 30 * 60e3 });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(file, JSON.stringify(list));
const base = (process.argv[2] || 'https://admin.<dominio>').replace(/\/$/, '');
console.log(`\nEnlace de alta (válido 30 minutos, un solo uso):\n\n  ${base}/?setup=${token}\n`);
