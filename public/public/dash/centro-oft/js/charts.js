/* =====================================================
   CHARTS · 4 gráficos da aba Estatísticas
   - Combo: barras (investimento diário) + linha (leads acumulados)
   - Leads por dia (barras laranja)
   - CPL por dia (linha roxa) × meta (linha tracejada vermelha)
   - Donut: distribuição por tipo de campanha (auto-categorizado)
   ===================================================== */

const Charts = {
  _combo:    null,
  _leadsDay: null,
  _cplDay:   null,
  _donut:    null,

  themeColors() {
    const css = getComputedStyle(document.documentElement);
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    return {
      isDark,
      primary:    css.getPropertyValue("--primary").trim()    || "#1F6FE5",
      accent:     css.getPropertyValue("--accent").trim()     || "#EF8A1F",
      muted:      css.getPropertyValue("--muted").trim()      || "#94A7C6",
      text:       css.getPropertyValue("--text").trim()       || "#0F1F38",
      grid:       isDark ? "rgba(255,255,255,.07)" : "rgba(15,42,95,.07)",
      tooltipBg:  isDark ? "rgba(15,28,48,0.95)"  : "rgba(15,32,56,0.95)",
      primaryArea: isDark ? "rgba(79,147,245,0.40)" : "rgba(31,111,229,0.45)",
      accentArea:  isDark ? "rgba(246,168,60,0.20)" : "rgba(239,138,31,0.14)",
      purple:     "#A78BFA",
      red:        "#F87171"
    };
  },

  /** Auxiliar: pega valor de uma coluna da linha diária respeitando o filtro de plataforma */
  daily_value(row, field) {
    // Layout esperado: [0:data, 1:dia, 2:verbaG, 3:leadsG, 4:leadsExpad,
    //                   5:%quebra, 6:cplExpad, 7:verbaFB, 8:leadsFB, 9:cplFB,
    //                   10:leadsTotalAcum, 11:%ref, 12:%meta]
    const platform = (window.App && App.state && App.state.platform) || "all";
    switch (field) {
      case "spend":
        if (platform === "google")   return row[2] || 0;
        if (platform === "facebook") return row[7] || 0;
        return (row[2] || 0) + (row[7] || 0);
      case "leads":
        if (platform === "google")   return row[3] || 0;
        if (platform === "facebook") return row[8] || 0;
        return (row[3] || 0) + (row[8] || 0);
      case "cpl": {
        const s = this.daily_value(row, "spend");
        const l = this.daily_value(row, "leads");
        return l > 0 ? s / l : null;
      }
    }
    return 0;
  },

  /** ====== GRÁFICO COMBO: Investimento diário (barras) × Leads acumulados (linha) ====== */
  renderCombo() {
    const canvas = document.getElementById("comboChart");
    if (!canvas) return;
    const c = this.themeColors();
    const daily = (App.fullDataset && App.fullDataset.daily) || [];
    if (daily.length === 0) {
      if (this._combo) { this._combo.destroy(); this._combo = null; }
      return;
    }

    const labels = daily.map(d => d[0]);
    const spends = daily.map(d => this.daily_value(d, "spend"));
    let acc = 0;
    const leadsCum = daily.map(d => {
      acc += this.daily_value(d, "leads");
      return acc;
    });

    // Atualiza subtítulo
    const totalSpend = spends.reduce((s, v) => s + v, 0);
    const totalLeads = leadsCum[leadsCum.length - 1] || 0;
    const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const dailyAvg = daily.length > 0 ? totalSpend / daily.length : 0;
    const heroSub = document.getElementById("heroSub");
    if (heroSub) {
      heroSub.innerHTML = `<strong>${Utils.num(totalLeads)}</strong> leads · <strong>${Utils.brl(totalSpend)}</strong> investidos · CPL <strong>${Utils.brl(avgCpl)}</strong> · <strong>${Utils.brl(dailyAvg)}</strong>/dia`;
    }

    if (this._combo) this._combo.destroy();
    this._combo = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Investimento (R$)",
            data: spends,
            backgroundColor: c.primaryArea,
            borderColor: c.primary,
            borderWidth: 1.5,
            borderRadius: 4,
            yAxisID: "y",
            order: 2
          },
          {
            type: "line",
            label: "Leads acumulados",
            data: leadsCum,
            borderColor: c.accent,
            backgroundColor: "transparent",
            borderWidth: 2.5,
            tension: 0.35,
            pointBackgroundColor: c.accent,
            pointBorderColor: c.isDark ? "#0F1C30" : "#FFFFFF",
            pointBorderWidth: 1.5,
            pointRadius: 3,
            pointHoverRadius: 6,
            yAxisID: "y1",
            order: 1
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top", align: "end",
            labels: {
              color: c.text, padding: 12, boxWidth: 10, boxHeight: 10,
              font: { size: 11.5, family: "Inter", weight: "600" },
              usePointStyle: true, pointStyle: "rectRounded"
            }
          },
          tooltip: {
            backgroundColor: c.tooltipBg, titleColor: "#FFF", bodyColor: "#FFF",
            padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4,
            callbacks: {
              label: x => {
                if (x.dataset.label.startsWith("Investimento")) {
                  return ` ${x.dataset.label}: ${Utils.brl(x.parsed.y)}`;
                }
                return ` ${x.dataset.label}: ${Utils.num(x.parsed.y)}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false }, border: { display: false },
            ticks: {
              color: c.muted, autoSkip: false,
              maxRotation: 60, minRotation: 45,
              font: { size: 9.5 }
            }
          },
          y: {
            position: "left",
            grid: { color: c.grid, drawBorder: false },
            border: { display: false },
            ticks: {
              color: c.muted,
              callback: v => "R$" + v,
              font: { size: 10 }
            }
          },
          y1: {
            position: "right",
            grid: { display: false },
            border: { display: false },
            ticks: { color: c.muted, font: { size: 10 } }
          }
        }
      }
    });
  },

  /** ====== LEADS POR DIA (barras laranjas) ====== */
  renderLeadsByDay() {
    const canvas = document.getElementById("leadsByDayChart");
    if (!canvas) return;
    const c = this.themeColors();
    const daily = (App.fullDataset && App.fullDataset.daily) || [];
    if (daily.length === 0) {
      if (this._leadsDay) { this._leadsDay.destroy(); this._leadsDay = null; }
      return;
    }

    const labels = daily.map(d => d[0]);
    const leads  = daily.map(d => this.daily_value(d, "leads"));

    if (this._leadsDay) this._leadsDay.destroy();
    this._leadsDay = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Leads",
          data: leads,
          backgroundColor: c.accent,
          borderRadius: 5,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.tooltipBg, titleColor: "#FFF", bodyColor: "#FFF",
            padding: 10, cornerRadius: 8,
            callbacks: { label: x => ` ${Utils.num(x.parsed.y)} leads` }
          }
        },
        scales: {
          x: {
            grid: { display: false }, border: { display: false },
            ticks: { color: c.muted, autoSkip: false, maxRotation: 60, minRotation: 45, font: { size: 9.5 } }
          },
          y: {
            grid: { color: c.grid, drawBorder: false },
            border: { display: false },
            ticks: { color: c.muted, font: { size: 10 }, precision: 0 }
          }
        }
      }
    });
  },

  /** ====== CPL POR DIA vs META (linha roxa + linha tracejada vermelha) ====== */
  renderCplByDay() {
    const canvas = document.getElementById("cplByDayChart");
    if (!canvas) return;
    const c = this.themeColors();
    const daily = (App.fullDataset && App.fullDataset.daily) || [];
    if (daily.length === 0) {
      if (this._cplDay) { this._cplDay.destroy(); this._cplDay = null; }
      return;
    }

    // Pega CPL meta da plataforma atual
    const platform = (App.state && App.state.platform) || "all";
    const platforms = App.fullDataset.platforms || {};
    let cplMeta = 0;
    if (platform === "google") {
      cplMeta = platforms.google?.cplMeta || 0;
    } else if (platform === "facebook") {
      cplMeta = platforms.facebook?.cplMeta || 0;
    } else {
      cplMeta = App.fullDataset.totals?.projected?.cpl || 0;
    }

    const labels = daily.map(d => d[0]);
    const cplSerie = daily.map(d => {
      const v = this.daily_value(d, "cpl");
      return v === null ? null : v;
    });
    const metaLine = labels.map(() => cplMeta);

    // Atualiza subtítulo
    const sub = document.getElementById("cplVsMetaSub");
    if (sub) sub.textContent = `vs meta ${Utils.brl(cplMeta)}`;

    if (this._cplDay) this._cplDay.destroy();
    this._cplDay = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "CPL realizado",
            data: cplSerie,
            borderColor: c.purple,
            backgroundColor: "rgba(167,139,250,0.12)",
            borderWidth: 2.5,
            tension: 0.35,
            fill: true,
            pointBackgroundColor: c.purple,
            pointRadius: 2.5, pointHoverRadius: 6,
            spanGaps: true
          },
          {
            label: "Meta",
            data: metaLine,
            borderColor: c.red,
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [6, 5],
            pointRadius: 0,
            tension: 0
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top", align: "end",
            labels: {
              color: c.text, padding: 10, boxWidth: 10, boxHeight: 10,
              font: { size: 11, family: "Inter", weight: "600" },
              usePointStyle: true, pointStyle: "circle"
            }
          },
          tooltip: {
            backgroundColor: c.tooltipBg, titleColor: "#FFF", bodyColor: "#FFF",
            padding: 10, cornerRadius: 8,
            callbacks: { label: x => ` ${x.dataset.label}: ${Utils.brl(x.parsed.y)}` }
          }
        },
        scales: {
          x: {
            grid: { display: false }, border: { display: false },
            ticks: { color: c.muted, autoSkip: false, maxRotation: 60, minRotation: 45, font: { size: 9.5 } }
          },
          y: {
            grid: { color: c.grid, drawBorder: false },
            border: { display: false },
            ticks: { color: c.muted, callback: v => "R$" + v, font: { size: 10 } }
          }
        }
      }
    });
  },

  /** ====== DONUT: distribuição por tipo de campanha ======
   * Categoriza automaticamente:
   * - Nome contém "search" / "pesquisa" → Rede de Pesquisa
   * - Nome contém "pmax" / "performance max" → Performance Max
   * - Nome contém "display" → Display
   * - Nome contém "discovery" / "demand gen" → Discovery
   * - Nome contém "youtube" / "video" → YouTube
   * - "facebook" / "instagram" / "meta" → Meta (Facebook/Instagram)
   * - resto → Outros
   *
   * Se não tiver dataset de campanhas detalhado, usa proporção entre Google e Meta
   * como fallback (mostra 2 fatias).
   */
  classifyCampaign(name) {
    const n = (name || "").toLowerCase();
    if (n.includes("pmax") || n.includes("performance max")) return "Performance Max";
    if (n.includes("search") || n.includes("pesquisa")) return "Rede de Pesquisa";
    if (n.includes("display")) return "Display";
    if (n.includes("discovery") || n.includes("demand gen")) return "Discovery";
    if (n.includes("youtube") || n.includes("video")) return "YouTube";
    if (n.includes("instagram") || n.includes("facebook") || n.includes("meta")) return "Meta Ads";
    return "Outros";
  },

  renderDonut() {
    const canvas = document.getElementById("campaignsDonut");
    const legendEl = document.getElementById("donutLegend");
    if (!canvas) return;
    const c = this.themeColors();

    // Tenta usar dataset.campaigns (se disponível) — categoriza pelo nome
    const platforms = (App.fullDataset && App.fullDataset.platforms) || {};
    const campaigns = (App.fullDataset && App.fullDataset.campaigns) || null;

    let categoryBuckets = {};

    if (campaigns && Array.isArray(campaigns) && campaigns.length > 0) {
      // Tem dados detalhados de campanhas — agrupa por categoria classificada
      campaigns.forEach(camp => {
        const cat = this.classifyCampaign(camp.name);
        if (!categoryBuckets[cat]) categoryBuckets[cat] = 0;
        categoryBuckets[cat] += camp.spend || 0;
      });
    } else {
      // Fallback: usa só Google × Meta com nomes genéricos
      const platform = (App.state && App.state.platform) || "all";
      if (platform !== "facebook") {
        categoryBuckets["Rede de Pesquisa"] = platforms.google?.budgetReal || 0;
      }
      if (platform !== "google") {
        categoryBuckets["Meta Ads"] = platforms.facebook?.budgetReal || 0;
      }
    }

    // Remove categorias vazias
    Object.keys(categoryBuckets).forEach(k => {
      if (!categoryBuckets[k] || categoryBuckets[k] <= 0) delete categoryBuckets[k];
    });

    const labels = Object.keys(categoryBuckets);
    const values = labels.map(k => categoryBuckets[k]);

    // Paleta de cores para as categorias
    const palette = [
      "#4F93F5", "#F6A83C", "#A78BFA", "#34D399",
      "#FB7185", "#60A5FA", "#FBBF24", "#94A3B8",
      "#22D3EE", "#F472B6"
    ];

    if (this._donut) this._donut.destroy();

    if (labels.length === 0) {
      if (legendEl) legendEl.innerHTML = '<div style="opacity:0.6;font-size:12px">Sem dados de campanhas no período</div>';
      return;
    }

    this._donut = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: palette.slice(0, labels.length),
          borderColor: c.isDark ? "#0F1C30" : "#FFFFFF",
          borderWidth: 3,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: "65%",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.tooltipBg, titleColor: "#FFF", bodyColor: "#FFF",
            padding: 10, cornerRadius: 8,
            callbacks: {
              label: x => {
                const total = values.reduce((s, v) => s + v, 0);
                const pct = total > 0 ? (x.parsed / total * 100) : 0;
                return ` ${x.label}: ${Utils.brl(x.parsed)} (${pct.toFixed(1)}%)`;
              }
            }
          }
        }
      }
    });

    // Legenda customizada lateral
    if (legendEl) {
      const total = values.reduce((s, v) => s + v, 0);
      legendEl.innerHTML = labels.map((lbl, i) => {
        const v = values[i];
        const pct = total > 0 ? (v / total * 100) : 0;
        return `
          <div class="donut-legend-item">
            <span class="ll-color" style="background:${palette[i]}"></span>
            <div class="ll-text">
              <div class="ll-name">${lbl}</div>
              <div class="ll-val">${Utils.brl(v)} <span class="ll-pct">${pct.toFixed(1)}%</span></div>
            </div>
          </div>
        `;
      }).join("");
    }
  },

  renderAll() {
    if (typeof Utils !== "undefined" && Utils.setupChartDefaults) Utils.setupChartDefaults();
    this.renderCombo();
    this.renderLeadsByDay();
    this.renderCplByDay();
    this.renderDonut();
  }
};
