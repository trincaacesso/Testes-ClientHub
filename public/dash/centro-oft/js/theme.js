/* =====================================================
   THEME · Alternador de tema claro/escuro
   ===================================================== */

const Theme = {
  STORAGE_KEY: "dashboard-theme",

  /** Detecta tema do sistema operacional */
  systemPref() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  },

  /** Obtém tema salvo ou do sistema */
  current() {
    try {
      return localStorage.getItem(this.STORAGE_KEY) || this.systemPref();
    } catch (e) {
      return this.systemPref();
    }
  },

  /** Aplica tema ao DOM */
  apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(this.STORAGE_KEY, theme);
    } catch (e) {
      // Storage bloqueado, mas não impede o toggle funcionar nesta sessão
    }

    // Re-renderiza gráficos com cores novas
    if (window.App && App.fullDataset) {
      setTimeout(() => App.render(), 50);
    }
  },

  /** Alterna entre claro e escuro */
  toggle() {
    const next = this.current() === "dark" ? "light" : "dark";
    this.apply(next);
  },

  /** Inicializa */
  init() {
    this.apply(this.current());
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", () => this.toggle());
    }
  }
};
