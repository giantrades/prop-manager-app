// A6 — Proxy CORS para Yahoo Finance (ações US + dividendos BR/US).
// Browser não pode chamar query1.finance.yahoo.com direto (CORS bloqueado).
// Endpoints:
//   GET ...?symbol=AAPL                -> { symbol, price, currency, at }
//   GET ...?type=dividends&symbol=X    -> { symbol, events:[{date,amount}], at }
// Deploy automático com o site (dir netlify/functions). Cache de 60s no CDN.
//
// Nota honesta: `events=div` do chart dá o HISTÓRICO de proventos (datas passadas);
// o próximo data-com (`quoteSummary`) exige crumb/cookie e responde 401 sem sessão.

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; currency?: string; symbol?: string };
      events?: { dividends?: Record<string, { amount?: number; date?: number }> };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

async function fetchChart(symbol: string, range: string, events?: string): Promise<YahooChart> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const ev = events ? `&events=${encodeURIComponent(events)}` : '';
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}${ev}`,
      {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceOS/1.0)' },
      },
    );
    if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
    return (await res.json()) as YahooChart;
  } finally {
    clearTimeout(timer);
  }
}

export const handler = async (event: { queryStringParameters?: Record<string, string> }) => {
  const symbol = (event.queryStringParameters?.symbol || '').trim().toUpperCase();
  const type = event.queryStringParameters?.type || 'quote';
  if (!symbol || !/^[A-Z0-9.\-=^]+$/.test(symbol)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'symbol inválido' }),
    };
  }
  try {
    if (type === 'dividends') {
      const json = await fetchChart(symbol, '2y', 'div');
      const divs = json?.chart?.result?.[0]?.events?.dividends ?? {};
      const events = Object.values(divs)
        .map((d) => ({
          date: d?.date ? new Date(d.date * 1000).toISOString().slice(0, 10) : null,
          amount: typeof d?.amount === 'number' ? d.amount : null,
        }))
        .filter((e) => e.date && e.amount != null)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600' },
        body: JSON.stringify({ symbol, events, at: new Date().toISOString() }),
      };
    }

    const json = await fetchChart(symbol, '1d');
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
