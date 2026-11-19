// FUNDAMENTOS — normalização, valores e feed plugável (sem endpoint → not_configured).
import { describe, it, expect } from 'vitest';
import {
  normalizeFundamentals,
  daysUntilEarnings,
  fundamentalNumeric,
  toFundamentalValues,
  resolveFundamentalField,
  fetchFundamentals,
  FUNDAMENTAL_FIELD_KEYS,
} from '../fundamentals';

const SAMPLE = {
  symbol: 'aapl',
  marketCap: 3_000_000_000_000,
  peTrailing: 28.5,
  peForward: 25.1,
  epsTrailing: 6.1,
  epsForward: 6.9,
  dividendYield: 0.005,
  beta: 1.2,
  earningsDate: '2026-11-05',
  revenueGrowth: 0.08,
  profitMargin: 0.25,
  avgVolume: 55_000_000,
  fiftyTwoWeekHigh: 260,
  fiftyTwoWeekLow: 160,
};

describe('normalizeFundamentals', () => {
  it('normaliza camelCase e símbolo em maiúsculo', () => {
    const f = normalizeFundamentals(SAMPLE);
    expect(f?.symbol).toBe('AAPL');
    expect(f?.marketCap).toBe(3_000_000_000_000);
    expect(f?.peTrailing).toBe(28.5);
  });

  it('aceita snake_case e timestamp de earnings', () => {
    const f = normalizeFundamentals({
      symbol: 'MSFT',
      market_cap: 1000,
      trailingPE: 30,
      earningsTimestamp: Date.UTC(2026, 0, 15),
    });
    expect(f?.marketCap).toBe(1000);
    expect(f?.peTrailing).toBe(30);
    expect(f?.earningsDate).toBe('2026-01-15');
  });

  it('rejeita objeto sem symbol', () => {
    expect(normalizeFundamentals({})).toBeNull();
    expect(normalizeFundamentals(null)).toBeNull();
  });
});

describe('daysUntilEarnings', () => {
  it('conta dias (arredondando para cima)', () => {
    const now = Date.UTC(2026, 0, 1);
    expect(daysUntilEarnings('2026-01-08', now)).toBe(7);
    expect(daysUntilEarnings('2025-12-30', now)).toBe(-2);
    expect(daysUntilEarnings(null, now)).toBeNull();
    expect(daysUntilEarnings('data-ruim', now)).toBeNull();
  });
});

describe('fundamentalNumeric', () => {
  const f = normalizeFundamentals(SAMPLE)!;
  it('converte percentuais para pontos', () => {
    expect(fundamentalNumeric(f, 'divyield')).toBeCloseTo(0.5);
    expect(fundamentalNumeric(f, 'revenuegrowth')).toBeCloseTo(8);
    expect(fundamentalNumeric(f, 'profitmargin')).toBeCloseTo(25);
  });

  it('mapeia os campos', () => {
    expect(fundamentalNumeric(f, 'pe')).toBe(28.5);
    expect(fundamentalNumeric(f, 'forwardpe')).toBe(25.1);
    expect(fundamentalNumeric(f, 'marketcap')).toBe(3_000_000_000_000);
    expect(fundamentalNumeric(f, 'beta')).toBe(1.2);
    expect(fundamentalNumeric(f, 'high52w')).toBe(260);
    expect(fundamentalNumeric(f, 'nada')).toBeNull();
  });

  it('toFundamentalValues monta o mapa por símbolo', () => {
    const map = toFundamentalValues(new Map([['AAPL', f]]));
    expect(map.get('AAPL')?.pe).toBe(28.5);
    expect(FUNDAMENTAL_FIELD_KEYS.every((k) => k in (map.get('AAPL') ?? {}))).toBe(true);
  });
});

describe('resolveFundamentalField', () => {
  it('resolve aliases', () => {
    expect(resolveFundamentalField('PE')).toBe('pe');
    expect(resolveFundamentalField('market cap')).toBeNull(); // com espaço não é ident
    expect(resolveFundamentalField('mcap')).toBe('marketcap');
    expect(resolveFundamentalField('earnings')).toBe('earningsindays');
    expect(resolveFundamentalField('zzz')).toBeNull();
  });
});

describe('fetchFundamentals', () => {
  it('sem endpoint → not_configured, sem itens', async () => {
    const res = await fetchFundamentals(['AAPL'], { endpoint: '' });
    expect(res.status).toBe('not_configured');
    expect(res.items.size).toBe(0);
  });

  it('com endpoint parseia itens e monta o mapa', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: () => Promise.resolve({ at: '2026-01-01T00:00:00Z', items: [SAMPLE] }),
    })) as unknown as typeof fetch;
    const res = await fetchFundamentals(['AAPL'], { endpoint: 'https://feed.test/fund', fetchImpl });
    expect(res.status).toBe('ok');
    expect(res.items.get('AAPL')?.peTrailing).toBe(28.5);
    expect(res.failed).toEqual([]);
  });

  it('feed vazio → offline', async () => {
    const fetchImpl = (async () => ({ ok: true, json: () => Promise.resolve({ items: [] }) })) as unknown as typeof fetch;
    const res = await fetchFundamentals(['AAPL'], { endpoint: 'https://feed.test/fund', fetchImpl });
    expect(res.status).toBe('offline');
  });

  it('HTTP falho → offline', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 500, json: () => Promise.resolve({}) })) as unknown as typeof fetch;
    const res = await fetchFundamentals(['AAPL'], { endpoint: 'https://feed.test/fund', fetchImpl });
    expect(res.status).toBe('offline');
  });
});
