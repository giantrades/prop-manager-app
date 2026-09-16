// P1 — priceService (borda de mercado). Busca cotações AO VIVO sem depender do
// Quantower (investimentos são independentes): Brapi para B3, CoinGecko para cripto.
// Preços em BRL. Com cache offline (memória + localStorage) e timeout.
// NUNCA escreve saldo: aplicar preço é via WealthService.markPosition (P3).
// Fórmulas ficam no motor (computePortfolio). Mobile: badge live/stale via `at`.
//
// Fonte: DOCS/10_MODULES/portfolio/00-spec.md (P1–P3).

import type { DataService } from './DataService';
import type { Position } from './types';

export interface Quote {
  symbol: string; // normalizado (upper, sem sufixo)
  price: number; // na moeda `currency`, > 0
  currency: 'BRL' | 'USD';
  source: 'brapi' | 'coingecko' | 'yahoo';
  at: string; // ISO do fetch bem-sucedido
}

export interface RefreshResult {
  quotes: Map<string, Quote>;
  failed: string[]; // símbolos sem preço nem cache
  fromCache: string[]; // símbolos servidos do cache (offline/stale)
}

const BRAPI_URL = 'https://brapi.dev/api/quote/';
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_KEY = 'pricecache-v1';
export const PRICE_TIMEOUT_MS = 8000;
// A7 — cooldown após falha (não martelar rate-limit): 2min base, dobra a cada
// falha consecutiva (cap 30min). Por símbolo, em memória.
const COOLDOWN_BASE_MS = 2 * 60 * 1000;
const COOLDOWN_MAX_MS = 30 * 60 * 1000;
const failState = new Map<string, { fails: number; nextRetryAt: number }>();

function envBrapiToken(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> })?.env;
    return env?.VITE_BRAPI_TOKEN || '';
  } catch {
    return '';
  }
}

function cooldownLeftMs(symbol: string, now = Date.now()): number {
  const st = failState.get(symbol);
  if (!st) return 0;
  return Math.max(0, st.nextRetryAt - now);
}

function noteFailure(symbol: string, now = Date.now()): void {
  const prev = failState.get(symbol)?.fails ?? 0;
  const fails = prev + 1;
  const wait = Math.min(COOLDOWN_MAX_MS, COOLDOWN_BASE_MS * 2 ** Math.min(fails - 1, 4));
  failState.set(symbol, { fails, nextRetryAt: now + wait });
}

function noteSuccess(symbol: string): void {
  failState.delete(symbol);
}

/** Limpa o estado de backoff (testes). */
export function clearPriceBackoff(): void {
  failState.clear();
}

/** Mapa cripto (símbolo base -> id CoinGecko). Fora daqui = tenta Brapi (B3). */
const CRYPTO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  SOL: 'solana',
  BNB: 'binancecoin',
  XRP: 'xrp',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  DOT: 'polkadot',
  LTC: 'litecoin',
};

export function normalizeSymbol(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\.SA$/, '')
    .replace(/[-/]?(BRL|USD|USDT)$/, (m) => (m.length > 4 ? '' : m));
}

export function routeSymbol(symbol: string): { source: 'brapi' | 'coingecko' | 'yahoo'; query: string } {
  // A6 — sufixo .US força Yahoo (ações americanas). Ex.: AAPL.US
  const raw = String(symbol || '').trim().toUpperCase();
  if (/\.US$/.test(raw)) {
    return { source: 'yahoo', query: raw.replace(/\.US$/, '') };
  }
  const base = normalizeSymbol(symbol).replace(/[-/].*$/, '');
  const id = CRYPTO_IDS[base];
  if (id) return { source: 'coingecko', query: id };
  return { source: 'brapi', query: base };
}

function envYahooProxy(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> })?.env;
    if (env?.VITE_YAHOO_PROXY) return env.VITE_YAHOO_PROXY;
  } catch {
    /* noop */
  }
  return '/.netlify/functions/yahoo-quote';
}

async function fetchYahoo(
  ticker: string,
  fetchImpl: FetchImpl,
  timeoutMs: number,
  proxyUrl?: string,
): Promise<{ price: number; currency: 'BRL' | 'USD' }> {
  const base = proxyUrl || envYahooProxy();
  const sep = base.includes('?') ? '&' : '?';
  const json = (await fetchJson(`${base}${sep}symbol=${encodeURIComponent(ticker)}`, fetchImpl, timeoutMs)) as {
    price?: number;
    currency?: string;
    error?: string;
  };
  if (json?.error) throw new Error(`Yahoo proxy: ${json.error}`);
  const price = json?.price;
  if (typeof price !== 'number' || !(price > 0)) throw new Error(`Yahoo sem preço para ${ticker}`);
  const currency = String(json?.currency || 'USD').toUpperCase() === 'BRL' ? 'BRL' : 'USD';
  return { price, currency };
}

