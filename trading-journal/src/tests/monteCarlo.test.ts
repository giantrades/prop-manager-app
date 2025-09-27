// @apps/trading-journal/src/tests/monteCarlo.test.ts
import { describe, it, expect } from 'vitest';
import { simulateRun as simulateRunStandalone, computeSummary as computeSummaryStandalone } from './testHelpers/monteHelpers';

describe('MonteCarlo logic (standalone)', () => {
  it('simulates a basic run and returns non-negative final equity', () => {
    const cfg = {
      maxTradesPerRun: 100,
      winProb: 0.5,
      expectancyR: 0.3,
      riskPerTradePct: 0.01,
      initialCapital: 10000,
    } as any;
    const rng = () => Math.random();
    const r = simulateRunStandalone(cfg, rng, []);
    expect(r.finalEquity).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(r.equitySeries)).toBeTruthy();
  });

  it('computes summary from multiple runs', () => {
    // create three dummy runs
    const runs = [
      { finalEquity: 12000, returnsPerTrade: [0.01, 0.02], tradesSimulated: 2, equitySeries: [10000, 10100, 12000], maxDrawdown: 0.05 },
      { finalEquity: 8000, returnsPerTrade: [-0.02, -0.1], tradesSimulated: 2, equitySeries: [10000, 9800, 8000], maxDrawdown: 0.2 },
      { finalEquity: 10050, returnsPerTrade: [0.005], tradesSimulated: 1, equitySeries: [10000, 10050], maxDrawdown: 0.01 },
    ];
    const cfg = { initialCapital: 10000, tradesPerYear: 252 } as any;
    const s = computeSummaryStandalone(runs, cfg);
    expect(s.totalRuns).toBe(3);
    expect(typeof s.cagr).toBe('number');
  });
});
