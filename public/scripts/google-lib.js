/**
 * google-lib.js — coleta do Google Ads via API oficial, POR CLIENTE.
 * Usado pelo servidor (endpoint /api/google?cli=) e pelo script de snapshot.
 * Node 18+ (fetch global). Sem dependências.
 *
 * 1 conjunto de chaves (MCC) acessa TODAS as contas — o customerId vem por cliente.
 * Env: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
 *      GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID
 */
'use strict';
// Versões candidatas da API (Google descontinua versões antigas ~3x/ano).
// Tenta da mais nova p/ mais antiga, usa a 1ª que responder e memoriza.
const CANDIDATE_VERSIONS = process.env.GOOGLE_ADS_API_VERSION
  ? [process.env.GOOGLE_ADS_API_VERSION]
  : ['v21', 'v20', 'v19', 'v18'];
let _workingVersion = null;
function env(k) { const v = process.env[k]; if (!v) throw new Error('Falta env ' + k); return v; }

let _tok = { value: null, exp: 0 };
async function accessToken() {
  if (_tok.value && Date.now() < _tok.exp) return _tok.value;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_ADS_CLIENT_ID'), client_secret: env('GOOGLE_ADS_CLIENT_SECRET'),
      refresh_token: env('GOOGLE_ADS_REFRESH_TOKEN'), grant_type: 'refresh_token'
    })
  });
  if (!r.ok) throw new Error('OAuth ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  _tok = { value: j.access_token, exp: Date.now() + ((j.expires_in || 3000) - 60) * 1000 };
  return _tok.value;
}

function shortName(name) {
  const clean = (name || '—').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
  return (clean || name || '—').slice(0, 30);
}

/**
 * @param {string} customerId  conta do cliente (só dígitos)
 * @param {number} days        janela (padrão 31, terminando ONTEM)
 * @returns {dias, regioes, totais}
 */
