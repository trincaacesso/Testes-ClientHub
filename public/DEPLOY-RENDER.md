# Deploy no Render — passo a passo

O dashboard é estático, mas o `server.js` (Node puro, sem dependências) o serve como um **Web Service** no Render free tier.

## 1. Subir para o GitHub

```bash
cd allpe-dashboard
git init
git add .
git commit -m "Dashboard All Pe - Google Ads"
git branch -M main
git remote add origin https://github.com/SUA-CONTA/allpe-dashboard.git
git push -u origin main
```

## 2. Criar o Web Service no Render

1. Acesse [dashboard.render.com](https://dashboard.render.com) → **New** → **Web Service**.
2. Conecte o repositório `allpe-dashboard`.
3. O Render detecta o `render.yaml` automaticamente. Se pedir manualmente:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
4. Clique em **Create Web Service**.

Em ~1–2 min o dashboard estará no ar em `https://allpe-dashboard.onrender.com`.

> O Render injeta `process.env.PORT` automaticamente — o `server.js` já usa isso.

## 3. Deploy alternativo (Netlify, estático)

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import from Git**.
2. Selecione o repositório. O `netlify.toml` já define `publish = "public"`.
3. **Deploy**. Pronto — hospedagem estática, sem servidor.

---

## Próximos passos — integração ao vivo (opcional)

Hoje os dados são um **snapshot** extraído do Google Ads dia-a-dia (em `public/data/dataset.js`). Para deixar o dashboard **ao vivo**:

1. Crie um proxy backend (estender o `server.js`) que consulta a **Google Ads API** (`GoogleAdsService.SearchStream`) com uma query GAQL agrupando por `segments.date`:
   ```sql
   SELECT segments.date, metrics.cost_micros, metrics.conversions,
          metrics.clicks, metrics.impressions
   FROM campaign
   WHERE segments.date BETWEEN '2026-05-03' AND '2026-06-02'
     AND campaign.status = 'ENABLED'
   ```
2. Exponha um endpoint `GET /api/daily?from=...&to=...` que retorna o mesmo formato de `ALLPE_DIAS`.
3. No front, troque os arrays embutidos por um `fetch('/api/daily')` com cache de 5 min e **fallback** para `dataset.js` se a API falhar.

Variáveis de ambiente necessárias (Google Ads API):
`GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`,
`GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (MCC), `GOOGLE_ADS_CUSTOMER_ID` (2182542786).

> Nunca exponha tokens no front — sempre via proxy no backend.
