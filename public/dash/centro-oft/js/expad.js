/* =====================================================
   EXPAD · Integração com a API de vendas da Expad
   Via proxy Netlify (/api/expad-sales) — credenciais ficam
   protegidas em variáveis de ambiente do servidor.
   ===================================================== */

const Expad = {
  _cache: null,
  _cacheAt: 0,
  _meta: null,

  endpoint() {
    return "/api/expad-sales" + (window.CLIENTE && window.CLIENTE.id ? ("?cli=" + encodeURIComponent(window.CLIENTE.id)) : "");
  },

  /** Busca dados de vendas via proxy (com cache de 5 min) */
  async fetch(opts = {}) {
    const now = Date.now();
    if (!opts.force && this._cache && (now - this._cacheAt) < (CONFIG.cacheTTL || 300000)) {
      return this._cache;
    }

    const params = new URLSearchParams();
    if (opts.from) params.set("from", opts.from);
    if (opts.to)   params.set("to",   opts.to);
    const qs = params.toString();
    const ep = this.endpoint();
    const url = qs ? (ep + (ep.includes('?') ? '&' : '?') + qs) : ep;

    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      let detail = "";
      let errJson = null;
      try {
        errJson = await res.json();
        detail = errJson.detail || errJson.error || "";
        if (errJson.expadMessage) detail += " · Expad: " + errJson.expadMessage;
        if (errJson.hint) detail += " · " + errJson.hint;

        // Mostra cada tentativa de formato de data no console (debug)
        if (errJson.attempts && errJson.attempts.length > 0) {
          console.group("[Expad] Tentativas de formato de data");
          errJson.attempts.forEach(a => {
            console.warn(`  ${a.format} → ${a.status || "erro"}: ${a.error}`);
          });
          console.groupEnd();
        }
      } catch (e) {
        detail = res.statusText;
      }
      throw new Error(`Expad proxy retornou ${res.status}: ${detail}`);
    }

    const json = await res.json();
    this._cache   = json;
    this._cacheAt = now;
    this._meta    = json._meta || null;

    if (json.sales) {
      console.log(`[Expad] ✓ Vendas: ${json.sales.totalCount} · R$ ${json.sales.totalValue.toFixed(2)} · Conv: ${json.sales.convRate.toFixed(2)}%`);
    }

    return json;
  },

  /** Carrega vendas para o período corrente (1º do mês até hoje) */
  async load() {
    try {
      const data = await this.fetch();
      return data && data.sales ? data.sales : null;
    } catch (err) {
      console.error("[Expad] Falha:", err);
      this.showErrorBanner(err.message);
      return null;
    }
  },

  /** Invalida o cache e força nova chamada */
  invalidateCache() {
    this._cache = null;
    this._cacheAt = 0;
  },

  showErrorBanner(msg) {
    const existing = document.getElementById("expadErrorBanner");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "expadErrorBanner";
    banner.style.cssText = `
      position: fixed; top: 70px; right: 16px; z-index: 9998;
      background: #FEF3C7; color: #92400E; padding: 12px 16px;
      border-radius: 10px; font-size: 12.5px; font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,.15); max-width: 380px;
      border: 1px solid #FCD34D;
    `;
    banner.innerHTML = `
      ⚠️ Expad indisponível — vendas não carregadas
      <span style="cursor:pointer;float:right;margin-left:10px;font-weight:700" onclick="this.parentElement.remove()">✕</span>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 10000);
  }
};

// Debug helper
window.debugExpad = function() {
  console.log("=== DEBUG EXPAD ===");
  console.log("Endpoint:", Expad.endpoint());
  console.log("Meta:", Expad._meta);
  console.log("Cache:", Expad._cache);
};
