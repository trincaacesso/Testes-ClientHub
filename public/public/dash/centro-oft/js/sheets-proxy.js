/* =====================================================
   NETLIFY FUNCTION · sheets-proxy
   Proxy serverless para a Google Sheets API.
   A API Key é lida das variáveis de ambiente do Netlify
   e NUNCA é exposta ao navegador do cliente.

   Endpoint público: /api/sheets  (via redirect do netlify.toml)
   Endpoint real:    /.netlify/functions/sheets-proxy
   ===================================================== */

exports.handler = async (event) => {
  // ===== CORS =====
  // Em produção o Netlify expõe a URL do site em process.env.URL
  // (ex: https://centro-oftalmologico.netlify.app)
  const ALLOWED_ORIGIN = process.env.URL || "*";

  const headers = {
    "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  };

  // Preflight CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  // Só aceita GET
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Método não permitido" })
    };
  }

  // ===== Lê variáveis de ambiente do Netlify =====
  const API_KEY    = process.env.GOOGLE_SHEETS_API_KEY;
  const SHEET_ID   = process.env.GOOGLE_SHEETS_ID;
  const SHEET_NAME = process.env.GOOGLE_SHEETS_NAME  || "Diário + Performance";
  const RANGE     = process.env.GOOGLE_SHEETS_RANGE || "A1:Z200";

  // Valida env vars críticas
  if (!API_KEY || !SHEET_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Configuração incompleta no Netlify",
        missing: [
          !API_KEY  && "GOOGLE_SHEETS_API_KEY",
          !SHEET_ID && "GOOGLE_SHEETS_ID"
        ].filter(Boolean),
        hint: "Configure em Site settings → Environment variables"
      })
    };
  }

  // ===== Monta URL para a Google Sheets API =====
  // Permite override do range via query string (?range=A1:M50)
  const range = (event.queryStringParameters && event.queryStringParameters.range) || RANGE;
  const fullRange = encodeURIComponent(`${SHEET_NAME}!${range}`);
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${fullRange}?key=${API_KEY}`;

  // ===== Chama a API =====
  try {
    const response = await fetch(sheetsUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[sheets-proxy] API erro", response.status, errorText.substring(0, 200));

      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: `Google Sheets API retornou ${response.status}`,
          detail: errorText.substring(0, 500),
          hint: response.status === 403
            ? "Verifique se a planilha está pública e se a API Key tem acesso à Sheets API"
            : response.status === 404
            ? "Planilha ou aba não encontrada. Confira GOOGLE_SHEETS_ID e GOOGLE_SHEETS_NAME"
            : null
        })
      };
    }

    const data = await response.json();

    // ===== Cache no CDN do Netlify =====
    // 5 minutos no edge, reduz custo de invocações da function
    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Cache-Control": "public, max-age=300, s-maxage=300"
      },
      body: JSON.stringify({
        ...data,
        _meta: {
          fetchedAt: new Date().toISOString(),
          sheetName: SHEET_NAME,
          range:     range,
          rowsCount: (data.values || []).length
        }
      })
    };
  } catch (err) {
    console.error("[sheets-proxy] Falha:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error:  "Falha ao chamar Google Sheets API",
        detail: err.message
      })
    };
  }
};
