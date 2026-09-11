import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';
import { strategyMetrics, allStrategyMetrics, deleteStrategyClean, MIN_SAMPLE } from '../strategies';
import type { Trade } from '../types';

function makeService(deviceId = 'dev-test') {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const ds = new DataService({ adapter, deviceId, bus: new EventBus(), channel: null });
  return { ds, adapter };
}

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 't-1', strategyId: 's1', accountId: 'a1', symbol: 'EURUSD', direction: 'long',
    entryDatetime: '2026-01-01T10:00:00Z', exitDatetime: '2026-01-01T11:00:00Z',
    qty: 1, entryPrice: 100, exitPrice: 110, commission: 0, swap: 0, rebate: 0, fees: 0,
    source: 'manual', resultNet: 10, resultR: 2, ...overrides,
  } as Trade;
}

describe('strategies — métricas', () => {
  it('sampleSufficient = false quando n < 20', () => {
    const m = strategyMetrics('s1', [trade()]);
    expect(m.n).toBe(1);
    expect(m.sampleSufficient).toBe(false);
    expect(m.n < MIN_SAMPLE).toBe(true);
  });

  it('calcula winRate, avgR, PF, expectancy', () => {
    const trades = [
      trade({ id: 'a', resultNet: 10, resultR: 2 }),
      trade({ id: 'b', resultNet: -5, resultR: -1 }),
      trade({ id: 'c', resultNet: 10, resultR: 2 }),
    ];
    const m = strategyMetrics('s1', trades);
    expect(m.winRate).toBeCloseTo(2 / 3, 4);
    expect(m.avgR).toBeCloseTo((2 - 1 + 2) / 3, 4);
    // PF = 20 / 5 = 4
    expect(m.profitFactor).toBe(4);
    expect(m.long.n).toBe(3);
  });

  it('consistência ponderada = melhor dia / total (rateado por weight)', () => {
    const trades = [
      trade({ id: 'a', entryDatetime: '2026-01-01T10:00:00Z', exitDatetime: '2026-01-01T11:00:00Z', entryPrice: 100, exitPrice: 110, resultNet: 10 }),
      trade({ id: 'b', entryDatetime: '2026-01-02T10:00:00Z', exitDatetime: '2026-01-02T11:00:00Z', entryPrice: 100, exitPrice: 105, resultNet: 5 }),
    ];
    const m = strategyMetrics('s1', trades);
    // melhor dia = 10, total = 15 => 0.6667
    expect(m.weightedConsistency).toBeCloseTo(10 / 15, 5);
  });

  it('allStrategyMetrics agrega por estratégia', () => {
    const trades = [
      trade({ id: 'a', strategyId: 's1', resultNet: 10 }),
      trade({ id: 'b', strategyId: 's2', resultNet: 5 }),
    ];
    const all = allStrategyMetrics(trades);
    expect(all.length).toBe(2);
    expect(all.find((x) => x.strategyId === 's1')?.n).toBe(1);
  });
});

describe('strategies — delete sem órfão', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => { ctx = makeService(); });

  it('desvincula trades (strategyId -> undefined) ao deletar estratégia', async () => {
    const { ds } = ctx;
    await ds.trades.bulkPut([
      trade({ id: 'a', strategyId: 's1' }),
      trade({ id: 'b', strategyId: 's2' }),
    ]);
    const result = await deleteStrategyClean(ds, 's1');
    expect(result.unlinkedTrades).toEqual(['a']);
    const trades = await ds.trades.list();
    const unlinked = trades.find((t) => t.id === 'a');
    expect(unlinked?.strategyId).toBeUndefined();
    // trade da outra estratégia não foi tocado
    expect(trades.find((t) => t.id === 'b')?.strategyId).toBe('s2');
  });
});
