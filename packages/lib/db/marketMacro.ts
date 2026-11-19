// MACRO — motor do módulo Macro (Cross-asset, Session tape, Rates & liquidity,
// Vol regime, Curves, Events). READ-ONLY. Reusa `fetchMarketQuotes`/`MarketQuote`
// de `marketData.ts` e o calendário econômico free (`economicCalendar.ts`).
//
// Sem FRED/COT (exigem chave/pago): juros vêm dos índices de yield do Yahoo
// (^IRX 3M, ^FVX 5Y, ^TNX 10Y, ^TYX 30Y); o 2Y não existe no feed grátis.
//
// Fonte: DOCS/10_MODULES/market/00-spec.md.

import type { MarketQuote } from './marketData';

// ---------------------------------------------------------------------------
// Universos
// ---------------------------------------------------------------------------

/** Símbolos diários do Macro (range 1mo p/ histórico). */
export const MACRO_SYMBOLS: string[] = [
  'SPY', 'QQQ', 'IWM', 'EFA', 'EEM',
  '^IRX', '^FVX', '^TNX', '^TYX',
  'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'TIP', 'AGG',
  '^VIX', '^VIX9D', '^VIX3M', '^VIX6M',
  'DX-Y.NYB', 'EURUSD=X', 'USDJPY=X', 'USDBRL=X', 'GBPUSD=X',
  'GC=F', 'SI=F', 'CL=F', 'NG=F', 'HG=F',
  'BTC-USD', 'ETH-USD',
];

/** Símbolos intraday do Session tape (range 1d, interval 5m). */
export const SESSION_TAPE: MacroDef[] = [
  { symbol: 'SPY', label: 'S&P 500', kind: 'index' },
  { symbol: 'QQQ', label: 'Nasdaq 100', kind: 'index' },
  { symbol: 'IWM', label: 'Russell 2000', kind: 'index' },
  { symbol: 'BTC-USD', label: 'Bitcoin', kind: 'crypto' },
  { symbol: 'ETH-USD', label: 'Ethereum', kind: 'crypto' },
  { symbol: 'GC=F', label: 'Gold', kind: 'commodity' },
  { symbol: 'CL=F', label: 'WTI crude', kind: 'commodity' },
  { symbol: 'DX-Y.NYB', label: 'Dollar index', kind: 'fx' },
  { symbol: '^VIX', label: 'VIX', kind: 'vol' },
];

export const SESSION_SYMBOLS: string[] = SESSION_TAPE.map((d) => d.symbol);

export interface MacroDef {
  symbol: string;
  label: string;
  kind?: 'index' | 'yield' | 'etf' | 'fx' | 'commodity' | 'crypto' | 'vol';
}

/** Cesta do painel Cross-asset (normalizado base 100). */
export const CROSS_ASSET: MacroDef[] = [
  { symbol: 'SPY', label: 'S&P 500', kind: 'index' },
  { symbol: 'QQQ', label: 'Nasdaq 100', kind: 'index' },
  { symbol: 'IWM', label: 'Russell 2000', kind: 'index' },
  { symbol: 'EEM', label: 'Emerging markets', kind: 'index' },
  { symbol: 'GC=F', label: 'Gold', kind: 'commodity' },
  { symbol: 'CL=F', label: 'WTI crude', kind: 'commodity' },
  { symbol: 'HG=F', label: 'Copper', kind: 'commodity' },
  { symbol: 'DX-Y.NYB', label: 'Dollar index', kind: 'fx' },
  { symbol: '^TNX', label: 'US 10Y yield', kind: 'yield' },
  { symbol: 'TLT', label: '20Y+ Treasury', kind: 'etf' },
  { symbol: 'HYG', label: 'HY credit', kind: 'etf' },
  { symbol: 'BTC-USD', label: 'Bitcoin', kind: 'crypto' },
  { symbol: 'ETH-USD', label: 'Ethereum', kind: 'crypto' },
];

/** Linhas da tabela de Juros & liquidez. */
export const RATE_ROWS: MacroDef[] = [
  { symbol: '^IRX', label: 'US 3M yield', kind: 'yield' },
  { symbol: '^FVX', label: 'US 5Y yield', kind: 'yield' },
  { symbol: '^TNX', label: 'US 10Y yield', kind: 'yield' },
  { symbol: '^TYX', label: 'US 30Y yield', kind: 'yield' },
  { symbol: 'SHY', label: '1–3Y Treasury', kind: 'etf' },
  { symbol: 'IEF', label: '7–10Y Treasury', kind: 'etf' },
  { symbol: 'TLT', label: '20Y+ Treasury', kind: 'etf' },
  { symbol: 'TIP', label: 'TIPS', kind: 'etf' },
  { symbol: 'LQD', label: 'IG credit', kind: 'etf' },
  { symbol: 'HYG', label: 'HY credit', kind: 'etf' },
];

