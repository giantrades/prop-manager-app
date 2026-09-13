// PropFirm — F1 dashboard, F5 cTrader ingest, F7 challenge EV. Valores à mão.
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus } from '../events';
import { accountDashboard, accountTradeStats } from '../accountModel';
import { challengeEv, firmPnlReport, firmPnlHistory } from '../money';
import { ctraderToTrade, ingestCtraderTrades } from '../ctraderIngest';
import { FIRM_TEMPLATES, applyTemplate, templateNeedsCheck } from '../firmTemplates';
import type { Account, PropExtension, Payout, Trade, Transaction } from '../types';

function makeEngine() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId: 'dev-prop', bus, channel: null });
  const chain = new DataChainEngine(ds);
  return { ds, chain };
}

function propAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'a1', kind: 'prop', name: 'E8 100K', currency: 'USD', hidden: false, defaultWeight: 1, ...overrides } as Account;
}

function propExt(overrides: Partial<PropExtension> = {}): PropExtension {
  return {
    accountId: 'a1', nominalSize: 100000, challengeCost: 500, phase: 'funded', target: 2000,
    maxDD: 0.1, trailingDD: 0.1, dailyDD: 0.05, consistencyPct: 0.4, minDays: 1,
    payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Rise' },
    profitSplit: 0.8, payoutFrequency: 'monthly', ...overrides,
  } as PropExtension;
}

function trade(overrides: Partial<Trade> & { id: string }): Trade {
  return {
    accountId: 'a1', symbol: 'XAUUSD', direction: 'long', entryDatetime: '2026-09-08T10:00:00Z',
    qty: 1, entryPrice: 100, commission: 0, swap: 0, rebate: 0, fees: 0,
    source: 'manual', resultNet: 0, resultR: null,
    updatedAt: '2026-09-08T10:00:00Z', deviceId: 'dev-prop', version: 0,
    ...overrides,
  } as Trade;
}

function payout(overrides: Partial<Payout> & { id: string }): Payout {
  return {
    accountIds: ['a1'], gross: 0, fee: 0, net: 0, splitByAccount: {},
    status: 'Paid', method: 'Wise', attachments: {},
    updatedAt: '2026-09-08T10:00:00Z', deviceId: 'dev-prop', version: 0,
    ...overrides,
  } as Payout;
}

