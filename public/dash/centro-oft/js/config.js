/* =====================================================
   CONFIG · Configurações do cliente
   ⚠️  As credenciais da Google Sheets API NÃO ficam aqui!
   Elas estão protegidas em variáveis de ambiente do Netlify
   e o cliente acessa via proxy: /api/sheets
   ===================================================== */

const CONFIG = {
  // ===== Endpoint do proxy do Netlify =====
  // Em produção:  /api/sheets → Netlify Function → Google Sheets API
  // Em dev local: depende do modo (ver abaixo)
  proxyEndpoint: "/api/sheets",

  // ===== Comportamento em desenvolvimento local =====
  // Detecta automaticamente se está rodando local
  isLocalDev: ["localhost", "127.0.0.1"].includes(window.location.hostname),

  // Em dev local você tem 2 opções:
  //
  //   1) Rodar `netlify dev` no terminal (recomendado)
  //      → as Functions ficam disponíveis em http://localhost:8888
  //      → mantenha devUseLocalData = false
  //
  //   2) Abrir com Live Server direto (mais rápido, sem Functions)
  //      → Live Server não tem proxy, então setar abaixo:
  //      → devUseLocalData = true (usa data/dataset.js)
  devUseLocalData: false,

  // ===== Cache no cliente =====
  // Evita bater no proxy a cada filtro trocado
  cacheTTL: 5 * 60 * 1000,  // 5 minutos

  // ===== Display only (informativo, não usado para chamada) =====
  sheetName: "Diário + Performance"
};
