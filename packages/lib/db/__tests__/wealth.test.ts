import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';
import {
  WealthService,
  computeNetWorth,
  computeFifoLots,
  computePortfolio,
  computeAllocation,
  computeDcaFromTransactions,
  computeForecast,
  computeSafeAvailable,
  computeGoalProgress,
  sumPayoutsInWindow,
  deriveJournalEvents,
  isMarkFresh,
  markPriceOf,
} from '../wealth';
import { computeAccountBalance } from '../money';
import type {
  Account,
  Goal,
  Payout,
  Position,
  PropExtension,
  Transaction,
} from '../types';

function makeService(deviceId = 'dev-wealth') {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId, bus, channel: null });
  const wealth = new WealthService(ds, { markPriceMaxAgeDays: 7, now: () => '2026-07-01T12:00:00Z' });
  return { ds, wealth, bus };
}

function cashAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'acct-c6', kind: 'bank', name: 'C6', currency: 'BRL', hidden: false, defaultWeight: 1, ...overrides } as Account;
}

function investAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'acct-xp', kind: 'investment', name: 'XP', currency: 'BRL', hidden: false, defaultWeight: 1, ...overrides } as Account;
}

function cryptoAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'acct-binance', kind: 'crypto', name: 'Binance', currency: 'BRL', hidden: false, defaultWeight: 1, ...overrides } as Account;
}

function position(overrides: Partial<Position> = {}): Position {
  return {
    id: 'pos-1',
    accountId: 'acct-xp',
    symbol: 'VALE3',
    qty: 100,
    avgPrice: 60,
    updatedAt: '2026-06-01T00:00:00Z',
    deviceId: 'dev-wealth',
    version: 0,
    ...overrides,
  } as Position;
}

function payout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: 'payout-1',
    accountIds: ['acct-e8'],
    gross: 10000,
    fee: 2000,
    net: 8000,
    splitByAccount: {},
    status: 'Pending',
    method: 'Wise',
    attachments: {},
    date: '2026-06-15T12:00:00Z',
    updatedAt: '2026-06-15T12:00:00Z',
    deviceId: 'dev-wealth',
    version: 0,
    ...overrides,
  } as Payout;
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    accountId: 'acct-c6',
    kind: 'payout_in',
    amount: 0,
    currency: 'BRL',
    date: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    deviceId: 'dev-wealth',
    version: 0,
    ...overrides,
  } as Transaction;
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    kind: 'networth',
    targetValue: 500000,
    currentDerived: 0,
    updatedAt: '2026-06-01T00:00:00Z',
    deviceId: 'dev-wealth',
    version: 0,
    ...overrides,
  } as Goal;
}

