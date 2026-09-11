// P3 — wealth com preço live: markPosition atualiza lastMarkPrice e o
// computePortfolio passa a usar o preço novo (cálculo à mão).
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';
import { WealthService, computePortfolio, applyBenchmark, saveCdiPoint, getCdiSeries, stockSalesTaxBase } from '../wealth';
import type { Position } from '../types';

function makeService() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId: 'dev-live', bus, channel: null });
  const wealth = new WealthService(ds, { markPriceMaxAgeDays: 7, now: () => '2026-07-01T12:00:00Z' });
  return { ds, wealth };
}

function pos(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-petr',
    accountId: 'acct-xp',
    symbol: 'PETR4',
    qty: 100,
    avgPrice: 40,
    updatedAt: '2026-06-01T00:00:00Z',
    deviceId: 'dev-live',
    version: 0,
    ...overrides,
  } as Position;
}

describe('portfolio live (P3)', () => {
  it('markPosition grava lastMarkPrice/lastMarkAt e portfolio usa o preço novo', async () => {
    const { ds, wealth } = makeService();
    await ds.accounts.put({
      id: 'acct-xp', kind: 'investment', name: 'XP', currency: 'BRL',
      hidden: false, defaultWeight: 1,
    } as never);
    await ds.positions.put(pos());
    // `now` congelado = now do markPosition, senão a marca cai em stale.
    const NOW = '2026-07-01T12:00:00Z';
    // antes: sem marcação, valor = custo (100*40=4000)
    const before = computePortfolio([pos()], { now: NOW });
    expect(before.totalValue).toBe(4000);
    // live: preço 42.10 => valor 4210, pnl 210
    const updated = await wealth.markPosition('pos-petr', 42.1);
    expect(updated.lastMarkPrice).toBe(42.1);
    expect(typeof updated.lastMarkAt).toBe('string');
    const after = computePortfolio([updated], { now: NOW });
    expect(after.totalValue).toBe(4210);
    expect(after.totalPnl).toBe(210);
  });

  it('markPosition rejeita preço <= 0 (nunca inventa preço)', async () => {
    const { ds, wealth } = makeService();
    await ds.positions.put(pos());
    await expect(wealth.markPosition('pos-petr', 0)).rejects.toThrow();
    await expect(wealth.markPosition('pos-petr', -5)).rejects.toThrow();
  });
});

describe('A1 — dividendos e yield on cost (cálculo à mão)', () => {
  const NOW = '2026-07-01T12:00:00Z';
  const p = (over = {}) => pos({
    id: 'pos-vale', symbol: 'VALE3', qty: 100, avgPrice: 50,
    lastMarkPrice: 60, lastMarkAt: '2026-06-30T00:00:00Z', ...over,
  });

  it('provento soma no yield sem mexer no cost basis', () => {
    // custo 5000, valor 6000, pnl 1000; +300 dividendos => yield (1000+300)/5000 = 26%
    const r = computePortfolio([p()], { now: NOW, dividends: { 'pos-vale': 300 } });
    expect(r.rows[0]).toMatchObject({ costBasis: 5000, dividends: 300, yieldOnCost: 0.26 });
    expect(r.dividendsTotal).toBe(300);
    expect(r.totalPnl).toBe(1000); // PnL puro inalterado
  });

  it('sem proventos, yield = pnl/custo; sem custo, yield 0 (nunca NaN)', () => {
    const r = computePortfolio([p()], { now: NOW });
    expect(r.rows[0]).toMatchObject({ dividends: 0, yieldOnCost: 0.2 });
    expect(r.dividendsTotal).toBe(0);
    const z = computePortfolio([p({ qty: 0, avgPrice: 0 })], { now: NOW, dividends: { 'pos-vale': 10 } });
    expect(z.rows[0].yieldOnCost).toBe(0);
  });
});

