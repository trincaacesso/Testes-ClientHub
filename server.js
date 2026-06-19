/**
 * server.js — Sistema multi-cliente (multi-tenant) de dashboards.
 * Node puro, sem dependências.
 *
 *  /                  -> agência: lista de clientes  | cliente: redireciona p/ o seu
 *  /login /logout     -> autenticação (cookie assinado)
 *  /c/<id>            -> dashboard do cliente <id> (template index.html parametrizado)
 *  /data/<id>/...     -> dados do cliente (protegido por acesso)
 *  /api/meta?cli=<id> -> Meta Ads ao vivo do cliente (1 token cobre todas as contas)
 *  /api/clients       -> (agência) lista para a landing
 *
 * Variáveis de ambiente:
 *  AGENCY_PASS     senha da agência (vê todos)         [padrão: agencia123]
 *  SESSION_SECRET  segredo p/ assinar o cookie         [padrão: dev-secret]
 *  META_TOKEN      token único do Business (todas contas)
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { fetchMetaData } = require('./scripts/meta-lib');
const { fetchGoogleAds } = require('./scripts/google-lib');
const { fetchExpad } = require('./scripts/expad-lib');
const ga4 = require('./scripts/ga4-lib');
const pinterest = require('./scripts/pinterest-lib');
const { fetchTiktokData, exchangeAuthCode, getAuthorizedAdvertisers } = require('./scripts/tiktok-lib');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, 'public');
const AGENCY_PASS = process.env.AGENCY_PASS || 'agencia123';
const SECRET = process.env.SESSION_SECRET || 'dev-secret-troque-em-producao';
const META_TOKEN = process.env.META_TOKEN || '';
const META_PRESET = process.env.META_PRESET || 'last_30d';
const META_TTL_MS = (parseInt(process.env.META_CACHE_MIN || '180', 10)) * 60 * 1000;
// ---- TikTok Ads (token único do app cobre os anunciantes autorizados) ----
const TIKTOK_TOKEN = process.env.TIKTOK_ACCESS_TOKEN || '';
const TIKTOK_APP_ID = process.env.TIKTOK_APP_ID || '';
const TIKTOK_APP_SECRET = process.env.TIKTOK_APP_SECRET || '';
const TIKTOK_TTL_MS = (parseInt(process.env.TIKTOK_CACHE_MIN || '180', 10)) * 60 * 1000;

const CLIENTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'clients.json'), 'utf8'));
// Usuários internos (cargos admin/analista). Senha pode vir de env USER_PASS_<USUARIO>.
let USERS = {};
try { USERS = JSON.parse(fs.readFileSync(path.join(__dirname, 'users.json'), 'utf8')); delete USERS._comment; } catch (e) { USERS = {}; }
function userPass(u) { return process.env['USER_PASS_' + String(u).toUpperCase()] || (USERS[u] && USERS[u].senha) || ''; }

// ---------- Troca de senha (overrides hasheados; padrão continua no clients.json) ----------
// Persistência: arquivo passwords.json. Em DATA_DIR (ex.: disco persistente do Render) se definido.
const PASS_FILE = path.join(process.env.DATA_DIR || __dirname, 'passwords.json');
let PASS_OVERRIDES = {};
try { PASS_OVERRIDES = JSON.parse(fs.readFileSync(PASS_FILE, 'utf8')); } catch (e) { PASS_OVERRIDES = {}; }
function savePassOverrides() { try { fs.writeFileSync(PASS_FILE, JSON.stringify(PASS_OVERRIDES, null, 2)); return true; } catch (e) { console.error('Falha ao salvar passwords.json:', e.message); return false; } }
function hashPass(pw) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex'); }
function verifyHash(pw, stored) { try { const [salt, h] = String(stored).split(':'); const k = crypto.scryptSync(String(pw), salt, 32).toString('hex'); const a = Buffer.from(k, 'hex'), b = Buffer.from(h, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch (e) { return false; } }
// senha "atual" correta? (override hasheado se existir, senão o padrão)
function checkPass(idKey, defaultPass, pass) {
  const ov = PASS_OVERRIDES[idKey];
  return ov ? verifyHash(pass, ov) : (defaultPass != null && pass === defaultPass);
}

// Janela histórica: por padrão do 1º de janeiro do ano atual até hoje.
// Override fixo via env HISTORY_DAYS (nº de dias). Limitada a 400 dias.
const _p2 = x => String(x).padStart(2, '0');
const _ymd = d => d.getUTCFullYear() + '-' + _p2(d.getUTCMonth() + 1) + '-' + _p2(d.getUTCDate());
function historyDays() {
  const env = parseInt(process.env.HISTORY_DAYS || '', 10);
  if (env) return Math.max(7, Math.min(400, env));
  const n = new Date();
  const jan1 = Date.UTC(n.getUTCFullYear(), 0, 1);
  const days = Math.floor((Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) - jan1) / 864e5) + 1;
  return Math.max(31, Math.min(400, days));
}
function historyRange() { // p/ Meta (time_range since/until)
  const until = _ymd(new Date());
  const d = new Date(); d.setUTCDate(d.getUTCDate() - (historyDays() - 1));
  return { since: _ymd(d), until };
}
function rangeFromDays(days) { // janela de N dias terminando hoje (p/ Meta)
  const until = _ymd(new Date());
  const d = new Date(); d.setUTCDate(d.getUTCDate() - (days - 1));
  return { since: _ymd(d), until };
}
// Resolve o período a partir de from/to (YYYY-MM-DD) explícitos ou de uma janela de N dias.
// Limita o intervalo a `maxSpan` dias (protege o servidor de pedidos absurdos).
function resolveRange(fromQ, toQ, days, maxSpan = 400) {
  const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  if (isYmd(fromQ) && isYmd(toQ)) {
    let since = fromQ, until = toQ;
    if (since > until) { const t = since; since = until; until = t; }
    const MS = 864e5;
    const span = Math.floor((Date.parse(until + 'T00:00:00Z') - Date.parse(since + 'T00:00:00Z')) / MS) + 1;
    if (span > maxSpan) since = _ymd(new Date(Date.parse(until + 'T00:00:00Z') - (maxSpan - 1) * MS));
    return { since, until };
  }
  const d = days ? Math.max(1, Math.min(maxSpan, days)) : historyDays();
  return rangeFromDays(d);
}

// ---------- cookie assinado ----------
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + mac;
}
function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, mac] = token.split('.');
  const exp = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac !== exp) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch (e) { return null; }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('='); if (i < 0) return;
    out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function session(req) { return verify(parseCookies(req).sess); }
const isStaff = sess => sess && (sess.role === 'admin' || sess.role === 'analista' || sess.role === 'agency');
function canSee(sess, cli) { return sess && (isStaff(sess) || sess.cli === cli); }

// ---------- Meta Ads (cache por cliente) ----------
const metaCache = {}; // cli -> {data, ts, inflight}
function getMeta(cli, account, days, campFilter) {
  const d = days ? Math.max(1, Math.min(400, days)) : 0;
  const range = d ? rangeFromDays(d) : historyRange();
  const fkey = campFilter ? JSON.stringify(campFilter) : '';
  const key = cli + '|' + (account || '') + '|' + (d || 'h') + '|' + fkey;
  const slot = metaCache[key] || (metaCache[key] = { data: null, ts: 0, inflight: null });
  const now = Date.now();
  if (slot.data && (now - slot.ts) < META_TTL_MS) return Promise.resolve(slot.data);
  if (slot.inflight) return slot.inflight;
  slot.inflight = (async () => {
    try {
      const data = await fetchMetaData(META_TOKEN, account, range, 24, (CLIENTS[cli] || {}).metaCustomLeadIds, campFilter || null, (CLIENTS[cli] || {}).metaLeadsFormOnly || false);
      slot.data = data; slot.ts = Date.now(); slot.inflight = null;
      return data;
    } catch (e) { slot.inflight = null; throw e; }
  })();
  return slot.inflight;
}

// ---------- Google Ads (cache por cliente) ----------
const GOOGLE_TTL_MS = (parseInt(process.env.GOOGLE_CACHE_MIN || '360', 10)) * 60 * 1000; // 6h padrão
const googleCache = {}; // cli -> {data, ts, inflight}
function getGoogle(cli, cid, days) {
  const d = days ? Math.max(1, Math.min(400, days)) : historyDays();
  const key = cli + '|' + (cid || '') + '|' + d;
  const slot = googleCache[key] || (googleCache[key] = { data: null, ts: 0, inflight: null });
  const now = Date.now();
  if (slot.data && (now - slot.ts) < GOOGLE_TTL_MS) return Promise.resolve(slot.data);
  if (slot.inflight) return slot.inflight;
  slot.inflight = (async () => {
    try {
      const data = await fetchGoogleAds(cid, d);
      slot.data = data; slot.ts = Date.now(); slot.inflight = null;
      return data;
    } catch (e) { slot.inflight = null; throw e; }
  })();
  return slot.inflight;
}

// ---------- TikTok Ads (cache por cliente) ----------
const tiktokCache = {}; // chave -> {data, ts, inflight}
function getTiktok(cli, advId, range) {
  const key = cli + '|' + (advId || '') + '|' + range.since + '|' + range.until;
  const slot = tiktokCache[key] || (tiktokCache[key] = { data: null, ts: 0, inflight: null });
  const now = Date.now();
  if (slot.data && (now - slot.ts) < TIKTOK_TTL_MS) return Promise.resolve(slot.data);
  if (slot.inflight) return slot.inflight;
  slot.inflight = (async () => {
    try {
      const data = await fetchTiktokData(TIKTOK_TOKEN, advId, range);
      slot.data = data; slot.ts = Date.now(); slot.inflight = null;
      return data;
    } catch (e) { slot.inflight = null; throw e; }
  })();
  return slot.inflight;
}
const GA4_TTL_MS = (parseInt(process.env.GA4_CACHE_MIN || '60', 10)) * 60 * 1000;
const ga4Cache = {}; // cli|pid|from|to -> {data, ts, inflight}
let ga4Props = { list: null, ts: 0, inflight: null };
const ga4Norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
async function ga4Properties() {
  if (ga4Props.list && Date.now() - ga4Props.ts < 12 * 3600e3) return ga4Props.list;
  if (ga4Props.inflight) return ga4Props.inflight;
  ga4Props.inflight = (async () => {
    try { const l = await ga4.listGA4Properties(); ga4Props = { list: l, ts: Date.now(), inflight: null }; return l; }
    catch (e) { ga4Props.inflight = null; throw e; }
  })();
  return ga4Props.inflight;
}
function ga4Match(list, nome) {
  const n = ga4Norm(nome); if (!n) return null;
  let best = null, bestScore = 0;
  for (const p of list) {
    const pn = ga4Norm(p.nome), an = ga4Norm(p.conta);
    let score = 0;
    if (pn === n || an === n) score = 100;
    else if (pn.includes(n) || n.includes(pn)) score = 80;
    else if (an.includes(n) || n.includes(an)) score = 60;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return bestScore >= 60 ? best : null;
}
async function resolveGA4Property(cli, emp) {
  const c = CLIENTS[cli] || {};
  if (emp && Array.isArray(c.empreendimentos)) {                                // por empreendimento (ex.: Concreto, ACL)
    const e = c.empreendimentos.find(x => x.id === emp);
    if (e && e.ga4Property) return String(e.ga4Property).replace(/\D/g, '');
  }
  if (c.ga4Property) return String(c.ga4Property).replace(/\D/g, '');           // ID fixo do cliente (prioridade)
  const term = c.ga4PropertyName || c.nome || cli;                              // nome da propriedade GA4 (se informado) ou nome do cliente
  const m = ga4Match(await ga4Properties(), term);
  return m ? m.property : '';
}
function getGA4(cli, pid, from, to) {
  const key = cli + '|' + pid + '|' + from + '|' + to;
  const slot = ga4Cache[key] || (ga4Cache[key] = { data: null, ts: 0, inflight: null });
  if (slot.data && Date.now() - slot.ts < GA4_TTL_MS) return Promise.resolve(slot.data);
  if (slot.inflight) return slot.inflight;
  slot.inflight = (async () => {
    try { const d = await ga4.fetchGA4(pid, { from, to }); slot.data = d; slot.ts = Date.now(); slot.inflight = null; return d; }
    catch (e) { slot.inflight = null; throw e; }
  })();
  return slot.inflight;
}

// ---------- Pinterest Ads (cache por cli|conta|período, mesmo padrão do GA4) ----------
const PIN_TTL_MS = (parseInt(process.env.PINTEREST_CACHE_MIN || '60', 10)) * 60 * 1000;
const pinCache = {}; // cli|acc|from|to -> {data, ts, inflight}
function getPinterest(cli, acc, from, to) {
  const key = cli + '|' + acc + '|' + from + '|' + to;
  const slot = pinCache[key] || (pinCache[key] = { data: null, ts: 0, inflight: null });
  if (slot.data && Date.now() - slot.ts < PIN_TTL_MS) return Promise.resolve(slot.data);
  if (slot.inflight) return slot.inflight;
  slot.inflight = (async () => {
    try { const d = await pinterest.fetchPinterest(acc, { from, to }); slot.data = d; slot.ts = Date.now(); slot.inflight = null; return d; }
    catch (e) { slot.inflight = null; throw e; }
  })();
  return slot.inflight;
}

// ---------- Análise por IA (Claude/Anthropic ou OpenAI) ----------
function buildAIPrompt(d) {
  const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const L = [];
  L.push('Você é um analista de tráfego pago sênior da agência Acesso Marketing.');
  L.push('Escreva uma análise de performance profissional, em português do Brasil, para o cliente "' + (d.cliente || '') + '".');
  L.push('Período analisado: ' + ((d.periodo && d.periodo.from) || '?') + ' a ' + ((d.periodo && d.periodo.to) || '?') + ' (' + ((d.periodo && d.periodo.dias) || '?') + ' dias).');
  L.push('');
  L.push('Dados (não invente nada além destes números):');
  if (d.google) { const x = d.google; L.push('- GOOGLE ADS: investimento ' + brl(x.custo) + ', ' + x.leads + ' leads, CPL ' + brl(x.cpl) + ', ' + x.cliques + ' cliques, CTR ' + (Number(x.ctr) || 0).toFixed(2) + '%.' + (x.metaLeadsMensal ? (' Meta mensal: ' + x.metaLeadsMensal + ' leads, orçamento ' + brl(x.orcamentoMensal) + '.') : '') + (d.comparacao && d.comparacao.google ? (' Período anterior: ' + brl(d.comparacao.google.custo) + ', ' + d.comparacao.google.leads + ' leads, CPL ' + brl(d.comparacao.google.cpl) + '.') : '')); }
  if (d.meta) { const x = d.meta; L.push('- META ADS (Facebook/Instagram): investimento ' + brl(x.custo) + ', ' + x.leads + ' leads, CPL ' + brl(x.cpl) + ', ' + x.cliques + ' cliques, CTR ' + (Number(x.ctr) || 0).toFixed(2) + '%.' + (d.comparacao && d.comparacao.meta ? (' Período anterior: ' + brl(d.comparacao.meta.custo) + ', ' + d.comparacao.meta.leads + ' leads, CPL ' + brl(d.comparacao.meta.cpl) + '.') : '')); }
  if (d.expad) { L.push('- CRM (Expad): ' + d.expad.qualificados + ' leads qualificados, ' + d.expad.ganhos + ' negócios ganhos.'); }
  L.push('');
  L.push('Estrutura da resposta: (1) um parágrafo curto de resumo geral; (2) 3 a 5 destaques, cada um começando com "- "; (3) recomendações práticas sob o título "Recomendações:", cada uma começando com "- ". Seja específico com os números, tom profissional e direto, sem jargão excessivo. Máximo ~230 palavras.');
  return L.join('\n');
}
async function getReportAI(payload) {
  const ANK = process.env.ANTHROPIC_API_KEY || '';
  const OAK = process.env.OPENAI_API_KEY || '';
  if (!ANK && !OAK) return { analise: null, fallback: true };
  const prompt = buildAIPrompt(payload || {});
  if (ANK) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest', max_tokens: 800, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + String((j.error && j.error.message) || JSON.stringify(j)).slice(0, 200));
    const text = (j.content && j.content[0] && j.content[0].text) || '';
    return { analise: text, provider: 'Claude' };
  }
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + OAK },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', max_tokens: 800, messages: [{ role: 'system', content: 'Você é um analista de tráfego pago sênior.' }, { role: 'user', content: prompt }] })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + String((j.error && j.error.message) || JSON.stringify(j)).slice(0, 200));
  const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  return { analise: text, provider: 'OpenAI' };
}

// ---------- News do segmento (inteligência via IA) ----------
async function callAIRaw(prompt, maxTokens) {
  const ANK = process.env.ANTHROPIC_API_KEY || '', OAK = process.env.OPENAI_API_KEY || '';
  if (!ANK && !OAK) throw new Error('IA não configurada (defina ANTHROPIC_API_KEY ou OPENAI_API_KEY no servidor)');
  if (ANK) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': ANK, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest', max_tokens: maxTokens || 1800, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + String((j.error && j.error.message) || '').slice(0, 200));
    return (j.content && j.content[0] && j.content[0].text) || '';
  }
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + OAK },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', max_tokens: maxTokens || 1800, messages: [{ role: 'user', content: prompt }] })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + String((j.error && j.error.message) || '').slice(0, 200));
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}
function parseJSONLoose(t) { if (!t) return null; let s = String(t).trim(); const f = s.indexOf('{'), l = s.lastIndexOf('}'); if (f >= 0 && l > f) s = s.slice(f, l + 1); try { return JSON.parse(s); } catch (e) { return null; } }
const newsCache = {};
const NEWS_TTL_MS = (parseInt(process.env.NEWS_CACHE_HOURS || '12', 10)) * 3600 * 1000;
function newsPrompt(c, cli) {
  const seg = (c.segmento || ((c.nome || cli) + ' — ' + (c.sub || ''))).trim();
  return [
    'Você é analista de inteligência de mercado e conteúdo de uma agência de marketing.',
    'Cliente: "' + (c.nome || cli) + '". Segmento/atividade: "' + seg + '".',
    'Gere um panorama de INTELIGÊNCIA DO SEGMENTO para orientar conteúdo e estratégia do cliente, em português do Brasil.',
    'Organize em 3 a 4 TÓPICOS temáticos relevantes para o segmento; em cada tópico, 1 a 2 itens.',
    'Cada item deve ter: categoria curta (ex.: TÉCNICO, MERCADO, REGULATÓRIO, TENDÊNCIA, SEGURANÇA), um público-alvo curto, um título, um resumo de 2 a 3 frases, uma fonte (use órgãos/entidades REAIS do setor quando fizer sentido — NUNCA invente URLs nem dados precisos), e uma "pauta" (ideia de conteúdo acionável para o cliente).',
    'Responda APENAS com JSON válido, sem markdown e sem texto fora do JSON, no formato exato:',
    '{"segmento":"...","topicos":[{"titulo":"...","itens":[{"categoria":"...","publico":"...","data":"","titulo":"...","resumo":"...","fonte":"...","pauta":"..."}]}]}',
    'Deixe "data" vazia se não tiver certeza. Não invente estatísticas específicas.'
  ].join('\n');
}
async function getSegmentNews(cli, refresh) {
  const c = CLIENTS[cli] || {};
  const slot = newsCache[cli];
  if (!refresh && slot && (Date.now() - slot.ts) < NEWS_TTL_MS) return slot.data;
  const txt = await callAIRaw(newsPrompt(c, cli), 1800);
  const j = parseJSONLoose(txt) || {};
  const data = { segmento: j.segmento || c.nome || cli, topicos: Array.isArray(j.topicos) ? j.topicos : [], gerado: _ymd(new Date()) };
  newsCache[cli] = { data, ts: Date.now() };
  return data;
}

// ---------- Expad (CRM, cache por cliente) ----------
const EXPAD_TTL_MS = (parseInt(process.env.EXPAD_CACHE_MIN || '5', 10)) * 60 * 1000;
const expadCache = {};
function cliKey(cli) { return String(cli).toUpperCase().replace(/[^A-Z0-9]/g, '_'); }
// Config Expad: por empreendimento (accountId no clients.json + chave por env) OU por cliente (webhook/API direta).
function expadCfgFor(cli, emp) {
  const c = CLIENTS[cli] || {};
  const k = cliKey(cli);
  // 1) Por EMPREENDIMENTO (ex.: Urba): accountId no empreendimento + chave em env EXPAD_API_KEY_<CLI>_<EMP> (ou _<CLI>)
  if (emp && Array.isArray(c.empreendimentos)) {
    const e = c.empreendimentos.find(x => x.id === emp);
    if (e && Array.isArray(e.expadAccounts) && e.expadAccounts.length) return { accounts: e.expadAccounts };
    if (e && e.expadAccountId) {
      const apiKey = process.env['EXPAD_API_KEY_' + k + '_' + cliKey(emp)] || process.env['EXPAD_API_KEY_' + k] || e.expadApiKey || '';
      if (apiKey) return { apiKey, accountId: e.expadAccountId };
      return null; // tem conta mas falta a chave (env ou expadApiKey no clients.json)
    }
  }
  // 2) Por CLIENTE — várias contas (somadas) OU chave/conta única no clients.json/env; API direta tem PRIORIDADE
  if (Array.isArray(c.expadAccounts) && c.expadAccounts.length) return { accounts: c.expadAccounts };
  const apiKey = process.env['EXPAD_API_KEY_' + k] || c.expadApiKey || (c.expad && c.expad.apiKey) || '';
  const accountId = c.expadAccountId || (c.expad && c.expad.accountId) || process.env['EXPAD_ACCOUNT_ID_' + k] || '';
  if (apiKey && accountId) return { apiKey, accountId };
  const webhookUrl = process.env['EXPAD_WEBHOOK_URL_' + k] || (c.expad && c.expad.webhookUrl) || process.env.EXPAD_WEBHOOK_URL || '';
  if (webhookUrl) return { webhookUrl };
  return null;
}
// soma várias respostas Expad numa só (ex.: Brazon tem conta Expad de Google + de Meta)
function mergeExpad(parts) {
  parts = parts.filter(p => p && p.sales);
  if (!parts.length) return { sales: null };
  if (parts.length === 1) return parts[0];
  const s = { totalCount: 0, totalValue: 0, leadCount: 0, novos: 0, qualificados: 0, ganhos: 0, valorGanho: 0, statusBreakdown: [], topProducts: [] };
  parts.forEach(p => { const x = p.sales; ['totalCount', 'totalValue', 'leadCount', 'novos', 'qualificados', 'ganhos', 'valorGanho'].forEach(k => s[k] += (+x[k] || 0)); if (Array.isArray(x.statusBreakdown)) s.statusBreakdown = s.statusBreakdown.concat(x.statusBreakdown); });
  s.avgTicket = s.totalCount ? +(s.totalValue / s.totalCount).toFixed(2) : 0;
  s.convRate = s.leadCount ? +(s.totalCount / s.leadCount * 100).toFixed(1) : 0;
  return { sales: s, _meta: { merged: parts.length } };
}
function getExpad(cli, emp, from, to, source) {
  const cfg = expadCfgFor(cli, emp);
  const key = cli + '|' + (emp || '') + '|' + (from || '') + '|' + (to || '') + '|' + (source || '');
  const slot = expadCache[key] || (expadCache[key] = { data: null, ts: 0, inflight: null });
  const now = Date.now();
  if (slot.data && (now - slot.ts) < EXPAD_TTL_MS) return Promise.resolve(slot.data);
  if (slot.inflight) return slot.inflight;
  slot.inflight = (async () => {
    try {
      const data = (cfg && cfg.accounts)
        ? mergeExpad(await Promise.all(cfg.accounts.map(a => fetchExpad(a, { from, to, source }).catch(() => null))))
        : await fetchExpad(cfg, { from, to, source });
      slot.data = data; slot.ts = Date.now(); slot.inflight = null; return data; }
    catch (e) { slot.inflight = null; throw e; }
  })();
  return slot.inflight;
}

// ---------- helpers HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const send = (res, code, type, body, extra) => {
  res.writeHead(code, Object.assign({ 'Content-Type': type }, extra || {}));
  res.end(body);
};
const json = (res, code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));
const redirect = (res, loc, cookie) => {
  const h = { Location: loc }; if (cookie) h['Set-Cookie'] = cookie;
  res.writeHead(302, h); res.end();
};
function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'text/html; charset=utf-8', '<h1>404</h1>');
    send(res, 200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', data,
      { 'Cache-Control': 'public, max-age=120' });
  });
}
function clientPublic(c, id) { // config exposta ao front (SEM senha)
  const emps = Array.isArray(c.empreendimentos) ? c.empreendimentos : [];
  return { id, nome: c.nome, sub: c.sub, logo: c.logo, metas: c.metas, googleCustomerId: c.googleCustomerId,
    hasMeta: !!c.metaAccount || emps.some(e => e.metaAccount),
    metaSemAcesso: !!c.metaSemAcesso,   // cliente roda Meta mas a agência não tem acesso à conta
    hasTiktok: !!c.tiktokAdvertiserId,   // mostra a aba TikTok só p/ quem tem advertiser_id no clients.json
    hasPinterest: !!c.pinterest,         // mostra a aba Pinterest só p/ clientes com "pinterest": true no clients.json
    empreendimentos: emps.length ? emps.map(e => ({ id: e.id, nome: e.nome, metas: e.metas || null, hasMeta: !!e.metaAccount })) : null };
}

// ---------- dashboard template ----------
function serveDashboard(res, id, sess) {
  const c = CLIENTS[id];
  const sessJson = `<script>window.SESSION=${JSON.stringify({ role: (sess && sess.role) || '', nome: (sess && (sess.nome || sess.user || sess.cli)) || '' })};</script>\n`;
  const tpl = c.template;
  // Template baseado em PASTA (ex.: centro-oft) — usa <base href> p/ os assets relativos.
  if (tpl && fs.existsSync(path.join(ROOT, 'dash', tpl, 'index.html'))) {
    return fs.readFile(path.join(ROOT, 'dash', tpl, 'index.html'), 'utf8', (err, html) => {
      if (err) return send(res, 500, 'text/html', 'erro template');
      const head = sessJson + `<base href="/dash/${tpl}/">\n<script>window.CLIENTE=${JSON.stringify(clientPublic(c, id))};</script>\n`;
      html = html.replace(/<head([^>]*)>/i, m => m + '\n' + head);
      send(res, 200, 'text/html; charset=utf-8', html, { 'Cache-Control': 'no-store' });
    });
  }
  // Template padrão (All Pé, arquivo único com dados em /data/<id>/).
  fs.readFile(path.join(ROOT, 'index.html'), 'utf8', (err, html) => {
    if (err) return send(res, 500, 'text/html', 'erro template');
    const inject = sessJson + `<script>window.CLIENTE=${JSON.stringify(clientPublic(c, id))};</script>\n`;
    html = html
      .replace('<script src="data/dataset.js"></script>',
               inject + `<script src="/data/${id}/dataset.js"></script>`)
      .replace('data/meta-dataset.js', `/data/${id}/meta-dataset.js`);
    send(res, 200, 'text/html; charset=utf-8', html, { 'Cache-Control': 'no-store' });
  });
}

// ---------- tela do projeto (hub: Dashboard x Relatório) — só staff ----------
function serveProjeto(res, id, sess) {
  const c = CLIENTS[id];
  const emps = Array.isArray(c.empreendimentos) ? c.empreendimentos : [];
  const proj = Object.assign(clientPublic(c, id), {
    google: !!c.googleCustomerId || emps.some(e => e.googleCustomerId),
    meta: !!c.metaAccount || emps.some(e => e.metaAccount),
    expad: !!expadCfgFor(id)
  });
  fs.readFile(path.join(ROOT, 'projeto.html'), 'utf8', (err, html) => {
    if (err) return send(res, 500, 'text/html', 'erro template');
    const inj = `<script>window.PROJ=${JSON.stringify(proj)};window.SESSION=${JSON.stringify({ role: sess.role, nome: sess.nome || sess.user || '' })};</script>\n`;
    html = html.replace('</head>', inj + '</head>');
    send(res, 200, 'text/html; charset=utf-8', html, { 'Cache-Control': 'no-store' });
  });
}

// ---------- servidor ----------
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname);
  const sess = session(req);

  // ---- LOGIN ----
  if (p === '/login' && req.method === 'GET') return serveFile(res, path.join(ROOT, 'login.html'));
  if (p === '/nova-senha') {
    if (!sess) return redirect(res, '/login');
    // só faz sentido p/ cliente ainda na senha padrão; senão manda pro destino normal
    if (!sess.cli || PASS_OVERRIDES['cli:' + sess.cli]) return redirect(res, sess.cli ? ('/c/' + sess.cli) : '/');
    return serveFile(res, path.join(ROOT, 'nova-senha.html'));
  }
  if (p === '/login' && req.method === 'POST') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      const f = Object.fromEntries(new URLSearchParams(b));
      const user = (f.user || '').trim(), pass = f.pass || '';
      const exp = Date.now() + 7 * 24 * 3600 * 1000;
      let payload = null;
      if (USERS[user] && checkPass('user:' + user, userPass(user), pass)) payload = { role: USERS[user].role, user, nome: USERS[user].nome, exp };
      else if (user.toLowerCase() === 'agencia' && pass === AGENCY_PASS) payload = { role: 'admin', user: 'agencia', exp };
      else if (CLIENTS[user] && checkPass('cli:' + user, CLIENTS[user].senha, pass)) payload = { role: 'cliente', cli: user, exp };
      if (!payload) return redirect(res, '/login?erro=1');
      const cookie = `sess=${sign(payload)}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax`;
      redirect(res, payload.role === 'cliente' ? '/c/' + payload.cli : '/', cookie);
    });
    return;
  }
  if (p === '/logout') return redirect(res, '/login', 'sess=; Path=/; Max-Age=0');

  // ---- exige login ----
  if (!sess) {
    if (p.startsWith('/api/')) return json(res, 401, { error: 'não autenticado' });
    if (p === '/' || p.startsWith('/c/') || p.startsWith('/data/')) return redirect(res, '/login');
  }

  // ---- raiz ----
  if (p === '/') {
    if (sess.role === 'cliente') return redirect(res, '/c/' + sess.cli);
    return serveFile(res, path.join(ROOT, 'agency.html')); // admin/analista
  }

  // ---- quem sou eu (cargo) ----
  if (p === '/api/me') {
    return json(res, 200, { role: sess.role, nome: sess.nome || sess.user || sess.cli || '', user: sess.user || sess.cli || '' });
  }

  // ---- trocar a própria senha (cliente ou usuário interno) ----
  if (p === '/api/change-password' && req.method === 'POST') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      const f = Object.fromEntries(new URLSearchParams(b));
      const atual = f.atual || '', nova = f.nova || '';
      let idKey, defaultPass;
      if (sess.cli) { idKey = 'cli:' + sess.cli; defaultPass = (CLIENTS[sess.cli] || {}).senha; }
      else if (sess.user && sess.user.toLowerCase() !== 'agencia') { idKey = 'user:' + sess.user; defaultPass = userPass(sess.user); }
      else return json(res, 403, { error: 'Este acesso (agência via env) não troca senha por aqui.' });
      // 1ª definição (ainda na senha padrão): não exige a senha atual, pois já está autenticado.
      // Trocas posteriores exigem a senha atual.
      if (PASS_OVERRIDES[idKey] && !checkPass(idKey, defaultPass, atual)) return json(res, 400, { error: 'Senha atual incorreta.' });
      if (!nova || String(nova).length < 4) return json(res, 400, { error: 'A nova senha precisa ter ao menos 4 caracteres.' });
      PASS_OVERRIDES[idKey] = hashPass(nova);
      const ok = savePassOverrides();
      return json(res, ok ? 200 : 500, ok ? { ok: true } : { error: 'Não foi possível salvar a nova senha no servidor.' });
    });
    return;
  }

  // ---- lista de clientes (admin/analista) ----
  if (p === '/api/clients') {
    if (!isStaff(sess)) return json(res, 403, { error: 'apenas equipe (admin/analista)' });
    return json(res, 200, Object.entries(CLIENTS).map(([id, c]) => {
      const emps = Array.isArray(c.empreendimentos) ? c.empreendimentos : [];
      return {
        id, nome: c.nome, sub: c.sub, logo: c.logo,
        google: !!c.googleCustomerId || emps.some(e => e.googleCustomerId),
        meta: !!c.metaAccount || emps.some(e => e.metaAccount),
        expad: !!expadCfgFor(id),
        emps: emps.length
      };
    }));
  }

  // ---- Meta ao vivo (por cliente) ----
  if (p === '/api/meta') {
    const cli = u.searchParams.get('cli');
    if (!canSee(sess, cli)) return json(res, 403, { error: 'sem acesso' });
    if (!META_TOKEN) return json(res, 503, { error: 'META_TOKEN não configurado' });
    const c = CLIENTS[cli] || {};
    let account = c.metaAccount || '';
    let campFilter = c.metaCampaignFilter || null;
    if (Array.isArray(c.empreendimentos) && c.empreendimentos.length) {
      const emp = u.searchParams.get('emp');
      const e = c.empreendimentos.find(x => x.id === emp) || c.empreendimentos[0];
      account = (e && e.metaAccount) || '';
      campFilter = (e && e.metaCampaignFilter) || null;
    }
    if (!account) return json(res, 404, { error: 'sem conta Meta para este cliente/empreendimento' });
    const days = parseInt(u.searchParams.get('days') || '', 10) || 0;
    return getMeta(cli, account, days, campFilter).then(d => json(res, 200, d)).catch(e => json(res, 502, { error: 'falha Meta', detail: e.message }));
  }

  // ---- Google ao vivo (por cliente, via API oficial) ----
  if (p === '/api/google') {
    const cli = u.searchParams.get('cli');
    if (!canSee(sess, cli)) return json(res, 403, { error: 'sem acesso' });
    const c = CLIENTS[cli];
    if (!c) return json(res, 404, { error: 'cliente não encontrado' });
    // resolve a conta: por empreendimento (emp) ou googleCustomerId direto
    let cid = c.googleCustomerId || '';
    if (Array.isArray(c.empreendimentos) && c.empreendimentos.length) {
      const emp = u.searchParams.get('emp');
      const e = c.empreendimentos.find(x => x.id === emp) || c.empreendimentos[0];
      cid = e.googleCustomerId;
    }
    if (!cid) return json(res, 404, { error: 'cliente sem conta Google' });
    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) return json(res, 503, { error: 'Google Ads não configurado (faltam as chaves no servidor)' });
    const days = parseInt(u.searchParams.get('days') || '', 10) || 0;
    return getGoogle(cli, cid, days).then(d => json(res, 200, d)).catch(e => json(res, 502, { error: 'falha Google Ads', detail: e.message }));
  }

  // ---- TikTok Ads ao vivo (por cliente; advertiser_id no clients.json) ----
  if (p === '/api/tiktok') {
    const cli = u.searchParams.get('cli');
    if (!canSee(sess, cli)) return json(res, 403, { error: 'sem acesso' });
    const c = CLIENTS[cli];
    if (!c) return json(res, 404, { error: 'cliente não encontrado' });
    if (!TIKTOK_TOKEN) return json(res, 503, { error: 'TikTok não configurado (defina TIKTOK_ACCESS_TOKEN no servidor)' });
    // resolve o anunciante: por empreendimento (emp) ou tiktokAdvertiserId direto
    let advId = c.tiktokAdvertiserId || '';
    if (Array.isArray(c.empreendimentos) && c.empreendimentos.length) {
      const emp = u.searchParams.get('emp');
      const e = c.empreendimentos.find(x => x.id === emp) || c.empreendimentos[0];
      advId = (e && e.tiktokAdvertiserId) || advId;
    }
    if (!advId) return json(res, 404, { error: 'cliente sem conta TikTok (defina tiktokAdvertiserId no clients.json)' });
    const days = parseInt(u.searchParams.get('days') || '', 10) || 0;
    const range = resolveRange(u.searchParams.get('from'), u.searchParams.get('to'), days);
    return getTiktok(cli, advId, range).then(d => json(res, 200, d)).catch(e => json(res, 502, { error: 'falha TikTok', detail: e.message }));
  }

  // ---- TikTok: trocar auth_code por access_token (apenas equipe; rodar 1x por anunciante) ----
  // Uso: depois que o cliente autoriza o app pela "Advertiser authorization URL", o TikTok
  // devolve um auth_code. Abra /api/tiktok-auth?code=<AUTH_CODE> logado como agência:
  // a resposta traz o access_token (copie p/ TIKTOK_ACCESS_TOKEN) e os advertiser_ids.
  if (p === '/api/tiktok-auth') {
    if (!isStaff(sess)) return json(res, 403, { error: 'apenas equipe (admin/analista)' });
    if (!TIKTOK_APP_ID || !TIKTOK_APP_SECRET) return json(res, 503, { error: 'defina TIKTOK_APP_ID e TIKTOK_APP_SECRET no servidor' });
    const code = u.searchParams.get('code') || u.searchParams.get('auth_code') || '';
    if (!code) return json(res, 400, { error: 'faltou ?code=<AUTH_CODE> (vem na URL de retorno após o cliente autorizar)' });
    return exchangeAuthCode(TIKTOK_APP_ID, TIKTOK_APP_SECRET, code)
      .then(d => json(res, 200, {
        ok: true,
        instrucoes: 'Copie access_token para a variável TIKTOK_ACCESS_TOKEN no Render/Railway. Use um dos advertiser_ids como tiktokAdvertiserId no clients.json.',
        access_token: d.access_token,
        advertiser_ids: d.advertiser_ids || [],
        scope: d.scope || []
      }))
      .catch(e => json(res, 502, { error: 'falha ao trocar auth_code', detail: e.message }));
  }

  // ---- TikTok: diagnóstico do token (apenas equipe) ----
  // Valida o TIKTOK_ACCESS_TOKEN e lista os anunciantes que ele enxerga.
  // Se der 40105 aqui, o token está errado/revogado. Se listar os anunciantes,
  // confira se o tiktokAdvertiserId do cliente está nessa lista.
  if (p === '/api/tiktok-check') {
    if (!isStaff(sess)) return json(res, 403, { error: 'apenas equipe (admin/analista)' });
    if (!TIKTOK_TOKEN) return json(res, 503, { error: 'TIKTOK_ACCESS_TOKEN não configurado' });
    if (!TIKTOK_APP_ID || !TIKTOK_APP_SECRET) return json(res, 503, { error: 'defina TIKTOK_APP_ID e TIKTOK_APP_SECRET no servidor' });
    return getAuthorizedAdvertisers(TIKTOK_APP_ID, TIKTOK_APP_SECRET, TIKTOK_TOKEN)
      .then(list => {
        const autorizados = list.map(a => ({ advertiser_id: a.advertiser_id, nome: a.advertiser_name }));
        const idsAutorizados = autorizados.map(a => String(a.advertiser_id));
        // confere quais clientes do clients.json têm o advertiser_id coberto pelo token
        const clientesTiktok = Object.entries(CLIENTS)
          .filter(([, c]) => c.tiktokAdvertiserId)
          .map(([id, c]) => ({ cliente: id, nome: c.nome, advertiser_id: String(c.tiktokAdvertiserId),
            coberto_pelo_token: idsAutorizados.includes(String(c.tiktokAdvertiserId)) }));
        json(res, 200, { ok: true, token_valido: true, tokenInicio: String(TIKTOK_TOKEN).slice(0, 6) + '…', tokenTamanho: String(TIKTOK_TOKEN).length, anunciantes_autorizados: autorizados, clientes_configurados: clientesTiktok });
      })
      .catch(e => json(res, 502, { ok: false, token_valido: false, error: 'token recusado pelo TikTok', detail: e.message, tokenInicio: String(TIKTOK_TOKEN).slice(0, 6) + '…', tokenTamanho: String(TIKTOK_TOKEN).length }));
  }

  // ---- Expad (vendas/CRM, por cliente) ----
  if (p === '/api/expad-sales') {
    const cli = u.searchParams.get('cli') || (sess.role === 'client' ? sess.cli : '');
    if (!cli || !canSee(sess, cli)) return json(res, 403, { error: 'sem acesso' });
    const emp = u.searchParams.get('emp') || '';
    const cfg = expadCfgFor(cli, emp);
    if (!cfg) return json(res, 503, { error: 'Expad não configurado para ' + cli + (emp ? ('/' + emp) : '') + ' (defina EXPAD_API_KEY_' + cliKey(cli) + (emp ? ('_' + cliKey(emp)) : '') + (emp ? '' : ' + EXPAD_ACCOUNT_ID_' + cliKey(cli)) + ')' });
    const from = u.searchParams.get('from') || '', to = u.searchParams.get('to') || '', source = u.searchParams.get('source') || '';
    if (u.searchParams.get('debug')) {
      return fetchExpad(cfg, { from, to, source, debug: true }).then(d => json(res, 200, d)).catch(e => json(res, 502, { error: 'falha Expad', detail: e.message }));
    }
    return getExpad(cli, emp, from, to, source).then(d => json(res, 200, d)).catch(e => json(res, 502, { error: 'falha Expad', detail: e.message }));
  }

  // ---- GA4 ao vivo (por cliente; propriedade casada pelo nome ou ga4Property fixo) ----
  if (p === '/api/ga4') {
    const cli = u.searchParams.get('cli');
    if (!canSee(sess, cli)) return json(res, 403, { error: 'sem acesso' });
    if (!ga4.configured()) return json(res, 503, { error: 'GA4 não configurado (defina GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET e GOOGLE_OAUTH_REFRESH_TOKEN no servidor)' });
    if (!CLIENTS[cli]) return json(res, 404, { error: 'cliente não encontrado' });
    const from = u.searchParams.get('from') || _ymd(new Date(Date.now() - 29 * 864e5));
    const to = u.searchParams.get('to') || _ymd(new Date());
    const emp = u.searchParams.get('emp') || '';
    return resolveGA4Property(cli, emp)
      .then(pid => {
        if (!pid) return json(res, 404, { error: 'nenhuma propriedade GA4 encontrada para "' + (CLIENTS[cli].nome || cli) + '" — confira em /api/ga4-discover ou fixe ga4Property no clients.json' });
        return getGA4(cli, pid, from, to).then(d => json(res, 200, d));
      })
      .catch(e => json(res, 502, { error: 'falha GA4', detail: e.message }));
  }

  // ---- Pinterest Ads ao vivo (por cliente; "pinterest":true + pinterestAdAccountId no clients.json) ----
  if (p === '/api/pinterest') {
    const cli = u.searchParams.get('cli');
    if (!canSee(sess, cli)) return json(res, 403, { error: 'sem acesso' });
    const c = CLIENTS[cli];
    if (!c) return json(res, 404, { error: 'cliente não encontrado' });
    if (!c.pinterest) return json(res, 404, { error: 'cliente sem Pinterest (defina "pinterest": true no clients.json)' });
    if (!pinterest.configured()) return json(res, 503, { error: 'Pinterest não configurado (defina PINTEREST_ACCESS_TOKEN no servidor)' });
    // resolve a conta de anúncios: por empreendimento (emp) ou pinterestAdAccountId direto
    let acc = c.pinterestAdAccountId || '';
    if (Array.isArray(c.empreendimentos) && c.empreendimentos.length) {
      const emp = u.searchParams.get('emp');
      const e = c.empreendimentos.find(x => x.id === emp) || c.empreendimentos[0];
      acc = (e && e.pinterestAdAccountId) || acc;
    }
    if (!acc) return json(res, 404, { error: 'cliente sem conta Pinterest (defina pinterestAdAccountId no clients.json)' });
    const from = u.searchParams.get('from') || _ymd(new Date(Date.now() - 29 * 864e5));
    const to = u.searchParams.get('to') || _ymd(new Date());
    return getPinterest(cli, acc, from, to).then(d => json(res, 200, d)).catch(e => json(res, 502, { error: 'falha Pinterest', detail: e.message }));
  }

  // ---- GA4 discover (equipe): lista propriedades + mapeamento sugerido por cliente ----
  if (p === '/api/ga4-discover') {
    if (!isStaff(sess)) return json(res, 403, { error: 'apenas equipe (admin/analista)' });
    if (!ga4.configured()) return json(res, 503, { error: 'GA4 não configurado' });
    return ga4Properties().then(list => {
      const mapeamento = Object.entries(CLIENTS).map(([id, c]) => {
        const fixed = c.ga4Property ? { property: String(c.ga4Property), nome: '(fixado no clients.json)', conta: '' } : null;
        const m = fixed || ga4Match(list, c.nome || id);
        return { cliente: id, nome: c.nome, match: m ? { property: m.property, propriedade: m.nome, conta: m.conta } : null };
      });
      json(res, 200, { totalPropriedades: list.length, semMatch: mapeamento.filter(x => !x.match).map(x => x.cliente), mapeamento, propriedades: list });
    }).catch(e => json(res, 502, { error: 'falha GA4', detail: e.message }));
  }

  // ---- Análise por IA (gera texto do relatório) ----
  if (p === '/api/report-ai' && req.method === 'POST') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      let payload = {}; try { payload = JSON.parse(b || '{}'); } catch (e) {}
      const cli = payload.cli || '';
      if (!isStaff(sess) || !canSee(sess, cli)) return json(res, 403, { error: 'apenas equipe' });
      getReportAI(payload)
        .then(d => json(res, 200, d))
        .catch(e => json(res, 200, { analise: null, error: e.message })); // 200 + null => cliente usa fallback por regras
    });
    return;
  }

  // ---- News do segmento (inteligência IA, por cliente) ----
  if (p === '/api/news') {
    const cli = u.searchParams.get('cli');
    if (!canSee(sess, cli)) return json(res, 403, { error: 'sem acesso' });
    if (!CLIENTS[cli]) return json(res, 404, { error: 'cliente não encontrado' });
    const refresh = u.searchParams.get('refresh') === '1';
    return getSegmentNews(cli, refresh).then(d => json(res, 200, d)).catch(e => json(res, 502, { error: 'falha IA', detail: e.message }));
  }

  // ---- tela do projeto (hub) — só staff; cliente vai direto ao dashboard ----
  if (p.startsWith('/projeto/')) {
    const id = p.slice('/projeto/'.length).replace(/\/$/, '');
    if (!CLIENTS[id]) return send(res, 404, 'text/html', '<h1>Cliente não encontrado</h1>');
    if (!canSee(sess, id)) return send(res, 403, 'text/html', '<h1>403 — sem acesso a este cliente</h1>');
    if (sess.role === 'cliente') return redirect(res, '/c/' + id);
    return serveProjeto(res, id, sess);
  }

  // ---- dashboard do cliente ----
  if (p.startsWith('/c/')) {
    const id = p.slice(3).replace(/\/$/, '');
    if (!CLIENTS[id]) return send(res, 404, 'text/html', '<h1>Cliente não encontrado</h1>');
    if (!canSee(sess, id)) return send(res, 403, 'text/html', '<h1>403 — sem acesso a este cliente</h1>');
    // 1º acesso do cliente (ainda na senha padrão) → obriga definir nova senha
    if (sess.cli && !PASS_OVERRIDES['cli:' + sess.cli]) return redirect(res, '/nova-senha');
    return serveDashboard(res, id, sess);
  }

  // ---- dados do cliente (protegidos) ----
  if (p.startsWith('/data/')) {
    const id = p.split('/')[2];
    if (!canSee(sess, id)) return json(res, 403, { error: 'sem acesso aos dados' });
    // segue para servir o arquivo estático abaixo
  }

  // ---- estáticos (assets, css, data já validado) ----
  const filePath = path.join(ROOT, path.normalize(p));
  if (!filePath.startsWith(ROOT)) return send(res, 403, 'text/plain', 'Forbidden');
  return serveFile(res, filePath);
});

server.listen(PORT, () => console.log(`[Multi-Dash] no ar em http://localhost:${PORT} (login: /login)`));
