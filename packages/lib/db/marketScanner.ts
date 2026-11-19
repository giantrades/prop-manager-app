// SCANNER — motor do screener configurável. READ-ONLY. Reusa o universo do Market
// (`CONSTITUENTS`, `SECTORS`, cestas) e compartilha o MESMO fetch (`MARKET_FULL_SYMBOLS`,
// chave 'market') — trocar entre Market e Scanner é instantâneo.
//
// Dados disponíveis por símbolo: preço, variação do dia, volume e série de closes (5d)
// → variação/high/low de 5d. Sem open/gap/RVOL (o feed grátis não traz isso por barra).
//
// Fonte: DOCS/10_MODULES/market/00-spec.md.

import type { MarketQuote } from './marketData';
import { CONSTITUENTS, SECTORS } from './marketData';
import { BASKET_SYMBOLS } from './marketBaskets';
import { parseRule, evaluateRule, numericFieldValue, isBuiltinNumericField } from './screenerRules';
import { customFieldIds, evaluateExpr, type CustomFieldCompiled } from './customFields';

const CONSTITUENT_MAP = new Map(CONSTITUENTS.map((c) => [c.symbol, c]));
const SECTOR_LABEL = new Map(SECTORS.map((s) => [s.id, s.label]));

export type ScreenerUniverse = 'stocks' | 'sectors' | 'baskets' | 'all';
export type ScreenerDirection = 'all' | 'up' | 'down';
export type ScreenerSort =
  | 'changePct'
  | 'change5d'
  | 'absChange'
  | 'volume'
  | 'price'
  | 'offHigh5d'
  | 'offLow5d';

export interface ScreenerFilters {
  universe: ScreenerUniverse;
  sector: string; // 'all' | SectorDef.id
  direction: ScreenerDirection;
  minChangePct: number | null; // fração (0.02 = +2%)
  maxChangePct: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  minVolume: number | null;
  query: string;
  rules: string; // linguagem de regras (screenerRules.ts); vazio = sem regra
  fundamentalRules: string; // regra separada de fundamentos/earnings; vazio = sem regra
  sortBy: ScreenerSort;
  sortDir: 'asc' | 'desc';
  limit: number;
}

export const DEFAULT_SCREENER_FILTERS: ScreenerFilters = {
  universe: 'stocks',
  sector: 'all',
  direction: 'all',
  minChangePct: null,
  maxChangePct: null,
  minPrice: null,
  maxPrice: null,
  minVolume: null,
  query: '',
  rules: '',
  fundamentalRules: '',
  sortBy: 'changePct',
  sortDir: 'desc',
  limit: 60,
};

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string;
  sectorId: string;
  price: number;
  changePct: number;
  change5d: number | null;
  high5d: number | null;
  low5d: number | null;
  offHigh5d: number | null; // 0 = no topo de 5d
  offLow5d: number | null; // 0 = no fundo de 5d
  volume: number | null;
  /** Campos numéricos extras (fundamentos + personalizados). */
  extra?: Record<string, number | null>;
}

export interface ScreenerResult {
  rows: ScreenerRow[];
  matched: number; // após filtros, antes do limite
  universeTotal: number;
  withData: number; // símbolos do universo com cotação
  ruleError: string | null; // erro de sintaxe da regra principal (regra ignorada)
  fundamentalRuleError: string | null; // erro de sintaxe da regra de fundamentos
}

export interface ScreenerExtras {
  /** Campos personalizados já compilados. */
  customFields?: CustomFieldCompiled[];
  /** Valores de fundamentos por símbolo (chaves de FUNDAMENTAL_FIELDS). */
  fundamentalValues?: Map<string, Record<string, number | null>>;
  /** Chaves de fundamentos disponíveis para a regra separada. */
  fundamentalFields?: string[];
}

export type ScreenerPreset = 'reset' | 'gainers' | 'losers' | 'volume' | 'movers' | 'nearHigh' | 'nearLow';

export const SCREENER_PRESETS: { id: ScreenerPreset; label: string }[] = [
  { id: 'gainers', label: 'Gainers' },
  { id: 'losers', label: 'Losers' },
  { id: 'volume', label: 'Volume' },
  { id: 'movers', label: 'Movers' },
  { id: 'nearHigh', label: 'Near 5d high' },
  { id: 'nearLow', label: 'Near 5d low' },
  { id: 'reset', label: 'Limpar' },
];

function universeSymbols(universe: ScreenerUniverse): string[] {
  const stocks = CONSTITUENTS.map((c) => c.symbol);
  const sectors = SECTORS.map((s) => s.etf);
  if (universe === 'sectors') return [...new Set(sectors)];
  if (universe === 'baskets') return [...new Set(BASKET_SYMBOLS)];
  if (universe === 'all') return [...new Set([...stocks, ...sectors, ...BASKET_SYMBOLS])];
  return [...new Set(stocks)];
}

interface SeriesStats {
  change5d: number | null;
  high5d: number | null;
  low5d: number | null;
  offHigh5d: number | null;
  offLow5d: number | null;
}

function seriesStats(series: Array<[number, number]> | undefined, price: number): SeriesStats {
  const closes = (series ?? []).map((p) => p[1]).filter((c) => Number.isFinite(c));
  if (closes.length < 2) {
    return { change5d: null, high5d: null, low5d: null, offHigh5d: null, offLow5d: null };
  }
  const first = closes[0];
  const high = Math.max(...closes);
  const low = Math.min(...closes);
  return {
    change5d: first ? (price - first) / first : null,
    high5d: high,
    low5d: low,
    offHigh5d: high ? (high - price) / high : null,
    offLow5d: low ? (price - low) / low : null,
  };
}

