/* =====================================================
   UTILS · Funções de formatação reutilizáveis
   ===================================================== */

const Utils = {
  /** Formata valor em BRL: 1234.5 → "R$ 1.234,50" */
  brl(v) {
    return "R$ " + Number(v).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },

  /** Formata número com separadores de milhar: 1908 → "1.908" */
  num(v) {
    return Number(v).toLocaleString("pt-BR");
  },

  /** Formata percentual: 0.318 → "31,8%" */
  pct(v, decimals = 1) {
    return Number(v).toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }) + "%";
  },

  /** Classifica % de meta em categoria visual */
  pctClass(metaPct) {
    if (metaPct >= 100) return "win";
    if (metaPct >= 50)  return "warn";
    if (metaPct > 0)    return "loss";
    return "neutral";
  },

  /** Capitaliza primeira letra */
  cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  /** Inicializa defaults do Chart.js */
  setupChartDefaults() {
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = "#6B7891";
  },

  /** Cria template padrão de tooltip para gráficos */
  tooltipStyle() {
    return {
      backgroundColor: "#0A1F44",
      titleFont: { size: 12, weight: 600 },
      bodyFont: { size: 12 },
      padding: 10,
      cornerRadius: 8,
      displayColors: true,
      boxPadding: 4
    };
  }
};
