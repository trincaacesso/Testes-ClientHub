/**
 * tiktok-lib.js — coleta de métricas do TikTok Ads (TikTok Business / Marketing API v1.3).
 * Mesmo espírito do meta-lib.js: Node puro, sem dependências.
 *
 * Autenticação: header "Access-Token: <TIKTOK_ACCESS_TOKEN>".
 * O token é obtido UMA vez trocando o auth_code (gerado quando o anunciante autoriza
 * o app pela "Advertiser authorization URL") em /oauth2/access_token/.
 *
 * Endpoints usados:
 *  - POST /open_api/v1.3/oauth2/access_token/   -> troca auth_code por access_token (+lista de advertiser_ids)
 *  - GET  /open_api/v1.3/report/integrated/get/ -> relatório de performance
 */
'use strict';
const https = require('https');

const HOST = 'business-api.tiktok.com';
const API = 'v1.3';
const BASE = `/open_api/${API}`;

// ---------- HTTP helpers ----------
function request(method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      host: HOST, path: pathname, method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers,
        data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    };
    const req = https.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        let j;
        try { j = JSON.parse(buf); } catch (e) { return reject(new Error('resposta não-JSON do TikTok: ' + buf.slice(0, 160))); }
        // A API do TikTok devolve sempre HTTP 200 com {code, message, data}. code 0 = OK.
        if (j.code !== 0) return reject(new Error('TikTok code ' + j.code + ': ' + (j.message || 'erro') ));
        resolve(j.data || {});
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const get = (pathname, headers) => request('GET', pathname, { headers });
const qs = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

// ---------- Troca de auth_code -> access_token (rodar 1x por anunciante) ----------
async function exchangeAuthCode(appId, secret, authCode) {
  if (!appId || !secret || !authCode) throw new Error('app_id, secret e auth_code são obrigatórios');
  const data = await request('POST', `${BASE}/oauth2/access_token/`, {
    body: { app_id: String(appId), secret: String(secret), auth_code: String(authCode) }
  });
  // data: { access_token, advertiser_ids:[...], scope:[...], ... }
  return data;
}

// ---------- Valida o token e lista os anunciantes que ele enxerga ----------
// Usa /oauth2/advertiser/get/ — se o token estiver errado/revogado, o TikTok devolve code 40105 aqui também.
async function getAuthorizedAdvertisers(appId, secret, token) {
  if (!token) throw new Error('TIKTOK_ACCESS_TOKEN ausente');
  const path = `${BASE}/oauth2/advertiser/get/?` + qs({ app_id: String(appId), secret: String(secret) });
  const data = await get(path, { 'Access-Token': token });
  // data: { list: [{ advertiser_id, advertiser_name }] }
  return Array.isArray(data.list) ? data.list : [];
}

// ---------- Relatório integrado (BASIC) ----------
const METRICS_DIA = ['spend', 'impressions', 'clicks', 'ctr', 'cpc', 'conversion', 'cost_per_conversion', 'reach'];
const METRICS_CAMP = ['campaign_name', 'spend', 'impressions', 'clicks', 'conversion'];
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const r2 = n => +(+n).toFixed(2);
const _p2 = x => String(x).padStart(2, '0');
const ymd = d => d.getUTCFullYear() + '-' + _p2(d.getUTCMonth() + 1) + '-' + _p2(d.getUTCDate());

// A API do TikTok limita o breakdown diário (stat_time_day) a ~30 dias por chamada.
// Quebra [start, end] em blocos de no máximo `maxDays` dias (sem sobreposição) p/ cobrir
// períodos longos (ex.: o ano todo) com várias chamadas que depois são concatenadas.
function splitRange(start, end, maxDays) {
  const MS = 864e5;
  const s0 = Date.parse(start + 'T00:00:00Z');
  const e0 = Date.parse(end + 'T00:00:00Z');
  if (isNaN(s0) || isNaN(e0) || s0 > e0) return [{ since: start, until: end }];
  const out = [];
  let s = s0;
  while (s <= e0) {
    const u = Math.min(s + (maxDays - 1) * MS, e0);
    out.push({ since: ymd(new Date(s)), until: ymd(new Date(u)) });
    s = u + MS;
  }
  return out;
}

