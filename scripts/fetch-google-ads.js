/**
 * fetch-google-ads.js
 * ------------------------------------------------------------------
 * Roda na nuvem (GitHub Actions), sem depender do PC do usuário.
 * Consulta a API do Google Ads (conta All Pé), monta a série diária dos
 * últimos 31 dias + a quebra por região, e reescreve public/data/dataset.js.
 *
 * Node 18+ (usa fetch global). Sem dependências externas.
 *
 * Variáveis de ambiente (GitHub Secrets):
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_CLIENT_ID
 *   GOOGLE_ADS_CLIENT_SECRET
 *   GOOGLE_ADS_REFRESH_TOKEN
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID   (MCC, só dígitos)
 *   GOOGLE_ADS_CUSTOMER_ID         (cliente All Pé: 2182542786)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const API_VERSION = 'v17';
const ENV = process.env;

function need(k){ if(!ENV[k]) { console.error('Falta a variável de ambiente:', k); process.exit(1);} return ENV[k]; }
const DEV_TOKEN = need('GOOGLE_ADS_DEVELOPER_TOKEN');
const CLIENT_ID = need('GOOGLE_ADS_CLIENT_ID');
const CLIENT_SECRET = need('GOOGLE_ADS_CLIENT_SECRET');
const REFRESH_TOKEN = need('GOOGLE_ADS_REFRESH_TOKEN');
const LOGIN_CID = need('GOOGLE_ADS_LOGIN_CUSTOMER_ID').replace(/\D/g,'');
const CUSTOMER_ID = need('GOOGLE_ADS_CUSTOMER_ID').replace(/\D/g,'');

const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;

// Janela: 31 dias terminando ONTEM (UTC)
const hoje = new Date();
const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()-1));
const ini = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), fim.getUTCDate()-30));
const DATA_INICIO = ymd(ini), DATA_FIM = ymd(fim);

// Nome curto legível por palavra-chave (fallback = nome cru encurtado)
function nomeCurto(name){
  const n = name.toLowerCase();
  if(n.includes('campina grande')) return 'Campina Grande/PE/AL/MA';
  if(n.includes('joão pessoa')||n.includes('joao pessoa')) return 'João Pessoa';
  if(n.includes('pmax')) return 'PMAX Geral';
  if(n.includes('natal')) return 'Natal';
  if(n.includes('salvador')) return 'Salvador';
  if(n.includes('sp e rj')||n.includes('[sp')) return 'SP e RJ';
  if(n.includes('institucional')) return 'Institucional';
  if(n.includes('norte')) return 'Norte+C.Oeste';
  if(n.includes('bh')||n.includes('contagem')) return 'BH + Contagem';
  if(n.includes('santana')) return 'Santana-SP';
  if(n.includes('franquia')||n.includes('expansão')||n.includes('expansao')) return 'Expansão Franquias';
  return name.replace(/\[.*?\]/g,'').trim().slice(0,28) || name.slice(0,28);
}

async function getAccessToken(){
  const r = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,refresh_token:REFRESH_TOKEN,grant_type:'refresh_token'})
  });
  if(!r.ok){ console.error('Falha no OAuth:', r.status, await r.text()); process.exit(1); }
  return (await r.json()).access_token;
}

async function searchStream(accessToken, query){
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${CUSTOMER_ID}/googleAds:searchStream`;
  const r = await fetch(url,{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${accessToken}`,
      'developer-token':DEV_TOKEN,
      'login-customer-id':LOGIN_CID,
      'Content-Type':'application/json'
    },
    body: JSON.stringify({query})
  });
  if(!r.ok){ console.error('Falha na Google Ads API:', r.status, await r.text()); process.exit(1); }
  const batches = await r.json();             // searchStream → array de {results:[...]}
  return batches.flatMap(b => b.results || []);
}

(async () => {
  console.log(`[GoogleAds] Janela ${DATA_INICIO} → ${DATA_FIM}`);
  const token = await getAccessToken();

  const query = `
    SELECT campaign.name, campaign.status, campaign.advertising_channel_type, segments.date,
           metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions
    FROM campaign
    WHERE segments.date BETWEEN '${DATA_INICIO}' AND '${DATA_FIM}'
      AND metrics.impressions > 0`;

  const rows = await searchStream(token, query);
  console.log(`[GoogleAds] ${rows.length} linhas retornadas`);

  // --- agrega por dia ---
  const porDia = {};
  // --- agrega por campanha (período) ---
  const porCamp = {};
  let TOT = {custo:0,conv:0,cliques:0,impr:0};
  let PMAX = {custo:0,conv:0,cliques:0};

  for(const row of rows){
    const c = row.campaign || {}, m = row.metrics || {}, s = row.segments || {};
    const custo = (Number(m.costMicros||0))/1e6;
    const conv = Math.round(Number(m.conversions||0));
    const cliques = Number(m.clicks||0);
    const impr = Number(m.impressions||0);

    const d = s.date;
    if(!porDia[d]) porDia[d] = {data:d,custo:0,conv:0,cliques:0,impr:0};
    porDia[d].custo += custo; porDia[d].conv += conv; porDia[d].cliques += cliques; porDia[d].impr += impr;

    TOT.custo += custo; TOT.conv += conv; TOT.cliques += cliques; TOT.impr += impr;

    if((c.advertisingChannelType||'')==='PERFORMANCE_MAX' || /\[pmax\]/i.test(c.name||'')){
      PMAX.custo += custo; PMAX.conv += conv; PMAX.cliques += cliques;
    }

    if(c.status==='ENABLED'){
      const nome = nomeCurto(c.name||'—');
      if(!porCamp[nome]) porCamp[nome] = 0;
      porCamp[nome] += custo;
    }
  }

  const DIAS = Object.values(porDia).sort((a,b)=>a.data<b.data?-1:1)
    .map(x=>({data:x.data,custo:+x.custo.toFixed(2),conv:x.conv,cliques:x.cliques,impr:x.impr}));

  // top 9 regiões + "Outros"
  const ordenadas = Object.entries(porCamp).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const top = ordenadas.slice(0,9).map(([n,v])=>[n,+v.toFixed(2)]);
  const restoSum = ordenadas.slice(9).reduce((a,[,v])=>a+v,0);
  if(restoSum>0) top.push(['Outros',+restoSum.toFixed(2)]);

  const totais = {
    custo:+TOT.custo.toFixed(2), conv:TOT.conv, cliques:TOT.cliques, impr:TOT.impr,
    pmax:{custo:+PMAX.custo.toFixed(2), conv:PMAX.conv, cliques:PMAX.cliques}
  };

  const geradoEm = `${pad(hoje.getUTCDate())}/${pad(hoje.getUTCMonth()+1)}/${hoje.getUTCFullYear()}`;

  const out =
`/* dataset.js — gerado automaticamente por GitHub Actions (fetch-google-ads.js) */
window.ALLPE_DIAS = ${JSON.stringify(DIAS).replace(/},/g,'},\n')};
window.ALLPE_REGIOES = ${JSON.stringify(top)};
window.ALLPE_TOTAIS = ${JSON.stringify(totais)};
window.ALLPE_METAS = { orcamentoMensal: 8600, cplMeta: 8.00 };
window.ALLPE_GERADO = "${geradoEm}";
`;

  const dest = path.join(__dirname,'..','public','data','all-pe','dataset.js');
  fs.writeFileSync(dest, out, 'utf8');
  const cpl = totais.conv ? (totais.custo/totais.conv) : 0;
  console.log(`[GoogleAds] OK · ${DIAS.length} dias · custo R$${totais.custo} · ${totais.conv} leads · CPL R$${cpl.toFixed(2)}`);
  console.log(`[GoogleAds] Escrito em ${dest}`);
})();
