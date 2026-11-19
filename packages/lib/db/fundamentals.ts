// FUNDAMENTOS & EARNINGS — camada plugável. O app NÃO inventa dado: se não houver feed
// configurado, a UI mostra "aguardando feed".
//
// Contrato externo (ver DOCS/10_MODULES/market/02-fundamentals-feed.md):
//   GET {VITE_FUNDAMENTALS_ENDPOINT}?symbols=AAPL,MSFT
//   → { at: ISO, items: Fundamentals[] }
//
// Cache offline-first (6h). Pure normalizers testados em `__tests__/fundamentals.test.ts`.

export interface Fundamentals {
  symbol: string;
  marketCap: number | null;
  peTrailing: number | null;
  peForward: number | null;
  epsTrailing: number | null;
  epsForward: number | null;
  dividendYield: number | null; // fração (0.03 = 3%)
  beta: number | null;
  earningsDate: string | null; // ISO (YYYY-MM-DD)
  revenueGrowth: number | null; // fração
  profitMargin: number | null; // fração
  avgVolume: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

export interface FundamentalFieldDoc {
  key: string;
  label: string;
  aliases: string[];
  unit?: string;
}

export const FUNDAMENTAL_FIELDS: FundamentalFieldDoc[] = [
  { key: 'marketcap', label: 'Market cap', aliases: ['marketcap', 'mcap'] },
  { key: 'pe', label: 'P/L (trailing)', aliases: ['pe', 'pl', 'trailingpe'] },
  { key: 'forwardpe', label: 'P/L forward', aliases: ['forwardpe', 'fwdpe', 'peforward'] },
  { key: 'eps', label: 'EPS (trailing)', aliases: ['eps', 'epstrailing'] },
  { key: 'forwardeps', label: 'EPS forward', aliases: ['forwardeps', 'fwdfeps', 'epforward'] },
  { key: 'divyield', label: 'Dividend yield', aliases: ['divyield', 'dividend', 'dy'], unit: '%' },
  { key: 'beta', label: 'Beta', aliases: ['beta'] },
  { key: 'earningsindays', label: 'Dias até earnings', aliases: ['earningsindays', 'daystoearnings', 'earningstime', 'earnings'] },
  { key: 'revenuegrowth', label: 'Crescimento de receita', aliases: ['revenuegrowth', 'revgrowth'], unit: '%' },
  { key: 'profitmargin', label: 'Margem de lucro', aliases: ['profitmargin', 'margin'], unit: '%' },
  { key: 'avgvolume', label: 'Volume médio (3m)', aliases: ['avgvolume', 'avgvol'] },
  { key: 'high52w', label: 'Máxima 52 semanas', aliases: ['high52w', '52whigh'] },
  { key: 'low52w', label: 'Mínima 52 semanas', aliases: ['low52w', '52wlow'] },
];

export const FUNDAMENTAL_FIELD_KEYS: string[] = FUNDAMENTAL_FIELDS.map((f) => f.key);

export const FUNDAMENTAL_RULE_EXAMPLES: string[] = [
  'pe < 25 AND revenuegrowth > 10',
  'earningsindays <= 7 AND change > 0',
  'divyield > 3 AND profitmargin > 15',
  'marketcap > 10B AND beta < 1.2',
];

function normalizeWordLocal(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const FIELD_ALIASES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const f of FUNDAMENTAL_FIELDS) {
    for (const a of [f.key, ...f.aliases]) map[normalizeWordLocal(a)] = f.key;
  }
  return map;
})();

export function resolveFundamentalField(raw: string): string | null {
  return FIELD_ALIASES[normalizeWordLocal(raw)] ?? null;
}

// ---------------------------------------------------------------------------
// Normalização / valores
// ---------------------------------------------------------------------------

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null) return raw[k];
  }
  return null;
}

