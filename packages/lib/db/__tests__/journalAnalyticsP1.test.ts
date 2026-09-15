// P1 — analytics adicionais do Trading (daily PnL, expectancy móvel, R box, heatmap dia).
import { describe, it, expect } from 'vitest';
import { dailyPnlSeries, rollingExpectancy, rBoxStats, heatmapByWeekday } from '../journalAnalytics';

const trade = (id, exitDate, resultNet, resultR, direction = 'long') => ({
  id,
  accountId: 'a',
  symbol: 'EURUSD',
  direction,
  entryDatetime: exitDate,
  exitDatetime: exitDate,
  exitPrice: 1.1,
  entryPrice: 1.09,
  qty: 1,
  commission: 0,
  swap: 0,
  fees: 0,
  resultNet,
  resultR,
  rebate: 0,
  source: 'manual',
  updatedAt: exitDate,
  deviceId: 'd',
  version: 0,
});

const TRADES: any[] = [
  trade('t1', '2026-09-07T10:00:00Z', 100, 1),   // Segunda
  trade('t2', '2026-09-07T12:00:00Z', -50, -0.5), // Segunda
  trade('t3', '2026-09-08T10:00:00Z', 200, 2),   // Terça
];

describe('P1 — analytics do Trading', () => {
  it('dailyPnlSeries agrupa por dia', () => {
    const days = dailyPnlSeries(TRADES);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: '2026-09-07', pnl: 50, trades: 2, wins: 1, losses: 1 });
  });

  it('rBoxStats devolve quartis', () => {
    const b = rBoxStats(TRADES);
    expect(b?.count).toBe(3);
    expect(b?.min).toBe(-0.5);
    expect(b?.max).toBe(2);
    expect(b?.median).toBe(1);
  });

  it('rollingExpectancy exige amostra >= janela', () => {
    expect(rollingExpectancy(TRADES, 20)).toEqual([]);
    const pts = rollingExpectancy(TRADES, 3);
    expect(pts).toHaveLength(1);
    expect(pts[0].expectancy).toBeCloseTo((1 - 0.5 + 2) / 3, 3);
  });

  it('heatmapByWeekday agrupa por dia da semana (Segunda = 1)', () => {
    const wd = heatmapByWeekday(TRADES);
    const mon = wd.find((w) => w.weekday === 1);
    const tue = wd.find((w) => w.weekday === 2);
    expect(mon).toMatchObject({ label: 'Seg', trades: 2, pnl: 50 });
    expect(tue).toMatchObject({ label: 'Ter', trades: 1, pnl: 200 });
  });
});
