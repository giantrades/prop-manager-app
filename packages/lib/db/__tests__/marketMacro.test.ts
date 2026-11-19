// MACRO — builders derivados puros (cross-asset, curva, spreads, vol, crédito).
import { describe, it, expect } from 'vitest';
import type { MarketQuote } from '../marketData';
import {
  buildCrossAssetSeries,
  buildYieldCurve,
  buildYieldSpreads,
  buildRatesLiquidity,
  buildCreditStress,
  buildVolRegime,
  periodChangePct,
  yieldChangeBp,
  type MacroDef,
} from '../marketMacro';

const T1 = Date.UTC(2026, 0, 2);
const T2 = Date.UTC(2026, 0, 3);
const T3 = Date.UTC(2026, 0, 4);

function q(symbol: string, price: number, series: Array<[number, number]>, changePct: number | null = null): MarketQuote {
  return {
    symbol: symbol.toUpperCase(),
    price,
    previousClose: price,
    change: 0,
    changePct,
    currency: 'USD',
    name: symbol,
    exchange: 'X',
    volume: null,
    marketTime: T3,
    series,
    at: new Date(T3).toISOString(),
  };
}

function map(...quotes: MarketQuote[]): Map<string, MarketQuote> {
  const m = new Map<string, MarketQuote>();
  for (const x of quotes) m.set(x.symbol, x);
  return m;
}

describe('periodChangePct / yieldChangeBp', () => {
  it('calcula variação percentual do período', () => {
    expect(periodChangePct([[T1, 100], [T2, 110]])).toBeCloseTo(0.1);
    expect(periodChangePct([[T1, 100]])).toBeNull();
  });
  it('yield em pontos-base', () => {
    expect(yieldChangeBp([[T1, 4.2], [T2, 4.5]])).toBeCloseTo(30);
  });
});

describe('buildCrossAssetSeries', () => {
  const defs: MacroDef[] = [
    { symbol: 'SPY', label: 'S&P 500' },
    { symbol: 'QQQ', label: 'Nasdaq 100' },
  ];
  it('normaliza base 100 e faz forward-fill em datas faltantes', () => {
    const quotes = map(
      q('SPY', 120, [[T1, 100], [T2, 110], [T3, 120]]),
      q('QQQ', 55, [[T1, 50], [T3, 55]]),
    );
    const out = buildCrossAssetSeries(quotes, defs);
    expect(out.dates).toHaveLength(3);
    expect(out.rows[0]['SPY']).toBeCloseTo(100);
    expect(out.rows[1]['SPY']).toBeCloseTo(110);
    // QQQ não tem T2 → forward-fill de T1
    expect(out.rows[1]['QQQ']).toBeCloseTo(100);
    expect(out.rows[2]['QQQ']).toBeCloseTo(110);
    expect(out.symbols.find((s) => s.symbol === 'SPY')?.changePct).toBeCloseTo(0.2);
    expect(out.symbols.find((s) => s.symbol === 'QQQ')?.changePct).toBeCloseTo(0.1);
  });

  it('agrupa por barras de 5m no intraday', () => {
    const base = Date.UTC(2026, 0, 2, 14, 30);
    const quotes = map(
      q('SPY', 102, [[base, 100], [base + 5 * 60 * 1000, 101], [base + 10 * 60 * 1000, 102]]),
    );
    const out = buildCrossAssetSeries(quotes, [{ symbol: 'SPY', label: 'S&P 500' }], { granularity: '5m' });
    expect(out.dates).toHaveLength(3);
    expect(out.dates[0]).toContain('T');
    expect(out.symbols[0].changePct).toBeCloseTo(0.02);
  });
});

describe('buildYieldCurve / buildYieldSpreads', () => {
  it('ordena por prazo e calcula bp', () => {
    const quotes = map(
      q('^IRX', 4.0, [[T1, 3.9], [T2, 4.0]]),
      q('^FVX', 4.2, [[T1, 4.2], [T2, 4.2]]),
      q('^TNX', 4.5, [[T1, 4.2], [T2, 4.5]]),
      q('^TYX', 4.7, [[T1, 4.7], [T2, 4.7]]),
    );
    const curve = buildYieldCurve(quotes);
    expect(curve.map((p) => p.label)).toEqual(['3M', '5Y', '10Y', '30Y']);
    expect(curve.find((p) => p.label === '10Y')?.changeBp).toBeCloseTo(30);

    const spreads = buildYieldSpreads(curve);
    expect(spreads.s10m3m).toBeCloseTo(0.5);
    expect(spreads.s30m10).toBeCloseTo(0.2);
    expect(spreads.s10m5).toBeCloseTo(0.3);
    expect(spreads.inverted).toBe(false);
  });

  it('marca curva invertida', () => {
    const curve = buildYieldCurve(map(
      q('^IRX', 5.0, [[T1, 5.0], [T2, 5.0]]),
      q('^TNX', 4.0, [[T1, 4.0], [T2, 4.0]]),
    ));
    expect(buildYieldSpreads(curve).inverted).toBe(true);
  });
});

describe('buildRatesLiquidity', () => {
  it('usa bp para yields e % para ETFs', () => {
    const defs: MacroDef[] = [
      { symbol: '^TNX', label: 'US 10Y', kind: 'yield' },
      { symbol: 'TLT', label: '20Y+', kind: 'etf' },
    ];
    const quotes = map(
      q('^TNX', 4.5, [[T1, 4.2], [T2, 4.5]], 0.01),
      q('TLT', 90, [[T1, 88], [T2, 90]], 0.02),
    );
    const rows = buildRatesLiquidity(quotes, defs);
    expect(rows[0].changeBp).toBeCloseTo(30);
    expect(rows[0].change1d).toBeCloseTo(0.01);
    expect(rows[1].changeBp).toBeNull();
    expect(rows[1].changePeriod).toBeCloseTo((90 - 88) / 88);
  });
});

describe('buildCreditStress', () => {
  it('detecta risk-on quando HY supera Treasury', () => {
    const quotes = map(
      q('HYG', 102, [[T1, 100], [T2, 102]]),
      q('IEF', 100.5, [[T1, 100], [T2, 100.5]]),
      q('LQD', 101, [[T1, 100], [T2, 101]]),
      q('TLT', 99, [[T1, 100], [T2, 99]]),
    );
    const credit = buildCreditStress(quotes);
    expect(credit.riskAppetite).toBeCloseTo(0.02 - 0.005);
    expect(credit.label).toBe('RISK-ON');
  });
});

describe('buildVolRegime', () => {
  it('detecta contango e regime normal', () => {
    const quotes = map(
      q('^VIX', 18, [[T1, 18], [T2, 18]]),
      q('^VIX9D', 17, [[T1, 17], [T2, 17]]),
      q('^VIX3M', 20, [[T1, 20], [T2, 20]]),
      q('^VIX6M', 21, [[T1, 21], [T2, 21]]),
    );
    const vol = buildVolRegime(quotes);
    expect(vol.contangoRatio).toBeCloseTo(0.9);
    expect(vol.structure).toBe('CONTANGO');
    expect(vol.regime).toBe('NORMAL');
  });

  it('detecta backwardation e regime alto', () => {
    const quotes = map(
      q('^VIX', 32, [[T1, 32], [T2, 32]]),
      q('^VIX3M', 28, [[T1, 28], [T2, 28]]),
    );
    const vol = buildVolRegime(quotes);
    expect(vol.structure).toBe('BACKWARDATION');
    expect(vol.regime).toBe('ALTA');
  });
});