describe('F1 — accountDashboard (cálculo à mão)', () => {
  // T1 long 100->110 x100 = +1000 (08/set) | T2 long 100->98 x100 = -200 (09/set)
  // equity 100800, peak 101000, DD 200/10000 = 0.02, headroom 9800
  async function seed() {
    const { ds, chain } = makeEngine();
    await ds.accounts.put(propAccount());
    await ds.propExtensions.put(propExt());
    await ds.trades.put(trade({ id: 't1', entryPrice: 100, exitPrice: 110, qty: 100, exitDatetime: '2026-09-08T11:00:00Z', resultNet: 1000, resultR: 2 }));
    await ds.trades.put(trade({ id: 't2', entryPrice: 100, exitPrice: 98, qty: 100, entryDatetime: '2026-09-09T10:00:00Z', exitDatetime: '2026-09-09T11:00:00Z', resultNet: -200, resultR: -1 }));
    await ds.payouts.put(payout({ id: 'p1', gross: 3200, fee: 640, net: 2560, splitByAccount: { a1: { gross: 3200, net: 2560, fee: 640 } } }));
    await ds.payouts.put(payout({ id: 'p2', status: 'Pending', gross: 1000, fee: 200, net: 800, splitByAccount: { a1: { gross: 1000, net: 800, fee: 200 } } }));
    return { ds, chain };
  }

  it('equity/peak/DD/headroom/payouts/trades', async () => {
    const { ds, chain } = await seed();
    const d = await accountDashboard(ds, chain, 'a1');
    expect(d?.equity).toBe(100800);
    expect(d?.peak).toBe(101000);
    expect(d?.drawdown).toMatchObject({ value: 200, fraction: 0.02 });
    expect(d?.headroom).toMatchObject({ value: 9800, percent: 0.98 });
    expect(d?.limitValue).toBe(10000);
    expect(d?.payouts).toMatchObject({ count: 2, totalNet: 2560 }); // Pending conta, mas não soma
    expect(d?.trades).toMatchObject({ count: 2, wins: 1, losses: 1, pnl: 800, daysOperated: 2 });
    expect(d?.series.length).toBeGreaterThan(0);
  });

  it('eligibility checklist honesto (consistency 1.25 > 0.4 => inelegível)', async () => {
    const { ds, chain } = await seed();
    const d = await accountDashboard(ds, chain, 'a1');
    // bestSingleDay 1000 / total 800 = 1.25 > 0.4
    expect(d?.eligibility?.eligible).toBe(false);
    expect(d?.eligibility?.checks).toMatchObject({
      equityReachedTarget: true, // 100800 >= 2000
      drawdownOk: true, // 0.02 < 1
      daysOperatedOk: true, // 2 >= 1
      consistencyOk: false,
    });
  });

  it('conta inexistente => null; conta não-prop => eligibility null', async () => {
    const { ds, chain } = await seed();
    expect(await accountDashboard(ds, chain, 'nope')).toBeNull();
    await ds.accounts.put(propAccount({ id: 'cash1', kind: 'cash', name: 'Cash' }));
    const d = await accountDashboard(ds, chain, 'cash1');
    expect(d?.eligibility).toBeNull();
    expect(d?.limitValue).toBe(0);
  });

  it('accountTradeStats ignora trade de outra conta e aberto', async () => {
    const { ds } = makeEngine();
    const all = [
      trade({ id: 't1', exitPrice: 110, qty: 100, exitDatetime: '2026-09-08T11:00:00Z', resultNet: 1000 }),
      trade({ id: 't9', accountId: 'outra', exitPrice: 110, qty: 100, exitDatetime: '2026-09-08T11:00:00Z', resultNet: 999 }),
      trade({ id: 't0', exitPrice: undefined, exitDatetime: undefined, resultNet: 0 }),
    ];
    void ds;
    expect(accountTradeStats(all, 'a1')).toMatchObject({ count: 1, pnl: 1000 });
  });
});

describe('F5 — ctraderIngest (dedup por primary-key)', () => {
  const ct = (over: Record<string, unknown>) => ({
    platformTradeId: 'ct_1', symbol: 'EURUSD', side: 'Buy', quantity: 1, price: 1.1,
    dateTime: '2026-09-08T10:00:00Z', netPnl: 0, fee: 0, platformAccountId: 'ct_123',
    ...over,
  });

  it('ctraderToTrade: id ct_, source/platformName ctrader, sem quantowerId', () => {
    const t = ctraderToTrade(ct({}), 'a1');
    expect(t.id).toBe('ct_1');
    expect(t.source).toBe('ctrader');
    expect(t.platformName).toBe('ctrader');
    expect(t.platformTradeId).toBe('ct_1');
    expect(t.quantowerId).toBeUndefined();
    expect(t.accountId).toBe('a1');
  });

  it('ingest: mapeia conta, cria; re-ingest atualiza sem duplicar; sem id pula', async () => {
    const { ds, chain } = makeEngine();
    await ds.accounts.put(propAccount({ id: 'a1', platformAccountId: 'ct_123', platformName: 'ctrader' }));
    const r1 = await ingestCtraderTrades(ds, chain, [ct({}), { ...ct({}), platformTradeId: '' }]);
    expect(r1).toMatchObject({ created: 1, updated: 0, skipped: 1 });
    expect((await ds.trades.get('ct_1'))?.accountId).toBe('a1');
    const r2 = await ingestCtraderTrades(ds, chain, [ct({ netPnl: 5 })]);
    expect(r2).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect((await ds.trades.list())).toHaveLength(1);
    expect((await ds.trades.get('ct_1'))?.resultNet).toBe(5);
  });

  it('ingest sem conta mapeada cria órfão (para mapear na UI)', async () => {
    const { ds, chain } = makeEngine();
    const r = await ingestCtraderTrades(ds, chain, [ct({ platformAccountId: 'ct_999' })]);
    expect(r.created).toBe(1);
    expect((await ds.trades.get('ct_1'))?.accountId).toBeUndefined();
  });
});