/** Converte um ticker do app para o formato do Yahoo (BR vira `.SA`, US tira `.US`). */
export function yahooSymbol(ticker: string): string {
  const raw = String(ticker || '').trim().toUpperCase();
  if (raw.endsWith('.US')) return raw.slice(0, -3);
  if (raw.endsWith('.SA')) return raw;
  // B3: PETR4, VALE3, ITUB4, BOVA11, HGLG11...
  if (/^[A-Z]{4}\d{1,2}$/.test(raw)) return `${raw}.SA`;
  return raw;
}

export interface YahooDividendEvent { date: string; amount: number; }

/**
 * #4 — Histórico de proventos via Yahoo (proxy CORS). Retorna eventos passados
 * (data-com + valor por ação). NÃO traz o próximo data-com (Yahoo exige crumb).
 */
export async function fetchDividendEvents(
  ticker: string,
  fetchImpl: FetchImpl = defaultFetch(),
  timeoutMs = 8000,
  proxyUrl?: string,
): Promise<YahooDividendEvent[]> {
  const base = proxyUrl || envYahooProxy();
  const sep = base.includes('?') ? '&' : '?';
  const json = (await fetchJson(
    `${base}${sep}type=dividends&symbol=${encodeURIComponent(yahooSymbol(ticker))}`,
    fetchImpl,
    timeoutMs,
  )) as { events?: YahooDividendEvent[]; error?: string };
  if (json?.error) throw new Error(`Yahoo proxy: ${json.error}`);
  return Array.isArray(json?.events) ? json.events : [];
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

function defaultFetch(): FetchImpl {
  const g = globalThis as { fetch?: FetchImpl };
  if (!g.fetch) throw new Error('fetch indisponível neste ambiente');
  return g.fetch.bind(globalThis);
}

async function fetchJson(url: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Race explícito: nem todo fetch respeita AbortSignal a tempo (ex.: rede presa).
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`timeout após ${timeoutMs}ms: ${url}`));
    }, timeoutMs);
  });
  try {
    const res = (await Promise.race([fetchImpl(url, { signal: ctrl.signal }), timeout])) as Response;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchBrapi(
  ticker: string,
  fetchImpl: FetchImpl,
  timeoutMs: number,
  token?: string,
): Promise<number> {
  const t = token || envBrapiToken();
  const url = `${BRAPI_URL}${encodeURIComponent(ticker)}${t ? `?token=${encodeURIComponent(t)}` : ''}`;
  const json = (await fetchJson(url, fetchImpl, timeoutMs)) as {
    results?: Array<{ regularMarketPrice?: number }>;
  };
  const price = json?.results?.[0]?.regularMarketPrice;
  if (typeof price !== 'number' || !(price > 0)) throw new Error(`Brapi sem preço para ${ticker}`);
  return price;
}

async function fetchCoingecko(id: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<number> {
  const json = (await fetchJson(
    `${COINGECKO_URL}?ids=${encodeURIComponent(id)}&vs_currencies=brl`,
    fetchImpl,
    timeoutMs,
  )) as Record<string, { brl?: number }>;
  const price = json?.[id]?.brl;
  if (typeof price !== 'number' || !(price > 0)) throw new Error(`CoinGecko sem preço para ${id}`);
  return price;
}

// ---- cache offline (memória + localStorage) ----

const memCache = new Map<string, Quote>();

function readDiskCache(): Record<string, Quote> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Quote>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDiskCache(symbol: string, quote: Quote): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const all = readDiskCache();
    all[symbol] = quote;
    const keys = Object.keys(all);
    if (keys.length > 200) {
      for (const k of keys.slice(0, keys.length - 200)) delete all[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* quota cheia ou indisponível: mantém só memória */
  }
}

export function getCached(symbol: string): Quote | null {
  const key = normalizeSymbol(symbol);
  return memCache.get(key) ?? readDiskCache()[key] ?? null;
}

function storeQuote(quote: Quote): void {
  memCache.set(quote.symbol, quote);
  writeDiskCache(quote.symbol, quote);
}

export function clearPriceCache(): void {
  memCache.clear();
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// A2 — alertas de preço. Avalia `Position.alerts` contra cotações frescas;
// dispara 1x por travessia até rearme manual. Sem spam: id já disparado ignora.
// ---------------------------------------------------------------------------

export interface PriceAlertHit {
  positionId: string;
  symbol: string;
  alertId: string;
  dir: 'above' | 'below';
  price: number;
  current: number;
}

const FIRED_ALERTS_KEY = 'price:alerts:fired';

export interface FiredAlert extends PriceAlertHit {
  firedAt: string;
}

/**
 * Avalia os alertas de UMA posição contra um preço (já na moeda da posição).
 * Ignora ids em `firedIds` (dispara 1x até rearme).
 */
export function evalAlertsForPrice(
  position: Pick<Position, 'id' | 'symbol' | 'alerts'>,
  price: number,
  firedIds: string[] = [],
): PriceAlertHit[] {
  if (!(price > 0)) return [];
  const fired = new Set(firedIds);
  const hits: PriceAlertHit[] = [];
  for (const a of position.alerts ?? []) {
    if (!a || typeof a.price !== 'number' || !(a.price > 0)) continue;
    if (fired.has(a.id)) continue;
    const hit = a.dir === 'above' ? price >= a.price : price <= a.price;
    if (hit) hits.push({ positionId: position.id, symbol: position.symbol, alertId: a.id, dir: a.dir, price: a.price, current: price });
  }
  return hits;
}

/**
 * Avalia alertas contra as cotações (ignora ids em `firedIds`).
 * `quotes`: mapa símbolo normalizado -> preço na MESMA unidade de comparação
 * (chamador converte se preciso; PortfolioPage passa preço já na moeda da posição).
 */
export function checkPriceAlerts(
  positions: Array<Pick<Position, 'id' | 'symbol' | 'alerts'>>,
  quotes: Map<string, number>,
  firedIds: string[] = [],
): PriceAlertHit[] {
  const hits: PriceAlertHit[] = [];
  for (const p of positions) {
    const current = quotes.get(normalizeSymbol(p.symbol));
    if (current == null) continue;
    hits.push(...evalAlertsForPrice(p, current, firedIds));
  }
  return hits;
}

export async function getFiredAlerts(ds: DataService): Promise<FiredAlert[]> {
  const rec = await ds.meta.getKey(FIRED_ALERTS_KEY);
  const v = rec?.value;
  return Array.isArray(v) ? (v as FiredAlert[]) : [];
}

export async function markAlertFired(ds: DataService, hit: PriceAlertHit): Promise<void> {
  const fired = await getFiredAlerts(ds);
  if (fired.some((f) => f.alertId === hit.alertId)) return;
  await ds.meta.setKey(FIRED_ALERTS_KEY, [...fired, { ...hit, firedAt: new Date().toISOString() }]);
}

/** Rearme manual: o alerta volta a poder disparar (sem apagar a definição). */
export async function rearmAlert(ds: DataService, alertId: string): Promise<void> {
  const fired = await getFiredAlerts(ds);
  await ds.meta.setKey(
    FIRED_ALERTS_KEY,
    fired.filter((f) => f.alertId !== alertId),
  );
}

/** Busca 1 cotação (live; em falha, tenta cache e relança se não houver). */
export async function getQuote(
  symbol: string,
  opts: { fetchImpl?: FetchImpl; timeoutMs?: number; token?: string; proxyUrl?: string } = {},
): Promise<Quote> {
  const key = normalizeSymbol(symbol);
  if (!key) throw new Error('símbolo vazio');
  const fetchImpl = opts.fetchImpl ?? defaultFetch();
  const timeoutMs = opts.timeoutMs ?? PRICE_TIMEOUT_MS;
  const { source, query } = routeSymbol(symbol);
  try {
    let price: number;
    let currency: 'BRL' | 'USD' = 'BRL';
    if (source === 'brapi') {
      price = await fetchBrapi(query, fetchImpl, timeoutMs, opts.token);
    } else if (source === 'yahoo') {
      const y = await fetchYahoo(query, fetchImpl, timeoutMs, opts.proxyUrl);
      price = y.price;
      currency = y.currency;
    } else {
      price = await fetchCoingecko(query, fetchImpl, timeoutMs);
    }
    const quote: Quote = { symbol: key, price, currency, source, at: new Date().toISOString() };
    storeQuote(quote);
    noteSuccess(key);
    return quote;
  } catch (err) {
    noteFailure(key);
    const cached = getCached(key);
    if (cached) return cached;
    throw err;
  }
}

/**
 * Atualiza vários símbolos (tolerante: um falha não derruba os outros).
 * A7 — respeita cooldown: símbolo em backoff serve cache (fromCache) ou conta
 * como failed sem chamada de rede.
 */
export async function refreshQuotes(
  symbols: string[],
  opts: { fetchImpl?: FetchImpl; timeoutMs?: number; token?: string } = {},
): Promise<RefreshResult> {
  const quotes = new Map<string, Quote>();
  const failed: string[] = [];
  const fromCache: string[] = [];
  const unique = [...new Set(symbols.map(normalizeSymbol).filter(Boolean))];
  await Promise.all(unique.map(async (symbol) => {
    const before = getCached(symbol);
    try {
      // Em cooldown: nem tenta a rede — serve cache ou conta como failed.
      if (cooldownLeftMs(symbol) > 0) {
        if (before) {
          quotes.set(symbol, before);
          fromCache.push(symbol);
        } else {
          failed.push(symbol);
        }
        return;
      }
      const q = await getQuote(symbol, opts);
      quotes.set(symbol, q);
      if (before && q.at === before.at) fromCache.push(symbol);
    } catch {
      failed.push(symbol);
    }
  }));
  return { quotes, failed, fromCache };
}
