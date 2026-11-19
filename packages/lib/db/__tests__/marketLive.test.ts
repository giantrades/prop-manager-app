// LIVE — builders derivados puros (setupboard, intraday breadth, alerts).
import { describe, it, expect } from 'vitest';
import type { MarketQuote } from '../marketData';
import { SECTORS } from '../marketData';
import {
  sma,
  sessionChangePct,
  buildSetupboard,
  buildIntradayBreadth,
  buildAlerts,
  type LiveDef,
} from '../marketLive';

const T1 = Date.UTC(2026, 0, 2);
const T2 = Date.UTC(2026, 0, 3);

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
    marketTime: T2,
    series,
    at: new Date(T2).toISOString(),
  };
}

function map(...quotes: MarketQuote[]): Map<string, MarketQuote> {
  const m = new Map<string, MarketQuote>();
  for (const x of quotes) m.set(x.symbol, x);
  return m;
}

function flatSeries(value: number, n: number): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => [T1 + i * 86400000, value] as [number, number]);
}

describe('sma / sessionChangePct', () => {
  it('média dos últimos n closes', () => {
    expect(sma(flatSeries(100, 20), 20)).toBeCloseTo(100);
    expect(sma(flatSeries(100, 10), 20)).toBeNull();
    expect(sma(undefined, 20)).toBeNull();
  });
  it('variação da sessão', () => {
    expect(sessionChangePct([[T1, 100], [T2, 102]])).toBeCloseTo(0.02);
    expect(sessionChangePct([[T1, 100]])).toBeNull();
  });
});

describe('buildSetupboard', () => {
  function sectorQuotes(changePct: number): MarketQuote[] {
    return SECTORS.map((s) => q(s.etf, 100, [[T1, 100], [T2, 100 * (1 + changePct)]], changePct));
  }

  it('classifica RISK-ON quando todos os sinais são positivos', () => {
    const quotes = map(
      q('SPY', 120, flatSeries(100, 20), 0.01),
      ...sectorQuotes(0.01),
      q('^VIX', 16, [[T1, 16], [T2, 16]], -0.03),
      q('^VIX3M', 20, [[T1, 20], [T2, 20]]),
      q('HYG', 101, [[T1, 100], [T2, 101]], 0.01),
      q('IEF', 100, [[T1, 100], [T2, 100]], 0),
      q('^TNX', 4.0, [[T1, 4.1], [T2, 4.0]], -0.02),
      q('DX-Y.NYB', 99, [[T1, 100], [T2, 99]], -0.01),
    );
    const board = buildSetupboard(quotes);
    expect(board.label).toBe('RISK-ON');
    expect(board.score).toBeCloseTo(1);
    expect(board.breadthPct).toBeCloseTo(1);
    expect(board.vix).toBeCloseTo(16);
  });

  it('classifica RISK-OFF quando todos os sinais são negativos', () => {
    const quotes = map(
      q('SPY', 80, flatSeries(100, 20), -0.01),
      ...sectorQuotes(-0.01),
      q('^VIX', 30, [[T1, 30], [T2, 30]], 0.10),
      q('^VIX3M', 26, [[T1, 26], [T2, 26]]),
      q('HYG', 99, [[T1, 100], [T2, 99]], -0.01),
      q('IEF', 100, [[T1, 100], [T2, 100]], 0),
      q('^TNX', 4.5, [[T1, 4.3], [T2, 4.5]], 0.03),
      q('DX-Y.NYB', 102, [[T1, 100], [T2, 102]], 0.02),
    );
    const board = buildSetupboard(quotes);
    expect(board.label).toBe('RISK-OFF');
    expect(board.score).toBeCloseTo(-1);
  });

  it('é NEUTRAL sem dados suficientes', () => {
    const board = buildSetupboard(new Map());
    expect(board.label).toBe('NEUTRAL');
    expect(board.score).toBeCloseTo(0);
    expect(board.signals.every((s) => s.tone === 'neu')).toBe(true);
  });
});

describe('buildIntradayBreadth', () => {
  it('conta avanços/quedas pela variação na sessão', () => {
    const defs: LiveDef[] = [
      { symbol: 'SPY', label: 'S&P 500' },
      { symbol: 'QQQ', label: 'Nasdaq 100' },
      { symbol: 'IWM', label: 'Russell 2000' },
    ];
    const quotes = map(
      q('SPY', 102, [[T1, 100], [T2, 102]]),
      q('QQQ', 99, [[T1, 100], [T2, 99]]),
      q('IWM', 101, [[T1, 100], [T2, 101]]),
    );
    const b = buildIntradayBreadth(quotes, defs);
    expect(b.total).toBe(3);
    expect(b.advancers).toBe(2);
    expect(b.decliners).toBe(1);
    expect(b.pctUp).toBeCloseTo(2 / 3);
    expect(b.rows[0].symbol).toBe('SPY');
  });
});

describe('buildAlerts', () => {
  it('dispara vol spike, curva invertida, crédito e cripto', () => {
    const quotes = map(
      q('^VIX', 30, [[T1, 27], [T2, 30]], 0.10),
      q('^TNX', 4.0, [[T1, 4.0], [T2, 4.0]]),
      q('^IRX', 4.5, [[T1, 4.5], [T2, 4.5]]),
      q('HYG', 98, [[T1, 100], [T2, 98]], -0.02),
      q('IEF', 101, [[T1, 100], [T2, 101]], 0.01),
      q('BTC-USD', 106, [[T1, 100], [T2, 106]], 0.06),
    );
    const alerts = buildAlerts(quotes);
    const ids = alerts.map((a) => a.id);
    expect(ids).toContain('vix-spike');
    expect(ids).toContain('curve-inverted');
    expect(ids).toContain('credit-stress');
    expect(ids).toContain('btc-move');
    // severidade alta vem primeiro
    expect(alerts[0].severity).toBe('high');
  });

  it('não dispara nada em mercado calmo', () => {
    const quotes = map(
      q('^VIX', 15, [[T1, 15], [T2, 15]], 0.0),
      q('^TNX', 4.5, [[T1, 4.5], [T2, 4.5]]),
      q('^IRX', 4.0, [[T1, 4.0], [T2, 4.0]]),
      q('HYG', 100, [[T1, 100], [T2, 100]], 0.0),
      q('IEF', 100, [[T1, 100], [T2, 100]], 0.0),
      q('BTC-USD', 100, [[T1, 100], [T2, 100]], 0.01),
    );
    expect(buildAlerts(quotes)).toHaveLength(0);
  });
});