describe('F7 — challengeEv (cálculo à mão)', () => {
  const cost = (id: string, accountId: string, amount: number, kind: Transaction['kind'] = 'challenge_cost'): Transaction =>
    ({ id, accountId, firmId: 'E8', kind, amount: -Math.abs(amount), currency: 'USD', date: '2026-01-05T12:00:00Z', updatedAt: '2026-01-05T12:00:00Z', deviceId: 'dev-prop', version: 0 } as Transaction);
  const pay = (id: string, amount: number): Transaction =>
    ({ id, accountId: 'a1', firmId: 'E8', kind: 'payout_in', amount, currency: 'USD', date: '2026-02-05T12:00:00Z', updatedAt: '2026-02-05T12:00:00Z', deviceId: 'dev-prop', version: 0 } as Transaction);
  const props = [
    { accountId: 'a1', phase: 'funded' },
    { accountId: 'a2', phase: 'funded' },
    { accountId: 'a3', phase: 'challenge' },
  ];
  // 6 challenges $500 (a1,a2,a3) + 2 resets $150 | payouts 2560+1280
  // attempts 6, approved 2, rate 0.3333, custo 3300, avgCusto 550, avgPayout 1920
  // EV = 0.3333*1920 - 550 = 89.94
  const txs = [
    cost('c1', 'a1', 500), cost('c2', 'a2', 500), cost('c3', 'a3', 500),
    cost('c4', 'a1', 500), cost('c5', 'a2', 500), cost('c6', 'a3', 500),
    cost('r1', 'a1', 150, 'reset_fee'), cost('r2', 'a3', 150, 'reset_fee'),
    pay('p1', 2560), pay('p2', 1280),
  ];

  it('EV com amostra (n=6): approved 2, EV 89.94', () => {
    const ev = challengeEv(txs, props, 'E8');
    expect(ev).toMatchObject({
      attempts: 6, approved: 2, totalCost: 3300, avgCost: 550, avgPayout: 1920, sampleOk: true,
    });
    expect(ev.approvalRate).toBeCloseTo(0.3333, 4);
    expect(ev.ev).toBe(89.94);
  });

  it('sem amostra (n<5): ev null, nunca um sinal', () => {
    const ev = challengeEv(txs.slice(0, 2), props, 'E8');
    expect(ev.attempts).toBe(2);
    expect(ev.sampleOk).toBe(false);
    expect(ev.ev).toBeNull();
  });
});

