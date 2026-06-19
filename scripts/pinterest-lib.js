/**
 * pinterest-lib.js — Pinterest Ads (Analytics API v5). Node 18+ (fetch global), sem dependências.
 *
 * ====== O QUE FALTA PARA LIGAR (depois é só preencher) ======
 * Env no servidor (Render/Railway):
 *   PINTEREST_ACCESS_TOKEN   -> access token do Pinterest Ads (escopo ads:read)
 * E em clients.json, no cliente:
 *   "pinterestAdAccountId": "<id da conta de anúncios>"
 *
 * Enquanto PINTEREST_ACCESS_TOKEN não existir, configured() retorna false e o
 * /api/pinterest devolve um aviso amigável (a aba já fica visível, só sem dados).
 *
 * Doc: https://developers.pinterest.com/docs/api/v5/ (analytics + campaigns)
 */
'use strict';

const API = 'https://api.pinterest.com/v5';

function configured() {
  return !!process.env.PINTEREST_ACCESS_TOKEN;
}
function token() {
  const t = process.env.PINTEREST_ACCESS_TOKEN;
  if (!t) throw new Error('Falta env PINTEREST_ACCESS_TOKEN');
  return t;
}

async function api(path, params) {
  const qs = params ? ('?' + new URLSearchParams(params).toString()) : '';
  const r = await fetch(API + path + qs, { headers: { Authorization: 'Bearer ' + token() } });
  const txt = await r.text();
  if (!r.ok) { const e = new Error('Pinterest ' + r.status + ': ' + txt.slice(0, 220)); e.status = r.status; e.body = txt; throw e; }
  return txt ? JSON.parse(txt) : {};
}

// Métricas que pedimos à Analytics API (nomes oficiais v5).
const METRICS = ['IMPRESSION_1', 'PIN_CLICK', 'SAVE', 'SPEND_IN_DOLLAR', 'TOTAL_CONVERSIONS'];
const num = v => (typeof v === 'number' ? v : (parseFloat(v) || 0));

/**
 * Busca métricas do Pinterest Ads num período.
 * @param {string} adAccountId  id da conta de anúncios
 * @param {{from:string,to:string}} range  YYYY-MM-DD
 * @returns {{adAccountId, periodo, totais, campanhas, pins}}
 */
async function fetchPinterest(adAccountId, range) {
  const acc = String(adAccountId || '').trim();
  if (!acc) throw new Error('pinterestAdAccountId vazio');
  const base = { start_date: range.from, end_date: range.to, columns: METRICS.join(','), granularity: 'TOTAL' };

  // 1) Totais da conta no período
  const accRep = await api('/ad_accounts/' + acc + '/analytics', base);
  const accRow = (Array.isArray(accRep) ? accRep[0] : (accRep.data && accRep.data[0])) || {};
  const totais = {
    impressoes: num(accRow.IMPRESSION_1),
    cliques: num(accRow.PIN_CLICK),
    salvamentos: num(accRow.SAVE),
    gasto: num(accRow.SPEND_IN_DOLLAR),
    conv: num(accRow.TOTAL_CONVERSIONS)
  };

  // 2) Por campanha (top por impressões) — tolerante a falha (alguns escopos não liberam)
  let campanhas = [];
  try {
    const list = await api('/ad_accounts/' + acc + '/campaigns', { page_size: 50 });
    const nomes = {};
    (list.items || []).forEach(c => { nomes[c.id] = c.name; });
    const rep = await api('/ad_accounts/' + acc + '/campaigns/analytics',
      Object.assign({}, base, { campaign_ids: (list.items || []).map(c => c.id).slice(0, 50).join(',') }));
    const rows = Array.isArray(rep) ? rep : (rep.data || []);
    campanhas = rows.map(r => ({
      nome: nomes[r.CAMPAIGN_ID || r.campaign_id] || (r.CAMPAIGN_ID || r.campaign_id || '—'),
      impressoes: num(r.IMPRESSION_1), cliques: num(r.PIN_CLICK), gasto: num(r.SPEND_IN_DOLLAR)
    })).sort((a, b) => b.impressoes - a.impressoes).slice(0, 10);
  } catch (e) { campanhas = []; }

  // 3) Pins de melhor desempenho (top por impressões) — também tolerante a falha
  let pins = [];
  try {
    const rep = await api('/ad_accounts/' + acc + '/pin_promotion_products/analytics', base).catch(() => null);
    const rows = rep ? (Array.isArray(rep) ? rep : (rep.data || [])) : [];
    pins = rows.map(r => ({ pin: r.PIN_PROMOTION_ID || r.pin_id || '—', impressoes: num(r.IMPRESSION_1), cliques: num(r.PIN_CLICK) }))
      .sort((a, b) => b.impressoes - a.impressoes).slice(0, 8);
  } catch (e) { pins = []; }

  return { adAccountId: acc, periodo: range.from + ' a ' + range.to, totais, campanhas, pins };
}

module.exports = { configured, fetchPinterest };
