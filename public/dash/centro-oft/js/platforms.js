/* =====================================================
   PLATFORMS · Cards comparativos Google × Meta
   - Investimento, Leads, CPL, Cliques, Participação na verba
   - Quando filtro de plataforma = "google", esconde Meta (e vice-versa)
   ===================================================== */

const Platforms = {
  /** Calcula cliques estimados via CTR ou usa valor real se houver */
  estimateClicks(spend, leads, cpc) {
    // Se temos CPC e investimento, cliques = investimento / CPC
    if (cpc && spend > 0) return Math.round(spend / cpc);
    // Senão estima via taxa de conversão típica (5-10% de cliques viram leads)
    return Math.round(leads * 7.5);
  },

  renderTable() {
    const container = document.getElementById("platformCompare");
    if (!container) return;

    const ds = App.fullDataset;
    if (!ds) { container.innerHTML = ""; return; }

    const p = ds.platforms || {};
    const platform = (App.state && App.state.platform) || "all";

    // Calcula totais pra participação na verba
    const totalSpend = (p.google?.budgetReal || 0) + (p.facebook?.budgetReal || 0);

    const cards = [];

    if (platform !== "facebook") {
      const g = p.google || {};
      const gShare = totalSpend > 0 ? (g.budgetReal / totalSpend) * 100 : 0;
      const gCpc = g.cpc || (g.budgetReal > 0 && g.clicks > 0 ? g.budgetReal / g.clicks : null);
      const gClicks = g.clicks || this.estimateClicks(g.budgetReal, g.leadsReal, gCpc);
      cards.push({
        key: "google",
        name: "Google Ads",
        tag: "Search & PMax",
        icon: "G",
        color: "google",
        items: [
          { label: "Investimento", value: Utils.brl(g.budgetReal || 0) },
          { label: "Leads",        value: Utils.num(g.leadsReal || 0), highlight: "primary" },
          { label: "CPL",          value: Utils.brl(g.leadsReal > 0 ? (g.budgetReal/g.leadsReal) : 0), highlight: "accent" },
          { label: "Cliques",      value: Utils.num(gClicks) },
          { label: "Participação na verba", value: `${gShare.toFixed(0)}%`, highlight: "accent" }
        ]
      });
    }

    if (platform !== "google") {
      const f = p.facebook || {};
      const fShare = totalSpend > 0 ? (f.budgetReal / totalSpend) * 100 : 0;
      const fCpc = f.cpc || (f.budgetReal > 0 && f.clicks > 0 ? f.budgetReal / f.clicks : null);
      const fClicks = f.clicks || this.estimateClicks(f.budgetReal, f.leadsReal, fCpc);
      cards.push({
        key: "facebook",
        name: "Meta Ads",
        tag: "Facebook & Instagram",
        icon: "M",
        color: "meta",
        items: [
          { label: "Investimento", value: Utils.brl(f.budgetReal || 0) },
          { label: "Leads",        value: Utils.num(f.leadsReal || 0), highlight: "primary" },
          { label: "CPL",          value: Utils.brl(f.leadsReal > 0 ? (f.budgetReal/f.leadsReal) : 0), highlight: "accent" },
          { label: "Cliques",      value: Utils.num(fClicks) },
          { label: "Participação na verba", value: `${fShare.toFixed(0)}%`, highlight: "accent" }
        ]
      });
    }

    container.innerHTML = cards.map(card => `
      <div class="card platform-compare-card ${card.color}">
        <div class="platform-compare-head">
          <div class="platform-compare-icon">${card.icon}</div>
          <div class="platform-compare-name">
            <div class="name">${card.name}</div>
          </div>
          <span class="platform-compare-tag">${card.tag}</span>
        </div>
        <div class="platform-compare-body">
          ${card.items.map(it => `
            <div class="pcr">
              <span class="pcr-label">${it.label}</span>
              <span class="pcr-value ${it.highlight ? 'hl-' + it.highlight : ''}">${it.value}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  },

  /** Compatibilidade com chamada antiga */
  renderBudgetLegend() {
    // Removido — substituído pelo donut
  }
};
