import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus } from '../events';
import type { Account, PropExtension, Trade, Payout } from '../types';

function makeService(deviceId = 'dev-test') {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const ds = new DataService({ adapter, deviceId, bus: new EventBus(), channel: null });
  const chain = new DataChainEngine(ds);
  return { ds, chain, adapter };
}

function propAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct-prop',
    kind: 'prop',
    name: 'FTMO',
    currency: 'USD',
    hidden: false,
    defaultWeight: 1,
    ...overrides,
  } as Account;
}

function propExt(overrides: Partial<PropExtension> = {}): PropExtension {
  return {
    accountId: 'acct-prop',
    nominalSize: 100000,
    challengeCost: 500,
    phase: 'funded',
    target: 100000,
    maxDD: 0.1,
    trailingDD: 0.1,
    dailyDD: 0.05,
    consistencyPct: 0.4,
    minDays: 1,
    payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Rise' },
    profitSplit: 0.8,
    payoutFrequency: 'monthly',
    ...overrides,
  } as PropExtension;
}

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    accountId: 'acct-prop',
    symbol: 'EURUSD',
    direction: 'long',
    entryDatetime: '2026-01-01T10:00:00Z',
    exitDatetime: '2026-01-01T11:00:00Z',
    qty: 1,
    entryPrice: 100,
    exitPrice: 110,
    commission: 0,
    swap: 0,
    rebate: 0,
    fees: 0,
    source: 'manual',
    resultNet: 10,
    resultR: null,
    ...overrides,
  } as Trade;
}

async function seedProp(ds: DataService) {
  await ds.accounts.put(propAccount());
  await ds.propExtensions.put(propExt());
}

describe('DataChainEngine — Trade -> Ledger -> Equity -> Eligibility -> Wallet', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('cria Transaction de custo no ledger a partir do trade', async () => {
    const { ds, chain } = ctx;
    await seedProp(ds);
    const t = trade({ commission: 5, swap: 2, rebate: 3, fees: 1 });
    await ds.trades.put(t);
    await chain.syncTrade(t);

    const txs = await ds.transactions.list();
    const kinds = txs.map((x) => x.kind).sort();
    expect(kinds).toEqual(['commission', 'fee', 'rebate', 'swap']);
    const commission = txs.find((x) => x.kind === 'commission');
    expect(commission?.amount).toBe(-5);
    const rebate = txs.find((x) => x.kind === 'rebate');
    expect(rebate?.amount).toBe(3);
    expect(commission?.ref).toEqual({ type: 'tradeId', id: 'trade-1' });
  });

  it('recalcula equity derivada (nunca escreve saldo direto)', async () => {
    const { ds, chain } = ctx;
    await seedProp(ds);
    const t = trade(); // pnl = +10
    await ds.trades.put(t);
    await chain.syncTrade(t);

    const equity = await chain.computeEquity('acct-prop');
    expect(equity).toBe(100010);

    // Proibido: account não ganhou campo currentFunding escrito.
    const acct = await ds.accounts.get('acct-prop');
    expect((acct as unknown as Record<string, unknown>).currentFunding).toBeUndefined();
  });

  it('Trade -> Eligibility verde quando equity >= target e DD ok', async () => {
    const { ds, chain } = ctx;
    // Consistency alta (1.0) pra 1 único dia de lucro passar no checklist.
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt({ consistencyPct: 1.0 }));
    const t = trade();
    await ds.trades.put(t);
    await chain.syncTrade(t);

    const result = await chain.checkPayoutEligibility('acct-prop');
    expect(result).not.toBeNull();
    expect(result!.eligible).toBe(true);
    expect(result!.checks.equityReachedTarget).toBe(true);
    expect(result!.checks.drawdownOk).toBe(true);
    expect(result!.checks.daysOperatedOk).toBe(true);
  });

  it('Trade -> Wallet: payout gera payout_in + fee e calcula net total', async () => {
    const { ds, chain } = ctx;
    await seedProp(ds);
    // Cria wallet de destino.
    await ds.accounts.put({
      id: 'wallet-1',
      kind: 'wallet',
      name: 'Wise',
      currency: 'USD',
      hidden: false,
      defaultWeight: 1,
    } as Account);

    const payout: Payout = {
      id: 'payout-1',
      accountIds: ['acct-prop'],
      gross: 10000,
      fee: 2000,
      net: 8000,
      splitByAccount: { 'acct-prop': { gross: 10000, net: 8000, fee: 2000 } },
      status: 'Paid',
      method: 'Rise',
      attachments: {},
      updatedAt: '2026-01-05T00:00:00Z',
      deviceId: 'dev-test',
      version: 0,
    };
    const result = await chain.applyPayout(payout, { destinationAccountId: 'wallet-1' });

    expect(result.totalNet).toBe(8000);
    expect(result.totalFee).toBe(2000);
    const txs = await ds.transactions.list();
    const inTx = txs.find((x) => x.kind === 'payout_in');
    const feeTx = txs.find((x) => x.id === 'payout-1:acct-prop:fee');
    // payout_in = GROSS (o que a firm grossou); fee = -fee. Net = gross - fee = 8000.
    expect(inTx?.amount).toBe(10000);
    expect(feeTx?.amount).toBe(-2000);
    expect(inTx?.accountId).toBe('wallet-1');
    // Wallet recebe o net (gross - fee).
    const walletBal = (await ds.transactions.list())
      .filter((x) => x.accountId === 'wallet-1')
      .reduce((s, x) => s + x.amount, 0);
    expect(walletBal).toBe(8000);
  });
});

