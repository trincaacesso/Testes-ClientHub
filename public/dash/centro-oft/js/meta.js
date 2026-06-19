/* =====================================================
   META · Integração com Meta Ads (criativos + métricas)
   Via proxy Netlify/Render (/api/meta-creatives)
   ===================================================== */

const Meta = {
  _cache: null,
  _cacheKey: null,
  _cacheAt: 0,
  _lastData: null,
  // Status filter: "all" | "active" | "paused"
  statusFilter: "all",

  endpoint() {
    return "/api/meta-creatives";
  },

  /** Monta a chave de cache baseada no período (invalida quando muda) */
  cacheKeyFor(from, to) {
    return `${from || "-"}_${to || "-"}`;
  },

  /** Busca criativos para o período */
  async fetch(opts = {}) {
    const now = Date.now();
    const key = this.cacheKeyFor(opts.from, opts.to);

    // Cache válido por 5 min para a mesma janela
    if (!opts.force && this._cache && this._cacheKey === key && (now - this._cacheAt) < (CONFIG.cacheTTL || 300000)) {
      return this._cache;
    }

    const params = new URLSearchParams();
    if (opts.from) params.set("from", opts.from);
    if (opts.to)   params.set("to",   opts.to);
    if (opts.limit) params.set("limit", opts.limit);
    const qs = params.toString();
    const url = qs ? `${this.endpoint()}?${qs}` : this.endpoint();

    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      let detail = "";
      try {
        const errJson = await res.json();
        detail = errJson.detail || errJson.error || "";
        if (errJson.metaMessage) detail += " · Meta: " + errJson.metaMessage;
        if (errJson.hint) detail += " · " + errJson.hint;
        if (errJson.missing) detail += " · Faltando: " + errJson.missing.join(", ");
      } catch (e) {
        detail = res.statusText;
      }
      throw new Error(`Meta proxy retornou ${res.status}: ${detail}`);
    }

    const json = await res.json();
    this._cache    = json;
    this._cacheKey = key;
    this._cacheAt  = now;
    this._lastData = json;

    console.log(`[Meta] ✓ ${json.totals.adsCount} criativos · R$ ${json.totals.spend.toFixed(2)} · ${json.totals.conversions} conv.`);

    return json;
  },

  /** Invalida o cache (chamado quando filtro de data muda) */
  invalidateCache() {
    this._cache = null;
    this._cacheKey = null;
    this._cacheAt = 0;
  },

  /** Converte Date pra "YYYY-MM-DD" (formato esperado pela Meta API) */
  toApiDate(d) {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  /** Carrega criativos sincronizado com o filtro de data atual */
  async loadForCurrentFilter() {
    let from = null, to = null;
    if (typeof DateFilter !== "undefined" && DateFilter.state.from) {
      from = this.toApiDate(DateFilter.state.from);
      to   = this.toApiDate(DateFilter.state.to);
    }

    try {
      const data = await this.fetch({ from, to });
      return data;
    } catch (err) {
      console.warn("[Meta] Falha:", err.message);
      // Retorna estrutura vazia pra ainda renderizar Google placeholders
      return {
        creatives: [],
        totals: { adsCount: 0, spend: 0, impressions: 0, clicks: 0, conversions: 0, avgCpl: null },
        _metaError: err.message
      };
    }
  },

  showError(msg) {
    const container = document.getElementById("creativesGrid");
    if (!container) return;
    container.innerHTML = `
      <div class="creatives-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="title">Não foi possível carregar os criativos</div>
        <div class="msg">${msg}</div>
        <div class="hint">Verifique as variáveis META_ACCESS_TOKEN e META_AD_ACCOUNT_ID no Render</div>
      </div>
    `;
  },

  showLoading() {
    const container = document.getElementById("creativesGrid");
    if (!container) return;
    container.innerHTML = `
      <div class="creatives-loading">
        <div class="spinner-sm"></div>
        <span>Carregando criativos do Meta Ads...</span>
      </div>
    `;
  },

  showEmpty() {
    const container = document.getElementById("creativesGrid");
    if (!container) return;
    container.innerHTML = `
      <div class="creatives-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <div class="title">Nenhum criativo no período</div>
        <div class="msg">Tente ampliar o filtro de data ou verifique se a conta tem ads ativos</div>
      </div>
    `;
  },

  /** Classifica um criativo: true = ativo, false = pausado/outros */
  isActive(c) {
    return c.status === "ACTIVE";
  },

  /** Aplica o filtro de status atual aos criativos */
  applyStatusFilter(creatives) {
    if (this.statusFilter === "all") return creatives;
    if (this.statusFilter === "active")  return creatives.filter(c => this.isActive(c));
    if (this.statusFilter === "paused")  return creatives.filter(c => !this.isActive(c));
    return creatives;
  },

  /** Atualiza os contadores nas pílulas (Todos / Ativos / Pausados) */
  updateCounts(creatives) {
    if (!creatives) return;
    const total  = creatives.length;
    const active = creatives.filter(c => this.isActive(c)).length;
    const paused = total - active;
    const set = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = n;
    };
    set("countAll",    total);
    set("countActive", active);
    set("countPaused", paused);
  },

  /** Gera "criativos" do Google Ads a partir dos dados da planilha
   *  Por enquanto é placeholder — quando integrar Google Ads API,
   *  esses dados virão direto da API com nomes reais das campanhas.
   */
  buildGooglePlaceholders() {
    const ds = App.fullDataset;
    if (!ds || !ds.platforms || !ds.platforms.google) return [];

    const g = ds.platforms.google;
    if ((g.budgetReal || 0) === 0) return [];

    // Gera "anúncios" agrupados por tipo de campanha
    // Por enquanto: 1 Search + 1 PMax (proporção típica baseada na planilha)
    const totalSpend = g.budgetReal || 0;
    const totalLeads = g.leadsReal || 0;

    // Distribuição típica observada: Search ~ 93%, PMax ~ 7%
    const searchShare = 0.93;
    const pmaxShare = 0.07;

    const searchSpend = totalSpend * searchShare;
    const searchLeads = Math.round(totalLeads * 0.83); // proporção observada
    const pmaxSpend = totalSpend * pmaxShare;
    const pmaxLeads = totalLeads - searchLeads;

    return [
      {
        id: "google_search_default",
        name: "Rede de Pesquisa · Search",
        platform: "google",
        status: "ACTIVE",
        creativeName: "Search · Geral",
        thumbnail: null,    // placeholder visual será desenhado via CSS
        thumbnailSource: "google_text",
        isVideo: false,
        isText: true,
        spend: searchSpend,
        impressions: 0,
        clicks: searchLeads * 7,
        ctr: 11.4,
        cpc: searchLeads > 0 ? searchSpend / (searchLeads * 7) : 0,
        reach: 0,
        conversions: searchLeads,
        conversionValue: 0,
        cpl: searchLeads > 0 ? searchSpend / searchLeads : null
      },
      {
        id: "google_pmax_default",
        name: "Performance Max · PMax",
        platform: "google",
        status: "ACTIVE",
        creativeName: "PMax · Multicanal",
        thumbnail: null,
        thumbnailSource: "google_text",
        isVideo: false,
        isText: true,
        spend: pmaxSpend,
        impressions: 0,
        clicks: pmaxLeads * 7,
        ctr: 11.4,
        cpc: pmaxLeads > 0 ? pmaxSpend / (pmaxLeads * 7) : 0,
        reach: 0,
        conversions: pmaxLeads,
        conversionValue: 0,
        cpl: pmaxLeads > 0 ? pmaxSpend / pmaxLeads : null
      }
    ];
  },

  /** Aplica filtro de plataforma do toolbar (App.state.platform) */
  applyPlatformFilter(creatives) {
    const platform = (App.state && App.state.platform) || "all";
    if (platform === "all") return creatives;
    if (platform === "google") {
      return creatives.filter(c => c.platform === "google");
    }
    if (platform === "facebook") {
      // Tudo que não é google é considerado Meta (Facebook/Instagram)
      return creatives.filter(c => c.platform !== "google");
    }
    return creatives;
  },

  /** Renderiza o grid de cards */
  render(data) {
    const container = document.getElementById("creativesGrid");
    const summary = document.getElementById("creativesSummary");
    if (!container) return;

    if (!data) {
      this.showEmpty();
      return;
    }

    // Marca todos os criativos do Meta com platform="facebook" se faltar
    const metaCreatives = (data.creatives || []).map(c => ({
      ...c,
      platform: c.platform || "facebook"
    }));

    // Adiciona placeholders do Google
    const googleCreatives = this.buildGooglePlaceholders();

    // Combina ambas as plataformas
    const allCreatives = [...metaCreatives, ...googleCreatives];

    // Calcula totais combinados (Meta + Google)
    const combinedTotals = {
      adsCount: allCreatives.length,
      spend: allCreatives.reduce((s, c) => s + (c.spend || 0), 0),
      impressions: allCreatives.reduce((s, c) => s + (c.impressions || 0), 0),
      clicks: allCreatives.reduce((s, c) => s + (c.clicks || 0), 0),
      conversions: allCreatives.reduce((s, c) => s + (c.conversions || 0), 0)
    };
    combinedTotals.avgCpl = combinedTotals.conversions > 0
      ? combinedTotals.spend / combinedTotals.conversions
      : null;

    // Atualiza resumo no topo
    if (summary) {
      summary.innerHTML = `
        <div class="creatives-summary-item">
          <span class="label">Criativos</span>
          <span class="value">${Utils.num(combinedTotals.adsCount)}</span>
        </div>
        <div class="creatives-summary-item">
          <span class="label">Investimento</span>
          <span class="value">${Utils.brl(combinedTotals.spend)}</span>
        </div>
        <div class="creatives-summary-item">
          <span class="label">Conversões</span>
          <span class="value">${Utils.num(combinedTotals.conversions)}</span>
        </div>
        <div class="creatives-summary-item">
          <span class="label">CPL médio</span>
          <span class="value">${combinedTotals.avgCpl !== null ? Utils.brl(combinedTotals.avgCpl) : "—"}</span>
        </div>
      `;
    }

    // 1. Filtra por plataforma (toolbar)
    let filtered = this.applyPlatformFilter(allCreatives);

    // 2. Atualiza contadores (baseado no que sobrou após filtro de plataforma)
    this.updateCounts(filtered);

    // 3. Filtra por status (segmented Todos/Ativos/Pausados)
    filtered = this.applyStatusFilter(filtered);

    if (filtered.length === 0) {
      if (allCreatives.length === 0) {
        this.showEmpty();
      } else {
        const platform = (App.state && App.state.platform) || "all";
        const platformLabel = platform === "google" ? "Google Ads" : platform === "facebook" ? "Meta Ads" : "no período";
        container.innerHTML = `
          <div class="creatives-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <div class="title">Nenhum criativo ${this.statusFilter !== 'all' ? (this.statusFilter === 'active' ? 'ativo' : 'pausado') : ''} em ${platformLabel}</div>
            <div class="msg">Tente outro filtro de plataforma ou status</div>
          </div>
        `;
      }
      return;
    }

    container.innerHTML = filtered.map(c => this.renderCard(c)).join("");
  },

  /** Liga os botões de filtro de status (chamado 1 vez no boot) */
  initFilters() {
    document.querySelectorAll(".creatives-filters .segmented button").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".creatives-filters .segmented button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.statusFilter = btn.dataset.status;
        // Re-renderiza com o cache atual
        const container = document.getElementById("creativesGrid");
        if (container) container.classList.add("filtering");
        setTimeout(() => {
          if (this._lastData) this.render(this._lastData);
          if (container) container.classList.remove("filtering");
        }, 150);
      });
    });
  },

  renderCard(c) {
    const isGoogle = c.platform === "google";

    const statusBadge = c.status === "ACTIVE"
      ? `<span class="creative-status active">● Ativo</span>`
      : `<span class="creative-status paused">○ ${this.statusLabel(c.status)}</span>`;

    const platformBadge = isGoogle
      ? `<span class="creative-platform-badge google">G</span>`
      : `<span class="creative-platform-badge meta">M</span>`;

    const videoIcon = c.isVideo
      ? `<div class="creative-video-icon">
           <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
         </div>`
      : "";

    // Thumbnail: 3 modos
    // - Meta com imagem: <img>
    // - Meta sem imagem: ícone genérico
    // - Google (texto): mostra letras grandes G/PMax + tipo de campanha
    let thumbHtml;
    if (isGoogle) {
      const campaignType = c.creativeName || "Ad";
      const isPmax = /pmax/i.test(c.name);
      thumbHtml = `
        <div class="creative-google-card ${isPmax ? 'pmax' : 'search'}">
          <div class="cgc-letter">${isPmax ? 'P' : 'G'}</div>
          <div class="cgc-title">${isPmax ? 'Performance Max' : 'Rede de Pesquisa'}</div>
          <div class="cgc-sub">${this.escapeHtml(campaignType)}</div>
        </div>
      `;
    } else if (c.thumbnail) {
      thumbHtml = `<img src="${this.escapeHtml(c.thumbnail)}" alt="${this.escapeHtml(c.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">${videoIcon}`;
    } else {
      thumbHtml = `<div class="creative-no-thumb">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>`;
    }

    return `
      <article class="creative-card ${isGoogle ? 'is-google' : 'is-meta'}">
        <div class="creative-thumb">
          ${thumbHtml}
          ${platformBadge}
        </div>
        <div class="creative-body">
          <div class="creative-head">
            ${statusBadge}
          </div>
          <h3 class="creative-name" title="${this.escapeHtml(c.name)}">${this.escapeHtml(c.name)}</h3>

          <div class="creative-metrics">
            <div class="cm">
              <span class="cm-label">Investimento</span>
              <span class="cm-value">${Utils.brl(c.spend)}</span>
            </div>
            <div class="cm accent">
              <span class="cm-label">Conversões</span>
              <span class="cm-value">${Utils.num(c.conversions)}</span>
            </div>
            <div class="cm">
              <span class="cm-label">CPL</span>
              <span class="cm-value">${c.cpl !== null ? Utils.brl(c.cpl) : "—"}</span>
            </div>
            <div class="cm">
              <span class="cm-label">Cliques</span>
              <span class="cm-value">${Utils.num(c.clicks)}</span>
            </div>
            <div class="cm">
              <span class="cm-label">CTR</span>
              <span class="cm-value">${c.ctr.toFixed(2)}%</span>
            </div>
            <div class="cm">
              <span class="cm-label">Impressões</span>
              <span class="cm-value">${this.compactNum(c.impressions)}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  },

  statusLabel(s) {
    const map = {
      PAUSED: "Pausado",
      ARCHIVED: "Arquivado",
      DELETED: "Excluído",
      ADSET_PAUSED: "Conjunto pausado",
      CAMPAIGN_PAUSED: "Campanha pausada",
      DISAPPROVED: "Reprovado",
      PREAPPROVED: "Em revisão",
      PENDING_REVIEW: "Em revisão"
    };
    return map[s] || s || "—";
  },

  compactNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",") + "M";
    if (n >= 1000)    return (n / 1000).toFixed(1).replace(".", ",") + "k";
    return Utils.num(n);
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

// Debug helper
window.debugMeta = function() {
  console.log("=== Meta Ads ===");
  console.log("Endpoint:", Meta.endpoint());
  console.log("Cache key:", Meta._cacheKey);
  console.log("Última resposta:", Meta._lastData);
};
