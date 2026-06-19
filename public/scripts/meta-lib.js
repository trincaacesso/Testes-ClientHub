/**
 * meta-lib.js — lógica de coleta de criativos + métricas do Meta Ads (Graph API).
 * Usado tanto pelo servidor (endpoint /api/meta em tempo real) quanto pelo
 * script meta-fetch.js (snapshot estático). Node puro, sem dependências.
 */
const https = require('https');
const API = 'v21.0';
const base = `https://graph.facebook.com/${API}`;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(buf);
          if (j.error) return reject(new Error(j.error.message || JSON.stringify(j.error)));
          resolve(j);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
async function getAll(url) {
  let out = [], next = url;
  while (next) {
    const j = await get(next);
    if (Array.isArray(j.data)) out = out.concat(j.data);
    next = j.paging && j.paging.next ? j.paging.next : null;
  }
  return out;
}
const qs = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

// normaliza p/ comparar nomes de campanha (minúsculas + sem acento)
const stripAccents = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// campaignFilter: string (substring) ou objeto { all:[], any:[], not:[] } — tudo case/acento-insensível
function campMatches(name, f) {
  if (!f) return true;
  const n = stripAccents(name);
  if (typeof f === 'string') return n.includes(stripAccents(f));
  if (f.all && !f.all.every(t => n.includes(stripAccents(t)))) return false;
  if (f.any && f.any.length && !f.any.some(t => n.includes(stripAccents(t)))) return false;
  if (f.not && f.not.some(t => n.includes(stripAccents(t)))) return false;
  return true;
}

// métrica unificada de "resultados" do Meta: leads (formulário/pixel) + conversas (WhatsApp/Messenger).
// Campanhas de mensagem NÃO geram action_type 'lead' — geram messaging_conversation_started.
function leadsFrom(actions, customIds, formOnly) {
  if (!Array.isArray(actions)) return 0;
  const v = t => { const a = actions.find(x => x.action_type === t); return a ? Math.round(+a.value || 0) : 0; };
  // Modo conversão PERSONALIZADA: conta só as conversões escolhidas pelo cliente (offsite_conversion.custom.<id>).
  if (customIds && customIds.length) return customIds.reduce((s, id) => s + v('offsite_conversion.custom.' + id), 0);
  // leads diretos (form on-Facebook + site/pixel). O 'lead' do Meta já é o total unificado
  // (= lead_grouped + onsite_web_lead); uso Math.max p/ não contar em dobro e cobrir contas que só reportem um deles.
  const lead = Math.max(v('lead'), v('onsite_conversion.lead_grouped'), v('offsite_conversion.fb_pixel_lead'), v('onsite_web_lead'));
  // Modo SÓ FORMULÁRIO: ignora conversas de WhatsApp/Messenger (bate com a coluna "Leads (formulário)" do Gerenciador).
  if (formOnly) return lead;
  // conversas iniciadas por mensagem (WhatsApp/Messenger)
  const msg = v('onsite_conversion.messaging_conversation_started_7d');
  return lead + msg;
}
function ddmmyyyy() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Busca os dados do Meta Ads e devolve o objeto pronto para o dashboard.
 * @param {string} token   access token (user ou system user)
 * @param {string} account ex.: act_1658989684627909
 * @param {string} preset  ex.: last_30d
 * @param {number} maxCrt  máx. de criativos
 */