async function report(token, advertiserId, dataLevel, dimensions, metrics, start, end) {
  let out = [], page = 1, totalPage = 1;
  do {
    const path = `${BASE}/report/integrated/get/?` + qs({
      advertiser_id: advertiserId,
      report_type: 'BASIC',
      data_level: dataLevel,
      dimensions: JSON.stringify(dimensions),
      metrics: JSON.stringify(metrics),
      start_date: start, end_date: end,
      page, page_size: 200
    });
    const d = await get(path, { 'Access-Token': token });
    if (Array.isArray(d.list)) out = out.concat(d.list);
    totalPage = (d.page_info && d.page_info.total_page) || 1;
    page++;
  } while (page <= totalPage && page <= 25);
  return out;
}

/**
 * range: { since:'YYYY-MM-DD', until:'YYYY-MM-DD' }
 * Retorna o MESMO formato consumido pelo front (espelha meta/ga4).
 */
async function fetchTiktokData(token, advertiserId, range) {
  if (!token) throw new Error('TIKTOK_ACCESS_TOKEN ausente');
  if (!advertiserId) throw new Error('tiktokAdvertiserId ausente para este cliente');
  const start = range.since, end = range.until;
  const periodoLbl = start + ' a ' + end;

  // 1) Série diária (nível anunciante) -> alimenta KPIs + gráfico
  //    stat_time_day aceita no máx. ~30 dias por chamada, então buscamos em blocos e juntamos.
  const chunks = splitRange(start, end, 30);
  let diasRaw = [];
  for (const ch of chunks) {
    const part = await report(token, advertiserId, 'AUCTION_ADVERTISER', ['stat_time_day'], METRICS_DIA, ch.since, ch.until);
    diasRaw = diasRaw.concat(part);
  }
  const dias = diasRaw.map(r => {
    const m = r.metrics || {}, dim = r.dimensions || {};
    return {
      data: String(dim.stat_time_day || '').slice(0, 10),
      custo: r2(num(m.spend)),
      conv: Math.round(num(m.conversion)),
      cliques: Math.round(num(m.clicks)),
      impr: Math.round(num(m.impressions))
    };
  }).filter(d => d.data).sort((a, b) => a.data < b.data ? -1 : 1);

  const totais = dias.reduce((a, d) => {
    a.spend += d.custo; a.impr += d.impr; a.clicks += d.cliques; a.leads += d.conv; return a;
  }, { spend: 0, impr: 0, clicks: 0, leads: 0 });
  totais.spend = r2(totais.spend);
  totais.ctr = totais.impr ? +(totais.clicks / totais.impr * 100).toFixed(2) : 0;
  totais.cpc = totais.clicks ? r2(totais.spend / totais.clicks) : 0;
  totais.cpl = totais.leads ? r2(totais.spend / totais.leads) : 0;

  // 2) Quebra por campanha -> doughnut + tabela "Top campanhas"
  const campRaw = await report(token, advertiserId, 'AUCTION_CAMPAIGN', ['campaign_id'], METRICS_CAMP, start, end);
  const camps = campRaw.map(r => {
    const m = r.metrics || {};
    return {
      nome: m.campaign_name || '—',
      spend: r2(num(m.spend)),
      impr: Math.round(num(m.impressions)),
      clicks: Math.round(num(m.clicks)),
      leads: Math.round(num(m.conversion))
    };
  }).filter(c => c.spend > 0).sort((a, b) => b.spend - a.spend);
  camps.forEach(c => c.cpl = c.leads ? r2(c.spend / c.leads) : 0);

  // doughnut: top 9 + "outras"
  const top = camps.slice(0, 9).map(c => [c.nome.length > 28 ? c.nome.slice(0, 26) + '…' : c.nome, c.spend]);
  const resto = camps.slice(9).reduce((a, c) => a + c.spend, 0);
  if (resto > 0) top.push(['Outras campanhas', r2(resto)]);

  return {
    conta: 'TikTok Ads',
    contaId: advertiserId,
    periodo: periodoLbl,
    totais,
    dias,
    campanhas: camps.slice(0, 20),
    regioes: top,           // mesmo nome usado pelo doughnut do Meta
    gerado: new Date().toLocaleString('pt-BR')
  };
}

module.exports = { fetchTiktokData, exchangeAuthCode, getAuthorizedAdvertisers };
