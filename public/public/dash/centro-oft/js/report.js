/* =====================================================
   REPORT · Geração de relatório analítico (CSV)
   ===================================================== */

const Report = {
  generate(groupBy = "daily") {
    const { google, facebook } = DATASET.platforms;
    const t = DATASET.totals;
    const sep = ";";

    let csv = "";

    csv += "RELATÓRIO ANALÍTICO · CENTRO OFTALMOLÓGICO\n";
    csv += `Período${sep}${DATASET.meta.periodStart} → ${DATASET.meta.periodEnd}\n`;
    csv += `Gerado em${sep}${DATASET.meta.generatedAt}\n`;
    csv += `Agrupamento${sep}${groupBy}\n\n`;

    csv += "COMPARATIVO RESUMIDO\n";
    csv += `Métrica${sep}Projetado${sep}Realizado${sep}% Atingido\n`;
    csv += `Orçamento (R$)${sep}${t.projected.budget.toFixed(2)}${sep}${t.realized.budget.toFixed(2)}${sep}${((t.realized.budget/t.projected.budget)*100).toFixed(1)}%\n`;
    csv += `Leads${sep}${t.projected.leads}${sep}${t.realized.leads}${sep}${((t.realized.leads/t.projected.leads)*100).toFixed(1)}%\n`;
    csv += `CPL (R$)${sep}${t.projected.cpl.toFixed(2)}${sep}${t.realized.cpl.toFixed(2)}${sep}${((t.realized.cpl/t.projected.cpl)*100).toFixed(1)}%\n`;
    csv += `Vendas${sep}—${sep}${t.realized.sales}${sep}—\n\n`;

    csv += "DADOS POR PLATAFORMA\n";
    csv += `Plataforma${sep}Orçamento${sep}Verba Real${sep}Meta Leads${sep}Leads Real${sep}% Meta${sep}CPL Meta${sep}CPL Real\n`;
    csv += `${google.name}${sep}${google.budgetProj.toFixed(2)}${sep}${google.budgetReal.toFixed(2)}${sep}${google.leadsMeta}${sep}${google.leadsReal}${sep}${google.metaPct}%${sep}${google.cplMeta.toFixed(2)}${sep}${google.cplReal.toFixed(2)}\n`;
    csv += `${facebook.name}${sep}${facebook.budgetProj.toFixed(2)}${sep}${facebook.budgetReal.toFixed(2)}${sep}${facebook.leadsMeta}${sep}${facebook.leadsReal}${sep}${facebook.metaPct}%${sep}${facebook.cplMeta.toFixed(2)}${sep}${facebook.cplReal.toFixed(2)}\n\n`;

    if (groupBy === "weekly") {
      csv += "AGRUPAMENTO SEMANAL · LEADS\n";
      csv += `Dia${sep}Semana Anterior${sep}Semana Atual\n`;
      DATASET.weeklyTrend.labels.forEach((d, i) => {
        csv += `${d}${sep}${DATASET.weeklyTrend.leads.previous[i]}${sep}${DATASET.weeklyTrend.leads.current[i]}\n`;
      });
    } else if (groupBy === "monthly") {
      csv += "AGRUPAMENTO MENSAL\n";
      csv += `Mês${sep}Verba Google${sep}Leads Google${sep}Verba Facebook${sep}Leads Facebook${sep}Total Leads\n`;
      const monthly = {};
      DATASET.daily.forEach(row => {
        const [data, , vG, lG, , , , vFB, lFB] = row;
        const month = data.split("/")[1] || "00";
        if (!monthly[month]) monthly[month] = { vG: 0, lG: 0, vFB: 0, lFB: 0 };
        monthly[month].vG += vG;
        monthly[month].lG += lG;
        monthly[month].vFB += vFB;
        monthly[month].lFB += lFB;
      });
      Object.entries(monthly).forEach(([m, d]) => {
        csv += `${m}/2026${sep}${d.vG.toFixed(2)}${sep}${d.lG}${sep}${d.vFB.toFixed(2)}${sep}${d.lFB}${sep}${d.lG + d.lFB}\n`;
      });
    } else {
      csv += "DETALHAMENTO DIÁRIO\n";
      csv += `Data${sep}Dia${sep}Verba Google${sep}Leads Google${sep}CPL Google${sep}Verba Facebook${sep}Leads Facebook${sep}CPL Facebook${sep}Leads Totais${sep}% Meta\n`;
      DATASET.daily.forEach(row => {
        const [data, dia, vG, lG, , , , vFB, lFB, cplFB, , , pctMeta] = row;
        const cplG = lG > 0 ? vG / lG : 0;
        const lTot = lG + lFB;
        csv += `${data}${sep}${dia}${sep}${vG.toFixed(2)}${sep}${lG}${sep}${cplG.toFixed(2)}${sep}${vFB.toFixed(2)}${sep}${lFB}${sep}${cplFB.toFixed(2)}${sep}${lTot}${sep}${pctMeta}%\n`;
      });
    }

    this.download(csv, `relatorio-centro-oftalmologico-${groupBy}-${Date.now()}.csv`);
  },

  download(content, filename) {
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  promptAndGenerate() {
    const choice = prompt(
      "Como deseja agrupar os dados do relatório?\n\n" +
      "Digite:\n" +
      "  1 - Diário (padrão)\n" +
      "  2 - Semanal\n" +
      "  3 - Mensal",
      "1"
    );
    if (choice === null) return;
    const map = { "1": "daily", "2": "weekly", "3": "monthly" };
    this.generate(map[choice.trim()] || "daily");
  }
};