/** Pontos da curva de juros. */
export const YIELD_POINTS: { symbol: string; label: string; years: number }[] = [
  { symbol: '^IRX', label: '3M', years: 0.25 },
  { symbol: '^FVX', label: '5Y', years: 5 },
  { symbol: '^TNX', label: '10Y', years: 10 },
  { symbol: '^TYX', label: '30Y', years: 30 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Variação % entre o 1º e o último close da série (null se insuficiente). */
export function periodChangePct(series: Array<[number, number]>): number | null {
  const closes = series.map((p) => p[1]).filter((c) => Number.isFinite(c));
  if (closes.length < 2) return null;
  const first = closes[0];
  const last = closes[closes.length - 1];
  return first ? (last - first) / first : null;
}

/** Variação absoluta em pontos-base (para yields: 1 ponto = 100 bp). */
export function yieldChangeBp(series: Array<[number, number]>): number | null {
  const closes = series.map((p) => p[1]).filter((c) => Number.isFinite(c));
  if (closes.length < 2) return null;
  return (closes[closes.length - 1] - closes[0]) * 100;
}

function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Cross-asset (séries normalizadas base 100)
// ---------------------------------------------------------------------------

export interface CrossAssetRow {
  date: string;
  [symbol: string]: number | string;
}

export interface CrossAssetSymbolInfo {
  symbol: string;
  label: string;
  kind?: MacroDef['kind'];
  last: number | null;
  changePct: number | null; // período
}

export interface CrossAssetSeries {
  dates: string[];
  rows: CrossAssetRow[];
  symbols: CrossAssetSymbolInfo[];
}

/**
 * Alinha as séries de vários ativos num eixo comum, normalizadas base 100 no
 * primeiro close de cada série (forward-fill em pontos faltantes).
 * `granularity: 'day'` agrupa por dia; `'5m'` agrupa por barras de 5 minutos.
 */
export function buildCrossAssetSeries(
  quotes: Map<string, MarketQuote>,
  defs: MacroDef[],
  opts: { granularity?: 'day' | '5m' } = {},
): CrossAssetSeries {
  const stepMs = opts.granularity === '5m' ? 5 * 60 * 1000 : null;
  const keyOf = (ts: number): string =>
    stepMs ? new Date(Math.floor(ts / stepMs) * stepMs).toISOString() : dayKey(ts);

  const perSymbol: { def: MacroDef; map: Map<string, number>; base: number; last: number }[] = [];
  const dateSet = new Set<string>();
  for (const def of defs) {
    const q = quotes.get(def.symbol.toUpperCase());
    if (!q || q.series.length < 2) continue;
    const map = new Map<string, number>();
    for (const [ts, close] of q.series) {
      if (!Number.isFinite(close)) continue;
      const k = keyOf(ts);
      map.set(k, close);
      dateSet.add(k);
    }
    const base = q.series.find((p) => Number.isFinite(p[1]))?.[1];
    if (!base) continue;
    const last = q.price;
    perSymbol.push({ def, map, base, last });
  }
  const dates = [...dateSet].sort();
  const rows: CrossAssetRow[] = [];
  const ffill = new Map<string, number>();
  for (const date of dates) {
    const row: CrossAssetRow = { date };
    for (const s of perSymbol) {
      const close = s.map.get(date);
      if (close != null) ffill.set(s.def.symbol, close);
      const v = ffill.get(s.def.symbol);
      if (v != null) row[s.def.symbol] = Number(((v / s.base) * 100).toFixed(2));
    }
    rows.push(row);
  }
  const symbols: CrossAssetSymbolInfo[] = perSymbol.map((s) => ({
    symbol: s.def.symbol,
    label: s.def.label,
    kind: s.def.kind,
    last: s.last,
    changePct: s.base ? (s.last - s.base) / s.base : null,
  }));
  return { dates, rows, symbols };
}

// ---------------------------------------------------------------------------
// Curva de juros + spreads
// ---------------------------------------------------------------------------

export interface YieldPoint {
  symbol: string;
  label: string;
  years: number;
  value: number;
  changeBp: number | null; // variação no período (bp)
}

export function buildYieldCurve(quotes: Map<string, MarketQuote>): YieldPoint[] {
  return YIELD_POINTS.map((p) => {
    const q = quotes.get(p.symbol.toUpperCase());
    return {
      symbol: p.symbol,
      label: p.label,
      years: p.years,
      value: q?.price ?? NaN,
      changeBp: q ? yieldChangeBp(q.series) : null,
    };
  })
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.years - b.years);
}

export interface YieldSpreads {
  y3m: number | null;
  y5: number | null;
  y10: number | null;
  y30: number | null;
  s10m3m: number | null; // 10y - 3m
  s10m5: number | null; // 10y - 5y
  s30m10: number | null; // 30y - 10y
  inverted: boolean; // 10y < 3m
}

export function buildYieldSpreads(curve: YieldPoint[]): YieldSpreads {
  const get = (label: string) => curve.find((p) => p.label === label)?.value ?? null;
  const y3m = get('3M');
  const y5 = get('5Y');
  const y10 = get('10Y');
  const y30 = get('30Y');
  const s10m3m = y10 != null && y3m != null ? y10 - y3m : null;
  const s10m5 = y10 != null && y5 != null ? y10 - y5 : null;
  const s30m10 = y30 != null && y10 != null ? y30 - y10 : null;
  return { y3m, y5, y10, y30, s10m3m, s10m5, s30m10, inverted: s10m3m != null && s10m3m < 0 };
}

// ---------------------------------------------------------------------------
// Juros & liquidez (tabela) + crédito
// ---------------------------------------------------------------------------

export interface RateRow {
  symbol: string;
  label: string;
  kind: MacroDef['kind'];
  value: number | null;
  change1d: number | null; // fração
  changePeriod: number | null; // fração
  changeBp: number | null; // só yields
}

export function buildRatesLiquidity(quotes: Map<string, MarketQuote>, defs: MacroDef[] = RATE_ROWS): RateRow[] {
  return defs.map((d) => {
    const q = quotes.get(d.symbol.toUpperCase());
    return {
      symbol: d.symbol,
      label: d.label,
      kind: d.kind,
      value: q?.price ?? null,
      change1d: q?.changePct ?? null,
      changePeriod: q ? periodChangePct(q.series) : null,
      changeBp: d.kind === 'yield' && q ? yieldChangeBp(q.series) : null,
    };
  });
}

export interface CreditStress {
  hyg1m: number | null;
  lqd1m: number | null;
  ief1m: number | null;
  tlt1m: number | null;
  riskAppetite: number | null; // hyg1m - ief1m (positivo = risk-on no crédito)
  label: string;
}

export function buildCreditStress(quotes: Map<string, MarketQuote>): CreditStress {
  const chg = (sym: string) => {
    const q = quotes.get(sym);
    return q ? periodChangePct(q.series) : null;
  };
  const hyg1m = chg('HYG');
  const lqd1m = chg('LQD');
  const ief1m = chg('IEF');
  const tlt1m = chg('TLT');
  const riskAppetite = hyg1m != null && ief1m != null ? hyg1m - ief1m : null;
  const label = riskAppetite == null ? '—' : riskAppetite > 0.005 ? 'RISK-ON' : riskAppetite < -0.005 ? 'RISK-OFF' : 'NEUTRO';
  return { hyg1m, lqd1m, ief1m, tlt1m, riskAppetite, label };
}

// ---------------------------------------------------------------------------
// Vol regime
// ---------------------------------------------------------------------------

export interface VolTermPoint {
  symbol: string;
  label: string;
  value: number | null;
  changePct: number | null;
}

export interface VolRegime {
  vix: number | null;
  term: VolTermPoint[];
  contangoRatio: number | null; // VIX / VIX3M
  structure: 'CONTANGO' | 'BACKWARDATION' | '—';
  regime: 'BAIXA' | 'NORMAL' | 'ELEVADA' | 'ALTA' | '—';
}

export function buildVolRegime(quotes: Map<string, MarketQuote>): VolRegime {
  const pt = (symbol: string, label: string): VolTermPoint => {
    const q = quotes.get(symbol.toUpperCase());
    return { symbol, label, value: q?.price ?? null, changePct: q?.changePct ?? null };
  };
  const term = [pt('^VIX9D', '9D'), pt('^VIX', 'VIX'), pt('^VIX3M', '3M'), pt('^VIX6M', '6M')];
  const vix = quotes.get('^VIX')?.price ?? null;
  const vix3m = quotes.get('^VIX3M')?.price ?? null;
  const contangoRatio = vix != null && vix3m != null && vix3m !== 0 ? vix / vix3m : null;
  const structure = contangoRatio == null ? '—' : contangoRatio < 1 ? 'CONTANGO' : 'BACKWARDATION';
  const regime = vix == null ? '—' : vix < 15 ? 'BAIXA' : vix < 20 ? 'NORMAL' : vix < 28 ? 'ELEVADA' : 'ALTA';
  return { vix, term, contangoRatio, structure, regime };
}