export function normalizeFundamentals(raw: unknown): Fundamentals | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const symbol = typeof rec.symbol === 'string' ? rec.symbol.toUpperCase() : null;
  if (!symbol) return null;
  const earnings = pick(rec, 'earningsDate', 'earnings_date', 'earningsTimestamp');
  let earningsDate: string | null = null;
  if (typeof earnings === 'string') earningsDate = earnings.slice(0, 10);
  else if (typeof earnings === 'number' && Number.isFinite(earnings)) earningsDate = new Date(earnings).toISOString().slice(0, 10);

  return {
    symbol,
    marketCap: num(pick(rec, 'marketCap', 'market_cap')),
    peTrailing: num(pick(rec, 'peTrailing', 'pe_trailing', 'trailingPE')),
    peForward: num(pick(rec, 'peForward', 'pe_forward', 'forwardPE')),
    epsTrailing: num(pick(rec, 'epsTrailing', 'eps_trailing')),
    epsForward: num(pick(rec, 'epsForward', 'eps_forward')),
    dividendYield: num(pick(rec, 'dividendYield', 'dividend_yield')),
    beta: num(pick(rec, 'beta')),
    earningsDate,
    revenueGrowth: num(pick(rec, 'revenueGrowth', 'revenue_growth')),
    profitMargin: num(pick(rec, 'profitMargin', 'profit_margin')),
    avgVolume: num(pick(rec, 'avgVolume', 'avg_volume')),
    fiftyTwoWeekHigh: num(pick(rec, 'fiftyTwoWeekHigh', 'fifty_two_week_high')),
    fiftyTwoWeekLow: num(pick(rec, 'fiftyTwoWeekLow', 'fifty_two_week_low')),
  };
}

/** Dias (inteiros, arredondando para cima) até a data de earnings. */
export function daysUntilEarnings(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

/** Valor numérico de um campo de fundamento (unidades de exibição, % em pontos). */
export function fundamentalNumeric(f: Fundamentals, key: string, now: number = Date.now()): number | null {
  switch (key) {
    case 'marketcap': return f.marketCap;
    case 'pe': return f.peTrailing;
    case 'forwardpe': return f.peForward;
    case 'eps': return f.epsTrailing;
    case 'forwardeps': return f.epsForward;
    case 'divyield': return f.dividendYield == null ? null : f.dividendYield * 100;
    case 'beta': return f.beta;
    case 'earningsindays': return daysUntilEarnings(f.earningsDate, now);
    case 'revenuegrowth': return f.revenueGrowth == null ? null : f.revenueGrowth * 100;
    case 'profitmargin': return f.profitMargin == null ? null : f.profitMargin * 100;
    case 'avgvolume': return f.avgVolume;
    case 'high52w': return f.fiftyTwoWeekHigh;
    case 'low52w': return f.fiftyTwoWeekLow;
    default: return null;
  }
}

/** Mapa símbolo → { campoFundamento: valor } para injetar nas regras. */
export function toFundamentalValues(
  items: Map<string, Fundamentals>,
  now: number = Date.now(),
): Map<string, Record<string, number | null>> {
  const out = new Map<string, Record<string, number | null>>();
  for (const [symbol, f] of items) {
    const row: Record<string, number | null> = {};
    for (const key of FUNDAMENTAL_FIELD_KEYS) row[key] = fundamentalNumeric(f, key, now);
    out.set(symbol, row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Feed (plugável) + cache
// ---------------------------------------------------------------------------

export type FundamentalsStatus = 'ok' | 'not_configured' | 'offline';

export interface FundamentalsFetchResult {
  items: Map<string, Fundamentals>;
  at: string | null;
  fromCache: boolean;
  failed: string[];
  status: FundamentalsStatus;
}

export type FundamentalsFeed = (symbols: string[]) => Promise<FundamentalsFetchResult>;

const CACHE_KEY = 'fundamentals:cache:v1';
const ENDPOINT_KEY = 'fundamentals:endpoint:v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function getFundamentalsEndpoint(): string | null {
  const ls = safeLocalStorage();
  try {
    const stored = ls?.getItem(ENDPOINT_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    /* noop */
  }
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env?.VITE_FUNDAMENTALS_ENDPOINT;
    if (env && env.trim()) return env.trim();
  } catch {
    /* noop */
  }
  return null;
}

export function setFundamentalsEndpoint(url: string | null): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    if (url && url.trim()) ls.setItem(ENDPOINT_KEY, url.trim());
    else ls.removeItem(ENDPOINT_KEY);
  } catch {
    /* noop */
  }
}

interface CacheShape {
  at: string;
  items: Fundamentals[];
}

function readCache(): CacheShape | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!Array.isArray(parsed?.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(items: Fundamentals[]): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), items }));
  } catch {
    /* quota/private mode */
  }
}

