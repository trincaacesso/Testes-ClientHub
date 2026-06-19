/* =====================================================
   DATASET · Dados exatos extraídos do PDF da planilha
   Centro Oftalmológico - MAIO Diário + Projeções
   ===================================================== */

const DATASET = {
  meta: {
    periodStart: "01/04/2026",
    periodEnd:   "01/05/2026",
    isoMonth:    84,
    generatedAt: "26/05/2026",
    clientName:  "Centro Oftalmológico"
  },

  totals: {
    projected: {
      budget:  4000.00,
      leads:   600,
      cpl:     6.67
    },
    realized: {
      budget:  3194.72,       // PDF: R$ 3.194,72
      orcaPct: 80,            // % do orçamento gasto
      leads:   1908,
      leadsPct: 318,          // % da meta de leads
      cpl:     1.67,          // CPL geral
      cplBI:   0,             // CPL BI (qualificado) - zerado pois não há lead BI
      leadsBI: 0,
      quebraGeral: -18,       // % quebra geral
      sales:   0,
      cac:     null,
      convRate: 0.00
    }
  },

  platforms: {
    google: {
      name:       "Google Ads",
      color:      "#1E5BC6",
      budgetProj: 3000.00,
      sharePct:   75,
      leadsMeta:  450,
      cplMeta:    6.67,
      budgetReal: 2612.63,    // PDF: R$ 2.612,63
      orcaPct:    87,
      leadsReal:  1839,       // PDF: 1.839 leads
      leadsExpad: 1503,
      cplReal:    1.42,       // PDF: R$ 1,42
      cplBI:      0,
      leadsBI:    0,
      quebraPct:  -18,
      metaPct:    409,
      // ============================================================
      // CAMPANHAS — Dados REAIS do Google Ads via MCP Acesso Google
      // Conta: COMG [NOVA] Centro Oftalmológico de MG (ID 5770191982)
      // Período: últimos 30 dias
      // Atualizado em: dados puxados via MCP no chat
      // ============================================================
      // Pra atualizar: peça ao Claude no chat "atualize os dados do Google
      // Ads do Centro Oftalmológico" — ele puxa via MCP e regenera essa lista.
      // ============================================================
      campaigns: [
        {
          id: "g_consultas",
          name: "[Acesso][Search] Consultas e Exames",
          type: "Search",
          status: "ACTIVE",
          spend: 828.27,
          leads: 853,
          clicks: 2742,
          impressions: 15506,
          ctr: 17.68,
          cpa: 0.97,
          budgetDaily: 30.00
        },
        {
          id: "g_cirurgias",
          name: "[Acesso][Search] Cirurgias (Manter 25% da verba)",
          type: "Search",
          status: "ACTIVE",
          spend: 737.70,
          leads: 196,
          clicks: 751,
          impressions: 8619,
          ctr: 8.71,
          cpa: 3.76,
          budgetDaily: 25.00
        },
        {
          id: "g_branding",
          name: "[Acesso][Search] Branding (Deixar 20% da verba)",
          type: "Search",
          status: "ACTIVE",
          spend: 671.48,
          leads: 1188,
          clicks: 3965,
          impressions: 11796,
          ctr: 33.61,
          cpa: 0.57,
          budgetDaily: 23.00
        },
        {
          id: "g_unimed",
          name: "[Acesso][Search] Convênios (UNIMED)",
          type: "Search",
          status: "ACTIVE",
          spend: 443.20,
          leads: 331,
          clicks: 843,
          impressions: 3821,
          ctr: 22.06,
          cpa: 1.34,
          budgetDaily: 15.00
        },
        {
          id: "g_convenios",
          name: "[Acesso][Search] Convênios (DEMAIS CONVÊNIOS)",
          type: "Search",
          status: "ACTIVE",
          spend: 436.79,
          leads: 220,
          clicks: 581,
          impressions: 2724,
          ctr: 21.33,
          cpa: 1.98,
          budgetDaily: 15.00
        }
      ]
    },
    facebook: {
      name:       "Facebook Ads",
      color:      "#F59E0B",
      budgetProj: 1000.00,
      sharePct:   25,
      leadsMeta:  150,
      cplMeta:    6.67,
      budgetReal: 582.09,     // PDF: R$ 582,09
      orcaPct:    58,
      leadsReal:  69,
      leadsExpad: 0,
      cplReal:    8.44,       // PDF: R$ 8,44
      cplBI:      0,
      leadsBI:    0,
      quebraPct:  0,
      metaPct:    46,
      // ============================================================
      // CAMPANHAS Meta (estes vêm da Meta API automaticamente quando
      // a aba Criativos carrega — aqui é só placeholder pro top 5)
      // ============================================================
      campaigns: [
        { id: "m_conv_lp",     name: "Conversões · Landing",    type: "Conversões",  status: "ACTIVE", spend: 245.30, leads: 32, clicks: 412, impressions: 18200 },
        { id: "m_remarketing", name: "Remarketing",              type: "Conversões",  status: "ACTIVE", spend: 156.20, leads: 18, clicks: 235, impressions: 11400 },
        { id: "m_engaj_post",  name: "Engajamento · Posts",     type: "Engajamento", status: "ACTIVE", spend: 98.40,  leads: 11, clicks: 156, impressions: 9800 },
        { id: "m_video_views", name: "Visualizações · Vídeo",   type: "Vídeo",       status: "ACTIVE", spend: 52.10,  leads: 5,  clicks: 88,  impressions: 14500 },
        { id: "m_traffic_inst",name: "Tráfego · Instagram",     type: "Tráfego",     status: "PAUSED", spend: 30.09,  leads: 3,  clicks: 67,  impressions: 5230 }
      ]
    }
  },

  // Dados diários exatos do PDF
  // [data, dia, verbaGoogle, leadsGoogle, leadsExpadGoogle, %quebra, cplGoogleExpad,
  //  verbaFacebook, leadsFacebook, cplFacebook, leadsTotalAcum, %ref, %meta]
  daily: [
    ["01/04", "quarta-feira",     0,    0.00,    0,   0,  2.52,  27.30,  1,  27.30,    1,   3,    0],
    ["02/04", "quinta-feira",     0,    0.00,    0,   0,  1.77,  27.25,  4,   6.81,    5,   6,    1],
    ["03/04", "sexta-feira",      0,    0.00,    0,   0,  3.15,  33.02,  2,  16.51,    7,  10,    1],
    ["04/04", "sábado",      205.86, 163.92,  147, -10,  2.46,  36.64,  5,   7.33,  176,  13,   29],
    ["05/04", "domingo",     172.72, 133.30,   82, -38,  2.52,  34.83,  4,   8.71,  313,  16,   52],
    ["06/04", "segunda-feira",166.33,121.99,   95, -22,  3.33,  30.49,  5,   6.10,  440,  19,   73],
    ["07/04", "terça-feira", 120.42,  94.98,   57, -40,  4.37,  23.27,  4,   5.82,  539,  23,   90],
    ["08/04", "quarta-feira",110.03,  66.98,   59, -12,  2.25,  26.01,  4,   6.50,  610,  26,  102],
    ["09/04", "quinta-feira", 97.24,  51.50,   42, -18,  2.02,  17.46,  0,   0.00,  662,  29,  110],
    ["10/04", "sexta-feira",  82.30,  26.00,   36,  38,  1.48,  26.89,  1,  26.89,  689,  32,  115],
    ["11/04", "sábado",      137.42, 136.01,   79, -42,  2.30,  33.98,  7,   4.85,  832,  35,  139],
    ["12/04", "domingo",     120.08,  99.35,   79, -20,  1.92,  32.42,  1,  32.42,  932,  39,  155],
    ["13/04", "segunda-feira",118.76, 79.98,   84,   5,  3.05,  31.39,  3,  10.46, 1015,  42,  169],
    ["14/04", "terça-feira", 105.65,  57.00,   68,  19,  3.18,  26.28,  4,   6.57, 1076,  45,  179],
    ["15/04", "quarta-feira",114.27,  58.50,   70,  20,  0.88,  24.24,  2,  12.12, 1137,  48,  189],
    ["16/04", "quinta-feira",100.77,  39.33,   59,  50,  1.29,  26.91,  1,  26.91, 1177,  52,  196],
    ["17/04", "sexta-feira",  94.27,  36.00,   42,  17,  2.19,  32.36,  1,  32.36, 1214,  55,  202],
    ["18/04", "sábado",      118.47,  91.49,   75, -18,  2.50,  32.75,  1,  32.75, 1306,  58,  218],
    ["19/04", "domingo",     115.57, 108.17,  110,   2,  2.47,  28.87,  3,   9.62, 1418,  61,  236],
    ["20/04", "segunda-feira",115.78, 74.37,   46, -38,  2.30,  29.73,  4,   7.43, 1496,  65,  249],
    ["21/04", "terça-feira", 112.72, 102.98,   69, -33,  1.63,  23.74,  2,  11.87, 1601,  68,  267],
    ["22/04", "quarta-feira",110.18,  91.46,   70, -23,  1.57,  26.85,  3,   8.95, 1695,  71,  283],
    ["23/04", "quinta-feira", 92.97,  43.00,   31, -28,  3.00,  27.63,  0,   0.00, 1738,  74,  290],
    ["24/04", "sexta-feira",  85.91,  43.50,   27, -38,  3.18,  31.86,  2,  15.93, 1784,  77,  297],
    ["25/04", "sábado",      114.91, 119.03,   76, -36,  1.51,  31.93,  5,   6.39, 1908,  81,  318],
    ["26/04", "domingo",          0,    0.00,    0,   0,  1.84,   0.00,  0,   0.00, 1908,  84,  318],
    ["27/04", "segunda-feira",    0,    0.00,    0,   0,  2.40,   0.00,  0,   0.00, 1908,  87,  318],
    ["28/04", "terça-feira",      0,    0.00,    0,   0,  1.45,   0.00,  0,   0.00, 1908,  90,  318],
    ["29/04", "quarta-feira",     0,    0.00,    0,   0,  0.24,   0.00,  0,   0.00, 1908,  94,  318],
    ["30/04", "quinta-feira",     0,    0.00,    0,   0,  0.00,   0.00,  0,   0.00, 1908,  97,  318],
    ["01/05", "quinta-feira",     0,    0.00,    0,   0,  0.00,   0.00,  0,   0.00, 1908, 100,  318]
  ],

  // Tendência semanal (últimas 2 semanas: 13-19/04 vs 20-26/04)
  weeklyTrend: {
    labels: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
    leads: {
      previous: [83, 61, 60, 40, 37, 92, 111],  // 13-19/04
      current:  [78, 104, 94, 43, 45, 124, 0]   // 20-26/04
    },
    cpl: {
      previous: [3.05, 3.18, 0.88, 1.29, 2.19, 2.50, 2.47],
      current:  [2.30, 1.63, 1.57, 3.00, 3.18, 1.51, 0]
    }
  }
};
