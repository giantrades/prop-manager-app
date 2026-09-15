import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { MoneyService } from '../money';
import { WealthService } from '../wealth';
import { RiskService } from '../risk';
import { EventBus } from '../events';
import { nowIso } from '../dateUtils';
import { buildCommandSnapshot, generateInsights, buildActions, firmPnlByFirm } from '../financialIntelligence';
import type { Account, Goal, Payout, PropExtension, Trade, Transaction } from '../types';

function makeServices(deviceId = 'dev-intel') {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId, bus, channel: null });
  const chain = new DataChainEngine(ds);
  const money = new MoneyService(ds, chain);
  const wealth = new WealthService(ds);
  const risk = new RiskService(ds, chain, { emitWarnings: false });
  return { ds, chain, money, wealth, risk };
}

function wallet(overrides: Partial<Account> = {}): Account {
  return {
    id: 'wallet-wise', kind: 'wallet', name: 'Wise', currency: 'USD', hidden: false, defaultWeight: 1,
    updatedAt: nowIso(), deviceId: 'dev-intel', version: 0, ...overrides,
  } as Account;
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`, accountId: 'wallet-wise', kind: 'payout_in',
    amount: 2560, currency: 'USD', date: nowIso(), updatedAt: nowIso(), deviceId: 'dev-intel', version: 0,
    ...overrides,
  } as Transaction;
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1', kind: 'networth', targetValue: 1000, currentDerived: 0, name: 'Meta NW',
    updatedAt: nowIso(), deviceId: 'dev-intel', version: 0, ...overrides,
  } as Goal;
}

function payout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: 'payout-1', accountIds: ['wallet-wise'], gross: 3200, fee: 640, net: 2560,
    splitByAccount: { 'wallet-wise': { gross: 3200, net: 2560, fee: 640 } },
    status: 'Pending', method: 'Wise', attachments: {}, date: nowIso(),
    updatedAt: nowIso(), deviceId: 'dev-intel', version: 0, ...overrides,
  } as Payout;
}

function trade(overrides: Partial<Trade> = {}): Trade {
  const ym = nowIso().slice(0, 7);
  return {
    id: 't1', accountId: 'wallet-wise', symbol: 'EURUSD', direction: 'long',
    entryDatetime: `${ym}-10T09:00:00Z`, exitDatetime: `${ym}-10T10:00:00Z`,
    qty: 1, entryPrice: 100, exitPrice: 110, commission: 0, swap: 0, rebate: 0, fees: 0,
    source: 'manual', resultNet: 100, resultR: 2, ...overrides,
  } as Trade;
}

describe('Fase 6 — Financial Intelligence (leitura-only, fonte citável)', () => {
  let ctx: ReturnType<typeof makeServices>;
  beforeEach(() => { ctx = makeServices(); });

  it('buildCommandSnapshot agrega motores sem inventar número', async () => {
    const { ds, wealth } = ctx;
    await ds.accounts.put(wallet());
    await ds.transactions.put(tx({ firmId: 'E8' }));
    await ds.payouts.put(payout());
    await ds.goals.put(goal({ targetValue: 1000 }));
    await ds.trades.put(trade());
    await wealth.setMonthlyInputs({
      monthlyIncome: 10000, monthlyBills: 2000, monthlyTaxReserve: 500, monthlyContributions: 1000,
      next30dBills: 0, taxReserve: 0,
    });

    const s = await buildCommandSnapshot(ctx);
    expect(s.netWorth.netWorth).toBeGreaterThan(0);
    expect(s.netWorth.components.cash).toBe(2560);
    expect(s.firmPnl.length).toBeGreaterThan(0);
    expect(s.pendingPayouts.some((p) => p.id === 'payout-1')).toBe(true);
    expect(s.forecast.netMonthly).toBe(6500);
    expect(s.risk.rows.length).toBeGreaterThan(0);
  });

  it('insight de caixa cita exatamente os números do snapshot (nenhum inventado)', async () => {
    const { ds, wealth } = ctx;
    await ds.accounts.put(wallet());
    await ds.transactions.put(tx({ firmId: 'E8' }));
    await wealth.setMonthlyInputs({
      monthlyIncome: 10000, monthlyBills: 2000, monthlyTaxReserve: 500, monthlyContributions: 1000,
      next30dBills: 0, taxReserve: 0,
    });

    const s = await buildCommandSnapshot(ctx);
    const insights = generateInsights(s);
    const cashInsight = insights.find((i) => i.kind === 'cash');
    expect(cashInsight).toBeDefined();
    expect(cashInsight!.data.cash).toBe(s.netWorth.components.cash);
    expect(cashInsight!.data.netWorth).toBe(s.netWorth.netWorth);
    expect(cashInsight!.source).toContain('wealth.netWorth()');
  });

  it('todo insight tem fonte citável e texto baseado nos dados', async () => {
    const { ds, wealth } = ctx;
    await ds.accounts.put(wallet());
    await ds.transactions.put(tx({ firmId: 'E8' }));
    await ds.trades.put(trade());
    await wealth.setMonthlyInputs({
      monthlyIncome: 10000, monthlyBills: 2000, monthlyTaxReserve: 500, monthlyContributions: 1000,
      next30dBills: 0, taxReserve: 0,
    });

    const s = await buildCommandSnapshot(ctx);
    const insights = generateInsights(s);
    expect(insights.length).toBeGreaterThan(0);
    for (const ins of insights) {
      expect(ins.source.length).toBeGreaterThan(0);
      expect(ins.text.length).toBeGreaterThan(0);
      // Nenhum campo de data deve ser undefined/NaN (não inventa número).
      for (const v of Object.values(ins.data)) {
        if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('insight de origem de payouts cita o firm de maior payout', async () => {
    const { ds } = ctx;
    await ds.accounts.put(wallet());
    await ds.transactions.put(tx({ firmId: 'E8' }));
    await ds.transactions.put(tx({ firmId: 'E8', amount: 4000, date: nowIso() }));

    const s = await buildCommandSnapshot(ctx);
    const growth = generateInsights(s).find((i) => i.kind === 'growth');
    expect(growth).toBeDefined();
    expect(growth!.data.topFirmPayouts).toBe(s.firmPnl[0].payouts);
    expect(growth!.source).toContain('money.firmPnl');
  });

  it('buildActions deriva DARF, payout pendente e meta concluída (flags dos motores)', async () => {
    const { ds, wealth } = ctx;
    await ds.accounts.put(wallet());
    await ds.transactions.put(tx({ firmId: 'E8' }));
    await ds.payouts.put(payout({ status: 'Pending' }));
    // Meta concluída: target baixo (netWorth >= 2560).
    await ds.goals.put(goal({ targetValue: 1000 }));
    // DARF: trade do mês com lucro.
    await ds.trades.put(trade());

    const s = await buildCommandSnapshot(ctx);
    const actions = buildActions(s);

    // Ação de DARF removida (cockpit de day/swing não existe mais).
    expect(actions.some((a) => (a as { kind: string }).kind === 'tax')).toBe(false);

    const payoutAction = actions.find((a) => a.kind === 'payout' && a.id.includes('payout-1'));
    expect(payoutAction).toBeDefined();

    const goalAction = actions.find((a) => a.kind === 'goal');
    expect(goalAction).toBeDefined();
    expect(goalAction!.source).toContain('wealth.goals()');
  });

  it('firmPnlByFirm agrupa por firm e usa a fórmula única', async () => {
    const { ds } = ctx;
    await ds.transactions.put(tx({ firmId: 'E8', amount: 3000 }));
    await ds.transactions.put(tx({ firmId: 'E8', amount: -500, kind: 'challenge_cost' }));
    const result = firmPnlByFirm(await ds.transactions.list());
    expect(result).toHaveLength(1);
    expect(result[0].firmId).toBe('E8');
    expect(result[0].payouts).toBe(3000);
    expect(result[0].costs).toBe(500);
    expect(result[0].profit).toBe(2500);
  });
});
