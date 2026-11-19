// MARKET — motor de dados. Fetch em lote (mock), cache e builders derivados puros.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  fetchMarketQuotes,
  clearMarketCache,
  chunkSymbols,
  buildOverview,
  buildRiskComposite,
  buildHeatmap,
  buildBreadth,
  buildMovers,
  buildBreadthDetail,
  MARKET_ALL_SYMBOLS,
  type MarketQuote,
} from '../marketData';

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

/** Mock do proxy Yahoo em lote: devolve um quote por símbolo pedido. */
function mockBatch(changeFor: (symbol: string) => { changePct: number; price?: number; volume?: number }): FetchImpl {
  return (async (url: string) => {
    const u = new URL(url, 'http://x');
    const syms = (u.searchParams.get('symbols') || '').split(',').filter(Boolean);
    return {
      ok: true,
      json: () => Promise.resolve({
        at: new Date().toISOString(),
        quotes: syms.map((s) => {
          const c = changeFor(s);
          const price = c.price ?? 100;
          return {
            symbol: s,
            price,
            previousClose: 100,
            change: price - 100,
            changePct: c.changePct,
            currency: 'USD',
            name: s,
            exchange: 'X',
            volume: c.volume ?? null,
            marketTime: null,
            series: [[1, 100], [2, price]],
          };
        }),
      }),
    };
  }) as unknown as FetchImpl;
}

function q(symbol: string, changePct: number, price = 100, volume: number | null = null): MarketQuote {
  return {
    symbol, price, previousClose: 100, change: price - 100, changePct,
    currency: 'USD', name: symbol, exchange: 'X', volume, marketTime: null,
    series: [[1, 100], [2, price]], at: new Date().toISOString(),
  };
}

beforeEach(() => clearMarketCache());

describe('marketData — fetch em lote', () => {
  it('chunkSymbols divide em lotes de 60', () => {
    const arr = Array.from({ length: 130 }, (_, i) => `S${i}`);
    const chunks = chunkSymbols(arr);
    expect(chunks.map((c) => c.length)).toEqual([60, 60, 10]);
  });

  it('mapeia quotes e marca failed quando o proxy não devolve o símbolo', async () => {
    const fetchImpl = mockBatch((s) => (s === 'AAPL' ? { changePct: 0.02 } : { changePct: 0 }));
    const res = await fetchMarketQuotes(['AAPL', 'MSFT'], { fetchImpl });
    expect(res.quotes.get('AAPL')?.changePct).toBeCloseTo(0.02);
    expect(res.quotes.get('MSFT')).toBeTruthy();
    expect(res.failed).toHaveLength(0);
  });

  it('tolerante a lote falho (não derruba o resto)', async () => {
    const fetchImpl = (async () => { throw new Error('rede'); }) as unknown as FetchImpl;
    const res = await fetchMarketQuotes(['AAPL'], { fetchImpl });
    expect(res.quotes.size).toBe(0);
    expect(res.failed).toContain('AAPL');
  });
});

describe('marketData — builders derivados', () => {
  const quotes = new Map<string, MarketQuote>([
    ['SPY', q('SPY', 0.01)],
    ['QQQ', q('QQQ', -0.02)],
    ['^VIX', q('^VIX', 0.05)],
    ['XLK', q('XLK', 0.015)],
    ['XLF', q('XLF', -0.005)],
    ['NVDA', q('NVDA', 0.03, 120, 5e7)],
    ['AAPL', q('AAPL', -0.01, 200, 8e7)],
    ['JPM', q('JPM', 0.02, 210, 3e7)],
  ]);

  it('buildOverview agrupa e conta altas/baixas', () => {
    const groups = buildOverview(quotes);
    const indices = groups.find((g) => g.id === 'indices');
    expect(indices?.rows.some((r) => r.symbol === 'SPY' && r.quote)).toBe(true);
    expect(indices?.advancers).toBeGreaterThanOrEqual(1);
    expect(indices?.decliners).toBeGreaterThanOrEqual(1);
  });

  it('buildRiskComposite: VIX subindo pressiona p/ risk-off', () => {
    const risk = buildRiskComposite(quotes);
    expect(risk.score).toBeLessThan(0);
    expect(['RISK-OFF', 'MISTO']).toContain(risk.label);
  });

  it('buildHeatmap inclui setores com tiles e breadth', () => {
    const sectors = buildHeatmap(quotes);
    expect(sectors.length).toBeGreaterThan(0);
    const tech = sectors.find((s) => s.id === 'tech');
    expect(tech?.tiles.some((t) => t.symbol === 'NVDA')).toBe(true);
    const breadth = buildBreadth(quotes, sectors);
    expect(breadth.length).toBe(sectors.length);
    expect(breadth.every((b) => b.pctAbove >= 0 && b.pctAbove <= 1)).toBe(true);
  });

  it('buildMovers ordena maiores altas e baixas', () => {
    const movers = buildMovers(quotes, 3);
    expect(movers.gainers[0].changePct).toBeGreaterThanOrEqual(movers.gainers[1]?.changePct ?? -1);
    expect(movers.losers[0].changePct).toBeLessThanOrEqual(movers.losers[1]?.changePct ?? 1);
    expect(movers.universeSize).toBeGreaterThan(0);
    expect(movers.advancers + movers.decliners).toBe(movers.universeSize);
  });

  it('MARKET_ALL_SYMBOLS inclui Environment + heatmap (sem duplicar)', () => {
    expect(MARKET_ALL_SYMBOLS).toContain('SPY');
    expect(MARKET_ALL_SYMBOLS).toContain('NVDA');
    expect(new Set(MARKET_ALL_SYMBOLS).size).toBe(MARKET_ALL_SYMBOLS.length);
  });

  it('buildBreadthDetail: adv/dec, distribuição e volume', () => {
    const detail = buildBreadthDetail(quotes);
    expect(detail.advancers).toBeGreaterThan(0);
    expect(detail.decliners).toBeGreaterThan(0);
    expect(detail.total).toBe(detail.advancers + detail.decliners + detail.unchanged);
    expect(detail.adLine).toBe(detail.advancers - detail.decliners);
    // A soma das faixas da distribuição = nº de cotações com variação.
    const distTotal = detail.distribution.reduce((s, d) => s + d.count, 0);
    expect(distTotal).toBe(detail.total);
    expect(detail.volumeRatio == null || (detail.volumeRatio >= 0 && detail.volumeRatio <= 1)).toBe(true);
  });
});
