/**
 * gerar-token-tiktok.js
 * Mini-programa para pegar o ACCESS TOKEN do TikTok a partir do auth_code.
 *
 * COMO USAR:
 *   1. Abra o terminal na pasta do projeto.
 *   2. Rode:  node gerar-token-tiktok.js
 *   3. Cole o App ID, o Secret e o auth_code quando pedir (sem aspas).
 *   4. Ele imprime o access_token e a lista de advertiser_ids.
 *
 * Dica: gere o auth_code NOVO logo antes de rodar isto (ele expira em minutos).
 */
'use strict';
const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const pergunta = (q) => new Promise((resolve) => rl.question(q, (a) => resolve((a || '').trim())));

function trocar(appId, secret, authCode) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ app_id: String(appId), secret: String(secret), auth_code: String(authCode) });
    const req = https.request({
      host: 'business-api.tiktok.com',
      path: '/open_api/v1.3/oauth2/access_token/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { reject(new Error('Resposta inesperada do TikTok: ' + buf.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    console.log('\n=== Gerador de Access Token do TikTok ===\n');
    const appId = await pergunta('1) Cole o APP ID e tecle Enter:\n> ');
    const secret = await pergunta('\n2) Cole o SECRET e tecle Enter:\n> ');
    const authCode = await pergunta('\n3) Cole o AUTH_CODE (novo!) e tecle Enter:\n> ');
    rl.close();

    if (!appId || !secret || !authCode) {
      console.log('\n[ERRO] Faltou preencher algum campo. Rode de novo.\n');
      process.exit(1);
    }

    console.log('\nTrocando o auth_code pelo token...\n');
    const r = await trocar(appId, secret, authCode);

    if (r.code !== 0) {
      console.log('====================================================');
      console.log('[FALHOU] O TikTok recusou. code ' + r.code + ': ' + r.message);
      if (String(r.message || '').toLowerCase().includes('auth_code')) {
        console.log('>> Quase sempre é o auth_code EXPIRADO ou já usado.');
        console.log('>> Gere um auth_code NOVO e rode este programa de novo na hora.');
      }
      console.log('====================================================\n');
      process.exit(1);
    }

    const d = r.data || {};
    console.log('====================================================');
    console.log('  DEU CERTO! Copie o ACCESS TOKEN abaixo:');
    console.log('====================================================\n');
    console.log('ACCESS TOKEN:\n' + d.access_token + '\n');
    console.log('ADVERTISER IDS autorizados:');
    (d.advertiser_ids || []).forEach((id) => console.log('  - ' + id));
    console.log('\n----------------------------------------------------');
    console.log('Agora cole o ACCESS TOKEN na variável TIKTOK_ACCESS_TOKEN');
    console.log('no Render/Railway (sem aspas) e faça o redeploy.');
    console.log('----------------------------------------------------\n');
  } catch (e) {
    console.log('\n[ERRO] ' + e.message + '\n');
    process.exit(1);
  }
})();