describe('Fase 4 — Wealth OS', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => { ctx = makeService(); });

  // -------------------------------------------------------------------------
  // GATE 1: Net Worth reconciles (teste automático, não conferência manual)
  // -------------------------------------------------------------------------
  describe('GATE: Net Worth reconcilia com soma Accounts+Positions+Payouts pendentes', () => {
    it('netWorth = cash(accounts) + positions(mark-to-market) + payouts pendentes', () => {
      const { ds } = ctx;
      // Caixa: C6 (bank) com 84k de saldo no ledger.
      const c6 = cashAccount({ id: 'acct-c6' });
      // Conta investimento (XP) e crypto (Binance) — valor via positions.
      const xp = investAccount({ id: 'acct-xp' });
      const binance = cryptoAccount({ id: 'acct-binance' });

      const txs: Transaction[] = [
        tx({ id: 't1', accountId: 'acct-c6', kind: 'payout_in', amount: 84000, date: '2026-01-10T00:00:00Z' }),
        tx({ id: 't2', accountId: 'acct-c6', kind: 'expense', amount: -2000, date: '2026-02-10T00:00:00Z' }),
        // Compra de ativo: saiu do caixa (não é consumo de caixa, mas move pra investimento).
        tx({ id: 't3', accountId: 'acct-xp', kind: 'transfer', amount: 20000, date: '2026-03-01T00:00:00Z' }),
      ];

      // Posições mark-to-market (marcação fresca).
      const positions: Position[] = [
        position({ id: 'pos-vale', accountId: 'acct-xp', symbol: 'VALE3', qty: 500, avgPrice: 40, lastMarkPrice: 52, lastMarkAt: '2026-06-30T00:00:00Z' }),
        position({ id: 'pos-btc', accountId: 'acct-binance', symbol: 'BTC', qty: 0.1, avgPrice: 350000, lastMarkPrice: 420000, lastMarkAt: '2026-06-29T00:00:00Z' }),
      ];

      // Payout pendente (recebível): net 8000.
      const payouts: Payout[] = [payout({ id: 'p-pending', status: 'Pending', net: 8000, gross: 10000, fee: 2000 })];

      const result = computeNetWorth({
        accounts: [c6, xp, binance],
        transactions: txs,
        positions,
        payouts,
        now: '2026-07-01T12:00:00Z',
      });

      // Soma manual:
      //  cash  = 84000 - 2000 = 82000 (conta C6; XP/Binance não contam como caixa)
      //  invest = VALE3 500*52 = 26000 + BTC 0.1*420000 = 42000 => 68000
      //  receivables = 8000
      //  netWorth = 82000 + 68000 + 8000 = 158000
      expect(result.components.cash).toBe(82000);
      expect(result.components.investments).toBe(68000);
      expect(result.components.receivables).toBe(8000);
      expect(result.components.liabilities).toBe(0);
      expect(result.netWorth).toBe(158000);

      // Reconciliação explícita (gate): Σ Accounts + Σ Positions + Σ Payouts pendentes.
      const sumAccounts = txs.reduce((s, t) => s + (t.accountId === 'acct-c6' ? t.amount : 0), 0);
      const sumPositions = positions.reduce((s, p) => s + p.qty * (p.lastMarkPrice ?? p.avgPrice), 0);
      const sumPending = payouts.filter((p) => p.status === 'Pending').reduce((s, p) => s + p.net, 0);
      expect(result.netWorth).toBeCloseTo(sumAccounts + sumPositions + sumPending, 2);
    });

    it('position com marcação velha entra no Net Worth mas some do "atualizado agora" (proveniência)', () => {
      const result = computeNetWorth({
        accounts: [cashAccount(), investAccount()],
        transactions: [],
        positions: [
          // Marcação de 30 dias atrás (maxAge=7) -> stale.
          position({ id: 'p-old', accountId: 'acct-xp', symbol: 'VALE3', qty: 100, avgPrice: 60, lastMarkPrice: 90, lastMarkAt: '2026-06-01T00:00:00Z' }),
        ],
        payouts: [],
        markPriceMaxAgeDays: 7,
        now: '2026-07-01T12:00:00Z',
      });

      // stale: usa avgPrice (60) no Net Worth, mas não conta em investmentsFresh.
      expect(result.components.investmentsStale).toBe(100 * 60);
      expect(result.components.investmentsFresh).toBe(0);
      expect(result.components.investments).toBe(6000);
      expect(result.stalePositions).toHaveLength(1);
      expect(result.stalePositions[0].symbol).toBe('VALE3');
      expect(result.stalePositions[0].value).toBe(6000);
      expect(result.netWorth).toBe(6000);
    });

    it('liabilities entram no net worth como negativo', () => {
      const result = computeNetWorth({
        accounts: [cashAccount()],
        transactions: [tx({ id: 't1', accountId: 'acct-c6', kind: 'payout_in', amount: 10000 })],
        positions: [],
        payouts: [],
        liabilities: 2500,
        now: '2026-07-01T12:00:00Z',
      });
      expect(result.components.liabilities).toBe(2500);
      expect(result.netWorth).toBe(7500);
    });
  });

  // -------------------------------------------------------------------------
  // GATE 2: Cost Basis FIFO bate com cálculo manual (dataset sintético)
  // -------------------------------------------------------------------------
  describe('GATE: Cost Basis FIFO bate com cálculo manual', () => {
    it('FIFO consome o lote mais antigo (buy 10@100 + buy 10@120, sell 15@130)', () => {
      const events = [
        { date: '2026-01-01T00:00:00Z', type: 'buy' as const, qty: 10, price: 100 },
        { date: '2026-01-02T00:00:00Z', type: 'buy' as const, qty: 10, price: 120 },
        { date: '2026-01-05T00:00:00Z', type: 'sell' as const, qty: 15, price: 130 },
      ];
      const fifo = computeFifoLots(events);

      // Soma manual:
      //  Vende 15: 10 do lote @100 (custo 1000) + 5 do lote @120 (custo 600) => custo vendido 1600
      //  Proceeds = 15*130 = 1950 => realizedPnl = 350
      //  Resta 5 @120 => costBasis = 600, avgCost = 120, qty = 5
      expect(fifo.qty).toBe(5);
      expect(fifo.costBasis).toBe(600);
      expect(fifo.avgCost).toBe(120);
      expect(fifo.costOfSold).toBe(1600);
      expect(fifo.realizedPnl).toBe(350);
      expect(fifo.lots).toHaveLength(1);
      expect(fifo.lots[0].qty).toBe(5);
      expect(fifo.lots[0].price).toBe(120);
    });

    it('FIFO com datas fora de ordem (ordena cronologicamente)', () => {
      const events = [
        { date: '2026-01-02T00:00:00Z', type: 'buy' as const, qty: 10, price: 120 },
        { date: '2026-01-01T00:00:00Z', type: 'buy' as const, qty: 10, price: 100 },
        { date: '2026-01-03T00:00:00Z', type: 'sell' as const, qty: 10, price: 130 },
      ];
      const fifo = computeFifoLots(events);
      // Consome o lote @100 (mais antigo) primeiro.
      expect(fifo.costOfSold).toBe(1000);
      expect(fifo.realizedPnl).toBe(1300 - 1000); // = 300
      expect(fifo.qty).toBe(10);
      expect(fifo.costBasis).toBe(1200);
    });

    it('venda sem lote suficiente (descoberta) não inventa cost basis', () => {
      const events = [
        { date: '2026-01-01T00:00:00Z', type: 'buy' as const, qty: 10, price: 100 },
        { date: '2026-01-02T00:00:00Z', type: 'sell' as const, qty: 15, price: 110 },
      ];
      const fifo = computeFifoLots(events);
      expect(fifo.qty).toBe(0);
      expect(fifo.costBasis).toBe(0);
      // Só o que tem lote é contabilizado: 10 vendidos, custo 1000, proceeds 1100.
      expect(fifo.realizedPnl).toBe(100);
    });

    it('computePortfolio cost basis e valor de mercado (mark-to-market)', () => {
      const positions: Position[] = [
        position({ id: 'p1', symbol: 'VALE3', qty: 100, avgPrice: 50, lastMarkPrice: 60, lastMarkAt: '2026-06-30T00:00:00Z' }),
        position({ id: 'p2', symbol: 'PETR4', qty: 200, avgPrice: 30, lastMarkPrice: 35, lastMarkAt: '2026-06-29T00:00:00Z' }),
      ];
      const result = computePortfolio(positions, { now: '2026-07-01T12:00:00Z' });

      // totalCost = 100*50 + 200*30 = 11000
      // totalValue = 100*60 + 200*35 = 13000
      // totalPnl = 2000; pnlPercent = 2000/11000 ≈ 0.1818
      expect(result.totalCost).toBe(11000);
      expect(result.totalValue).toBe(13000);
      expect(result.totalPnl).toBe(2000);
      expect(result.pnlPercent).toBeCloseTo(2000 / 11000, 4);
      expect(result.staleCount).toBe(0);
    });

    it('markPriceOf cai pro avgPrice quando a marcação é velha; isMarkFresh retorna false', () => {
      const pos = position({ qty: 100, avgPrice: 60, lastMarkPrice: 90, lastMarkAt: '2026-06-01T00:00:00Z' });
      expect(isMarkFresh(pos, 7, '2026-07-01T12:00:00Z')).toBe(false);
      expect(markPriceOf(pos, 7, '2026-07-01T12:00:00Z')).toBe(60);
      const fresh = position({ qty: 100, avgPrice: 60, lastMarkPrice: 90, lastMarkAt: '2026-06-30T00:00:00Z' });
      expect(isMarkFresh(fresh, 7, '2026-07-01T12:00:00Z')).toBe(true);
      expect(markPriceOf(fresh, 7, '2026-07-01T12:00:00Z')).toBe(90);
    });
  });

  // -------------------------------------------------------------------------
  // DCA + Alocação/Concentração
  // -------------------------------------------------------------------------
  describe('DCA mensal + alocação/concentração', () => {
    it('DCA agrupa aportes (buy) por mês', () => {
      const txs = [
        tx({ id: 'b1', accountId: 'acct-xp', kind: 'buy', amount: -5000, date: '2026-01-10T00:00:00Z' }),
        tx({ id: 'b2', accountId: 'acct-xp', kind: 'buy', amount: -3000, date: '2026-01-20T00:00:00Z' }),
        tx({ id: 'b3', accountId: 'acct-xp', kind: 'buy', amount: -8000, date: '2026-02-05T00:00:00Z' }),
        tx({ id: 'b4', accountId: 'acct-xp', kind: 'sell', amount: 2000, date: '2026-02-10T00:00:00Z' }),
      ];
      const dca = computeDcaFromTransactions(txs);
      expect(dca).toEqual([
        { month: '2026-01', amount: 8000 },
        { month: '2026-02', amount: 8000 }, // sell não conta como aporte
      ]);
    });

    it('alocação por símbolo/conta e concentração (maior holding)', () => {
      const positions: Position[] = [
        position({ id: 'p1', symbol: 'VALE3', accountId: 'acct-xp', qty: 100, avgPrice: 50, lastMarkPrice: 60, lastMarkAt: '2026-06-30T00:00:00Z' }),
        position({ id: 'p2', symbol: 'BTC', accountId: 'acct-binance', qty: 0.1, avgPrice: 350000, lastMarkPrice: 420000, lastMarkAt: '2026-06-29T00:00:00Z' }),
      ];
      const alloc = computeAllocation(positions, { now: '2026-07-01T12:00:00Z' });
      // totalValue = 6000 + 42000 = 48000
      // BTC = 42000/48000 = 0.875 (top)
      expect(alloc.topSymbol).toBe('BTC');
      expect(alloc.topPct).toBeCloseTo(42000 / 48000, 4);
      expect(alloc.count).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Forecast 30/60/90 + Safe Available
  // -------------------------------------------------------------------------
  describe('Forecast + Safe Available', () => {
    it('forecast TODAY + payouts + salário - contas - imposto - aportes = 30/60/90d', () => {
      const f = computeForecast({
        currentCash: 84000,
        expectedPayouts: 22000,
        monthlyIncome: 10000,
        monthlyBills: 5000,
        monthlyTaxReserve: 1500,
        monthlyContributions: 1000,
      });
      // netMonthly = 10000 - 5000 - 1500 - 1000 = 2500
      // base = 84000 + 22000 = 106000
      // d30 = 108500, d60 = 111000, d90 = 113500
      expect(f.netMonthly).toBe(2500);
      expect(f.d30).toBe(106000 + 2500);
      expect(f.d60).toBe(106000 + 5000);
      expect(f.d90).toBe(106000 + 7500);
    });

    it('Safe Available = líquido - 30d contas - reserva imposto + payouts esperados', () => {
      const safe = computeSafeAvailable({
        currentCash: 84000,
        next30dBills: 6000,
        taxReserve: 12000,
        expectedPayouts: 22000,
      });
      expect(safe).toBe(84000 - 6000 - 12000 + 22000); // = 88000
    });
  });

  // -------------------------------------------------------------------------
  // Goals 2.0 (progresso derivado)
  // -------------------------------------------------------------------------
  describe('Goals 2.0 — progresso derivado (nunca digitado)', () => {
    it('networth goal usa netWorth; portfolio usa portfolioValue', () => {
      const nw = computeGoalProgress(goal({ id: 'g-nw', kind: 'networth', targetValue: 500000 }), {
        netWorth: 200000, cash: 0, portfolioValue: 0, payoutsInWindow: 0,
      });
      expect(nw.current).toBe(200000);
      expect(nw.progress).toBeCloseTo(0.4, 4);
      expect(nw.completed).toBe(false);

      const port = computeGoalProgress(goal({ id: 'g-port', kind: 'portfolio', targetValue: 261000 }), {
        netWorth: 0, cash: 0, portfolioValue: 261000, payoutsInWindow: 0,
      });
      expect(port.current).toBe(261000);
      expect(port.completed).toBe(true);
      expect(port.remaining).toBe(0);
    });

    it('emergency goal usa cash; property usa propertyFund', () => {
      const emergency = computeGoalProgress(goal({ id: 'g-em', kind: 'emergency', targetValue: 50000 }), {
        netWorth: 0, cash: 42000, portfolioValue: 0, payoutsInWindow: 0,
      });
      expect(emergency.current).toBe(42000);
      expect(emergency.pct).toBeCloseTo(84, 1);

      const prop = computeGoalProgress(goal({ id: 'g-prop', kind: 'property', targetValue: 800000 }), {
        netWorth: 0, cash: 0, portfolioValue: 0, propertyFund: 288000, payoutsInWindow: 0,
      });
      expect(prop.current).toBe(288000);
      expect(prop.pct).toBeCloseTo(36, 1);
    });

    it('payout_year goal respeita windowType (calendar_year vs rolling_12m)', () => {
      const txs = [
        tx({ id: 'p1', kind: 'payout_in', amount: 5000, date: '2026-03-01T00:00:00Z' }),
        tx({ id: 'p2', kind: 'payout_in', amount: 7000, date: '2026-06-01T00:00:00Z' }),
        tx({ id: 'p3', kind: 'payout_in', amount: 9000, date: '2025-11-01T00:00:00Z' }), // fora do ano, dentro dos 12m
        tx({ id: 'p4', kind: 'payout_in', amount: 9999, date: '2024-01-01T00:00:00Z' }), // fora
      ];
      const calendar = sumPayoutsInWindow(txs, 'calendar_year', '2026-07-01T12:00:00Z');
      const rolling = sumPayoutsInWindow(txs, 'rolling_12m', '2026-07-01T12:00:00Z');
      expect(calendar).toBe(5000 + 7000); // 2026
      expect(rolling).toBe(5000 + 7000 + 9000); // 2025-07..2026-07 (p3 em 2025-11 está dentro)

      const goalResult = computeGoalProgress(goal({ id: 'g-py', kind: 'payout_year', targetValue: 180000, windowType: 'calendar_year' }), {
        netWorth: 0, cash: 0, portfolioValue: 0, payoutsInWindow: calendar,
      });
      expect(goalResult.current).toBe(12000);
      expect(goalResult.pct).toBeCloseTo((12000 / 180000) * 100, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Financial Journal
  // -------------------------------------------------------------------------
  describe('Financial Journal', () => {
    it('deriva primeiro payout, marcos e investimento (sempre não-confirmado)', () => {
      const txs = [
        tx({ id: 'p1', kind: 'payout_in', amount: 10000, date: '2026-01-10T00:00:00Z' }),
        tx({ id: 'p2', kind: 'payout_in', amount: 12000, date: '2026-02-10T00:00:00Z' }),
        tx({ id: 'b1', kind: 'buy', amount: -5000, date: '2026-01-15T00:00:00Z' }),
      ];
      const events = deriveJournalEvents({ transactions: txs });
      const types = events.map((e) => e.type);
      expect(types).toContain('first_payout');
      expect(types).toContain('investment');
      // Payout acumulado 22000 não cruza 10000? 10000 cruza na 1ª. 22000 não cruza 50000.
      // Todos nascem não-confirmados.
      expect(events.every((e) => e.confirmed === false)).toBe(true);
      const first = events.find((e) => e.type === 'first_payout');
      expect(first?.amount).toBe(10000);
    });
  });

  // -------------------------------------------------------------------------
  // WealthService end-to-end via DataService (escrita derivada, nunca direto)
  // -------------------------------------------------------------------------
  describe('WealthService (DataService)', () => {
    it('captura snapshot e monta série de net worth (histórico)', async () => {
      const { ds, wealth } = ctx;
      await ds.accounts.put(cashAccount({ id: 'acct-c6' }));
      await ds.transactions.put(tx({ id: 't1', accountId: 'acct-c6', kind: 'payout_in', amount: 84000, date: '2026-01-01T00:00:00Z' }));

      const snap = await wealth.captureNetWorthSnapshot();
      expect(snap.netWorth).toBe(84000);
      const series = await wealth.netWorthSeries();
      expect(series).toHaveLength(1);
    });

    it('goals() calcula progresso derivado a partir dos dados', async () => {
      const { ds, wealth } = ctx;
      await ds.accounts.put(cashAccount({ id: 'acct-c6' }));
      await ds.transactions.put(tx({ id: 't1', accountId: 'acct-c6', kind: 'payout_in', amount: 84000, date: '2026-01-01T00:00:00Z' }));
      await ds.goals.put(goal({ id: 'g-em', kind: 'emergency', targetValue: 50000 }));

      const results = await wealth.goals();
      expect(results).toHaveLength(1);
      expect(results[0].goal.kind).toBe('emergency');
      expect(results[0].current).toBe(84000);
      expect(results[0].completed).toBe(true);
    });

    it('markPosition atualiza lastMarkPrice/lastMarkAt (mark-to-market manual)', async () => {
      const { ds, wealth } = ctx;
      await ds.positions.put(position({ id: 'pos-1', symbol: 'VALE3', qty: 100, avgPrice: 60 }));
      const updated = await wealth.markPosition('pos-1', 72);
      expect(updated.lastMarkPrice).toBe(72);
      expect(updated.lastMarkAt).toBe('2026-07-01T12:00:00Z');
    });
  });
});

describe('wealth � marcos (JournalEvent)', () => {
  it('createJournalEvent cria marco confirmado; listJournalEvents inclui; removeJournalEvent apaga', async () => {
    const ctx = makeService();
    const { ds, wealth } = ctx;
    const ev = await wealth.createJournalEvent({ date: '2026-03-01T00:00:00Z', title: 'Primeiro payout', amount: 5000 });
    expect(ev.confirmed).toBe(true);
    expect(ev.type).toBe('custom');
    let list = await wealth.listJournalEvents();
    expect(list.map((e) => e.id)).toContain(ev.id);
    await wealth.removeJournalEvent(ev.id);
    list = await wealth.listJournalEvents();
    expect(list.map((e) => e.id)).not.toContain(ev.id);
  });
});

describe('wealth � ativo "other" (valor manual)', () => {
  it('portfolio inclui other e calcula valoriza��o (PnL)', async () => {
    const { ds, wealth } = makeService();
    await ds.accounts.put(investAccount());
    await ds.positions.put(position({
      id: 'pos-other', symbol: 'APTO', qty: 1, avgPrice: 300000,
      lastMarkPrice: 350000, lastMarkAt: '2026-07-01T12:00:00Z', assetKind: 'other',
    }));
    const p = await wealth.portfolio();
    const row = p.rows.find((r) => r.symbol === 'APTO');
    expect(row.assetKind).toBe('other');
    expect(row.marketValue).toBe(350000);
    expect(row.pnl).toBe(50000);
  });
});
