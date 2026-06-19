/* =====================================================
   SHEETS · Integração com Google Sheets via proxy Netlify
   O cliente chama /api/sheets — a Netlify Function faz
   a chamada real à API com a chave armazenada em env vars.
   ===================================================== */

const Sheets = {
  _cache: null,
  _cacheAt: 0,
  _lastRaw: null,
  _layoutInfo: null,
  _meta: null,

  url() {
    return CONFIG.proxyEndpoint;
  },

  async fetch() {
    const now = Date.now();
    if (this._cache && (now - this._cacheAt) < CONFIG.cacheTTL) {
      return this._cache;
    }

    const res = await fetch(this.url(), {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      // Tenta extrair detalhes do erro (a function retorna JSON com hint)
      let detail = "";
      try {
        const errJson = await res.json();
        detail = errJson.detail || errJson.error || "";
        if (errJson.hint) detail += " · " + errJson.hint;
        if (errJson.missing) detail += " · Faltando: " + errJson.missing.join(", ");
      } catch (e) {
        detail = res.statusText;
      }
      throw new Error(`Proxy retornou ${res.status}: ${detail}`);
    }

    const json = await res.json();
    this._cache = json.values || [];
    this._lastRaw = this._cache;
    this._meta = json._meta || null;
    this._cacheAt = now;

    if (this._meta) {
      console.log(`[Sheets] ✓ ${this._meta.rowsCount} linhas via proxy (${this._meta.sheetName}!${this._meta.range})`);
    }

    return this._cache;
  },

  toNum(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return v;
    const s = String(v)
      .replace(/R\$\s?/g, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/%/g, "")
      .trim();
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  },

  isDateLike(s) {
    if (!s) return false;
    return /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(String(s).trim());
  },

  findDataStart(rows) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      if (rows[i] && this.isDateLike(rows[i][0])) {
        return i;
      }
    }
    return -1;
  },

  /**
   * Parser baseado no layout REAL da planilha:
   *   A: Data        B: Dia         C: Verba Google  D: Lead Google
   *   E: Lead Expad  F: % Quebra    G: CPL Expad     H: Verba Facebook
   *   I: Lead FB     J: CPL FB      K: Lead Total    L: %REF      M: %META
   */

  /**
   * Localiza uma linha do cabeçalho cujo primeiro campo bate com um nome
   * de plataforma (Google / Facebook / TOTAL), ignorando caixa e acentos.
   */
  findPlatformRow(rows, platformName) {
    const target = platformName.toLowerCase().trim();
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
      const cell = (rows[i] && rows[i][0] ? String(rows[i][0]) : "").toLowerCase().trim();
      if (cell === target || cell.startsWith(target)) {
        return rows[i];
      }
    }
    return null;
  },

  /**
   * Extrai o ISO Mês (% do mês transcorrido) procurando "ISO MÊS" no topo.
   * Aceita formatos "ISO MÊS: 84%" em qualquer célula das primeiras linhas.
   */
  findIsoMonth(rows) {
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const row = rows[i] || [];
      for (const cell of row) {
        if (!cell) continue;
        const s = String(cell);
        if (/iso\s*m[êe]s/i.test(s)) {
          // pega o número do percentual na mesma célula
          const m = s.match(/(\d{1,3})\s*%/);
          if (m) return parseInt(m[1], 10);
          // ou na célula seguinte (alguns layouts separam rótulo e valor)
          const idx = row.indexOf(cell);
          if (idx >= 0 && row[idx + 1]) {
            const n = this.toNum(row[idx + 1]);
            if (n > 0 && n <= 100) return Math.round(n);
          }
        }
      }
    }
    return null;
  },

  /**
   * Lê a tabela de cabeçalho PROJETADO + REALIZADO.
   * Layout das colunas (linhas ~4-8):
   *   A: Plataforma   B: Orçamento proj.   C: % invest   D: Meta Lead   E: Meta CPL
   *   F: Real $       G: % Orça            H: Real Lead  I: % Meta      J: Real CPL
   * Retorna { google, facebook, total } com os campos do PROJETADO,
   * ou null se não encontrar as linhas.
   */
  parseHeaderTable(rows) {
    const gRow  = this.findPlatformRow(rows, "google");
    const fbRow = this.findPlatformRow(rows, "facebook");
    const tRow  = this.findPlatformRow(rows, "total");

    if (!gRow && !fbRow) {
      console.warn("[Sheets] Cabeçalho PROJETADO não encontrado — usando fallback");
      return null;
    }

    const readRow = (r) => r ? {
      budgetProj: this.toNum(r[1]),   // B - Orçamento projetado
      sharePct:   this.toNum(r[2]),   // C - % do investimento
      leadsMeta:  this.toNum(r[3]),   // D - Meta de Leads  ← PROJETADO
      cplMeta:    this.toNum(r[4]),   // E - Meta CPL       ← PROJETADO
      budgetReal: this.toNum(r[5]),   // F - Real $
      orcaPct:    this.toNum(r[6]),   // G - % Orçamento
      leadsReal:  this.toNum(r[7]),   // H - Real Lead
      metaPct:    this.toNum(r[8]),   // I - % Meta Lead
      cplReal:    this.toNum(r[9])    // J - Real CPL
    } : null;

    const result = {
      google:   readRow(gRow),
      facebook: readRow(fbRow),
      total:    readRow(tRow)
    };

    console.log("[Sheets] ✓ Cabeçalho PROJETADO lido:", {
      google:   result.google   ? `meta ${result.google.leadsMeta} leads / CPL ${result.google.cplMeta}` : "—",
      facebook: result.facebook ? `meta ${result.facebook.leadsMeta} leads / CPL ${result.facebook.cplMeta}` : "—",
      total:    result.total    ? `meta ${result.total.leadsMeta} leads` : "—"
    });

    return result;
  },

  parse(rows) {
    if (!rows || rows.length === 0) {
      console.warn("[Sheets] Planilha vazia");
      return DATASET;
    }

    const startRow = this.findDataStart(rows);
    if (startRow === -1) {
      console.warn("[Sheets] Não foi possível encontrar linhas com data válida");
      return DATASET;
    }

    // ===== Lê a parte PROJETADO/REALIZADO do cabeçalho =====
    const header = this.parseHeaderTable(rows);
    const isoMonth = this.findIsoMonth(rows);

    const dataRows = rows.slice(startRow).filter(r => r && this.isDateLike(r[0]));

    this._layoutInfo = {
      totalRows: rows.length,
      startRow,
      dataRows: dataRows.length,
      firstDataRow: dataRows[0] || null
    };

    console.log("[Sheets] ✓ Layout detectado:", this._layoutInfo);

    if (dataRows.length === 0) return DATASET;

    const daily = dataRows.map(r => {
      const data = String(r[0]).split("/").slice(0, 2).join("/");
      const dia  = (r[1] || "").toLowerCase();

      const verbaG  = this.toNum(r[2]);
      const leadsG  = this.toNum(r[3]);
      const leadsExpG = this.toNum(r[4]);
      const quebra  = this.toNum(r[5]);
      const cplExpG = this.toNum(r[6]);
      const verbaFB = this.toNum(r[7]);
      const leadsFB = this.toNum(r[8]);
      const cplFB   = this.toNum(r[9]);
      const leadsTotalAcum = this.toNum(r[10]);
      const pctRef  = this.toNum(r[11]);
      const pctMeta = this.toNum(r[12]);

      return [
        data, dia,
        verbaG, leadsG, leadsExpG, quebra, cplExpG,
        verbaFB, leadsFB, cplFB,
        leadsTotalAcum, pctRef, pctMeta
      ];
    });

    const sumVG  = daily.reduce((a, d) => a + d[2], 0);
    const sumLG  = daily.reduce((a, d) => a + d[3], 0);
    const sumLExpG = daily.reduce((a, d) => a + d[4], 0);
    const sumVFB = daily.reduce((a, d) => a + d[7], 0);
    const sumLFB = daily.reduce((a, d) => a + d[8], 0);
    const lastTotalAcum = daily[daily.length - 1]?.[10] || (sumLG + sumLFB);

    console.log(`[Sheets] Google: R$ ${sumVG.toFixed(2)} | ${sumLG} leads`);
    console.log(`[Sheets] Facebook: R$ ${sumVFB.toFixed(2)} | ${sumLFB} leads`);

    // ===== Metas (PROJETADO) — vindas da planilha ou fallback =====
    const hg = header && header.google   ? header.google   : null;
    const hf = header && header.facebook ? header.facebook : null;
    const ht = header && header.total    ? header.total    : null;

    // Metas por plataforma: usa o que veio da planilha, senão mantém o dataset
    const googleMeta = {
      budgetProj: hg && hg.budgetProj > 0 ? hg.budgetProj : DATASET.platforms.google.budgetProj,
      sharePct:   hg && hg.sharePct  > 0 ? hg.sharePct   : DATASET.platforms.google.sharePct,
      leadsMeta:  hg && hg.leadsMeta > 0 ? hg.leadsMeta  : DATASET.platforms.google.leadsMeta,
      cplMeta:    hg && hg.cplMeta   > 0 ? hg.cplMeta    : DATASET.platforms.google.cplMeta,
      metaPct:    hg && hg.metaPct   > 0 ? hg.metaPct    : DATASET.platforms.google.metaPct
    };
    const facebookMeta = {
      budgetProj: hf && hf.budgetProj > 0 ? hf.budgetProj : DATASET.platforms.facebook.budgetProj,
      sharePct:   hf && hf.sharePct  > 0 ? hf.sharePct   : DATASET.platforms.facebook.sharePct,
      leadsMeta:  hf && hf.leadsMeta > 0 ? hf.leadsMeta  : DATASET.platforms.facebook.leadsMeta,
      cplMeta:    hf && hf.cplMeta   > 0 ? hf.cplMeta    : DATASET.platforms.facebook.cplMeta,
      metaPct:    hf && hf.metaPct   > 0 ? hf.metaPct    : DATASET.platforms.facebook.metaPct
    };

    // Metas totais: prioriza linha TOTAL; senão soma Google + Facebook
    const totalBudgetProj = ht && ht.budgetProj > 0
      ? ht.budgetProj
      : googleMeta.budgetProj + facebookMeta.budgetProj;
    const totalLeadsMeta = ht && ht.leadsMeta > 0
      ? ht.leadsMeta
      : googleMeta.leadsMeta + facebookMeta.leadsMeta;
    const totalCplMeta = ht && ht.cplMeta > 0
      ? ht.cplMeta
      : (googleMeta.cplMeta + facebookMeta.cplMeta) / 2;

    return {
      ...DATASET,
      meta: {
        ...DATASET.meta,
        isoMonth: (isoMonth != null) ? isoMonth : DATASET.meta.isoMonth
      },
      totals: {
        projected: {
          budget: totalBudgetProj,
          leads:  Math.round(totalLeadsMeta),
          cpl:    totalCplMeta
        },
        realized: {
          ...DATASET.totals.realized,
          budget: sumVG + sumVFB,
          leads:  Math.round(lastTotalAcum || (sumLG + sumLFB)),
          cpl:    (sumVG + sumVFB) / Math.max(1, sumLG + sumLFB)
        }
      },
      platforms: {
        google: {
          ...DATASET.platforms.google,
          ...googleMeta,
          budgetReal: sumVG,
          leadsReal:  Math.round(sumLG),
          leadsExpad: Math.round(sumLExpG),
          cplReal:    sumVG / Math.max(1, sumLG)
        },
        facebook: {
          ...DATASET.platforms.facebook,
          ...facebookMeta,
          budgetReal: sumVFB,
          leadsReal:  Math.round(sumLFB),
          cplReal:    sumVFB / Math.max(1, sumLFB)
        }
      },
      daily,
      weeklyTrend: this.buildWeeklyTrend(daily)
    };
  },

  buildWeeklyTrend(daily) {
    const active = daily.filter(d => d[2] > 0 || d[7] > 0);
    const last14 = active.slice(-14);
    const prev = last14.slice(0, 7);
    const curr = last14.slice(7, 14);

    while (prev.length < 7) prev.push([null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    while (curr.length < 7) curr.push([null, null, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    return {
      labels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
      leads: {
        previous: prev.map(d => (d[3] || 0) + (d[8] || 0)),
        current:  curr.map(d => (d[3] || 0) + (d[8] || 0))
      },
      cpl: {
        previous: prev.map(d => d[6] || 0),
        current:  curr.map(d => d[6] || 0)
      }
    };
  },

  async load() {
    // Modo dev local forçando fallback
    if (CONFIG.isLocalDev && CONFIG.devUseLocalData) {
      console.warn("[Sheets] Modo dev local — usando dataset.js (fallback)");
      this.showInfoBanner("Modo dev local — usando dados de fallback");
      return DATASET;
    }

    try {
      const rows = await this.fetch();
      console.log(`[Sheets] ${rows.length} linhas carregadas via proxy`);
      return this.parse(rows);
    } catch (err) {
      console.error("[Sheets] Falha no proxy:", err);

      // Mensagem específica por contexto
      let msg = err.message;
      if (CONFIG.isLocalDev) {
        msg = "Rodando sem `netlify dev`. Use `netlify dev` ou ative `devUseLocalData: true` em config.js.";
      }
      this.showErrorBanner(msg);
      return DATASET;
    }
  },

  showErrorBanner(msg) {
    this._showBanner(msg, "#FEE2E2", "#991B1B", "#FCA5A5", "⚠️");
  },

  showInfoBanner(msg) {
    this._showBanner(msg, "#FEF3C7", "#92400E", "#FCD34D", "ℹ️", 6000);
  },

  _showBanner(msg, bg, color, border, icon, timeout = 10000) {
    const existing = document.getElementById("sheetsErrorBanner");
    if (existing) existing.remove();

    const banner = document.createElement("div");
    banner.id = "sheetsErrorBanner";
    banner.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 9999;
      background: ${bg}; color: ${color}; padding: 12px 16px;
      border-radius: 10px; font-size: 12.5px; font-weight: 600;
      box-shadow: 0 4px 14px rgba(0,0,0,.15); max-width: 380px;
      border: 1px solid ${border};
    `;
    banner.innerHTML = `
      ${icon} ${msg}
      <span style="cursor:pointer;float:right;margin-left:10px;font-weight:700" onclick="this.parentElement.remove()">✕</span>
    `;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), timeout);
  }
};

// ===== Debug helper exposto globalmente =====
window.debugSheets = function() {
  console.log("=== DEBUG SHEETS ===");
  console.log("Endpoint (proxy):", Sheets.url());
  console.log("Modo dev local:", CONFIG.isLocalDev);
  console.log("devUseLocalData:", CONFIG.devUseLocalData);
  console.log("Meta da última resposta:", Sheets._meta);
  console.log("Cache raw:", Sheets._lastRaw);
  console.log("Layout detectado:", Sheets._layoutInfo);
  console.log("DATASET atual:", DATASET);
};
