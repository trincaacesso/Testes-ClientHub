/**
 * expad-lib.js — busca dados de vendas da Expad via URL (webhook/insights).
 * A URL vem de env (EXPAD_WEBHOOK_URL) ou de clients.json (expad.webhookUrl).
 * Node 18+ (fetch global). Sem dependências.
 *
 * Normaliza para o formato que o front espera: { sales: {...}, _meta:{...} }.
 * Aceita: (a) formato "insights" da Expad (attributionUserPerformances...),
 *         (b) algo que já tenha .sales (passa adiante),
 *         (c) formato desconhecido → devolve cru em .raw p/ inspeção.
 */
'use strict';

function normalize(json) {
  if (json && json.sales) return { sales: json.sales };
  if (json && (json.attributionUserPerformances || json.productPerformances || json.statusPerformances || json.sourcePerformances || json.campaignProviderPerformances || json.typePerformances)) {
    let totalSaleCount = 0, totalSaleValue = 0, totalLeadCount = 0;
    (json.attributionUserPerformances || []).forEach(p => {
      totalSaleCount += (p.saleCount || 0);
      totalLeadCount += (p.leadCount || 0);
      totalSaleValue += (Number(p.saleValueMicros) || 0) / 1e6;
    });
    const topProducts = (json.productPerformances || [])
      .filter(p => (p.count || 0) > 0)
      .sort((a, b) => (b.saleValue || 0) - (a.saleValue || 0))
      .slice(0, 5)
      .map(p => ({ name: p.name || '(sem nome)', count: p.count || 0, saleValue: p.saleValue || 0 }));
    const statusBreakdown = (json.statusPerformances || []).map(s => ({ status: s.key, count: s.value }));
    const avgTicket = totalSaleCount > 0 ? totalSaleValue / totalSaleCount : 0;
    const convRate = totalLeadCount > 0 ? (totalSaleCount / totalLeadCount) * 100 : 0;
    // Contagem por status (regex no nome)
    const statusCount = (re) => statusBreakdown
      .filter(s => re.test(String(s.status || ''))).reduce((a, s) => a + (Number(s.count) || 0), 0);
    // novos leads = total de leads no período (soma de todos os status; cobre contas tipo Urba: NEW/ACTIVE/LOST)
    const novos = statusBreakdown.reduce((a, s) => a + (Number(s.count) || 0), 0) || totalLeadCount;
    const qualificados = statusCount(/qualif|active|andamento|negocia|propost|agendad/i);   // em progresso/qualificado
    const ganhos = statusCount(/^complete$|ganho|won|conclu|vend|fechad/i);                  // negócios ganhos
    // Valor do ganho: usa saleValueMicros; se vier 0, soma productPerformances.saleValue
    let valorGanho = totalSaleValue;
    if (!valorGanho) valorGanho = (json.productPerformances || []).reduce((a, p) => a + (Number(p.saleValue) || 0), 0);
    return { sales: { totalCount: totalSaleCount, totalValue: totalSaleValue, avgTicket, convRate, leadCount: totalLeadCount, novos, qualificados, ganhos, valorGanho, topProducts, statusBreakdown } };
  }
  return { sales: null, raw: json }; // formato desconhecido — para ajustarmos o parse
}

/**
 * @param {object} cfg   { webhookUrl }  OU  { apiKey, accountId }  (API direta, chave por cliente)
 * @param {object} opts  { from, to } (YYYY-MM-DD)
 */
async function fetchExpad(cfg, opts = {}) {
  cfg = cfg || {};
  let url, headers = { Accept: 'application/json' };
  if (cfg.webhookUrl) {
    url = cfg.webhookUrl;                                   // modo URL/webhook (Make)
  } else if (cfg.apiKey && cfg.accountId) {
    url = 'https://api.expad.com.br/v1/account/' + String(cfg.accountId).replace(/[^0-9A-Za-z_-]/g, '') + '/insights';
    headers['X-API-Key'] = cfg.apiKey;                      // modo API direta (chave por cliente)
  } else {
    throw new Error('Expad: configure uma URL (webhook) OU a chave da API + accountId');
  }
  // Expad é exigente com o período → tenta vários candidatos até aceitar (formato T00:00:00Z).
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const Z = s => s + 'T00:00:00Z';
  const yy = now.getUTCFullYear(), mm = pad(now.getUTCMonth() + 1);
  const nm = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const nextMonth = Z(nm.getUTCFullYear() + '-' + pad(nm.getUTCMonth() + 1) + '-01');
  const firstOfMonth = Z(yy + '-' + mm + '-01');
  const cands = [];
  if (opts.from && /^\d{4}-\d{2}-\d{2}/.test(opts.from)) {
    cands.push([Z(opts.from.slice(0, 10)), (opts.to && /^\d{4}-\d{2}-\d{2}/.test(opts.to)) ? Z(opts.to.slice(0, 10)) : nextMonth]);
  }
  cands.push([firstOfMonth, nextMonth]);                       // mês corrente
  cands.push([Z(yy + '-01-01'), nextMonth]);                   // desde início do ano

  const buildUrl = (f, t) => {
    try {
      const u = new URL(url);
      u.searchParams.set('from', f); u.searchParams.set('to', t);
      if (opts.source) u.searchParams.set('source', opts.source);   // experimento: filtro por fonte
      return u.toString();
    } catch (e) {
      return url + (url.includes('?') ? '&' : '?') + 'from=' + encodeURIComponent(f) + '&to=' + encodeURIComponent(t) + (opts.source ? '&source=' + encodeURIComponent(opts.source) : '');
    }
  };

  const mode = cfg.apiKey ? 'api' : (cfg.webhookUrl ? 'webhook' : '?');
  let r, lastDetail = '', usedFrom = '', usedTo = '';
  for (const [f, t] of cands) {
    r = await fetch(buildUrl(f, t), { headers });
    if (r.ok) { usedFrom = f; usedTo = t; break; }
    lastDetail = (await r.text()).slice(0, 220);
    if (r.status !== 400) throw new Error('Expad [' + mode + '] ' + r.status + ': ' + lastDetail);   // erro não-400 → para
  }
  if (!r || !r.ok) throw new Error('Expad [' + mode + '] 400 (enviei from=' + (cands[0] ? cands[0][0] : '?') + '): ' + lastDetail);
  let json;
  try { json = await r.json(); } catch (e) { throw new Error('Expad retornou resposta não-JSON'); }
  if (opts.debug) return { raw: json, _meta: { from: usedFrom, to: usedTo, mode: cfg.apiKey ? 'api' : 'webhook' } };
  const out = normalize(json);
  out._meta = { fetchedAt: new Date().toISOString(), from: opts.from || null, to: opts.to || null };
  return out;
}

module.exports = { fetchExpad };
