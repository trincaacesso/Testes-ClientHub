# Integração TikTok Ads — guia rápido

A aba **TikTok Ads** aparece automaticamente **só** para os clientes que tiverem
`tiktokAdvertiserId` preenchido no `clients.json`. Hoje está habilitada no
**Cotemig Colégio**.

## 1) Variáveis de ambiente (Render / Railway)

| Variável | O que é | Obrigatória |
|---|---|---|
| `TIKTOK_ACCESS_TOKEN` | Token de acesso obtido após o cliente autorizar o app | ✅ Sim |
| `TIKTOK_APP_ID` | Seu App ID do TikTok for Business | ✅ Sim (para gerar o token) |
| `TIKTOK_APP_SECRET` | Seu Secret do app | ✅ Sim (para gerar o token) |
| `TIKTOK_CACHE_MIN` | Minutos de cache dos dados (padrão `180`) | ❌ Opcional |

> No Render: **Environment → Add Environment Variable**.
> No Railway: **Variables → New Variable**. Depois faça **Deploy/Redeploy**.

## 2) Como obter o `TIKTOK_ACCESS_TOKEN` (faz uma vez por anunciante)

1. Coloque `TIKTOK_APP_ID` e `TIKTOK_APP_SECRET` nas variáveis e faça o deploy.
2. Envie ao cliente a sua **"Advertiser authorization URL"**. Ele autoriza o app.
3. Ao autorizar, o TikTok redireciona para a sua URL de retorno com `?auth_code=XXXX` no fim. Copie esse `auth_code`.
4. Logado no painel **como agência**, abra no navegador:
   ```
   https://SEU-DASHBOARD/api/tiktok-auth?code=COLE_O_AUTH_CODE_AQUI
   ```
5. A resposta traz:
   - `access_token` → copie e cole na variável `TIKTOK_ACCESS_TOKEN` (e faça redeploy).
   - `advertiser_ids` → escolha o do cliente e use no passo 3.

## 3) Ligar o cliente ao anunciante (`clients.json`)

Dentro do bloco do cliente, adicione o `tiktokAdvertiserId`:

```json
"cotemig-colegio": {
  ...
  "tiktokAdvertiserId": "1234567890123456789",
  ...
}
```

Pronto. Ao recarregar o dashboard do Cotemig Colégio, a aba **TikTok Ads**
aparece com investimento, impressões, cliques, CTR, conversões, CPL, CPC,
gráfico diário, distribuição por campanha e a tabela de top campanhas.

## Para habilitar em OUTRO cliente

Basta adicionar `"tiktokAdvertiserId": "..."` no bloco dele no `clients.json`.
O mesmo `TIKTOK_ACCESS_TOKEN` cobre todos os anunciantes que autorizaram o app.

## Endpoints criados
- `GET /api/tiktok?cli=<id>&days=<n>` — dados ao vivo do cliente (com cache).
- `GET /api/tiktok-auth?code=<auth_code>` — **só equipe**; troca o auth_code pelo access_token.
