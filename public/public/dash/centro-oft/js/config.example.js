/* =====================================================
   CONFIG.EXAMPLE · Template
   Copie este arquivo para config.js (ele já vem assim).
   As CREDENCIAIS reais ficam nas variáveis de ambiente
   do Netlify, NÃO nesse arquivo.
   ===================================================== */

const CONFIG = {
  // Endpoint do proxy Netlify
  proxyEndpoint: "/api/sheets",

  // Detecta dev local automaticamente
  isLocalDev: ["localhost", "127.0.0.1"].includes(window.location.hostname),

  // Em dev local sem `netlify dev`, ative pra usar dados de fallback
  devUseLocalData: false,

  // Cache no cliente (ms)
  cacheTTL: 5 * 60 * 1000,

  // Display only
  sheetName: "Diário + Performance"
};