function sortValue(r: ScreenerRow, key: ScreenerSort): number | null {
  switch (key) {
    case 'change5d':
      return r.change5d;
    case 'absChange':
      return Math.abs(r.changePct);
    case 'volume':
      return r.volume;
    case 'price':
      return r.price;
    case 'offHigh5d':
      return r.offHigh5d;
    case 'offLow5d':
      return r.offLow5d;
    default:
      return r.changePct;
  }
}

/** Aplica filtros/ordenação/limite sobre as cotações (já carregadas). */
export function buildScreener(
  quotes: Map<string, MarketQuote>,
  filters: ScreenerFilters = DEFAULT_SCREENER_FILTERS,
  extras: ScreenerExtras = {},
): ScreenerResult {
  const symbols = universeSymbols(filters.universe);
  const q = filters.query.trim().toUpperCase();
  const rows: ScreenerRow[] = [];
  let withData = 0;

  const customFields = extras.customFields ?? [];
  const customIds = customFieldIds(customFields);
  const fundamentalFields = extras.fundamentalFields ?? [];
  const mainExtras = [...fundamentalFields, ...customIds];

  const ruleText = (filters.rules ?? '').trim();
  let ruleAst = null as ReturnType<typeof parseRule>['ast'];
  let ruleError: string | null = null;
  if (ruleText) {
    const parsed = parseRule(ruleText, { extraNumericFields: mainExtras });
    ruleAst = parsed.ast;
    ruleError = parsed.error;
  }

  const fundText = (filters.fundamentalRules ?? '').trim();
  let fundAst = null as ReturnType<typeof parseRule>['ast'];
  let fundamentalRuleError: string | null = null;
  if (fundText) {
    const parsed = parseRule(fundText, { extraNumericFields: fundamentalFields });
    fundAst = parsed.ast;
    fundamentalRuleError = parsed.error;
  }

  for (const symbol of symbols) {
    const quote = quotes.get(symbol.toUpperCase());
    if (!quote || quote.changePct == null) continue;
    withData += 1;

    const constituency = CONSTITUENT_MAP.get(symbol);
    const name = constituency?.name ?? quote.name ?? symbol;
    const sector = constituency ? SECTOR_LABEL.get(constituency.sector) ?? constituency.sector : '—';

    if (filters.sector !== 'all' && constituency?.sector !== filters.sector) continue;
    if (q && !symbol.toUpperCase().includes(q) && !name.toUpperCase().includes(q)) continue;
    if (filters.direction === 'up' && quote.changePct <= 0) continue;
    if (filters.direction === 'down' && quote.changePct >= 0) continue;
    if (filters.minChangePct != null && quote.changePct < filters.minChangePct) continue;
    if (filters.maxChangePct != null && quote.changePct > filters.maxChangePct) continue;
    if (filters.minPrice != null && quote.price < filters.minPrice) continue;
    if (filters.maxPrice != null && quote.price > filters.maxPrice) continue;
    if (filters.minVolume != null && (quote.volume == null || quote.volume < filters.minVolume)) continue;

    const stats = seriesStats(quote.series, quote.price);
    const extra: Record<string, number | null> = { ...(extras.fundamentalValues?.get(symbol) ?? {}) };
    const row: ScreenerRow = {
      symbol,
      name,
      sector,
      sectorId: constituency?.sector ?? '',
      price: quote.price,
      changePct: quote.changePct,
      ...stats,
      volume: quote.volume,
      extra,
    };

    // Campos personalizados: avalia em ordem, permitindo referência a anteriores.
    for (const cf of customFields) {
      if (!cf.ast) continue;
      extra[cf.id] = evaluateExpr(cf.ast, (field) => {
        if (isBuiltinNumericField(field)) return numericFieldValue(row, field);
        return extra[field] ?? null;
      });
    }

    rows.push(row);
  }

  let candidates = rows;
  const mainAst = ruleAst;
  if (mainAst) candidates = candidates.filter((r) => evaluateRule(mainAst, r));
  const fAst = fundAst;
  if (fAst) candidates = candidates.filter((r) => evaluateRule(fAst, r));

  const dir = filters.sortDir === 'asc' ? 1 : -1;
  candidates.sort((a, b) => {
    const va = sortValue(a, filters.sortBy);
    const vb = sortValue(b, filters.sortBy);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // nulos sempre no fim
    if (vb == null) return -1;
    return (va - vb) * dir;
  });

  const matched = candidates.length;
  return {
    rows: candidates.slice(0, Math.max(1, filters.limit)),
    matched,
    universeTotal: symbols.length,
    withData,
    ruleError,
    fundamentalRuleError,
  };
}

/** Preset de mercado (reset preserva universo, limite e regras). */
export function applyPreset(preset: ScreenerPreset, base: ScreenerFilters = DEFAULT_SCREENER_FILTERS): ScreenerFilters {
  const reset: ScreenerFilters = {
    ...DEFAULT_SCREENER_FILTERS,
    universe: base.universe,
    limit: base.limit,
    rules: base.rules,
    fundamentalRules: base.fundamentalRules,
  };
  switch (preset) {
    case 'gainers':
      return { ...reset, direction: 'up', sortBy: 'changePct', sortDir: 'desc' };
    case 'losers':
      return { ...reset, direction: 'down', sortBy: 'changePct', sortDir: 'asc' };
    case 'volume':
      return { ...reset, sortBy: 'volume', sortDir: 'desc' };
    case 'movers':
      return { ...reset, sortBy: 'absChange', sortDir: 'desc' };
    case 'nearHigh':
      return { ...reset, sortBy: 'offHigh5d', sortDir: 'asc' };
    case 'nearLow':
      return { ...reset, sortBy: 'offLow5d', sortDir: 'asc' };
    case 'reset':
    default:
      return reset;
  }
}
