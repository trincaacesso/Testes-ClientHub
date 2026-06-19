/**
 * meta-fetch.js — gera um SNAPSHOT estático (public/data/meta-dataset.js e
 * .claude/data/meta-dataset.js) com os criativos do Meta Ads.
 *
 * OBS: em produção (Railway) o dashboard busca o Meta em tempo real via
 * /api/meta — este script é só para gerar o fallback estático / uso manual.
 *
 * SEGURANÇA: o token NUNCA fica no código nem no repositório.
 *   - variável de ambiente META_TOKEN, ou
 *   - arquivo C:\Users\guzun\.claude\allpe-meta-token.txt (fora do repo)
 *
 * Uso:  $env:META_TOKEN="EAAB..."; node scripts/meta-fetch.js
 * Opcionais: META_ACCOUNT, META_PRESET (last_30d), META_LIMIT (24)
 */
const fs = require('fs');
const path = require('path');
const { fetchMetaData } = require('./meta-lib');

const TOKEN_FILE = path.join(__dirname, '..', '..', 'allpe-meta-token.txt');
let TOKEN = process.env.META_TOKEN || '';
if (!TOKEN) { try { TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch (e) { /* sem arquivo */ } }

const ACCOUNT = process.env.META_ACCOUNT || 'act_1658989684627909';
const PRESET  = process.env.META_PRESET  || 'last_30d';
const MAXCRT  = parseInt(process.env.META_LIMIT || '24', 10);
const OUTS    = [
  path.join(__dirname, '..', 'public', 'data', 'meta-dataset.js'),
  path.join(__dirname, '..', '..', 'data', 'meta-dataset.js')
];

if (!TOKEN) {
  console.error('ERRO: token ausente. Defina META_TOKEN ou crie ' + TOKEN_FILE);
  process.exit(2);
}

(async () => {
  try {
    const data = await fetchMetaData(TOKEN, ACCOUNT, PRESET, MAXCRT);
    const js = `/* meta-dataset.js — criativos Meta Ads (All Pé) · gerado por scripts/meta-fetch.js */\n` +
      `window.ALLPE_META = ${JSON.stringify(data)};\n`;
    OUTS.forEach(o => { try { fs.writeFileSync(o, js, 'utf8'); } catch (e) { console.error('aviso: não gravou', o, '-', e.message); } });
    console.log(`OK · ${data.criativos.length} criativos · R$${data.totais.spend} · ${data.totais.leads} leads · -> ${OUTS.length} arquivo(s)`);
  } catch (e) {
    console.error('FALHA:', e.message);
    process.exit(1);
  }
})();
