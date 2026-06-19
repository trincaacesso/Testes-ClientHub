/* =====================================================
   KPIS · 3 scorecards compactos
   - Respeitam filtro de plataforma (Todos / Google / Meta)
   - Investimento × Meta de orçamento
   - Leads × Meta de leads
   - CPL × Meta de CPL
   ===================================================== */

const KPIs = {
  /** Calcula KPIs baseados no filtro de plataforma atual */
  compute() {
    const platform = (App.state && App.state.platform) || "all";
    const ds = App.fullDataset;
    if (!ds) return null;

    const t = ds.totals;
    const p = ds.platforms;

    let budgetReal, budgetProj, leadsReal, leadsMeta, cplMeta;

    if (platform === "google") {
      budgetReal = p.google?.budgetReal || 0;
      budgetProj = p.google?.budgetProj || 0;
      leadsReal  = p.google?.leadsReal  || 0;
      leadsMeta  = p.google?.leadsMeta  || 0;
      cplMeta    = p.google?.cplMeta    || 0;
    } else if (platform === "facebook") {
      budgetReal = p.facebook?.budgetReal || 0;
      budgetProj = p.facebook?.budgetProj || 0;
      leadsReal  = p.facebook?.leadsReal  || 0;
      leadsMeta  = p.facebook?.leadsMeta  || 0;
      cplMeta    = p.facebook?.cplMeta    || 0;
    } else {
      budgetReal = t.realized?.budget || 0;
      budgetProj = t.projected?.budget || 0;
      leadsReal  = t.realized?.leads || 0;
      leadsMeta  = t.projected?.leads || 0;
      cplMeta    = t.projected?.cpl || 0;
    }

    const cplReal = leadsReal > 0 ? budgetReal / leadsReal : 0;

    return { budgetReal, budgetProj, leadsReal, leadsMeta, cplReal, cplMeta };
  },

  render() {
    const k = this.compute();
    if (!k) return;

    const budgetPct = k.budgetProj > 0 ? (k.budgetReal / k.budgetProj) * 100 : 0;
    const leadsPct  = k.leadsMeta > 0  ? (k.leadsReal  / k.leadsMeta)  * 100 : 0;
    const cplPct    = k.cplMeta > 0    ? (k.cplReal    / k.cplMeta)    * 100 : 0;

    // Status do CPL: abaixo da meta = win (verde), acima = loss (vermelho)
    const cplStatus = (k.cplReal > 0 && k.cplMeta > 0)
      ? (k.cplReal <= k.cplMeta ? "win" : "loss")
      : "neutral";
    const cplBadge = cplStatus === "win"
      ? `<span class="kpi-delta up">no alvo ▾</span>`
      : cplStatus === "loss"
      ? `<span class="kpi-delta down">acima ▴</span>`
      : "";

    const items = [
      {
        cls: "win",
        label: "Investimento",
        icon: `<path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/>` ,
        iconBg: "money",
        value: Utils.brl(k.budgetReal),
        meta:  `Orçamento: <strong>${Utils.brl(k.budgetProj)}</strong>`,
        rightInfo: `${Math.round(budgetPct)}% do orçamento`,
        progress: Math.min(100, budgetPct),
        progressClass: "blue"
      },
      {
        cls: "accent",
        label: "Leads (conversões)",
        icon: `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
        iconBg: "target",
        value: Utils.num(k.leadsReal),
        meta:  `Meta: <strong>${Utils.num(k.leadsMeta)}</strong>`,
        rightInfo: `${Math.round(leadsPct)}%`,
        progress: Math.min(100, leadsPct),
        progressClass: "orange"
      },
      {
        cls: cplStatus,
        label: "CPL médio",
        icon: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
        iconBg: "cpl",
        value: Utils.brl(k.cplReal),
        meta: `Meta: <strong>${Utils.brl(k.cplMeta)}</strong>`,
        rightBadge: cplBadge,
        progress: Math.min(100, cplPct),
        progressClass: cplStatus === "win" ? "green" : "red"
      }
    ];

    // 4º KPI CONDICIONAL: Leads qualificados (via webhook Expad)
    // Só aparece se o módulo está disponível E tem pelo menos 1 lead
    if (typeof ExpadQualified !== "undefined" && ExpadQualified.count() > 0) {
      const qualifiedCount = ExpadQualified.count();
      // Taxa de qualificação = qualificados / leads totais (não Meta)
      const qualifyRate = k.leadsReal > 0 ? (qualifiedCount / k.leadsReal * 100) : 0;
      items.push({
        cls: "win",
        label: "Leads qualificados",
        icon: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>`,
        iconBg: "qualified",
        value: Utils.num(qualifiedCount),
        meta: `de ${Utils.num(k.leadsReal)} leads totais`,
        rightInfo: `${qualifyRate.toFixed(1)}% qualificação`,
        progress: Math.min(100, qualifyRate),
        progressClass: "green"
      });
    }

    const container = document.getElementById("kpiStack");
    if (!container) return;

    container.innerHTML = items.map(item => `
      <div class="kpi ${item.cls}">
        <div class="kpi-head">
          <span class="kpi-label">${item.label}</span>
          <div class="kpi-icon ${item.iconBg}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg>
          </div>
        </div>
        <div class="kpi-value">${item.value}</div>
        <div class="kpi-meta-row">
          <span class="kpi-target">${item.meta}</span>
          ${item.rightBadge || `<span class="kpi-right-info">${item.rightInfo}</span>`}
        </div>
        <div class="kpi-progress ${item.progressClass}"><span style="width:${item.progress}%"></span></div>
      </div>
    `).join("");
  }
};
