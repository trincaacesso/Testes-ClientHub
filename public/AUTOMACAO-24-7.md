# Automação 24/7 (sempre conectado) — GitHub Actions + API Google Ads

Este é o modo **"sempre on"**: a atualização roda na **nuvem do GitHub**, todo dia, **mesmo com seu PC desligado** (inclusive fins de semana). Não depende do Claude nem do seu computador.

```
GitHub Actions (06:50, todo dia) → API Google Ads → reescreve dataset.js → commit/push → Render redeploya
```

> **Por que não dá pra usar o MCP aqui?** O MCP do Google Ads do Claude só funciona dentro do app no seu PC. A nuvem não o enxerga — por isso a automação 24/7 fala **direto com a API do Google Ads**.

---

## ✅ O que já está pronto no repositório
- `scripts/fetch-google-ads.js` — busca os dados e gera o `public/data/dataset.js`
- `.github/workflows/update-data.yml` — agenda diária + commit/push automático

## 🔧 O que VOCÊ precisa fazer (uma vez)

### 1. Conseguir as credenciais da API do Google Ads
Você (ou quem cuida da conta de API) precisa de 6 valores:

| Secret | Onde conseguir |
|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads → Ferramentas → **Central de API** (precisa de aprovação do Google; pode levar alguns dias) |
| `GOOGLE_ADS_CLIENT_ID` | Google Cloud Console → APIs e Serviços → **Credenciais** → ID do cliente OAuth 2.0 |
| `GOOGLE_ADS_CLIENT_SECRET` | mesma tela acima (segredo do cliente OAuth) |
| `GOOGLE_ADS_REFRESH_TOKEN` | gerado uma vez via OAuth Playground (escopo `https://www.googleapis.com/auth/adwords`) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | ID do **MCC** (gerenciadora), só dígitos |
| `GOOGLE_ADS_CUSTOMER_ID` | ID da conta **All Pé**: `2182542786` |

> Dica para o refresh token: [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground/) → engrenagem → marque "Use your own OAuth credentials" → cole client id/secret → autorize o escopo **Google Ads API** → troque o code pelo refresh token.

### 2. Cadastrar os 6 valores como **Secrets** no GitHub
No repositório `GustavoZunzarren/all-pe`:
**Settings → Secrets and variables → Actions → New repository secret** (crie os 6, com os nomes exatos da tabela).

### 3. Ligar o Render (se ainda não ligou)
Conecte o repo no Render (ver `DEPLOY-RENDER.md`). Como tem `autoDeploy: true`, todo push do GitHub Actions dispara o redeploy.

### 4. Testar
Aba **Actions** do repositório → workflow **"Atualiza dados (Google Ads)"** → **Run workflow**. Veja os logs: deve aparecer `OK · 31 dias · custo R$… · … leads · CPL R$…` e um commit novo.

---

## 🧹 Depois de validar
Quando o GitHub Actions estiver funcionando, **desative a rotina local do Claude** (`allpe-dashboard-daily`) para os dois não ficarem disputando o mesmo arquivo:
sidebar → **Scheduled** → `allpe-dashboard-daily` → desativar.

A partir daí: **zero dependência do seu PC**. Todo dia, com você dormindo ou no fim de semana, o dado se atualiza sozinho e o link do Render fica fresco.

---

## ⏱️ Observações
- O `cron` do GitHub Actions é em **UTC**; `50 9 * * *` = **06:50 de Brasília**. O GitHub pode atrasar alguns minutos em horários de pico — normal.
- O workflow só faz commit **se o dado mudou** (evita commits vazios).
- Enquanto você não cadastrar os Secrets, o workflow vai falhar de propósito (sem credencial) — é esperado até a configuração.