function cacheToMap(cache: CacheShape, symbols: string[]): Map<string, Fundamentals> {
  const want = new Set(symbols.map((s) => s.toUpperCase()));
  const map = new Map<string, Fundamentals>();
  for (const item of cache.items) {
    if (want.size === 0 || want.has(item.symbol)) map.set(item.symbol, item);
  }
  return map;
}

function isCacheFresh(at: string): boolean {
  const t = Date.parse(at);
  return Number.isFinite(t) && Date.now() - t < CACHE_TTL_MS;
}

function buildUrl(endpoint: string, symbols: string[]): string {
  const sep = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${sep}symbols=${encodeURIComponent(symbols.join(','))}`;
}

/**
 * Busca fundamentos do endpoint configurado. Sem endpoint → `not_configured` (usa cache se
 * houver). Em falha → cache (`offline`). Nunca lança.
 */
export async function fetchFundamentals(
  symbols: string[],
  opts: { endpoint?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<FundamentalsFetchResult> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const endpoint = opts.endpoint ?? getFundamentalsEndpoint();
  const cache = readCache();
  const cachedForSymbols = cache ? cacheToMap(cache, wanted) : new Map<string, Fundamentals>();

  if (!endpoint) {
    return {
      items: cachedForSymbols,
      at: cache?.at ?? null,
      fromCache: cachedForSymbols.size > 0,
      failed: cachedForSymbols.size > 0 ? [] : wanted,
      status: 'not_configured',
    };
  }

  const fetchImpl = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) {
    return { items: cachedForSymbols, at: cache?.at ?? null, fromCache: cachedForSymbols.size > 0, failed: wanted, status: 'offline' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetchImpl(buildUrl(endpoint, wanted), { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { at?: string; items?: unknown } | unknown[];
    const rawItems = Array.isArray(json) ? json : Array.isArray((json as { items?: unknown }).items) ? (json as { items: unknown[] }).items : [];
    const items = rawItems.map(normalizeFundamentals).filter((f): f is Fundamentals => !!f);
    if (items.length === 0) throw new Error('feed vazio');

    const merged = new Map<string, Fundamentals>(cachedForSymbols);
    for (const f of items) merged.set(f.symbol, f);
    writeCache([...merged.values()]);

    const at = Array.isArray(json) ? new Date().toISOString() : ((json as { at?: string }).at ?? new Date().toISOString());
    const got = new Set(items.map((f) => f.symbol));
    return {
      items: merged,
      at,
      fromCache: false,
      failed: wanted.filter((s) => !got.has(s)),
      status: 'ok',
    };
  } catch {
    return {
      items: cachedForSymbols,
      at: cache?.at ?? null,
      fromCache: true,
      failed: wanted.filter((s) => !cachedForSymbols.has(s)),
      status: 'offline',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function clearFundamentalsCache(): void {
  const ls = safeLocalStorage();
  try {
    ls?.removeItem(CACHE_KEY);
  } catch {
    /* noop */
  }
}

export { CACHE_TTL_MS as FUNDAMENTALS_CACHE_TTL_MS };
