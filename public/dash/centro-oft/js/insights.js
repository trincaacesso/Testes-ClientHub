/* =====================================================
   INSIGHTS · Análises automáticas para Centro Oftalmológico
   ===================================================== */

const Insights = {
  /** Gera 3 insights automáticos baseados nos dados atuais */
  generate() {
    const insights = [];
    const t = DATASET.totals;
    const { google, facebook } = DATASET.platforms;
    const daily = DATASET.daily;

    // ===== INSIGHT 1: Gargalo comercial (vendas zeradas) =====
    if (t.realized.leads > 0 && t.realized.sales === 0) {
      insights.push({
        type: "alert",
        title: "Gargalo no funil comercial",
        desc: `<strong>${Utils.num(t.realized.leads)} leads</strong> capturados e <strong>0 vendas</strong> registradas. Investigar atendimento, qualificação e conversão para agendamento.`,
        icon: `<path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>`
      });
    }

    // ===== INSIGHT 2: CPL muito abaixo da meta =====
    const cplRatio = (t.realized.cpl / t.projected.cpl) * 100;
    if (cplRatio < 50 && t.realized.leads > 0) {
      insights.push({
        type: "success",
        title: "CPL excepcional",
        desc: `Custo por Lead em <strong>${Utils.brl(t.realized.cpl)}</strong>, ${(100-cplRatio).toFixed(0)}% abaixo da meta de ${Utils.brl(t.projected.cpl)}. Eficiência de aquisição muito superior ao planejado.`,
        icon: `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>`
      });
    }

    // ===== INSIGHT 3: Desbalanceamento entre plataformas =====
    const googleShare = (google.budgetReal / (google.budgetReal + facebook.budgetReal)) * 100;
    const expectedShare = google.sharePct;
    const shareDiff = Math.abs(googleShare - expectedShare);

    if (shareDiff > 10) {
      insights.push({
        type: "warn",
        title: "Distribuição fora do planejado",
        desc: `Google representa <strong>${googleShare.toFixed(0)}%</strong> da verba real, mas o planejado era <strong>${expectedShare}%</strong>. Reavaliar mix de canais.`,
        icon: `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`
      });
    }

    // ===== INSIGHT 4: Quebra de performance Google (se relevante) =====
    if (google.leadsReal > 0 && google.quebraPct < -10) {
      insights.push({
        type: "warn",
        title: "Quebra de performance no Google",
        desc: `Performance <strong>${Math.abs(google.quebraPct)}% abaixo</strong> do projetado para Google. Verificar qualidade de palavras-chave, segmentação e criativos.`,
        icon: `<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>`
      });
    }

    // ===== INSIGHT 5: Meta de leads superada =====
    const leadsPct = (t.realized.leads / t.projected.leads) * 100;
    if (leadsPct > 200) {
      insights.push({
        type: "success",
        title: "Meta de leads superada",
        desc: `<strong>${leadsPct.toFixed(0)}%</strong> da meta atingida com apenas <strong>${t.realized.orcaPct || Math.round((t.realized.budget/t.projected.budget)*100)}%</strong> da verba. Considerar escalar o que está funcionando.`,
        icon: `<path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/>`
      });
    }

    // ===== INSIGHT 6: Disparidade CPL Google × Facebook =====
    if (google.leadsReal > 0 && facebook.leadsReal > 0) {
      const ratio = facebook.cplReal / google.cplReal;
      if (ratio > 3) {
        insights.push({
          type: "warn",
          title: "Facebook muito mais caro que Google",
          desc: `CPL Facebook (<strong>${Utils.brl(facebook.cplReal)}</strong>) é <strong>${ratio.toFixed(1)}x</strong> o CPL Google (${Utils.brl(google.cplReal)}). Avaliar realocação de verba.`,
          icon: `<path d="M3 3v18h18M7 12l3-3 4 4 5-5"/>`
        });
      }
    }

    // ===== INSIGHT 7: Concentração de leads em dia da semana =====
    const dayPerformance = this.analyzeDayOfWeek(daily);
    if (dayPerformance.bestDay && dayPerformance.bestDayLeads > 0) {
      insights.push({
        type: "default",
        title: `${Utils.cap(dayPerformance.bestDay)} é seu melhor dia`,
        desc: `Média de <strong>${Math.round(dayPerformance.bestDayLeads)} leads/dia</strong> aos ${dayPerformance.bestDay}s. Considere reforçar verba nesse dia.`,
        icon: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`
      });
    }

    // Retorna até 3 insights priorizando alertas
    return insights
      .sort((a, b) => {
        const priority = { alert: 0, warn: 1, success: 2, default: 3 };
        return priority[a.type] - priority[b.type];
      })
      .slice(0, 3);
  },

  /** Analisa performance média por dia da semana */
  analyzeDayOfWeek(daily) {
    const byDay = {};
    daily.forEach(d => {
      const dia = d[1];
      if (!dia) return;
      const leads = (d[3] || 0) + (d[8] || 0);
      if (leads === 0) return;
      if (!byDay[dia]) byDay[dia] = { total: 0, count: 0 };
      byDay[dia].total += leads;
      byDay[dia].count += 1;
    });

    let bestDay = null, bestAvg = 0;
    Object.entries(byDay).forEach(([dia, data]) => {
      const avg = data.total / data.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestDay = dia;
      }
    });

    return { bestDay, bestDayLeads: bestAvg };
  },

  /** Renderiza os insights no DOM */
  render() {
    const container = document.getElementById("insightsRow");
    if (!container) return;
    const items = this.generate();

    if (items.length === 0) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }
    container.style.display = "";

    container.innerHTML = items.map(i => `
      <div class="insight-card ${i.type}">
        <div class="insight-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${i.icon}
          </svg>
        </div>
        <div class="insight-body">
          <div class="insight-title">${i.title}</div>
          <div class="insight-desc">${i.desc}</div>
        </div>
      </div>
    `).join("");
  }
};
