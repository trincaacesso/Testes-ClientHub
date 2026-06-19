# Dashboard de Performance — All Pé (Google Ads)

Dashboard de performance de marketing digital no estilo **glassmorphism (Apple/iOS)**, feito para a conta **All Pé** (Google Ads ID `2182542786`) pela **Acesso Marketing**.

![stack](https://img.shields.io/badge/stack-HTML%20%2B%20CSS%20%2B%20JS%20vanilla-blue) ![charts](https://img.shields.io/badge/charts-Chart.js%204.4-orange)

---

## ✨ O que tem

- **KPIs**: Investimento, Leads (conversões) e **CPL médio** com metas e barras de progresso.
- **CPL com verificação de filtros e histórico**: CPL = Investimento ÷ Conversões, sempre no período filtrado, considerando **apenas campanhas com entrega** (22 campanhas pausadas excluídas).
- **Dados DIÁRIOS reais** puxados do Google Ads dia-a-dia (03/05/2026 → 02/06/2026).
- **Gráficos** (Chart.js): investimento diário × leads acumulados, leads/dia, CPL/dia vs meta, doughnut de distribuição por região.
- **Comparativo Search × Performance Max**.
- **Tabela diária** com dia da semana e fins de semana destacados.
- **Seletor de período**: atalhos (30/14/7 dias) **+ filtro de data customizado (range livre)**.
- **Exportar PDF** (1 clique, via html2pdf.js).
- **Tema claro/escuro** persistente (sem flash ao carregar).

> **Observação sobre granularidade:** a série é diária e real. O último dia (02/06) é parcial — as conversões do dia ainda estão em atribuição.

---

## 🗂 Estrutura

```
allpe-dashboard/
├── public/
│   ├── index.html        # o dashboard (auto-contido, usa CDNs)
│   └── data/
│       └── dataset.js     # snapshot real dos dados (para futura atualização)
├── server.js              # servidor estático Node puro (para o Render)
├── package.json
├── render.yaml            # deploy no Render (Web Service)
├── netlify.toml           # deploy alternativo no Netlify (estático)
├── DEPLOY-RENDER.md       # passo a passo de deploy
└── README.md
```

---

## ▶️ Rodar localmente

Requisito: **Node 18+** (só para servir os arquivos — o dashboard em si é estático).

```bash
npm start
# abre em http://localhost:3000
```

Ou, sem Node, basta abrir `public/index.html` direto no navegador (precisa de internet para os CDNs do Chart.js e html2pdf).

---

## 🤖 Atualização automática (rotina diária)

Há uma **tarefa agendada** (`allpe-dashboard-daily`) que roda **todo dia às ~06:52** no Claude Code e:

1. Calcula a janela = últimos 31 dias (terminando ontem).
2. Puxa o Google Ads **dia-a-dia** (via subagente) + a quebra por região (`analise_periodo`).
3. Reescreve o `data/dataset.js` com os números frescos e `window.ALLPE_GERADO` = data da extração.

Resultado: ao abrir o dashboard de manhã, ele já mostra os dados do dia anterior. O `index.html` lê de `data/dataset.js` (com os últimos valores como *fallback* embutido).

> A tarefa roda enquanto o app Claude estiver aberto; se estiver fechado na hora, roda no próximo lançamento. Gerencie em **Scheduled** na barra lateral. **Dica:** clique em **"Run now"** uma vez para pré-aprovar as permissões (MCP Google Ads, Agent, Write) e evitar que execuções futuras parem em prompts.

## 🎯 Metas e objetivos (orçamento, leads, CPL)

As metas são **configuração fixa** no `public/index.html` (NÃO ficam no `dataset.js`, pra rotina diária não sobrescrever). Procure o bloco `// Metas (CONFIG fixa ...)`:

```js
// Google (aba Visão geral)
const META = Object.assign({orcamentoMensal:8600, metaLeadsMensal:470}, window.ALLPE_METAS||{});
// Facebook (aba Meta Ads)
const META_FB = { orcamento:1400, metaLeads:53 };
```

| Plataforma | Orçamento/mês | Meta de leads | CPL-alvo (derivado) |
|---|---|---|---|
| Google   | R$ 8.600 | 470 | **R$ 18,30** (8600 ÷ 470) |
| Facebook | R$ 1.400 | 53  | **R$ 26,42** (1400 ÷ 53) |

- O **CPL-alvo é calculado automaticamente** (`orçamento ÷ meta de leads`) — você não define à mão; ao mudar o orçamento ou a meta, ele se recalcula.
- No Google, a meta de leads e o orçamento são **escalados pelo período** selecionado (30/14/7 dias ou range custom).
- Para alterar qualquer meta: edite só essas duas linhas e dê commit/push (ou edite pelo VS Code).

## 🔄 Atualizar os dados manualmente

Os números vêm de uma extração do Google Ads feita **dia-a-dia**. Para atualizar:

1. Extraia a nova série diária (custo, conversões, cliques, impressões por dia) e a quebra por região.
2. Cole no `public/data/dataset.js` (formato documentado no próprio arquivo).
3. Atualize os mesmos arrays embutidos no topo do `<script>` de `public/index.html` (`DIAS`, `REGIOES`, `PMAX`, `TOT`).

> Para automatizar a extração via API do Google Ads, veja `DEPLOY-RENDER.md` (seção "Próximos passos — integração ao vivo").

---

## 🎨 Paleta

| Cor | Hex | Uso |
|---|---|---|
| Primária | `#1F6FE5` | marca / investimento |
| Acento | `#EF8A1F` | leads |
| Sucesso | `#1F9D56` | CPL no alvo |
| Perigo | `#DC4632` | CPL acima da meta |

Fontes: **Inter** (corpo) + **Plus Jakarta Sans** (títulos).

---

Fonte dos dados: Google Ads (MCC) · conta All Pé · gerado em 02/06/2026.
