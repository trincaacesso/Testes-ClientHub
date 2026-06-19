/* =====================================================
   FORECAST · Projeção de fechamento do mês
   ===================================================== */

const Forecast = {
  /** Calcula projeção linear de fechamento baseada no ritmo atual */
  calculate() {
    const t = DATASET.totals;
    const isoPct = DATASET.meta.isoMonth / 100;  // ex: 0.84

    if (isoPct === 0) {
      return null;
    }

    // Projeção linear simples: realizado / % do mês
    const projectedLeads  = Math.round(t.realized.leads  / isoPct);
    const projectedBudget = t.realized.budget / isoPct;

    const leadsTarget  = t.projected.leads;
    const budgetTarget = t.projected.budget;

    const leadsGap  = projectedLeads  - leadsTarget;
    const budgetGap = budgetTarget - projectedBudget;

    return {
      isoPct: DATASET.meta.isoMonth,
      projectedLeads,
      projectedBudget,
      leadsGap,
      budgetGap,
      willHitTarget: projectedLeads >= leadsTarget,
      willOverBudget: projectedBudget > budgetTarget
    };
  },

  /** Renderiza o card de projeção */
  render() {
    const container = document.getElementById("forecastCard");
    if (!container) return;

    const f = this.calculate();
    if (!f) {
      container.style.display = "none";
      return;
    }
    container.style.display = "";

    const leadsClass = f.willHitTarget ? "success" : "danger";
    const budgetClass = f.willOverBudget ? "danger" : "success";

    const leadsDiff = f.leadsGap >= 0
      ? `+${Utils.num(f.leadsGap)} acima da meta`
      : `${Utils.num(f.leadsGap)} abaixo da meta`;

    const budgetDiff = f.budgetGap >= 0
      ? `${Utils.brl(f.budgetGap)} de folga`
      : `${Utils.brl(Math.abs(f.budgetGap))} estourado`;

    container.innerHTML = `
      <div class="forecast-info">
        <div class="forecast-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
        </div>
        <div class="forecast-text">
          <h3>Projeção de fechamento do mês</h3>
          <p>Com <strong>${f.isoPct}%</strong> do mês transcorrido, mantendo o ritmo atual, o mês deve fechar com <strong>${Utils.num(f.projectedLeads)} leads</strong> e <strong>${Utils.brl(f.projectedBudget)}</strong> investidos.</p>
        </div>
      </div>
      <div class="forecast-numbers">
        <div class="forecast-num">
          <div class="forecast-num-label">Leads projetados</div>
          <div class="forecast-num-value ${leadsClass}">${Utils.num(f.projectedLeads)}</div>
          <div style="font-size:10.5px;color:var(--gray-500);margin-top:3px">${leadsDiff}</div>
        </div>
        <div class="forecast-num">
          <div class="forecast-num-label">Verba projetada</div>
          <div class="forecast-num-value ${budgetClass}">${Utils.brl(f.projectedBudget)}</div>
          <div style="font-size:10.5px;color:var(--gray-500);margin-top:3px">${budgetDiff}</div>
        </div>
      </div>
    `;
  }
};
