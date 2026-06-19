/* =====================================================
   DATE FILTER · Atalhos rápidos + calendário popup
   - Filtra TODOS os dados (KPIs, gráficos, plataformas, tabela)
   - Trabalha sobre o dataset já carregado (filtragem local rápida)
   ===================================================== */

const DateFilter = {
  // Estado do filtro atual
  state: {
    mode:    "range",      // "single" ou "range"
    quick:   "last7",      // atalho ativo
    from:    null,         // Date
    to:      null,         // Date
    custom:  false         // true quando usuário escolhe data no calendário
  },

  // Estado do calendário popup
  cal: {
    open:        false,
    viewMonth:   new Date().getMonth(),
    viewYear:    new Date().getFullYear(),
    mode:        "single", // "single" ou "range"
    pickFrom:    null,
    pickTo:      null
  },

  /** Inicializa: aplica atalho padrão e prende eventos */
  init() {
    // PORTAL: move o popup pra ser filho direto do <body>
    const popup = document.getElementById("calendarPopup");
    if (popup && popup.parentElement !== document.body) {
      document.body.appendChild(popup);
    }

    // Impede o popup inteiro de fechar quando clica dentro dele
    if (popup) {
      popup.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }

    this.applyQuickPreset("last7");

    // Atalhos rápidos
    document.querySelectorAll(".period-quick button").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".period-quick button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.applyQuickPreset(btn.dataset.quick);
        this.notifyChange();
      });
    });

    // Toggle do calendário
    document.getElementById("calendarToggle").addEventListener("click", e => {
      e.stopPropagation();
      this.toggleCalendar();
    });

    // Fechar ao clicar fora
    document.addEventListener("click", e => {
      const popup = document.getElementById("calendarPopup");
      if (this.cal.open && popup && !popup.contains(e.target) &&
          !e.target.closest("#calendarToggle")) {
        this.closeCalendar();
      }
    });

    // Fechar ao rolar a página (evita popup ficar deslocado do botão)
    window.addEventListener("scroll", () => {
      if (this.cal.open) this.closeCalendar();
    }, { passive: true });

    // Fechar com tecla ESC
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && this.cal.open) this.closeCalendar();
    });

    // Navegação do calendário (stopPropagation pra não fechar o popup)
    document.getElementById("calPrev").addEventListener("click", (e) => {
      e.stopPropagation();
      this.cal.viewMonth--;
      if (this.cal.viewMonth < 0) {
        this.cal.viewMonth = 11;
        this.cal.viewYear--;
      }
      this.renderCalendar();
    });
    document.getElementById("calNext").addEventListener("click", (e) => {
      e.stopPropagation();
      this.cal.viewMonth++;
      if (this.cal.viewMonth > 11) {
        this.cal.viewMonth = 0;
        this.cal.viewYear++;
      }
      this.renderCalendar();
    });

    // Modo (dia único / período)
    document.querySelectorAll(".cal-mode button").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".cal-mode button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.cal.mode = btn.dataset.mode;
        this.cal.pickFrom = null;
        this.cal.pickTo = null;
        this.renderCalendar();
        this.updateHint();
      });
    });

    // ====== EVENT DELEGATION nos dias do calendário ======
    // 1 listener no grid que NÃO é destruído por innerHTML
    // Isso resolve o bug de cliques não funcionarem após o re-render
    const grid = document.getElementById("calGrid");
    if (grid) {
      grid.addEventListener("click", (e) => {
        e.stopPropagation();  // ESSENCIAL: não deixa o handler global fechar o popup
        const btn = e.target.closest(".cal-day");
        if (!btn || btn.classList.contains("outside") || btn.disabled) return;
        const day = parseInt(btn.dataset.d, 10);
        if (isNaN(day)) return;
        const date = new Date(this.cal.viewYear, this.cal.viewMonth, day);
        this.onDayClick(date);
      });
    }

    // Limpar / Aplicar
    document.getElementById("calClear").addEventListener("click", (e) => {
      e.stopPropagation();
      this.cal.pickFrom = null;
      this.cal.pickTo = null;
      this.renderCalendar();
      this.updateHint();
    });
    document.getElementById("calApply").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!this.cal.pickFrom) {
        console.warn("[DateFilter] Nenhuma data selecionada");
        return;
      }
      const finalFrom = this.cal.pickFrom;
      const finalTo   = this.cal.pickTo || this.cal.pickFrom;

      this.state.custom = true;
      this.state.quick  = null;
      this.state.mode   = this.cal.mode;
      this.state.from   = finalFrom;
      this.state.to     = finalTo;
      document.querySelectorAll(".period-quick button").forEach(b => b.classList.remove("active"));
      console.log("[DateFilter] Aplicado:", {
        mode: this.state.mode,
        from: this.formatDate(finalFrom),
        to:   this.formatDate(finalTo)
      });
      this.closeCalendar();
      this.notifyChange();
    });

    this.updateDisplay();
  },

  /** Aplica um atalho (Hoje, Ontem, 7d, 30d, Este mês) */
  applyQuickPreset(key) {
    const today = this.startOfDay(new Date());
    let from, to;

    switch (key) {
      case "today":
        from = today;
        to = today;
        break;
      case "yesterday":
        from = this.addDays(today, -1);
        to = from;
        break;
      case "last7":
        from = this.addDays(today, -6);
        to = today;
        break;
      case "last30":
        from = this.addDays(today, -29);
        to = today;
        break;
      case "month":
        from = new Date(today.getFullYear(), today.getMonth(), 1);
        to = today;
        break;
      default:
        from = this.addDays(today, -6);
        to = today;
    }

    this.state.quick  = key;
    this.state.from   = from;
    this.state.to     = to;
    this.state.mode   = "range";
    this.state.custom = false;
    this.updateDisplay();
  },

  /** Atualiza o label "Período: X → Y" */
  updateDisplay() {
    const lbl = document.getElementById("periodLabel");
    if (!lbl) return;
    const { from, to } = this.state;
    if (!from || !to) { lbl.textContent = "—"; return; }
    const sameDay = this.sameDate(from, to);
    if (sameDay) {
      lbl.textContent = this.formatDate(from);
    } else {
      lbl.textContent = `${this.formatDate(from)} → ${this.formatDate(to)}`;
    }
  },

  /** Notifica o app que o filtro mudou — App.applyDateFilter() recalcula tudo */
  notifyChange() {
    this.updateDisplay();
    // IMPORTANTE: não usar 'window.App' porque 'const App = {...}' não atribui ao window
    if (typeof App !== "undefined" && typeof App.applyDateFilter === "function") {
      console.log("[DateFilter] Notificando App.applyDateFilter()");
      App.applyDateFilter();
    } else {
      console.warn("[DateFilter] App.applyDateFilter() não disponível");
    }
  },

  /** ===== Calendário popup ===== */
  toggleCalendar() {
    if (this.cal.open) this.closeCalendar();
    else this.openCalendar();
  },

  openCalendar() {
    const popup = document.getElementById("calendarPopup");
    const toggle = document.getElementById("calendarToggle");
    if (!popup || !toggle) return;

    // Posiciona o popup logo abaixo do botão de calendário
    const rect = toggle.getBoundingClientRect();
    const popupWidth = 300;
    const popupHeight = 380;  // altura aproximada (cabeçalho + grade + ações)
    const margin = 16;

    // Horizontal: alinha à direita do botão, mas não corta na tela
    let left = rect.right - popupWidth;
    if (left < margin) left = margin;
    if (left + popupWidth > window.innerWidth - margin) {
      left = window.innerWidth - popupWidth - margin;
    }

    // Vertical: abre abaixo, mas se cortar embaixo, abre acima
    let top = rect.bottom + 10;
    if (top + popupHeight > window.innerHeight - margin) {
      // Não cabe abaixo — abre acima do botão
      top = rect.top - popupHeight - 10;
      // Se também não couber acima, gruda no topo
      if (top < margin) top = margin;
    }

    popup.style.position = "fixed";
    popup.style.top      = top + "px";
    popup.style.left     = left + "px";
    popup.style.right    = "auto";
    popup.style.bottom   = "auto";
    popup.style.zIndex   = "999999";

    popup.hidden = false;
    this.cal.open = true;

    console.log("[DateFilter] Popup aberto em:", { top, left, parentTag: popup.parentElement?.tagName });

    // Pré-popula com a seleção atual
    if (this.state.from) {
      this.cal.viewMonth = this.state.from.getMonth();
      this.cal.viewYear  = this.state.from.getFullYear();
      this.cal.pickFrom  = this.state.from;
      this.cal.pickTo    = this.sameDate(this.state.from, this.state.to) ? null : this.state.to;
      this.cal.mode      = this.sameDate(this.state.from, this.state.to) ? "single" : "range";
      document.querySelectorAll(".cal-mode button").forEach(b => {
        b.classList.toggle("active", b.dataset.mode === this.cal.mode);
      });
    }
    this.renderCalendar();
    this.updateHint();
  },

  closeCalendar() {
    const popup = document.getElementById("calendarPopup");
    if (popup) popup.hidden = true;
    this.cal.open = false;
  },

  /** Desenha o calendário do mês atual */
  renderCalendar() {
    const title = document.getElementById("calTitle");
    const grid  = document.getElementById("calGrid");
    if (!title || !grid) return;

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    title.textContent = `${monthNames[this.cal.viewMonth]} ${this.cal.viewYear}`;

    const firstDay = new Date(this.cal.viewYear, this.cal.viewMonth, 1);
    const startWeekday = firstDay.getDay(); // 0 = domingo
    const daysInMonth = new Date(this.cal.viewYear, this.cal.viewMonth + 1, 0).getDate();
    const today = this.startOfDay(new Date());

    let html = "";
    // Dias do mês anterior (preenchimento)
    const prevMonthDays = new Date(this.cal.viewYear, this.cal.viewMonth, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      html += `<button class="cal-day outside" disabled>${prevMonthDays - i}</button>`;
    }

    // Dias do mês atual
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(this.cal.viewYear, this.cal.viewMonth, d);
      const classes = ["cal-day"];

      if (this.sameDate(date, today)) classes.push("today");

      // Estado da seleção
      const pf = this.cal.pickFrom;
      const pt = this.cal.pickTo;

      if (this.cal.mode === "single" && pf && this.sameDate(date, pf)) {
        classes.push("selected");
      } else if (this.cal.mode === "range") {
        if (pf && this.sameDate(date, pf)) classes.push("range-start");
        if (pt && this.sameDate(date, pt)) classes.push("range-end");
        if (pf && pt && date > pf && date < pt) classes.push("in-range");
      }

      html += `<button class="${classes.join(" ")}" data-d="${d}">${d}</button>`;
    }

    grid.innerHTML = html;
    // Handlers nos dias estão no init() via event delegation no .cal-grid
  },

  onDayClick(date) {
    if (this.cal.mode === "single") {
      this.cal.pickFrom = date;
      this.cal.pickTo   = date;
    } else {
      // Modo range: 1º clique = início, 2º clique = fim
      if (!this.cal.pickFrom || (this.cal.pickFrom && this.cal.pickTo)) {
        this.cal.pickFrom = date;
        this.cal.pickTo   = null;
      } else {
        if (date < this.cal.pickFrom) {
          this.cal.pickTo   = this.cal.pickFrom;
          this.cal.pickFrom = date;
        } else {
          this.cal.pickTo = date;
        }
      }
    }
    this.renderCalendar();
    this.updateHint();
  },

  /** Atualiza a dica dinâmica abaixo do toggle de modo */
  updateHint() {
    const hint = document.getElementById("calHint");
    if (!hint) return;

    const pf = this.cal.pickFrom;
    const pt = this.cal.pickTo;

    if (this.cal.mode === "single") {
      if (pf) {
        hint.textContent = `Selecionado: ${this.formatDate(pf)}`;
        hint.classList.add("active");
      } else {
        hint.textContent = "Clique em um dia";
        hint.classList.remove("active");
      }
    } else {
      // range
      if (!pf) {
        hint.textContent = "Clique no PRIMEIRO dia do período";
        hint.classList.remove("active");
      } else if (pf && !pt) {
        hint.textContent = `Início: ${this.formatDate(pf)} · agora clique no FIM`;
        hint.classList.add("active");
      } else {
        hint.textContent = `${this.formatDate(pf)} → ${this.formatDate(pt)}`;
        hint.classList.add("active");
      }
    }
  },

  /** ===== Filtragem do dataset ===== */

  /** Verifica se uma linha diária está dentro do período selecionado */
  isInRange(dailyRow) {
    const d = this.parseRowDate(dailyRow);
    if (!d) return true;
    const from = this.startOfDay(this.state.from);
    const to   = this.endOfDay(this.state.to);
    return d >= from && d <= to;
  },

  /** Recebe o dataset bruto (full) e devolve um novo dataset filtrado pelo período */
  filterDataset(fullDataset) {
    if (!fullDataset || !fullDataset.daily) return fullDataset;

    // Filtra linhas diárias dentro do período
    const filteredDaily = fullDataset.daily.filter(row => this.isInRange(row));

    // Recalcula totais a partir das linhas filtradas
    let sumVG = 0, sumLG = 0, sumLExpG = 0;
    let sumVFB = 0, sumLFB = 0;

    filteredDaily.forEach(d => {
      sumVG    += parseFloat(d[2])  || 0;
      sumLG    += parseInt(d[3])    || 0;
      sumLExpG += parseInt(d[4])    || 0;
      sumVFB   += parseFloat(d[7])  || 0;
      sumLFB   += parseInt(d[8])    || 0;
    });

    const totalDays = filteredDaily.length || 1;
    const periodFraction = totalDays / Math.max(1, fullDataset.daily.length);

    // Metas proporcionais ao período (se filtrou 7 dias de 30, meta = 7/30 * meta total)
    const googleMetaScaled = {
      ...fullDataset.platforms.google,
      budgetReal: sumVG,
      leadsReal:  sumLG,
      leadsExpad: sumLExpG,
      cplReal:    sumVG / Math.max(1, sumLG),
      // proporcionais
      budgetProj: fullDataset.platforms.google.budgetProj * periodFraction,
      leadsMeta:  Math.round(fullDataset.platforms.google.leadsMeta * periodFraction),
      // campanhas: escalonadas proporcionalmente ao período
      // (engate temporário — quando Google Ads API estiver ativa, virão com
      //  valores reais do período já filtrados pela própria API)
      campaigns: (fullDataset.platforms.google.campaigns || []).map(c => ({
        ...c,
        spend:       (c.spend       || 0) * periodFraction,
        leads:       Math.round((c.leads       || 0) * periodFraction),
        clicks:      Math.round((c.clicks      || 0) * periodFraction),
        impressions: Math.round((c.impressions || 0) * periodFraction)
      }))
    };
    const facebookMetaScaled = {
      ...fullDataset.platforms.facebook,
      budgetReal: sumVFB,
      leadsReal:  sumLFB,
      cplReal:    sumVFB / Math.max(1, sumLFB),
      budgetProj: fullDataset.platforms.facebook.budgetProj * periodFraction,
      leadsMeta:  Math.round(fullDataset.platforms.facebook.leadsMeta * periodFraction),
      campaigns: (fullDataset.platforms.facebook.campaigns || []).map(c => ({
        ...c,
        spend:       (c.spend       || 0) * periodFraction,
        leads:       Math.round((c.leads       || 0) * periodFraction),
        clicks:      Math.round((c.clicks      || 0) * periodFraction),
        impressions: Math.round((c.impressions || 0) * periodFraction)
      }))
    };

    const projBudget = googleMetaScaled.budgetProj + facebookMetaScaled.budgetProj;
    const projLeads  = googleMetaScaled.leadsMeta + facebookMetaScaled.leadsMeta;
    const realBudget = sumVG + sumVFB;
    const realLeads  = sumLG + sumLFB;

    return {
      ...fullDataset,
      meta: {
        ...fullDataset.meta,
        periodStart: this.formatDate(this.state.from),
        periodEnd:   this.formatDate(this.state.to),
        periodDays:  totalDays
      },
      totals: {
        projected: {
          budget: projBudget,
          leads:  projLeads,
          cpl:    fullDataset.totals.projected.cpl
        },
        realized: {
          ...fullDataset.totals.realized,
          budget: realBudget,
          leads:  realLeads,
          cpl:    realBudget / Math.max(1, realLeads)
        }
      },
      platforms: {
        google:   googleMetaScaled,
        facebook: facebookMetaScaled
      },
      daily: filteredDaily,
      weeklyTrend: fullDataset.weeklyTrend  // mantém o trend original (semana atual × anterior)
    };
  },

  /** ===== Helpers ===== */

  startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  },
  endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  },
  addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  },
  sameDate(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  },
  formatDate(d) {
    if (!d) return "—";
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const yr  = d.getFullYear();
    return `${day}/${mon}/${yr}`;
  },

  /**
   * Lê a data de uma linha diária. As linhas vêm como:
   * [date, dia, verbaG, leadsG, leadsExpG, ...] onde date pode ser "01/05/2026" ou "2026-05-01" ou objeto Date.
   */
  parseRowDate(row) {
    if (!row || row.length === 0) return null;
    const raw = row[0];
    if (raw instanceof Date) return this.startOfDay(raw);
    if (typeof raw !== "string") return null;

    // Tenta DD/MM/YYYY
    let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      return this.startOfDay(new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])));
    }
    // Tenta DD/MM (assume ano corrente do filtro)
    m = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (m) {
      const year = this.state.from ? this.state.from.getFullYear() : new Date().getFullYear();
      return this.startOfDay(new Date(year, parseInt(m[2]) - 1, parseInt(m[1])));
    }
    // Tenta YYYY-MM-DD
    m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      return this.startOfDay(new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
    }
    return null;
  }
};

// Debug helper global
window.debugDateFilter = function() {
  console.log("=== DateFilter State ===");
  console.log("Mode:",   DateFilter.state.mode);
  console.log("Quick:",  DateFilter.state.quick);
  console.log("From:",   DateFilter.state.from);
  console.log("To:",     DateFilter.state.to);
  console.log("Custom:", DateFilter.state.custom);
  console.log("Label:",  document.getElementById("periodLabel")?.textContent);
};
