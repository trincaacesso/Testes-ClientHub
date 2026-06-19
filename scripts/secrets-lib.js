/**
 * secrets-lib.js — cofre de segredos POR CLIENTE (CRM, tokens próprios, etc.).
 *
 * A config NÃO-secreta fica em clients.json (no repo).
 * Os SEGREDOS por cliente ficam aqui, FORA do Git:
 *   { "<idCliente>": { "expadToken": "...", "expadBaseUrl": "..." }, ... }
 *
 * Fonte do arquivo (nesta ordem):
 *   1. process.env.SECRETS_FILE            (caminho explícito)
 *   2. /etc/secrets/client-secrets.json    (Render Secret File)
 *   3. ./client-secrets.local.json         (desenvolvimento local, gitignored)
 *
 * MIGRAÇÃO FUTURA: para trocar por banco (Postgres) basta reescrever getSecret()
 * para buscar na tabela — o resto do código (server.js) não muda.
 */
'use strict';
const fs = require('fs');
const path = require('path');

function resolveFile() {
  if (process.env.SECRETS_FILE) return process.env.SECRETS_FILE;
  const render = '/etc/secrets/client-secrets.json';
  if (fs.existsSync(render)) return render;
  return path.join(__dirname, '..', 'client-secrets.local.json');
}
const FILE = resolveFile();

let cache = null, ts = 0;
function load() {
  if (cache && (Date.now() - ts) < 60000) return cache; // recarrega a cada 60s
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { cache = {}; }
  ts = Date.now();
  return cache;
}

function getSecret(cli) { return load()[cli] || {}; }
function hasSecrets() { return Object.keys(load()).length > 0; }

module.exports = { getSecret, hasSecrets, secretsFile: () => FILE };
