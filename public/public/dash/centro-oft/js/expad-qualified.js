/* =====================================================
   EXPAD QUALIFIED · Leads qualificados via webhook
   - Busca contagem de leads do endpoint /api/expad/qualified-leads
   - Respeita filtro de data atual (DateFilter)
   - Expõe ExpadQualified.count, .byDay pra outros módulos consumirem
   ===================================================== */

const ExpadQualified = {
  _data: null,
  _loadedAt: 0,
  CACHE_MS: 60_000,  // 1 min — webhook é em tempo real, não precisa cache longo

  /** Formata Date → "YYYY-MM-DD" pra API */
  _ymd(d) {
    if (!d) return null;
    if (typeof d === "string") return d.slice(0, 10);
    return d.toISOString().slice(0, 10);
  },

  /** Busca contagem do servidor (com cache curto) */
  async load(opts = {}) {
    const { from, to, force } = opts;

    // Cache: se mesma janela e <60s, reusa
    const cacheKey = `${from || ""}|${to || ""}`;
    if (!force && this._data && this._cacheKey === cacheKey && (Date.now() - this._loadedAt < this.CACHE_MS)) {
      return this._data;
    }

    const params = new URLSearchParams();
    if (from) params.set("from", this._ymd(from));
    if (to)   params.set("to",   this._ymd(to));
    const url = "/api/expad/qualified-leads" + (params.toString() ? "?" + params : "");

    try {
      const res = await fetch(url);
      if (!res.ok) {
        // 404, 500, etc — não derruba o dashboard
        console.warn(`[ExpadQualified] endpoint retornou ${res.status} — webhook pode não estar configurado ainda`);
        this._data = { qualifiedCount: 0, byDay: {}, totalActive: 0, _error: true };
        this._cacheKey = cacheKey;
        this._loadedAt = Date.now();
        return this._data;
      }
      const data = await res.json();
      this._data = data;
      this._cacheKey = cacheKey;
      this._loadedAt = Date.now();
      console.log(`[ExpadQualified] ${data.qualifiedCount} leads qualificados no período`);
      return data;
    } catch (err) {
      console.warn("[ExpadQualified] falha ao buscar:", err.message);
      this._data = { qualifiedCount: 0, byDay: {}, totalActive: 0, _error: true };
      this._cacheKey = cacheKey;
      this._loadedAt = Date.now();
      return this._data;
    }
  },

  /** Carrega usando o filtro de data atual (DateFilter) */
  async loadForCurrentFilter(force = false) {
    let from = null, to = null;
    if (typeof DateFilter !== "undefined" && DateFilter.state && DateFilter.state.from) {
      from = DateFilter.state.from;
      to   = DateFilter.state.to;
    }
    return this.load({ from, to, force });
  },

  /** Contagem rápida (sincrono — usa último cache) */
  count() {
    return this._data ? (this._data.qualifiedCount || 0) : 0;
  },

  /** byDay rápido (sincrono — usa último cache) */
  byDay() {
    return this._data ? (this._data.byDay || {}) : {};
  },

  /** Invalida cache (força próximo load a refetch) */
  invalidate() {
    this._data = null;
    this._cacheKey = null;
    this._loadedAt = 0;
  }
};

// Debug helper
window.debugExpadQualified = function() {
  console.table(ExpadQualified._data);
};