describe('A2 — firm templates', () => {
  it('3 presets com campos obrigatórios + aviso de conferência', () => {
    expect(FIRM_TEMPLATES.map((t) => t.id)).toEqual([
      'ftmo-challenge-100k',
      'e8-evaluation-50k',
      'apex-150k-rithmic',
    ]);
    for (const t of FIRM_TEMPLATES) {
      expect(t.nominalSize).toBeGreaterThan(0);
      expect(t.target).toBeGreaterThan(0);
      expect(t.version).toBeGreaterThanOrEqual(1);
      expect(t.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Todos nascem não verificados => UI mostra aviso até conferir.
      expect(templateNeedsCheck(t)).toBe(true);
    }
    // Template verificado e recente não pede conferência.
    expect(templateNeedsCheck({ ...FIRM_TEMPLATES[0], verified: true, checkedAt: new Date().toISOString().slice(0, 10) })).toBe(false);
  });

  it('applyTemplate preenche conta+prop (editável depois), sem regra => 1', () => {
    const applied = applyTemplate('', 'ftmo-challenge-100k');
    expect(applied?.accountPatch).toMatchObject({ kind: 'prop', institution: 'FTMO', name: 'FTMO Challenge 100K' });
    expect(applied?.prop).toMatchObject({
      phase: 'challenge', nominalSize: 100000, target: 10000,
      maxDD: 0.1, dailyDD: 0.05, minDays: 4, profitSplit: 0.8, challengeCost: 540,
    });
    expect(applied?.prop.consistencyPct).toBe(1); // FTMO sem regra
    expect(applyTemplate('Minha conta', 'ftmo-challenge-100k')?.accountPatch.name).toBe('Minha conta');
    expect(applyTemplate('', 'inexistente')).toBeNull();
  });
});

describe('A4 — firmPnlReport (cálculo à mão, com rate)', () => {
  const rtx = (over: Partial<Transaction> & { id: string; kind: Transaction['kind'] }): Transaction => ({
    accountId: 'a1', firmId: 'E8', amount: 0, currency: 'USD', date: '2026-09-05T12:00:00Z',
    updatedAt: '2026-09-05T12:00:00Z', deviceId: 'dev-prop', version: 0, ...over,
  } as Transaction);
  // E8/a1: payout +2560 (rate 5.0) | challenge -500 | fee -640 | rebate +42 | commission -87
  // E8/a2: payout +1000 (sem rate => 1)
  // OUTRA firm: payout +10 (ignorada no filtro? não — relatório inclui todas as firms)
  const txs = [
    rtx({ id: 't1', kind: 'payout_in', amount: 2560, rate: 5.0 }),
    rtx({ id: 't2', kind: 'challenge_cost', amount: -500 }),
    rtx({ id: 't3', kind: 'fee', amount: -640 }),
    rtx({ id: 't4', kind: 'rebate', amount: 42 }),
    rtx({ id: 't5', kind: 'commission', amount: -87 }),
    rtx({ id: 't6', kind: 'payout_in', accountId: 'a2', amount: 1000 }),
  ];
  const accts = [{ id: 'a1', name: 'E8 100K' }, { id: 'a2', name: 'E8 50K' }];

  it('linhas por (firm,conta) + total, com brlProfit pelo rate de cada tx', () => {
    const rows = firmPnlReport(txs, accts);
    const total = rows.find((r) => r.firmId === 'E8' && r.accountId === null);
    // fee (-640) soma em costs: costs = 500+640 = 1140; fees = 87 (commission)
    // profit = 3560 - 1140 + 42 - 87 = 2375
    expect(total).toMatchObject({ payouts: 3560, costs: 1140, fees: 87, rebates: 42, profit: 2375, txCount: 6 });
    // brl: 2560*5 + 1000*1 - 500 - 640 - 87 + 42 = 12800+1000-1227+42 = 12615
    expect(total?.brlProfit).toBe(12615);
    const a1 = rows.find((r) => r.accountId === 'a1');
    expect(a1).toMatchObject({ accountName: 'E8 100K', payouts: 2560, profit: 1375, txCount: 5 });
    expect(a1?.brlProfit).toBe(12800 - 500 - 640 - 87 + 42);
    const a2 = rows.find((r) => r.accountId === 'a2');
    expect(a2).toMatchObject({ payouts: 1000, profit: 1000 });
    // total vem antes das contas
    expect(rows[0].accountId).toBeNull();
  });

  it('ignora tx sem firmId', () => {
    const rows = firmPnlReport([rtx({ id: 'x', kind: 'payout_in', amount: 5, firmId: undefined })], accts);
    expect(rows).toHaveLength(0);
  });
});

describe('B1 � firmPnlHistory (lucro por firm por m�s)', () => {
  const h = (id, firmId, kind, amount, ym) => ({ id, accountId: 'a1', firmId, kind, amount, currency: 'USD', date: ym + '-15T12:00:00Z', updatedAt: ym + '-15T12:00:00Z', deviceId: 'dev-prop', version: 0 });

  it('agrupa por m�s com zeros preenchidos; ignora kinds neutros e sem firm', () => {
    const txs = [
      h('p1', 'E8', 'payout_in', 1000, '2026-08'),
      h('c1', 'E8', 'challenge_cost', -500, '2026-08'),
      h('p2', 'E8', 'payout_in', 2000, '2026-09'),
      h('f1', 'FTMO', 'payout_in', 3000, '2026-09'),
      h('t1', 'E8', 'transfer', 9999, '2026-09'),
      h('n1', undefined, 'payout_in', 777, '2026-09'),
      h('o1', 'E8', 'payout_in', 1, '2026-01'),
    ];
    const r = firmPnlHistory(txs, 2, '2026-09');
    expect(r.months).toEqual(['2026-08', '2026-09']);
    expect(r.firms).toEqual(['E8', 'FTMO']);
    expect(r.rows).toEqual([
      { ym: '2026-08', E8: 500, FTMO: 0 },
      { ym: '2026-09', E8: 2000, FTMO: 3000 },
    ]);
  });
});

