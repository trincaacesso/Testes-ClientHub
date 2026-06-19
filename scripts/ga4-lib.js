/**
 * ga4-lib.js — Google Analytics 4 (Data API + Admin API). Node 18+ (fetch global), sem dependências.
 * Env: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN
 * (OAuth do Google com escopo analytics.readonly)
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
  if (!r.ok) throw new Error('OAuth GA4 ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  _tok = { value: j.access_token, exp: Date.now() + ((j.expires_in || 3000) - 60) * 1000 };
  return _tok.value;
}

/** Lista todas as propriedades GA4 acessíveis: [{property:'123', nome, conta}] */
async function listGA4Properties() {
  const token = await accessToken();
  let out = [], pageToken = '';
  do {
    const u = 'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200' + (pageToken ? ('&pageToken=' + pageToken) : '');
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('GA4 Admin ' + r.status + ': ' + (await r.text()).slice(0, 200));
    const j = await r.json();
    (j.accountSummaries || []).forEach(acc => (acc.propertySummaries || []).forEach(p => {
      out.push({ property: String(p.property || '').replace('properties/', ''), nome: p.displayName || '', conta: acc.displayName || '' });
    }));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function runReport(propertyId, body, token) {
  const r = await fetch('https://analyticsdata.googleapis.com/v1beta/properties/' + propertyId + ':runReport', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  if (!r.ok) { const e = new Error('GA4 Data ' + r.status + ': ' + txt.slice(0, 220)); e.status = r.status; e.body = txt; throw e; }
  return JSON.parse(txt);
}

/**
 * Busca métricas do GA4 num período.
 * @param {string} propertyId só dígitos
 * @param {{from:string,to:string}} range YYYY-MM-DD
 * @returns {dias, canais, paginas, totais}
 */
async function fetchGA4(propertyId, range) {
  const pid = String(propertyId).replace(/\D/g, '');
  if (!pid) throw new Error('propertyId vazio');
  const token = await accessToken();
  const dateRanges = [{ startDate: range.from, endDate: range.to }];

  // métrica de conversão: 'keyEvents' (novo nome) com fallback p/ 'conversions'
  let convMetric = 'keyEvents', daily;
  const dailyBody = m => ({ dateRanges, dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' }, { name: m }], limit: 500 });
  try { daily = await runReport(pid, dailyBody('keyEvents'), token); }
  catch (e) {
    if (e.status === 400 && /keyEvents/i.test(e.body || '')) { convMetric = 'conversions'; daily = await runReport(pid, dailyBody('conversions'), token); }
    else throw e;
  }
  const dias = (daily.rows || []).map(r => {
    const d = r.dimensionValues[0].value; // YYYYMMDD
    const m = r.metricValues.map(x => +x.value || 0);
    return { data: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), sessoes: m[0], usuarios: m[1], novos: m[2], conv: m[3] };
  }).sort((a, b) => a.data < b.data ? -1 : 1);

  const canaisRep = await runReport(pid, { dateRanges, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }, { name: convMetric }], limit: 20 }, token);
  const canais = (canaisRep.rows || []).map(r => ({ canal: r.dimensionValues[0].value, sessoes: +r.metricValues[0].value || 0, conv: +r.metricValues[1].value || 0 }))
    .sort((a, b) => b.sessoes - a.sessoes);

  const pagRep = await runReport(pid, { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 8 }, token);
  const paginas = (pagRep.rows || []).map(r => ({ pagina: r.dimensionValues[0].value, views: +r.metricValues[0].value || 0 }));

  const totais = dias.reduce((a, x) => ({ sessoes: a.sessoes + x.sessoes, usuarios: a.usuarios + x.usuarios, novos: a.novos + x.novos, conv: a.conv + x.conv }), { sessoes: 0, usuarios: 0, novos: 0, conv: 0 });
  return { propertyId: pid, periodo: range.from + ' a ' + range.to, dias, canais, paginas, totais, convMetric };
}

module.exports = { configured, listGA4Properties, fetchGA4 };
