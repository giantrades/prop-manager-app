// MARKET — cestas (Themes / Factors / ETF map). Builders puros.
import { describe, it, expect } from 'vitest';
import {
  buildThemes,
  buildFactors,
  buildEtfMap,
  MARKET_FULL_SYMBOLS,
  THEMES,
  FACTORS,
} from '../marketBaskets';
import { MARKET_ALL_SYMBOLS, type MarketQuote } from '../marketData';

function q(symbol: string, changePct: number, price = 100): MarketQuote {
  return {
    symbol, price, previousClose: 100, change: price - 100, changePct,
    currency: 'USD', name: symbol, exchange: 'X', volume: 1000, marketTime: null,
    series: [[1, 100], [2, price]], at: new Date().toISOString(),
  };
}

describe('marketBaskets — builders', () => {
  const quotes = new Map<string, MarketQuote>([
    ['SPY', q('SPY', 0.01)],
    ['NVDA', q('NVDA', 0.04)],
    ['AMD', q('AMD', 0.02)],
    ['AVGO', q('AVGO', -0.01)],
    ['MU', q('MU', 0.03)],
    ['IWF', q('IWF', 0.015)],
    ['IWD', q('IWD', -0.005)],
  ]);

  it('buildThemes ordena por variação média e calcula rel SPY', () => {
    const themes = buildThemes(quotes);
    expect(themes.length).toBeGreaterThan(0);
    for (let i = 1; i < themes.length; i += 1) {
      expect(themes[i - 1].avgChangePct).toBeGreaterThanOrEqual(themes[i].avgChangePct);
    }
    const semis = themes.find((t) => t.id === 'semis');
    expect(semis).toBeTruthy();
    expect(semis!.members.length).toBeGreaterThan(0);
    expect(semis!.relToBench).toBeCloseTo(semis!.avgChangePct - 0.01);
  });

  it('buildFactors inclui baskets com dados', () => {
    const factors = buildFactors(quotes);
    const growth = factors.find((f) => f.id === 'growth');
    expect(growth?.members.some((m) => m.symbol === 'IWF')).toBe(true);
    expect(growth!.breadth).toBeGreaterThanOrEqual(0);
    expect(growth!.breadth).toBeLessThanOrEqual(1);
  });

  it('buildEtfMap agrupa por categoria com tiles ponderados', () => {
    const cats = buildEtfMap(quotes);
    const broad = cats.find((c) => c.id === 'broad');
    expect(broad?.tiles.some((t) => t.symbol === 'SPY')).toBe(true);
    expect(broad!.weight).toBeGreaterThan(0);
    expect(cats.every((c) => c.tiles.length > 0)).toBe(true);
  });

  it('MARKET_FULL_SYMBOLS = core + cestas, sem duplicar', () => {
    expect(MARKET_FULL_SYMBOLS).toContain('SPY'); // core
    expect(MARKET_FULL_SYMBOLS).toContain('TSM'); // cesta (theme semis)
    expect(new Set(MARKET_FULL_SYMBOLS).size).toBe(MARKET_FULL_SYMBOLS.length);
    for (const s of MARKET_ALL_SYMBOLS) expect(MARKET_FULL_SYMBOLS).toContain(s);
  });

  it('definições de cesta não têm símbolo vazio', () => {
    for (const b of [...THEMES, ...FACTORS]) {
      expect(b.symbols.length).toBeGreaterThan(0);
      expect(b.symbols.every((s) => s.trim().length > 0)).toBe(true);
    }
  });
});