describe('A8 — renda fixa com accrual (cálculo à mão)', () => {
  const NOW = '2026-07-01T12:00:00Z';
  // CDB 12% a.a., 1000 cotas a 100, start 2026-01-01 (181 dias até 01/jul):
  // grown = 100 * 1.12^(181/365) ≈ 105.7828 → juros ≈ 5.7828/cota → 5782.80 total
  const cdb = (over = {}) => pos({
    id: 'pos-cdb', symbol: 'CDB-XP', qty: 1000, avgPrice: 100,
    assetKind: 'fixed', yieldRate: 0.12, yieldType: 'pre',
    updatedAt: '2026-01-01T12:00:00Z',
    lastMarkPrice: undefined, lastMarkAt: undefined, ...over,
  });

  it('pré com taxa cresce sem marcação manual', () => {
    const r = computePortfolio([cdb()], { now: NOW });
    const row = r.rows[0];
    const expected = Number((100 * (1.12 ** (181 / 365)) - 100) * 1000).toFixed(2);
    expect(row.accruedInterest).toBe(Number(expected));
    expect(row.markPrice).toBeCloseTo(100 * (1.12 ** (181 / 365)), 2);
    // marketValue = qty × markPrice(arredondado): difere do cálculo direto pelo
    // duplo arredondamento (< 1 unidade) — por isso tolerância larga aqui.
    expect(row.marketValue).toBe(105780);
    expect(Math.abs(row.marketValue - (row.costBasis + row.accruedInterest))).toBeLessThan(1);
    expect(r.totalValue).toBe(row.marketValue);
  });

  it('pos/ipca caem no marco manual; sem taxa idêntico ao equity', () => {
    const r = computePortfolio([
      cdb({ id: 'a', yieldType: 'pos' }),
      cdb({ id: 'b', yieldType: 'ipca' }),
      cdb({ id: 'c', yieldRate: undefined }),
    ], { now: NOW });
    for (const row of r.rows) {
      expect(row.accruedInterest).toBe(0);
      expect(row.marketValue).toBe(row.costBasis); // sem mark => avgPrice
    }
  });
});

describe('A5 — posições USD com conversão (cálculo à mão)', () => {
  const NOW = '2026-07-01T12:00:00Z';
  const brl = (over = {}) => pos({ id: 'p-br', symbol: 'VALE3', qty: 100, avgPrice: 50, lastMarkPrice: 60, lastMarkAt: '2026-06-30T00:00:00Z', ...over });
  const usd = (over = {}) => pos({ id: 'p-us', symbol: 'AAPL', currency: 'USD', qty: 10, avgPrice: 200, lastMarkPrice: 220, lastMarkAt: '2026-06-30T00:00:00Z', ...over });

  it('USD com fx 5.0 converte custo e valor; BRL intacto', () => {
    const r = computePortfolio([brl(), usd()], { now: NOW, fxUSD: 5.0 });
    // BRL: custo 5000, valor 6000. USD: custo 2000*5=10000, valor 2200*5=11000.
    expect(r.totalCost).toBe(15000);
    expect(r.totalValue).toBe(17000);
    expect(r.totalPnl).toBe(2000);
    expect(r.fxUSD).toBe(5.0);
    expect(r.unconverted).toBe(0);
    expect(r.rows.find((x) => x.id === 'p-us')).toMatchObject({ currency: 'USD', converted: true });
    expect(r.rows.find((x) => x.id === 'p-br')).toMatchObject({ currency: 'BRL', converted: true });
  });

  it('USD sem taxa fica FORA dos totais (nunca converte no olho) + unconverted', () => {
    const r = computePortfolio([brl(), usd()], { now: NOW });
    expect(r.totalCost).toBe(5000);
    expect(r.totalValue).toBe(6000);
    expect(r.fxUSD).toBeNull();
    expect(r.unconverted).toBe(1);
    // linha mantém números nativos para exibição honesta
    expect(r.rows.find((x) => x.id === 'p-us')).toMatchObject({ costBasis: 2000, marketValue: 2200, converted: false });
  });

  it('fx inválido (0/negativo) equivale a sem taxa', () => {
    const r = computePortfolio([usd()], { now: NOW, fxUSD: 0 });
    expect(r.totalCost).toBe(0);
    expect(r.unconverted).toBe(1);
  });
});

