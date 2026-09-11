import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { RiskService } from '../risk';
import { EventBus } from '../events';
import type { Account, PropExtension, Trade } from '../types';

function makeService(deviceId = 'dev-test') {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId, bus, channel: null });
  const chain = new DataChainEngine(ds);
  const risk = new RiskService(ds, chain);
  return { ds, chain, risk, bus };
}

function propAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'a1', kind: 'prop', name: 'FTMO', currency: 'USD', hidden: false, defaultWeight: 1, ...overrides } as Account;
}

function propExt(overrides: Partial<PropExtension> = {}): PropExtension {
  return {
    accountId: 'a1', nominalSize: 100000, challengeCost: 500, phase: 'funded', target: 100000,
    maxDD: 0.1, trailingDD: 0.1, dailyDD: 0.05, consistencyPct: 0.4, minDays: 1,
    payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Rise' },
    profitSplit: 0.8, payoutFrequency: 'monthly', ...overrides,
  } as PropExtension;
}

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 't1', accountId: 'a1', symbol: 'EURUSD', direction: 'long',
    entryDatetime: '2026-01-01T10:00:00Z', exitDatetime: '2026-01-01T11:00:00Z',
    qty: 1, entryPrice: 100, exitPrice: 110, commission: 0, swap: 0, rebate: 0, fees: 0,
    source: 'manual', resultNet: 10, resultR: 2, ...overrides,
  } as Trade;
}

describe('RiskService', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => { ctx = makeService(); });

  it('calcula risco de conta prop (SAFE quando DD baixo)', async () => {
    const { ds, risk } = ctx;
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt());
    await ds.trades.put(trade({ id: 't1', resultNet: 10 }));

    const row = await risk.riskFor(propAccount(), propExt());
    expect(row.metrics.equity).toBe(100010);
    expect(row.status.status).toBe('SAFE');
  });

  it('agrega snapshot de todas as contas e conta os níveis', async () => {
    const { ds, risk } = ctx;
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt());
    // Segunda conta não-prop (cash) rastreada.
    await ds.accounts.put({ id: 'cash1', kind: 'cash', name: 'Cash', currency: 'USD', hidden: false, defaultWeight: 1 } as Account);
    // Prop em STOP (DD alto).
    await ds.propExtensions.put(propExt({ maxDD: 0.0001, trailingDD: 0.0001, dailyDD: 0.0001, accountId: 'a1' }));
    await ds.trades.put(trade({ id: 't1', entryPrice: 100, exitPrice: 50, resultNet: -5000, qty: 100 }));

    const snap = await risk.snapshot();
    expect(snap.rows.length).toBe(2);
    expect(snap.counts.STOP).toBe(1);
    expect(snap.counts.SAFE).toBe(1);
    expect(snap.worst?.account.id).toBe('a1');
  });

  it('emite risk:warning quando uma conta cruza o limiar', async () => {
    const { ds, risk, bus } = ctx;
    const warnings: unknown[] = [];
    bus.on('risk:warning', (p) => warnings.push(p));
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt({ maxDD: 0.0001, trailingDD: 0.0001, dailyDD: 0.0001 }));
    await ds.trades.put(trade({ id: 't1', entryPrice: 100, exitPrice: 50, resultNet: -5000, qty: 100 }));

    await risk.snapshot();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('pnlToday e tradesToday refletem os trades fechados hoje', async () => {
    const { ds, risk } = ctx;
    const today = new Date().toISOString();
    await ds.trades.put(trade({ id: 'win', entryDatetime: today, exitDatetime: today, entryPrice: 100, exitPrice: 110, resultNet: 10 }));
    await ds.trades.put(trade({ id: 'loss', entryDatetime: today, exitDatetime: today, entryPrice: 100, exitPrice: 95, resultNet: -5 }));
    const stats = await risk.todayStats();
    expect(stats.pnlToday).toBe(5);
    expect(stats.tradesToday.win).toBe(1);
    expect(stats.tradesToday.loss).toBe(1);
  });
});