async function fetchGoogleAds(customerId, days = 31) {
  const cid = String(customerId).replace(/\D/g, '');
  if (!cid) throw new Error('customerId vazio');
  const login = env('GOOGLE_ADS_LOGIN_CUSTOMER_ID').replace(/\D/g, '');
  const dev = env('GOOGLE_ADS_DEVELOPER_TOKEN');

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hoje = new Date();
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - 1));
  const ini = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate() - (days - 1)));
  const from = ymd(ini), to = ymd(fim);

  const token = await accessToken();
  const query = `SELECT campaign.name, campaign.status, campaign.advertising_channel_type, segments.date, metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.impressions > 0`;

  const versions = _workingVersion ? [_workingVersion] : CANDIDATE_VERSIONS;
  let batches = null;
  for (const v of versions) {
    const r = await fetch(`https://googleads.googleapis.com/${v}/customers/${cid}/googleAds:searchStream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'developer-token': dev, 'login-customer-id': login, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (r.status === 404) continue;                 // versão inexistente/descontinuada → tenta a próxima
    if (!r.ok) throw new Error('Google Ads ' + r.status + ' (' + v + '): ' + (await r.text()).slice(0, 220));
    _workingVersion = v;                            // memoriza a versão que funcionou
    batches = await r.json();
    break;
  }
  if (!batches) throw new Error('Nenhuma versão da API aceita (todas 404): tentei ' + versions.join(', '));
  const rows = batches.flatMap(b => b.results || []);

  const porDia = {}, porCamp = {};
  let TOT = { custo: 0, conv: 0, cliques: 0, impr: 0 }, PMAX = { custo: 0, conv: 0, cliques: 0 };
  for (const row of rows) {
    const c = row.campaign || {}, m = row.metrics || {}, s = row.segments || {};
    const custo = Number(m.costMicros || 0) / 1e6, conv = Math.round(Number(m.conversions || 0)),
          cliques = Number(m.clicks || 0), impr = Number(m.impressions || 0);
    const d = s.date; (porDia[d] = porDia[d] || { data: d, custo: 0, conv: 0, cliques: 0, impr: 0, pmax: { custo: 0, conv: 0, cliques: 0 } });
    porDia[d].custo += custo; porDia[d].conv += conv; porDia[d].cliques += cliques; porDia[d].impr += impr;
    TOT.custo += custo; TOT.conv += conv; TOT.cliques += cliques; TOT.impr += impr;
    if ((c.advertisingChannelType || '') === 'PERFORMANCE_MAX' || /\[pmax\]|performance max/i.test(c.name || '')) {
      PMAX.custo += custo; PMAX.conv += conv; PMAX.cliques += cliques;
      porDia[d].pmax.custo += custo; porDia[d].pmax.conv += conv; porDia[d].pmax.cliques += cliques;   // PMax por dia (p/ o split por período no dash)
    }
    if (c.status === 'ENABLED') { const n = shortName(c.name); porCamp[n] = (porCamp[n] || 0) + custo; }
  }
  // Top palavras-chave do período (agregado). Falha aqui NÃO derruba o resto (contas só-PMax não têm keywords).
  let keywords = [];
  try {
    const kwQuery = `SELECT ad_group_criterion.keyword.text, metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions FROM keyword_view WHERE segments.date BETWEEN '${from}' AND '${to}' AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC LIMIT 40`;
    const kr = await fetch(`https://googleads.googleapis.com/${_workingVersion}/customers/${cid}/googleAds:searchStream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'developer-token': dev, 'login-customer-id': login, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: kwQuery })
    });
    if (kr.ok) {
      const kb = await kr.json();
      const porKw = {};
      kb.flatMap(b => b.results || []).forEach(row => {
        const t = (row.adGroupCriterion && row.adGroupCriterion.keyword && row.adGroupCriterion.keyword.text) || '';
        if (!t) return;
        const m = row.metrics || {};
        const o = porKw[t] || (porKw[t] = { kw: t, custo: 0, conv: 0, cliques: 0, impr: 0 });
        o.custo += Number(m.costMicros || 0) / 1e6; o.conv += Math.round(Number(m.conversions || 0));
        o.cliques += Number(m.clicks || 0); o.impr += Number(m.impressions || 0);
      });
      keywords = Object.values(porKw).map(k => ({ ...k, custo: +k.custo.toFixed(2) }))
        .sort((a, b) => (b.conv - a.conv) || (b.custo - a.custo)).slice(0, 15);
    }
  } catch (e) { /* keywords são opcionais */ }

  // Criativos de IMAGEM (PMax + Display). Search não tem imagem. Falha NÃO derruba o resto; erro/diagnóstico expostos.
  let criativos = [], criativosErro = '', criativosDebug = '';
  const hdrs = { Authorization: `Bearer ${token}`, 'developer-token': dev, 'login-customer-id': login, 'Content-Type': 'application/json' };
  const runQ = async (qq) => {
    const rr = await fetch(`https://googleads.googleapis.com/${_workingVersion}/customers/${cid}/googleAds:searchStream`, { method: 'POST', headers: hdrs, body: JSON.stringify({ query: qq }) });
    if (!rr.ok) throw new Error(rr.status + ': ' + (await rr.text()).slice(0, 200));
    return (await rr.json()).flatMap(b => b.results || []);
  };
  // pega a 1ª URL de imagem que existir na estrutura do asset (cobre variações de campo)
  const imgUrl = a => (a && a.imageAsset && ((a.imageAsset.fullSize && a.imageAsset.fullSize.url) || a.imageAsset.url)) || '';
  try {
    const rows = await runQ(`SELECT asset.id, asset.name, asset.image_asset.full_size.url, asset_group_asset.field_type, asset_group_asset.performance_label, asset_group.id, asset_group.name FROM asset_group_asset WHERE asset_group_asset.status = 'ENABLED'`);
    const seen = {};
    rows.forEach(row => {
      const a = row.asset || {}, aga = row.assetGroupAsset || {}, g = row.assetGroup || {};
      const url = imgUrl(a); if (!url || seen[a.id]) return; seen[a.id] = 1;
      criativos.push({ id: a.id, nome: a.name || '(imagem)', img: url, perf: aga.performanceLabel || '', tipo: aga.fieldType || '', grupo: g.name || '', grupoId: g.id || '' });
    });
    criativosDebug = 'pmax_rows=' + rows.length + ' imgs=' + criativos.length;
    if (!criativos.length && rows.length) criativosDebug += ' sample=' + JSON.stringify(rows[0]).slice(0, 300);
  } catch (e) { criativosErro = 'PMax: ' + e.message; }
  if (!criativos.length) {
    try {
      const rows = await runQ(`SELECT asset.id, asset.name, asset.type, asset.image_asset.full_size.url FROM asset WHERE asset.type = 'IMAGE'`);
      const seen = {};
      rows.forEach(row => {
        const a = row.asset || {}; const url = imgUrl(a); if (!url || seen[a.id]) return; seen[a.id] = 1;
        criativos.push({ id: a.id, nome: a.name || '(imagem)', img: url, perf: '', tipo: 'IMAGE', grupo: '' });
      });
      criativosDebug += ' | asset_rows=' + rows.length + ' imgs=' + criativos.length;
      if (!criativos.length && rows.length) criativosDebug += ' sample=' + JSON.stringify(rows[0]).slice(0, 300);
    } catch (e) { criativosErro = (criativosErro ? criativosErro + ' | ' : '') + 'asset: ' + e.message; }
  }
  criativos = criativos.slice(0, 40);
  // Métricas POR GRUPO DE RECURSOS (asset group). O PMax não expõe métrica por imagem;
  // o número mostrado em cada imagem é o desempenho do grupo a que ela pertence.
  // segments.date só no WHERE => métricas já vêm AGREGADAS no período (1 linha por grupo).
  try {
    const gids = [...new Set(criativos.map(c => c.grupoId).filter(Boolean))];
    if (gids.length) {
      const gm = await runQ(`SELECT asset_group.id, metrics.clicks, metrics.impressions, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion, metrics.conversions_from_interactions_rate FROM asset_group WHERE segments.date BETWEEN '${from}' AND '${to}'`);
      const map = {};
      gm.forEach(row => {
        const id = row.assetGroup && row.assetGroup.id; if (!id) return;
        const m = row.metrics || {};
        map[id] = {
          cliques: Number(m.clicks || 0),
          impr: Number(m.impressions || 0),
          ctr: +((Number(m.ctr || 0)) * 100).toFixed(2),
          cpc: +(Number(m.averageCpc || 0) / 1e6).toFixed(2),
          custo: +(Number(m.costMicros || 0) / 1e6).toFixed(2),
          conv: +(Number(m.conversions || 0)).toFixed(2),
          cpa: +(Number(m.costPerConversion || 0) / 1e6).toFixed(2),
          taxa: +((Number(m.conversionsFromInteractionsRate || 0)) * 100).toFixed(2)
        };
      });
      criativos.forEach(c => { if (c.grupoId && map[c.grupoId]) c.stats = map[c.grupoId]; });
    }
  } catch (e) { criativosErro = (criativosErro ? criativosErro + ' | ' : '') + 'grpMetrics: ' + e.message; }

  const dias = Object.values(porDia).sort((a, b) => a.data < b.data ? -1 : 1)
    .map(x => ({ data: x.data, custo: +x.custo.toFixed(2), conv: x.conv, cliques: x.cliques, impr: x.impr,
      pmax: { custo: +(x.pmax ? x.pmax.custo : 0).toFixed(2), conv: x.pmax ? x.pmax.conv : 0, cliques: x.pmax ? x.pmax.cliques : 0 } }));
  const ord = Object.entries(porCamp).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const regioes = ord.slice(0, 9).map(([n, v]) => [n, +v.toFixed(2)]);
  const resto = ord.slice(9).reduce((a, [, v]) => a + v, 0);
  if (resto > 0) regioes.push(['Outros', +resto.toFixed(2)]);
  return {
    dias, regioes, keywords, criativos, criativosErro, criativosDebug,
    totais: { custo: +TOT.custo.toFixed(2), conv: TOT.conv, cliques: TOT.cliques, impr: TOT.impr,
      pmax: { custo: +PMAX.custo.toFixed(2), conv: PMAX.conv, cliques: PMAX.cliques } }
  };
}

module.exports = { fetchGoogleAds };
