/* =====================================================
   MAIN · Bootstrap + filtros funcionais (sem bug!)
   ===================================================== */

const App = {
  fullDataset: null,   // dados após filtro de data (vem do DateFilter)
  _rawDataset: null,   // dados ORIGINAIS sem nenhum filtro
  currentView: "stats",
  state: {
    platform: "all"    // "all" | "google" | "facebook"
  },

  /** Deep clone do dataset original */
  cloneFullDataset() {
    return JSON.parse(JSON.stringify(this.fullDataset));
  },

  /** Aplica filtros (data + plataforma) e atualiza fullDataset
   *  Importante: as funções de render (KPIs/Charts/Platforms/Table) leem
   *  App.state.platform diretamente e sabem como interpretar.
   *  Aqui só garantimos que App.fullDataset tem o recorte por DATA correto.
   */
  applyFilters() {
    // Tudo é feito no applyDateFilter agora — esse método existe só pra
    // compatibilidade. Não precisamos refilter aqui pois o platform filter
    // é aplicado pelos próprios módulos no momento do render.
  },

  /** Mescla dados de vendas vindos da Expad no fullDataset */
  mergeExpadSales(sales) {
    if (!sales || !this.fullDataset) return;

    const r = this.fullDataset.totals.realized;
    r.sales       = sales.totalCount   || 0;
    r.salesValue  = sales.totalValue   || 0;
    r.avgTicket   = sales.avgTicket    || 0;
    r.convRate    = sales.convRate     || 0;

    // CAC: Custo de Aquisição = verba total / nº de vendas
    if (sales.totalCount > 0 && r.budget > 0) {
      r.cac = r.budget / sales.totalCount;
    } else {
      r.cac = null;
    }

    // Top produtos e breakdown de status pra futura visualização
    this.fullDataset.expad = {
      topProducts:     sales.topProducts     || [],
      statusBreakdown: sales.statusBreakdown || [],
      leadCountExpad:  sales.leadCount       || 0
    };

    console.log(`[App] Vendas Expad mescladas: ${r.sales} vendas · R$ ${r.salesValue.toFixed(2)} · CAC R$ ${r.cac ? r.cac.toFixed(2) : "—"}`);
  },

  /** Aplica filtro de data ao dataset bruto e renderiza tudo */
  applyDateFilter() {
    if (!this._rawDataset) return;

    // Pega dataset filtrado pelo período selecionado
    if (typeof DateFilter !== "undefined" && DateFilter.state.from) {
      this.fullDataset = DateFilter.filterDataset(this._rawDataset);
    } else {
      this.fullDataset = JSON.parse(JSON.stringify(this._rawDataset));
    }

    // Renderiza tudo com o novo dataset
    this.render();

    // Se está na view de criativos, recarrega com novo período também
    if (this.currentView === "creatives") {
      this.loadCreatives();
    }

    // Carrega leads qualificados em paralelo (não bloqueia render)
    // Quando chegar, refaz só os KPIs pra incluir o novo contador
    if (typeof ExpadQualified !== "undefined") {
      ExpadQualified.loadForCurrentFilter(true).then(() => {
        if (typeof KPIs !== "undefined") KPIs.render();
      }).catch(err => {
        console.warn("[App] ExpadQualified falhou silenciosamente:", err.message);
      });
    }
  },

  /** Troca entre views (overview / creatives) */
  switchView(view) {
    this.currentView = view;
    document.querySelectorAll(".view").forEach(el => {
      el.hidden = el.dataset.view !== view;
    });

    // Quando entra em "criativos" pela primeira vez (ou troca de período), carrega
    if (view === "creatives") {
      this.loadCreatives();
    }
  },

  /** Carrega criativos do Meta Ads (respeitando filtro de data) */
  async loadCreatives() {
    if (typeof Meta === "undefined") return;
    Meta.showLoading();
    const data = await Meta.loadForCurrentFilter();
    if (data) {
      Meta.render(data);
    }
  },

  /** Renderiza todos os módulos */
  render() {
    this.applyFilters();
    KPIs.render();
    Platforms.renderTable();
    Platforms.renderBudgetLegend();
    Charts.renderAll();
    Campaigns.render();
    DailyTable.render();
  },

  /** Mostra/esconde overlay de carregamento */
  setLoading(loading) {
    const el = document.getElementById("loadingOverlay");
    if (el) el.style.display = loading ? "flex" : "none";
  },

  /** Boot */
  async init() {
    // Tema primeiro (antes de qualquer render)
    Theme.init();

    // ===== Popula header (cliente + nome) =====
    const clientName = DATASET.meta.clientName || "Centro Oftalmológico";
    const nameEl = document.getElementById("clientName");
    const logoEl = document.getElementById("clientLogo");
    if (nameEl) nameEl.textContent = clientName;
    if (logoEl) {
      // Iniciais do nome (até 2 letras)
      const initials = clientName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0].toUpperCase())
        .join("");
      logoEl.textContent = initials || "CO";
    }

    // ===== Carrega dados do Google Sheets =====
    // ⏸️ Expad desativada temporariamente (aguardando integração)
    this.setLoading(true);
    let sheetsOk = false;
    try {
      this.fullDataset = await Sheets.load().catch(err => {
        console.error("[App] Sheets falhou:", err);
        return JSON.parse(JSON.stringify(DATASET));
      });
      sheetsOk = Sheets._lastRaw && Sheets._lastRaw.length > 0;
    } catch (err) {
      console.error(err);
      this.fullDataset = JSON.parse(JSON.stringify(DATASET));
    }
    this.setLoading(false);
    this.setStatus(sheetsOk ? "online" : "demo");

    // Guarda referência intacta do dataset COMPLETO (pra reaplicar filtros)
    this._rawDataset = JSON.parse(JSON.stringify(this.fullDataset));

    // Inicializa filtro de data (define período padrão "Últimos 7 dias")
    if (typeof DateFilter !== "undefined") {
      DateFilter.init();
    }

    // Inicializa filtros de status dos criativos
    if (typeof Meta !== "undefined" && typeof Meta.initFilters === "function") {
      Meta.initFilters();
    }

    // Inicializa toggle colapsável da tabela
    if (typeof DailyTable !== "undefined" && typeof DailyTable.init === "function") {
      DailyTable.init();
    }

    // Renderiza já filtrado
    this.applyDateFilter();

    // ===== EVENTOS =====

    // Toggle de view (Visão geral / Criativos)
    document.querySelectorAll(".tabs-pill button").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tabs-pill button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const view = btn.dataset.view;
        this.switchView(view);
      });
    });

    // Filtro de plataforma (apenas o segmented da toolbar, NÃO o de criativos)
    document.querySelectorAll(".toolbar-actions .segmented button").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".toolbar-actions .segmented button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.state.platform = btn.dataset.platform;
        this.render();
        // Se está na aba de Criativos, re-renderiza eles com novo filtro
        if (this.currentView === "creatives" && typeof Meta !== "undefined" && Meta._lastData) {
          Meta.render(Meta._lastData);
        }
      });
    });

    // Botões de relatório
    document.getElementById("btnReport").addEventListener("click", () => {
      Report.promptAndGenerate();
    });
    const btnExport = document.getElementById("btnExport");
    if (btnExport) {
      btnExport.addEventListener("click", () => Report.generate("daily"));
    }

    // Botão de atualizar dados
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => this.refresh());
      this.updateRefreshTooltip();
    }
  },

  /** Atualiza dados da planilha (invalida cache e refaz a chamada ao proxy) */
  async refresh() {
    const btn = document.getElementById("refreshBtn");
    if (!btn || btn.disabled) return;

    // UI: spin + disabled
    btn.disabled = true;
    btn.classList.add("refreshing");

    // Invalida cache do Sheets pra forçar nova chamada
    Sheets._cache = null;
    Sheets._cacheAt = 0;
    // ⏸️ Expad desativada temporariamente
    // Invalida cache do Meta (recarrega se a view atual for criativos)
    if (typeof Meta !== "undefined") Meta.invalidateCache();

    try {
      const newData = await Sheets.load();
      this._rawDataset = JSON.parse(JSON.stringify(newData));

      this._rawDataset.meta = {
        ...this._rawDataset.meta,
        generatedAt: this.formatNow()
      };

      // Reaplica filtro de data ao novo dataset
      this.applyDateFilter();
      this.showRefreshToast("Dados atualizados com sucesso");
      this.updateRefreshTooltip();
    } catch (err) {
      console.error("[App.refresh] Falha:", err);
      this.showRefreshToast("Erro ao atualizar — usando dados em cache", true);
    } finally {
      btn.disabled = false;
      btn.classList.remove("refreshing");
    }
  },

  /** Atualiza tooltip do botão com horário da última atualização */
  updateRefreshTooltip() {
    const btn = document.getElementById("refreshBtn");
    if (!btn) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    btn.setAttribute("data-last-update", `Atualizado às ${hh}:${mm}`);
  },

  /** Toast de confirmação no canto da tela */
  showRefreshToast(message, isError = false) {
    const existing = document.querySelector(".refresh-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "refresh-toast";
    if (isError) {
      toast.style.background = "#FEE2E2";
      toast.style.color = "#991B1B";
      toast.style.borderColor = "#FCA5A5";
    }
    toast.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${isError
          ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
          : '<polyline points="20 6 9 17 4 12"/>'}
      </svg>
      ${message}
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  },

  /** Formata data/hora pra "DD/MM/YYYY" */
  formatNow() {
    const d = new Date();
    return [
      String(d.getDate()).padStart(2, "0"),
      String(d.getMonth() + 1).padStart(2, "0"),
      d.getFullYear()
    ].join("/");
  },

  /** Formata só hora "HH:MM" */
  formatTime() {
    const d = new Date();
    return [
      String(d.getHours()).padStart(2, "0"),
      String(d.getMinutes()).padStart(2, "0")
    ].join(":");
  },

  /** Atualiza indicador de status (ao vivo / demo / offline) */
  setStatus(mode) {
    const dot = document.getElementById("statusDot");
    const lbl = document.getElementById("statusLabel");
    if (!dot || !lbl) return;
    dot.classList.remove("online", "demo", "offline");
    if (mode === "online")  { dot.classList.add("online");  lbl.textContent = "Ao vivo"; }
    if (mode === "demo")    { dot.classList.add("demo");    lbl.textContent = "Demonstração"; }
    if (mode === "offline") { dot.classList.add("offline"); lbl.textContent = "Modo offline"; }
  }
};

// Boot
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => App.init());
} else {
  App.init();
}