describe('A1 — trailing-DD live (posições abertas)', () => {
  it('sem live: idêntico ao cálculo anterior, includesLive falsy', async () => {
    const { ds, risk } = makeService();
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt());
    const row = await risk.riskFor(propAccount(), propExt());
    expect(row.metrics.equity).toBe(100000);
    expect(row.metrics.includesLive).toBeFalsy();
    expect(row.metrics.livePnl ?? 0).toBe(0);
  });

  it('live negativo aprofunda DD e marca badge; positivo abate', async () => {
    const { ds, risk } = makeService();
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt());
    const base = await risk.riskFor(propAccount(), propExt());
    const neg = await risk.riskFor(propAccount(), propExt(), { pnl: -3000, count: 1 });
    expect(neg.metrics.equity).toBe(97000);
    expect(neg.metrics.includesLive).toBe(true);
    expect(neg.metrics.liveCount).toBe(1);
    expect(neg.metrics.trailingDDUsed).toBeGreaterThan(base.metrics.trailingDDUsed ?? 0);
    // trailing 10% de 100k = 10000 limite; 3000/10000 = 0.3
    expect(neg.metrics.trailingDDUsed).toBeCloseTo(0.3, 5);
    const pos = await risk.riskFor(propAccount(), propExt(), { pnl: 2000, count: 1 });
    expect(pos.metrics.equity).toBe(102000);
    expect(pos.metrics.trailingDDUsed).toBe(0);
  });

  it('snapshot repassa liveByAccount só para a conta certa', async () => {
    const { ds, risk } = makeService();
    await ds.accounts.put(propAccount());
    await ds.accounts.put(propAccount({ id: 'a2', name: 'E8' }));
    await ds.propExtensions.put(propExt());
    await ds.propExtensions.put(propExt({ accountId: 'a2' }));
    const snap = await risk.snapshot({ a1: { pnl: -1000, count: 2 } });
    const r1 = snap.rows.find((r) => r.account.id === 'a1');
    const r2 = snap.rows.find((r) => r.account.id === 'a2');
    expect(r1?.metrics.includesLive).toBe(true);
    expect(r1?.metrics.equity).toBe(99000);
    expect(r2?.metrics.includesLive).toBeFalsy();
    expect(r2?.metrics.equity).toBe(100000);
  });
});

describe('A3 — payout:eligible 1x por ciclo', () => {
  // 5 dias +20 cada: equity 100100 >= 50, DD ~0, 5 dias, consistency 20/100 = 0.2 <= 0.4
  async function seedEligible() {
    const { ds, risk, bus } = makeService();
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt({ target: 50, minDays: 1, consistencyPct: 0.4 }));
    for (let d = 1; d <= 5; d += 1) {
      const day = `2026-09-0${d}`;
      await ds.trades.put(trade({
        id: `e${d}`, entryPrice: 100, exitPrice: 120,
        entryDatetime: `${day}T10:00:00Z`, exitDatetime: `${day}T11:00:00Z`,
        resultNet: 20, resultR: 1,
      }));
    }
    const events = [];
    bus.on('payout:eligible', (p) => events.push(p));
    return { ds, risk, events };
  }

  it('dispara 1x, silencia no 2º snapshot, reabre após payout novo', async () => {
    const { ds, risk, events } = await seedEligible();
    await risk.snapshot();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ accountId: 'a1', accountName: 'FTMO' });
    await risk.snapshot();
    expect(events).toHaveLength(1); // sem spam
    await ds.payouts.put({
      id: 'pay1', accountIds: ['a1'], gross: 100, fee: 20, net: 80,
      splitByAccount: {}, status: 'Paid', method: 'Wise', attachments: {},
      updatedAt: '2026-09-06T12:00:00Z', deviceId: 'dev-test', version: 0,
    });
    await risk.snapshot();
    expect(events).toHaveLength(2); // ciclo novo reabre o alerta
  });

  it('conta inelegível nunca emite', async () => {
    const { ds, risk, bus } = makeService();
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt()); // target 100000, sem trades => inelegível
    const events = [];
    bus.on('payout:eligible', (p) => events.push(p));
    await risk.snapshot();
    expect(events).toHaveLength(0);
  });
});