describe('DataChainEngine — drawdown trailing vs daily', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService();
  });

  it('trailingDD usa o pico absoluto; dailyDD usa a equity do início do dia', async () => {
    const { ds, chain } = ctx;
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt({ nominalSize: 100000 }));

    // Trade A: +5000 no dia 1.
    const tA = trade({
      id: 'trade-a',
      entryDatetime: '2026-01-01T10:00:00Z',
      exitDatetime: '2026-01-01T11:00:00Z',
      entryPrice: 100,
      exitPrice: 150,
      qty: 100,
      resultNet: 5000,
    });
    // Trade B: -10000 no dia 2.
    const tB = trade({
      id: 'trade-b',
      entryDatetime: '2026-01-02T10:00:00Z',
      exitDatetime: '2026-01-02T11:00:00Z',
      entryPrice: 150,
      exitPrice: 50,
      qty: 100,
      resultNet: -10000,
    });

    await ds.trades.bulkPut([tA, tB]);
    await chain.syncTrade(tA);
    await chain.syncTrade(tB);

    const dd = await chain.drawdowns('acct-prop');
    // trailingDD = (105000 - 95000)/100000 = 0.1
    expect(dd.trailingDD).toBeCloseTo(0.1, 5);
    // dailyDD = (105000 - 95000)/105000 ≈ 0.095238
    expect(dd.dailyDD).toBeCloseTo(0.095238, 4);
    // São métricas diferentes (o teste prova que não são a mesma coisa).
    expect(dd.trailingDD).toBeGreaterThan(dd.dailyDD);
  });

  it('emite risk:warning quando trailingDD excede o limite da firm', async () => {
    const { ds, chain } = ctx;
    await ds.accounts.put(propAccount());
    // trailingDD limit baixíssimo (0.001) => qualquer DD dispara.
    await ds.propExtensions.put(propExt({ trailingDD: 0.001, nominalSize: 100000 }));

    const warnings: unknown[] = [];
    const bus = ctx.ds.bus;
    bus.on('risk:warning', (p) => warnings.push(p));

    const tA = trade({
      id: 'trade-a',
      entryDatetime: '2026-01-01T10:00:00Z',
      exitDatetime: '2026-01-01T11:00:00Z',
      entryPrice: 100,
      exitPrice: 150,
      qty: 100,
      resultNet: 5000,
    });
    const tB = trade({
      id: 'trade-b',
      entryDatetime: '2026-01-02T10:00:00Z',
      exitDatetime: '2026-01-02T11:00:00Z',
      entryPrice: 150,
      exitPrice: 50,
      qty: 100,
      resultNet: -10000,
    });
    await ds.trades.bulkPut([tA, tB]);
    await chain.syncTrade(tA);
    await chain.syncTrade(tB);

    expect(warnings.length).toBeGreaterThan(0);
  });
});