describe('A3 — benchmark CDI (cálculo à mão)', () => {
  const hist = [
    { at: '2026-01-15T12:00:00Z', value: 10000, cost: 10000 },
    { at: '2026-02-15T12:00:00Z', value: 11000, cost: 10000 },
    { at: '2026-04-10T12:00:00Z', value: 12000, cost: 10000 },
  ];
  const cdi = [
    { ym: '2026-01', pct: 0.01 },
    { ym: '2026-02', pct: 0.01 },
    { ym: '2026-03', pct: 0.01 },
  ];

  it('base 100 no 1º ponto; compõe mês a mês; mês sem dado segura flat', () => {
    const out = applyBenchmark(hist, cdi);
    expect(out.map((p) => p.index)).toEqual([100, 101, 102.01]);
    expect(out.map((p) => p.at)).toEqual(hist.map((h) => h.at));
  });

  it('sem série ou sem histórico retorna [] (chart inalterado)', () => {
    expect(applyBenchmark(hist, [])).toEqual([]);
    expect(applyBenchmark([], cdi)).toEqual([]);
  });

  it('saveCdiPoint valida e ordena; getCdiSeries filtra inválidos', async () => {
    const { ds } = makeService();
    await saveCdiPoint(ds, '2026-02', 0.01);
    await saveCdiPoint(ds, '2026-01', 0.02);
    expect(await getCdiSeries(ds)).toEqual([
      { ym: '2026-01', pct: 0.02 },
      { ym: '2026-02', pct: 0.01 },
    ]);
    await expect(saveCdiPoint(ds, '2026', 0.01)).rejects.toThrow();
    await expect(saveCdiPoint(ds, '2026-03', -1)).rejects.toThrow();
  });
});

describe('A4 — stockSalesTaxBase FIFO (cálculo à mão)', () => {
  const tx = (over) => ({
    accountId: 'a1', amount: 0, currency: 'BRL', date: '2026-01-01T12:00:00Z',
    updatedAt: '2026-01-01T12:00:00Z', deviceId: 'dev', version: 0, ...over,
  });
  // Compras: 100×50 (jan) + 100×60 (fev). Venda 120×70 (mar):
  // consome 100@50 + 20@60 = 6200; recebe 8400; ganho 2200.
  const txs = [
    tx({ id: 'b1', kind: 'buy', amount: -5000, date: '2026-01-10T12:00:00Z', asset: { symbol: 'VALE3', qty: 100, price: 50 } }),
    tx({ id: 'b2', kind: 'buy', amount: -6000, date: '2026-02-10T12:00:00Z', asset: { symbol: 'VALE3', qty: 100, price: 60 } }),
    tx({ id: 's1', kind: 'sell', amount: 8400, date: '2026-03-10T12:00:00Z', asset: { symbol: 'VALE3', qty: 120, price: 70 } }),
    tx({ id: 's2', kind: 'sell', amount: 500, date: '2026-03-12T12:00:00Z' }),
    tx({ id: 's3', kind: 'sell', amount: 999, date: '2026-04-10T12:00:00Z', asset: { symbol: 'VALE3', qty: 10, price: 99.9 } }),
  ];

  it('ganho FIFO da venda no mês + venda sem asset com gain null', () => {
    const r = stockSalesTaxBase(txs, '2026-03');
    expect(r.sales).toHaveLength(2);
    expect(r.sales[0]).toMatchObject({ symbol: 'VALE3', qty: 120, proceeds: 8400, cost: 6200, gain: 2200 });
    expect(r.sales[1]).toMatchObject({ symbol: '(sem ativo)', gain: null });
    expect(r.monthGain).toBe(2200);
  });

  it('outro mês não entra; mês vazio zera', () => {
    expect(stockSalesTaxBase(txs, '2026-04').monthGain).toBeGreaterThan(0);
    expect(stockSalesTaxBase(txs, '2026-05')).toMatchObject({ sales: [], monthGain: 0 });
  });
});
