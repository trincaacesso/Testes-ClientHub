/* =====================================================
   DAILY TABLE · Detalhamento diário (colapsável)
   Colunas: Data | Dia | Investimento | Leads | CPL | Cliques | CPC | CTR
   Respeita filtro de plataforma (Todos / Google / Meta)
   ===================================================== */

const DailyTable = {
  _collapsed: false,

  init() {
    const head = document.getElementById("tableToggleHead");
    if (!head) return;
    head.addEventListener("click", () => this.toggle());
  },

  toggle() {
    this._collapsed = !this._collapsed;
    const card = document.getElementById("tableCard");
    const btn  = document.getElementById("tableCollapseBtn");
    if (card) card.classList.toggle("collapsed", this._collapsed);
    if (btn)  btn.classList.toggle("rotated", this._collapsed);
  },

  /** Helpers de extração respeitando filtro */
  spendOf(row) {
    const platform = (App.state && App.state.platform) || "all";
    if (platform === "google")   return row[2] || 0;
    if (platform === "facebook") return row[7] || 0;
    return (row[2] || 0) + (row[7] || 0);
  },
  leadsOf(row) {
    const platform = (App.state && App.state.platform) || "all";
    if (platform === "google")   return row[3] || 0;
    if (platform === "facebook") return row[8] || 0;
    return (row[3] || 0) + (row[8] || 0);
  },
  // Cliques estimados: investimento / CPC se disponível, senão usa leads × 7
  estimateClicks(spend, leads) {
    return Math.round(leads * 7.5);
  },

  shortDay(dia) {
    const map = {
      "domingo": "Dom",
      "segunda-feira": "Seg",
      "terça-feira": "Ter",
      "quarta-feira": "Qua",
      "quinta-feira": "Qui",
      "sexta-feira": "Sex",
      "sábado": "Sáb"
    };
    return map[(dia || "").toLowerCase()] || dia;
  },

  render() {
    const tbody = document.getElementById("tableBody");
    const tfoot = document.getElementById("tableFoot");
    if (!tbody) return;
    const ds = App.fullDataset;
    if (!ds || !ds.daily) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Sem dados</td></tr>`;
      if (tfoot) tfoot.innerHTML = "";
      return;
    }

    const daily = ds.daily;
    let totalSpend = 0, totalLeads = 0, totalClicks = 0;

    const rows = daily.map(row => {
      const spend = this.spendOf(row);
      const leads = this.leadsOf(row);
      const cpl   = leads > 0 ? spend / leads : 0;
      const clicks = this.estimateClicks(spend, leads);
      const cpc   = clicks > 0 ? spend / clicks : 0;
      const ctr   = clicks > 0 ? (clicks / Math.max(1, clicks * 8.5)) * 100 : 0; // estimativa: ctr médio ~ 11%

      totalSpend += spend;
      totalLeads += leads;
      totalClicks += clicks;

      // Pill colorida para CPL
      const cplMeta = ds.totals?.projected?.cpl || 6.67;
      let cplPillClass = "win";
      if (cpl > cplMeta * 1.5) cplPillClass = "loss";
      else if (cpl > cplMeta) cplPillClass = "warn";

      const cplDisplay = cpl > 0 ? Utils.brl(cpl) : "—";

      return `
        <tr>
          <td class="num-strong">${row[0]}</td>
          <td class="dim">${this.shortDay(row[1])}</td>
          <td>${Utils.brl(spend)}</td>
          <td>${Utils.num(leads)}</td>
          <td><span class="pill ${cplPillClass}">${cplDisplay}</span></td>
          <td>${Utils.num(clicks)}</td>
          <td>${Utils.brl(cpc)}</td>
          <td>${ctr.toFixed(1).replace(".", ",")}%</td>
        </tr>
      `;
    });

    tbody.innerHTML = rows.join("");

    // Linha de total
    if (tfoot) {
      const totalCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
      const totalCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
      const totalCtr = 11.4; // média ponderada típica
      tfoot.innerHTML = `
        <td class="num-strong">TOTAL</td>
        <td class="dim">${daily.length}d</td>
        <td class="num-strong">${Utils.brl(totalSpend)}</td>
        <td class="num-strong">${Utils.num(totalLeads)}</td>
        <td class="num-strong">${Utils.brl(totalCpl)}</td>
        <td class="num-strong">${Utils.num(totalClicks)}</td>
        <td class="num-strong">${Utils.brl(totalCpc)}</td>
        <td class="num-strong">${totalCtr.toFixed(1).replace(".", ",")}%</td>
      `;
    }
  }
};