async function fetchMetaData(token, account, preset = 'last_30d', maxCrt = 24, customLeadIds = null, campaignFilter = null, formOnly = false) {
  if (!token) throw new Error('token ausente');
  // preset pode ser uma string (ex.: 'last_30d') OU um objeto {since,until} p/ janela histórica
  const dp = (preset && typeof preset === 'object' && preset.since)
    ? { time_range: JSON.stringify({ since: preset.since, until: preset.until }) }
    : { date_preset: preset || 'last_30d' };
  const periodoLbl = dp.time_range ? (preset.since + ' a ' + preset.until) : (preset || 'last_30d');

  // 0) FILTRO por campanha (empreendimento dentro de conta geral): resolve os IDs das campanhas que casam
  // pelo nome e restringe TODOS os insights a elas (campaign.id IN [...]).
  let fil = {};
  if (campaignFilter) {
    const allCamps = await getAll(`${base}/${account}/campaigns?` + qs({ fields: 'id,name', limit: 500, access_token: token }));
    const ids = allCamps.filter(c => campMatches(c.name, campaignFilter)).map(c => c.id);
    if (!ids.length) {
      // nenhuma campanha casou → devolve estrutura vazia (sem erro)
      return { conta: '', contaId: account, periodo: periodoLbl,
        totais: { spend: 0, impr: 0, clicks: 0, leads: 0, cpl: 0 }, dias: [], regioes: [], criativos: [], gerado: ddmmyyyy() };
    }
    fil = { filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ids }]) };
  }

  // 1) Totais da conta
  const acc = (await get(`${base}/${account}/insights?` + qs({
    level: 'account', fields: 'spend,impressions,clicks,actions',
    ...dp, ...fil, access_token: token
  }))).data[0] || {};
  const totais = {
    spend: +(+acc.spend || 0).toFixed(2),
    impr: +acc.impressions || 0,
    clicks: +acc.clicks || 0,
    leads: leadsFrom(acc.actions, customLeadIds, formOnly)
  };

  // 1b) Série DIÁRIA (time_increment=1) — alimenta o dashboard "igual ao Google"
  const daily = await getAll(`${base}/${account}/insights?` + qs({
    level: 'account', fields: 'spend,impressions,clicks,actions',
    ...dp, ...fil, time_increment: 1, access_token: token
  }));
  const dias = daily.map(r => ({
    data: r.date_start,
    custo: +(+r.spend || 0).toFixed(2),
    conv: leadsFrom(r.actions, customLeadIds, formOnly),
    cliques: +r.clicks || 0,
    impr: +r.impressions || 0
  })).sort((a, b) => a.data < b.data ? -1 : 1);

  // 1c) Quebra por CAMPANHA — alimenta o doughnut + "Top campanhas"
  const camps = await getAll(`${base}/${account}/insights?` + qs({
    level: 'campaign', fields: 'campaign_name,spend',
    ...dp, ...fil, limit: 200, access_token: token
  }));
  const byCamp = {};
  camps.forEach(r => { const v = +(+r.spend || 0); if (v > 0) { const n = r.campaign_name || '—'; byCamp[n] = (byCamp[n] || 0) + v; } });
  const ordC = Object.entries(byCamp).sort((a, b) => b[1] - a[1]);
  const regioes = ordC.slice(0, 9).map(([n, v]) => [n.length > 28 ? n.slice(0, 26) + '…' : n, +v.toFixed(2)]);
  const restoC = ordC.slice(9).reduce((a, [, v]) => a + v, 0);
  if (restoC > 0) regioes.push(['Outras campanhas', +restoC.toFixed(2)]);

  // 2) Insights por anúncio
  const ins = await getAll(`${base}/${account}/insights?` + qs({
    level: 'ad', fields: 'ad_id,ad_name,spend,impressions,clicks,ctr,actions',
    ...dp, ...fil, limit: 200, access_token: token
  }));
  const byId = {};
  ins.forEach(r => {
    byId[r.ad_id] = {
      id: r.ad_id, nome: r.ad_name,
      spend: +(+r.spend || 0).toFixed(2),
      impr: +r.impressions || 0,
      clicks: +r.clicks || 0,
      ctr: +(+r.ctr || 0).toFixed(2),
      leads: leadsFrom(r.actions, customLeadIds, formOnly)
    };
  });

  // 3) Criativo + status (lotes de 50). Guarda miniatura, story_id, page_id e hash.
  const ids = Object.keys(byId);
  const pageOf = {}, storyOf = {}, hashOf = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await get(`${base}/?` + qs({
      ids: chunk.join(','),
      fields: 'effective_status,creative{thumbnail_url,image_url,effective_object_story_id,object_story_spec{page_id},asset_feed_spec{images}}',
      access_token: token
    }));
    chunk.forEach(id => {
      const node = r[id] || {}, cr = node.creative || {};
      byId[id].status = node.effective_status || '';
      byId[id].img = cr.image_url || cr.thumbnail_url || '';
      if (cr.effective_object_story_id) storyOf[id] = cr.effective_object_story_id;
      if (cr.object_story_spec && cr.object_story_spec.page_id) pageOf[id] = cr.object_story_spec.page_id;
      const imgs = cr.asset_feed_spec && cr.asset_feed_spec.images;
      if (imgs && imgs[0] && imgs[0].hash) hashOf[id] = imgs[0].hash;
    });
  }

  // 3b) Imagem em ALTA: token de cada Página -> full_picture do post original.
  const pageIds = [...new Set(Object.values(pageOf))];
  const pageTokens = {};
  for (const pid of pageIds) {
    try {
      const pt = (await get(`${base}/${pid}?` + qs({ fields: 'access_token', access_token: token }))).access_token;
      if (pt) pageTokens[pid] = pt;
    } catch (e) { /* mantém miniatura */ }
  }
  const fullPic = {};
  const allSids = [...new Set(ids.filter(id => storyOf[id]).map(id => storyOf[id]))];
  for (const sid of allSids) {
    const owner = ids.find(id => storyOf[id] === sid && pageOf[id]) || '';
    const pt = pageTokens[pageOf[owner]];
    if (!pt) continue;
    try {
      const r = await get(`${base}/${sid}?` + qs({ fields: 'full_picture,attachments{media}', access_token: pt }));
      const att = r.attachments && r.attachments.data && r.attachments.data[0];
      const attSrc = att && att.media && att.media.image && att.media.image.src;
      const url = r.full_picture || attSrc;
      if (url) fullPic[sid] = url;
    } catch (e) { /* mantém miniatura */ }
  }
  // 3c) Advantage+ sem foto no post: resolve hash via /adimages.
  const needHash = ids.filter(id => hashOf[id] && !(storyOf[id] && fullPic[storyOf[id]]));
  const hashes = [...new Set(needHash.map(id => hashOf[id]))];
  const hashUrl = {};
  for (let i = 0; i < hashes.length; i += 40) {
    const chunk = hashes.slice(i, i + 40);
    try {
      const r = await get(`${base}/${account}/adimages?` + qs({
        hashes: JSON.stringify(chunk), fields: 'hash,url,permalink_url', access_token: token
      }));
      (r.data || []).forEach(im => { hashUrl[im.hash] = im.url || im.permalink_url; });
    } catch (e) { /* mantém miniatura */ }
  }
  ids.forEach(id => {
    const sid = storyOf[id];
    if (sid && fullPic[sid]) byId[id].img = fullPic[sid];
    else if (hashOf[id] && hashUrl[hashOf[id]]) byId[id].img = hashUrl[hashOf[id]];
  });

  // 4) Lista final: gasto > 0, ordenada por gasto desc, top maxCrt.
  const criativos = ids.map(id => byId[id])
    .filter(a => a.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, maxCrt)
    .map(a => ({ ...a, cpl: a.leads ? +(a.spend / a.leads).toFixed(2) : 0 }));

  return {
    conta: 'All Pé Brasil',
    contaId: account,
    periodo: periodoLbl,
    totais: { ...totais, cpl: totais.leads ? +(totais.spend / totais.leads).toFixed(2) : 0 },
    dias,
    regioes,
    criativos,
    gerado: ddmmyyyy()
  };
}

module.exports = { fetchMetaData };
