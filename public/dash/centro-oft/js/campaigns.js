/* =====================================================
   CAMPAIGNS · Top 5 campanhas da plataforma filtrada
   - Visível quando filtro de plataforma = "google" ou "facebook"
   - Substitui o donut nesses casos (donut com 1 fatia não faz sentido)
   - Engate pronto pra Google Ads API quando integrada
   ===================================================== */

const Campaigns = {

  /** Lê campanhas da plataforma escolhida, ordena por gasto, limita ao TOP N */
  getTopForPlatform(platform, n = 5) {
    const ds = App.fullDataset;
    if (!ds || !ds.platforms) return [];

    const p = ds.platforms[platform];
    if (!p || !p.campaigns || !Array.isArray(p.campaigns)) return [];

    // Clona, ordena por spend desc, pega top N
    return [...p.campaigns]
      .filter(c => (c.spend || 0) > 0)
      .sort((a, b) => (b.spend || 0) - (a.spend || 0))
      .slice(0, n);
  },

  /** Pega o gasto total da plataforma (pra cálculo de participação %) */
  getTotalSpend(platform) {
    const ds = App.fullDataset;
    if (!ds || !ds.platforms) return 0;
    const p = ds.platforms[platform];
    if (!p) return 0;
    // Prefere o budgetReal oficial, mas se não tiver, soma as campanhas
    if (typeof p.budgetReal === "number" && p.budgetReal > 0) return p.budgetReal;
    return (p.campaigns || []).reduce((s, c) => s + (c.spend || 0), 0);
  },

  /** Decide entre mostrar donut (Todas) ou top 5 (plataforma específica) */
  render() {
    const platform = (App.state && App.state.platform) || "all";
    const donutCard = document.getElementById("compositionDonutCard");
    const topCard   = document.getElementById("topCampaignsCard");

    if (platform === "all") {
      // Mostra o donut, esconde top 5
      if (donutCard) donutCard.hidden = false;
      if (topCard)   topCard.hidden = true;
      // O donut já é renderizado pelo Charts.renderDonut()
      return;
    }

    // Plataforma específica: esconde donut, mostra top 5
    if (donutCard) donutCard.hidden = true;
    if (topCard)   topCard.hidden = false;
    this.renderTop(platform);
  },

  /** Renderiza a lista de top 5 campanhas */
  renderTop(platform) {
    const list  = document.getElementById("topCampaignsList");
    const title = document.getElementById("topCampaignsTitle");
    const sub   = document.getElementById("topCampaignsSub");
    const tag   = document.getElementById("topCampaignsTag");
    if (!list) return;

    const platformLabel = platform === "google" ? "Google Ads" : "Meta Ads";
    const top = this.getTopForPlatform(platform, 5);
    const totalSpend = this.getTotalSpend(platform);

    // Atualiza títulos
    if (title) title.textContent = `Top ${Math.min(5, top.length)} campanhas · ${platformLabel}`;
    if (sub)   sub.textContent   = `por investimento no período`;
    if (tag)   tag.textContent   = Utils.brl(totalSpend);

    if (top.length === 0) {
      list.innerHTML = `
        <div class="top-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div class="title">Sem dados de campanhas</div>
          <div class="msg">${platform === "google"
            ? "Conecte a Google Ads API ou aguarde a sincronização do cliente"
            : "Carregue a aba Criativos para sincronizar os dados do Meta"}
          </div>
        </div>
      `;
      return;
    }

    // Determina valor máximo pra escalar barras visuais
    const maxSpend = Math.max(...top.map(c => c.spend || 0));

    // Renderiza linhas estilo ranking
    list.innerHTML = top.map((c, idx) => {
      const spend = c.spend || 0;
      const leads = c.leads || 0;
      const cpl = leads > 0 ? spend / leads : null;
      const sharePct = totalSpend > 0 ? (spend / totalSpend * 100) : 0;
      const barPct = maxSpend > 0 ? (spend / maxSpend * 100) : 0;
      const cType = c.type || "—";

      const statusBadge = c.status === "ACTIVE"
        ? `<span class="tc-status active">●</span>`
        : `<span class="tc-status paused">○</span>`;

      // Pill do tipo de campanha
      const typeClass = this.typeClass(cType);

      return `
        <div class="tc-row">
          <div class="tc-rank">${idx + 1}</div>
          <div class="tc-body">
            <div class="tc-head">
              <span class="tc-name" title="${Campaigns.escapeHtml(c.name)}">${Campaigns.escapeHtml(c.name)}</span>
              ${statusBadge}
              <span class="tc-type ${typeClass}">${Campaigns.escapeHtml(cType)}</span>
            </div>
            <div class="tc-bar">
              <div class="tc-bar-fill" style="width:${barPct}%"></div>
            </div>
            <div class="tc-meta">
              <span><strong>${Utils.brl(spend)}</strong> · ${sharePct.toFixed(1)}% da verba</span>
              <span class="tc-sep">·</span>
              <span>${Utils.num(leads)} leads</span>
              <span class="tc-sep">·</span>
              <span>CPL <strong>${cpl !== null ? Utils.brl(cpl) : "—"}</strong></span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  typeClass(type) {
    const t = (type || "").toLowerCase();
    if (t.includes("search") || t.includes("pesquisa")) return "type-search";
    if (t.includes("pmax"))    return "type-pmax";
    if (t.includes("display")) return "type-display";
    if (t.includes("video") || t.includes("vídeo")) return "type-video";
    if (t.includes("conver"))  return "type-conv";
    if (t.includes("engaj"))   return "type-engage";
    if (t.includes("tráf") || t.includes("traf")) return "type-traffic";
    return "type-other";
  },

  escapeHtml(s) {
    if (!s) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
};
