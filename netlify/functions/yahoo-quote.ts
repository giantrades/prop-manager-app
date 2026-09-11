// A6 — Proxy CORS para Yahoo Finance (ações US).
// Browser não pode chamar query1.finance.yahoo.com direto (CORS bloqueado).
// Endpoint: GET /.netlify/functions/yahoo-quote?symbol=AAPL
// Resposta: { symbol, price, currency, at } — preço na moeda do ativo (geralmente USD).
// Deploy automático com o site (dir netlify/functions). Cache de 60s no CDN.

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; currency?: string; symbol?: string };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

export const handler = async (event: { queryStringParameters?: Record<string, string> }) => {
  const symbol = (event.queryStringParameters?.symbol || '').trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.\-=^]+$/.test(symbol)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'symbol inválido' }),
    };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceOS/1.0)' },
        },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Yahoo HTTP ${res.status}` }),
      };
    }
    const json = (await res.json()) as YahooChart;
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== 'number' || !(price > 0)) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Yahoo sem preço para ${symbol}` }),
      };
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' },
      body: JSON.stringify({
        symbol,
        price,
        currency: meta?.currency || 'USD',
        at: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err instanceof Error ? err.message : 'proxy error' }),
    };
  }
};
