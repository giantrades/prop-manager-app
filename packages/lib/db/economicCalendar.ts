// STAGE 6 — economicCalendar. Overlay econômico (FOMC/CPI) via API free (sem key).
// Best-effort + offline-first: em falha, usa o último fetch cacheado (localStorage).
// NUNCA inventa evento — se a API estiver indisponível, a UI mostra "sem conexão".
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Financial Calendar — overlay econômico).

/** Evento econômico normalizado. */
export interface EconomicEvent {
  id: string;
  source: string;
  eventName: string;
  importance: 'high' | 'med' | 'low';
  scheduledAt: string; // ISO 8601 UTC
  periodLabel?: string | null;
  previous?: string | null;
  actual?: string | null;
}

export interface EconomicCalendarOptions {
  /** Endpoint base da API free. Default: xoomar (sem key). */
  baseUrl?: string;
  /** Cache key prefix (permite versionar). */
  cacheKey?: string;
}

const DEFAULT_BASE = 'https://xoomar.com/api/markets/calendar';
const CACHE_PREFIX = 'econ:calendar:';

function cacheKeyFor(from: string, to: string, cacheKey?: string): string {
  return `${CACHE_PREFIX}${cacheKey ?? 'v1'}:${from}:${to}`;
}

function readCache(from: string, to: string, cacheKey?: string): EconomicEvent[] | null {
  try {
    const raw = localStorage.getItem(cacheKeyFor(from, to, cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.data)) return parsed.data as EconomicEvent[];
    return null;
  } catch {
    return null;
  }
}

function writeCache(from: string, to: string, data: EconomicEvent[], cacheKey?: string): void {
  try {
    localStorage.setItem(cacheKeyFor(from, to, cacheKey), JSON.stringify({ data, at: new Date().toISOString() }));
  } catch {
    // quota cheia / private mode — ignora, não quebra o app.
  }
}

function normalize(raw: unknown): EconomicEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: EconomicEvent[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const scheduledAt = typeof rec.scheduledAt === 'string' ? rec.scheduledAt : null;
    const eventName = typeof rec.eventName === 'string' ? rec.eventName : null;
    if (!scheduledAt || !eventName) continue;
    const importance =
      rec.importance === 'high' || rec.importance === 'med' || rec.importance === 'low' ? rec.importance : 'med';
    out.push({
      id: `${eventName}:${scheduledAt}`,
      source: typeof rec.source === 'string' ? rec.source : 'unknown',
      eventName,
      importance,
      scheduledAt,
      periodLabel: typeof rec.periodLabel === 'string' ? rec.periodLabel : null,
      previous: typeof rec.previous === 'string' ? rec.previous : null,
      actual: typeof rec.actual === 'string' ? rec.actual : null,
    });
  }
  return out;
}

/**
 * Busca eventos econômicos no intervalo [from, to] (YYYY-MM-DD). Em falha de rede,
 * retorna o cache; se não houver cache, lança (a UI mostra estado offline).
 */
export async function fetchEconomicEvents(
  from: string,
  to: string,
  opts: EconomicCalendarOptions = {},
): Promise<EconomicEvent[]> {
  const base = opts.baseUrl ?? DEFAULT_BASE;
  const url = `${base}?from=${from}&to=${to}&importance=high`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = normalize((json as { data?: unknown }).data);
    writeCache(from, to, data, opts.cacheKey);
    return data;
  } catch (err) {
    const cached = readCache(from, to, opts.cacheKey);
    if (cached) return cached;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Intervalo [início, fim] do mês em "YYYY-MM-DD" (inclusive). */
export function monthRange(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
