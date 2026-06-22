/**
 * gsc-lib.js — Google Search Console (Search Analytics API). Node 18+ (fetch global), sem dependências.
 *
 * Reaproveita o MESMO OAuth do GA4:
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN
 *
 * ====== O QUE FALTA PARA LIGAR ======
 * O refresh token precisa incluir o escopo do Search Console:
 *   https://www.googleapis.com/auth/webmasters.readonly
 * (o token do GA4 costuma ter só analytics.readonly — re-autorize pedindo os DOIS escopos
 *  e atualize GOOGLE_OAUTH_REFRESH_TOKEN). A conta Google precisa ter acesso à propriedade
 *  do Search Console do cliente.
 *
 * Doc: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
 */
'use strict';

function env(k) { const v = process.env[k]; if (!v) throw new Error('Falta env ' + k); return v; }
function configured() {
  return !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
}

let _tok = { value: null, exp: 0 };
async function accessToken() {
  if (_tok.value && Date.now() < _tok.exp) return _tok.value;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_OAUTH_CLIENT_ID'), client_secret: env('GOOGLE_OAUTH_CLIENT_SECRET'),
      refresh_token: env('GOOGLE_OAUTH_REFRESH_TOKEN'), grant_type: 'refresh_token'
    })
  });
  if (!r.ok) throw new Error('OAuth GSC ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  _tok = { value: j.access_token, exp: Date.now() + ((j.expires_in || 3000) - 60) * 1000 };
  return _tok.value;
}

/** Lista todas as propriedades do Search Console acessíveis: [{site, nivel}] */
async function listSites() {
  const token = await accessToken();
  const r = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('GSC sites ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return (j.siteEntry || []).map(s => ({ site: s.siteUrl, nivel: s.permissionLevel || '' }));
}

async function query(siteUrl, body, token) {
  const url = 'https://www.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteUrl) + '/searchAnalytics/query';
  const r = await fetch(url, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  if (!r.ok) { const e = new Error('GSC query ' + r.status + ': ' + txt.slice(0, 220)); e.status = r.status; e.body = txt; throw e; }
  return JSON.parse(txt || '{}');
}

const round = (v, d) => { const m = Math.pow(10, d); return Math.round((+v || 0) * m) / m; };

/**
 * Busca métricas do Search Console num período.
 * @param {string} siteUrl  ex.: 'sc-domain:exemplo.com.br' ou 'https://www.exemplo.com.br/'
 * @param {{from:string,to:string}} range  YYYY-MM-DD
 * @returns {{site, periodo, totais, consultas, paginas, dispositivos}}
 */
async function fetchGSC(siteUrl, range) {
  const site = String(siteUrl || '').trim();
  if (!site) throw new Error('siteUrl vazio');
  const token = await accessToken();
  const base = { startDate: range.from, endDate: range.to, type: 'web' };

  // 1) Totais do período (sem dimensão)
  const totRep = await query(site, base, token);
  const tr = (totRep.rows && totRep.rows[0]) || {};
  const totais = {
    cliques: Math.round(tr.clicks || 0),
    impressoes: Math.round(tr.impressions || 0),
    ctr: round((tr.ctr || 0) * 100, 2),     // em %
    posicao: round(tr.position || 0, 1)
  };

  // 2) Principais consultas (queries)
  const qRep = await query(site, Object.assign({ dimensions: ['query'], rowLimit: 25 }, base), token);
  const consultas = (qRep.rows || []).map(r => ({
    termo: (r.keys && r.keys[0]) || '—', cliques: Math.round(r.clicks || 0), impressoes: Math.round(r.impressions || 0),
    ctr: round((r.ctr || 0) * 100, 1), posicao: round(r.position || 0, 1)
  }));

  // 3) Principais páginas
  const pRep = await query(site, Object.assign({ dimensions: ['page'], rowLimit: 15 }, base), token);
  const paginas = (pRep.rows || []).map(r => ({
    pagina: (r.keys && r.keys[0]) || '—', cliques: Math.round(r.clicks || 0), impressoes: Math.round(r.impressions || 0),
    ctr: round((r.ctr || 0) * 100, 1), posicao: round(r.position || 0, 1)
  }));

  // 4) Por dispositivo (tolerante a falha)
  let dispositivos = [];
  try {
    const dRep = await query(site, Object.assign({ dimensions: ['device'], rowLimit: 10 }, base), token);
    dispositivos = (dRep.rows || []).map(r => ({ dispositivo: (r.keys && r.keys[0]) || '—', cliques: Math.round(r.clicks || 0), impressoes: Math.round(r.impressions || 0) }));
  } catch (e) { dispositivos = []; }

  return { site, periodo: range.from + ' a ' + range.to, totais, consultas, paginas, dispositivos };
}

module.exports = { configured, listSites, fetchGSC };
