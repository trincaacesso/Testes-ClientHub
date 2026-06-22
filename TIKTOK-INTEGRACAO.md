# Integração TikTok Ads — guia rápido

A aba **TikTok Ads** aparece automaticamente **só** para os clientes que tiverem
`tiktokAdvertiserId` preenchido no `clients.json` (lógica em `server.js` →
`clientPublic()` → `hasTiktok`).

### Clientes com TikTok hoje
| Cliente (chave no `clients.json`) | Nome | `tiktokAdvertiserId` | Observação |
|---|---|---|---|
| `cotemig-colegio` | Cotemig Colégio | `7039121894964084738` | — |
| `cotemig-faculdade` | Cotemig Faculdade | `7156675428080467970` | — |
| `suggar` | Suggar Eletrodomésticos | `7302560928502005762` | Dash padrão; Google/Meta/Expad/GA4 prontos (vazios) p/ preencher depois |
| _(Depyl Action)_ | CA - Depyl Action | `7279099103961808898` | **Dash à parte** — anotado aqui p/ futura ativação; ainda não criado no `clients.json` |

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

### A) Cliente que JÁ existe no `clients.json`
Basta adicionar `"tiktokAdvertiserId": "..."` no bloco dele. O mesmo
`TIKTOK_ACCESS_TOKEN` cobre todos os anunciantes que autorizaram o app.

### B) Cliente NOVO (modelo: Suggar)
Cole um bloco assim no final do `clients.json` (antes do `}` que fecha o arquivo).
Os campos vazios deixam Google / Meta / Criativos / Expad / GA4 **prontos** —
é só preencher o id de cada canal quando tiver. Só o TikTok já funciona.

```json
"chave-do-cliente": {
  "nome": "Nome do Cliente",
  "sub": "Segmento · TikTok Ads · BRL",
  "logo": "/assets/logo.svg",
  "googleCustomerId": "",
  "metaAccount": "",
  "tiktokAdvertiserId": "0000000000000000000",
  "metas": { "google": { "orcamentoMensal": 0, "metaLeadsMensal": 0 }, "meta": { "orcamento": 0, "metaLeads": 0 } },
  "expadAccountId": "", "expadApiKey": "",
  "ga4Property": "",
  "senha": "chave123"
}
```

> ⚠️ Edite **as DUAS cópias**: `clients.json` (raiz, lida pelo servidor) e
> `public/clients.json` (deploy estático do Netlify). Mantenha as duas iguais.
> O login do cliente é a **chave** + a **senha** desse bloco.

## Endpoints criados
- `GET /api/tiktok?cli=<id>&days=<n>` — dados ao vivo do cliente (com cache).
- `GET /api/tiktok-auth?code=<auth_code>` — **só equipe**; troca o auth_code pelo access_token.
- `GET /api/tiktok-check` — **só equipe**; valida o token e lista os anunciantes
  autorizados, marcando quais clientes do `clients.json` estão `coberto_pelo_token`.
  Use isto depois de adicionar um cliente novo: se `coberto_pelo_token: false`,
  o cliente precisa autorizar o app (passo 2) antes da aba mostrar dados.
