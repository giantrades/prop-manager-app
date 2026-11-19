// A6 — Proxy CORS para Yahoo Finance.
//
// 2 modos (o legado segue intacto — usado por priceService):
//  1) SINGLE (legado): GET /.netlify/functions/yahoo-quote?symbol=AAPL
//     Resposta: { symbol, price, currency, at }
//  2) BATCH (Market module): GET /.netlify/functions/yahoo-quote?symbols=AAPL,MSFT,...&range=5d&interval=1d
//     Resposta: { at, quotes: [{ symbol, price, previousClose, change, changePct,
//                  currency, name, exchange, volume, marketTime, series: [[ts, close], ...] }] }
//
// O browser não pode chamar query1.finance.yahoo.com direto (CORS bloqueado).
// Deploy automático com o site (dir netlify/functions). Cache curto no CDN.

interface YahooChartResult {
  meta?: {
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    currency?: string;
    exchangeName?: string;
    shortName?: string;
    longName?: string;
    regularMarketVolume?: number;
    regularMarketTime?: number;
  };
  timestamp?: number[];
  indicators?: { quote?: Array<{ close?: Array<number | null> }> };
}

interface YahooChart {
  chart?: {
    result?: YahooChartResult[];
    error?: { code?: string; description?: string } | null;
  };
}

interface BatchQuote {
  symbol: string;
  price: number;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  currency: string;
  name: string | null;
  exchange: string | null;
  volume: number | null;
  marketTime: number | null;
  series: Array<[number, number]>;
}

const SYMBOL_RE = /^[A-Z0-9.\-=^]{1,24}$/;
const RANGE_WHITELIST = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'ytd', 'max']);
const INTERVAL_WHITELIST = new Set(['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo']);

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(statusCode: number, body: unknown, cacheSeconds = 60) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, 'Cache-Control': `public, s-maxage=${cacheSeconds}` },
    body: JSON.stringify(body),
  };
}

async function fetchChart(symbol: string, range: string, interval: string): Promise<YahooChartResult | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
      { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FinanceOS/1.0)' } },
    );
    if (!res.ok) return null;
    const parsed = (await res.json()) as YahooChart;
    return parsed?.chart?.result?.[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildSeries(result: YahooChartResult): Array<[number, number]> {
  const ts = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i < ts.length; i += 1) {
    const c = closes[i];
    if (typeof c === 'number' && Number.isFinite(c)) out.push([ts[i] * 1000, c]);
  }
  return out;
}

function buildQuote(symbol: string, result: YahooChartResult | null): BatchQuote | null {
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== 'number' || !(price > 0)) return null;
  const prevRaw = meta?.previousClose ?? meta?.chartPreviousClose;
  const previousClose = typeof prevRaw === 'number' && prevRaw > 0 ? prevRaw : null;
  const change = previousClose != null ? price - previousClose : null;
  const changePct = previousClose != null && previousClose !== 0 ? (price - previousClose) / previousClose : null;
  return {
    symbol,
    price,
    previousClose,
    change,
    changePct,
    currency: meta?.currency || 'USD',
    name: meta?.shortName || meta?.longName || null,
    exchange: meta?.exchangeName || null,
    volume: typeof meta?.regularMarketVolume === 'number' ? meta.regularMarketVolume : null,
    marketTime: typeof meta?.regularMarketTime === 'number' ? meta.regularMarketTime * 1000 : null,
    series: buildSeries(result),
  };
}

/** Roda tarefas com concorrência limitada (evita rajada que o Yahoo bloqueia). */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx;
      idx += 1;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export const handler = async (event: { queryStringParameters?: Record<string, string> }) => {
  const qs = event.queryStringParameters ?? {};
  const rawSymbol = (qs.symbol || '').trim().toUpperCase();
  const rawSymbols = (qs.symbols || '').trim().toUpperCase();
  const range = RANGE_WHITELIST.has(qs.range || '') ? (qs.range as string) : '1d';
  const interval = INTERVAL_WHITELIST.has(qs.interval || '') ? (qs.interval as string) : '5m';

  // ---- BATCH ----
  if (rawSymbols) {
    const symbols = [...new Set(rawSymbols.split(',').map((s) => s.trim()).filter(Boolean))];
    if (symbols.length === 0 || symbols.length > 80 || symbols.some((s) => !SYMBOL_RE.test(s))) {
      return json(400, { error: 'symbols inválidos (1–80 símbolos A-Z0-9.-=^)' });
    }
    const results = await pool(symbols, 10, async (sym) => buildQuote(sym, await fetchChart(sym, range, interval)));
    const quotes = results.filter((q): q is BatchQuote => q != null);
    // cache curto no CDN: intraday muda; diário pode cachear mais.
    const ttl = interval.includes('m') || interval === '1h' ? 30 : 300;
    return json(200, { at: new Date().toISOString(), range, interval, quotes }, ttl);
  }

  // ---- SINGLE (legado) ----
  if (!rawSymbol || !SYMBOL_RE.test(rawSymbol)) {
    return json(400, { error: 'symbol inválido' });
  }
  const result = await fetchChart(rawSymbol, '1d', '1d');
  const meta = result?.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== 'number' || !(price > 0)) {
    return json(502, { error: `Yahoo sem preço para ${rawSymbol}` });
  }
  return json(200, { symbol: rawSymbol, price, currency: meta?.currency || 'USD', at: new Date().toISOString() });
};
