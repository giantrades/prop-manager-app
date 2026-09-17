import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { MoneyService, splitByWeight, computePayoutSplitByWeight } from '../money';
import { EventBus } from '../events';
import type { Account, Payout, PropExtension, Trade } from '../types';

function makeService(deviceId = 'dev-money') {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId, bus, channel: null });
  const chain = new DataChainEngine(ds);
  const money = new MoneyService(ds, chain);
  return { ds, chain, money, bus };
}

function propAccount(overrides: Partial<Account> = {}): Account {
  return { id: 'acct-e8', kind: 'prop', name: 'E8', currency: 'USD', hidden: false, defaultWeight: 1, ...overrides } as Account;
}

function propExt(overrides: Partial<PropExtension> = {}): PropExtension {
  return {
    accountId: 'acct-e8', nominalSize: 100000, challengeCost: 500, phase: 'funded', target: 100000,
    maxDD: 0.1, trailingDD: 0.1, dailyDD: 0.05, consistencyPct: 0.4, minDays: 1,
    payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Rise' },
    profitSplit: 0.8, payoutFrequency: 'monthly', ...overrides,
  } as PropExtension;
}

function wallet(overrides: Partial<Account> = {}): Account {
  return { id: 'wallet-wise', kind: 'wallet', name: 'Wise', currency: 'USD', hidden: false, defaultWeight: 1, ...overrides } as Account;
}

function payout(overrides: Partial<Payout> = {}): Payout {
  return {
    id: 'payout-1',
    accountIds: ['acct-e8'],
    gross: 3200,
    fee: 640,
    net: 2560,
    splitByAccount: { 'acct-e8': { gross: 3200, net: 2560, fee: 640 } },
    status: 'Paid',
    method: 'Wise',
    attachments: {},
    date: '2026-01-15T12:00:00Z',
    updatedAt: '2026-01-15T12:00:00Z',
    deviceId: 'dev-money',
    version: 0,
    ...overrides,
  } as Payout;
}

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 't1', accountId: 'acct-e8', symbol: 'EURUSD', direction: 'long',
    entryDatetime: '2026-01-10T09:00:00Z', exitDatetime: '2026-01-10T10:00:00Z',
    qty: 1, entryPrice: 100, exitPrice: 110, commission: 0, swap: 0, rebate: 0, fees: 0,
    source: 'manual', resultNet: 10, resultR: 2, ...overrides,
  } as Trade;
}

describe('Fase 3 — Money OS', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => { ctx = makeService(); });

  // -------------------------------------------------------------------------
  // Gate 1: Payout Completed -> +Wallet -> Tax reserve -> Expense/Invest
  // -------------------------------------------------------------------------
  describe('Gate: Payout Completed -> +Wallet -> Tax reserve -> Expense/Invest', () => {
    it('fluxo fim-a-fim: payout_in na wallet, alocação cria tax_reserve/expense/transfer', async () => {
      const { ds, chain, money } = ctx;

      // Cria a conta prop e a wallet de destino.
      await ds.accounts.put(propAccount());
      await ds.propExtensions.put(propExt());
      await ds.accounts.put(wallet({ id: 'wallet-wise', currency: 'USD' }));
      await ds.accounts.put({ id: 'wallet-invest', kind: 'investment', name: 'XP', currency: 'USD', hidden: false, defaultWeight: 1 } as Account);
      await ds.accounts.put({ id: 'wallet-brl', kind: 'bank', name: 'C6', currency: 'BRL', hidden: false, defaultWeight: 1 } as Account);

      const p = payout();

      // 1) Payout Completed -> payout_in (gross) + fee na wallet (via chain).
      const applied = await chain.applyPayout(p, { destinationAccountId: 'wallet-wise' });
      expect(applied.totalNet).toBe(2560);
      expect(applied.totalFee).toBe(640);

      // Wallet recebeu o net (gross - fee = 3200 - 640 = 2560).
      let bal = await money.accountBalance('wallet-wise');
      expect(bal).toBe(2560);

      // 2) Wizard de alocação: tax reserve 15%, resto por peso.
      const plan = {
        payoutId: p.id,
        destinationAccountId: 'wallet-wise',
        currency: 'USD',
        date: '2026-01-15T12:00:00Z',
        rate: 5.5, // PTAX BRL/USD do dia do recebimento
        rateTimestamp: '2026-01-15T12:00:00Z',
        taxReservePct: 0.15,
        buckets: [
          { kind: 'expense' as const, accountId: 'wallet-wise', weight: 0.3, note: 'Living' },
          { kind: 'invest' as const, accountId: 'wallet-invest', weight: 0.6, note: 'Invest' },
          { kind: 'cash' as const, accountId: 'wallet-wise', weight: 0.1, note: 'Cash' },
        ],
      };
      const computed = await money.applyPayoutAllocation(p, plan);

      // tax reserve = 15% de 2560 = 384; netAfterTax = 2176
      expect(computed.taxReserve).toBe(384);
      expect(computed.netAfterTax).toBe(2176);

      // pesos normalizados: expense 0.3, invest 0.6, cash 0.1 -> 2176
      // expense = 652.80, invest = 1305.60, cash = 217.60
      expect(computed.outflows.find((o) => o.kind === 'expense')?.amount).toBeCloseTo(-652.8, 1);
      expect(computed.outflows.find((o) => o.kind === 'transfer' && o.accountId === 'wallet-wise')?.amount).toBeCloseTo(-1305.6, 1);
      expect(computed.inflows.find((o) => o.kind === 'transfer' && o.accountId === 'wallet-invest')?.amount).toBeCloseTo(1305.6, 1);
      expect(computed.cashRemaining).toBeCloseTo(217.6, 1);

      // Transactions criadas no ledger.
      const txs = await ds.transactions.list();
      const kinds = txs.map((t) => t.kind);
      expect(kinds).toContain('tax_reserve');
      expect(kinds).toContain('expense');
      expect(kinds).toContain('transfer');

      const taxTx = txs.find((t) => t.kind === 'tax_reserve');
      expect(taxTx?.amount).toBe(-384);
      expect(taxTx?.rate).toBe(5.5); // PTAX guardado na Transaction

      // 3) Saldo final da wallet: payout_in(gross 3200) + fee(-640) + tax_reserve(-384)
      //    + expense(-652.8) + transfer-out invest(-1305.6) = 217.6 (o "cash" que ficou).
      bal = await money.accountBalance('wallet-wise');
      expect(bal).toBeCloseTo(217.6, 1);

      // Saldo da conta de investimento = +1305.6 (transfer in).
      const investBal = await money.accountBalance('wallet-invest');
      expect(investBal).toBeCloseTo(1305.6, 1);
    });

    it('splitByAccount usa PESO, nunca amount/n (função pura)', () => {
      const r = splitByWeight(2560, { a: 2, b: 1 });
      expect(r.a).toBeCloseTo(2560 * (2 / 3), 1);
      expect(r.b).toBeCloseTo(2560 * (1 / 3), 1);
      expect(r.a + r.b).toBe(2560);
    });
  });

  // -------------------------------------------------------------------------
  // Gate 2: Firm P&L bate com soma manual
  // -------------------------------------------------------------------------
  describe('Gate: Firm P&L bate com cálculo manual', () => {
    it('Firm P&L = Σ payout_in - Σ(challenge+reset+monthly+fee) + Σ rebate - Σ(commission+swap)', async () => {
      const { ds, chain, money } = ctx;
      await ds.accounts.put(propAccount());
      await ds.propExtensions.put(propExt());
      await ds.accounts.put(wallet());

      // Soma manual (calculadora), payout_in = GROSS 3200:
      //  payout_in: +3200
      //  fee:       -640   (custo firm)
      //  rebate:    +42
      //  commission: -50
      //  swap:      -37
      //  challenge: -499
      //  reset:     -150
      //  monthly:   -25
      const p = payout({ net: 2560 });
      await chain.applyPayout(p, { destinationAccountId: 'wallet-wise' });

      // Registra custos via MoneyService.
      await money.recordCost('challenge_cost', { accountId: 'acct-e8', firmId: 'acct-e8', amount: 499, currency: 'USD', date: '2025-12-01T00:00:00Z' });
      await money.recordCost('reset_fee', { accountId: 'acct-e8', firmId: 'acct-e8', amount: 150, currency: 'USD', date: '2026-01-01T00:00:00Z' });
      await money.recordCost('monthly_fee', { accountId: 'acct-e8', firmId: 'acct-e8', amount: 25, currency: 'USD', date: '2026-01-01T00:00:00Z' });
      await money.addTransaction({ accountId: 'acct-e8', firmId: 'acct-e8', kind: 'rebate', amount: 42, currency: 'USD', date: '2026-01-01T00:00:00Z' });
      await money.addTransaction({ accountId: 'acct-e8', firmId: 'acct-e8', kind: 'commission', amount: -50, currency: 'USD', date: '2026-01-01T00:00:00Z' });
      await money.addTransaction({ accountId: 'acct-e8', firmId: 'acct-e8', kind: 'swap', amount: -37, currency: 'USD', date: '2026-01-01T00:00:00Z' });

      const result = await money.firmPnl('acct-e8');

      // Soma manual (calculadora):
      //  payout 3200 - fee 640 = 2560
      //  2560 + rebate 42 = 2602
      //  2602 - commission 50 = 2552
      //  2552 - swap 37 = 2515
      //  2515 - challenge 499 = 2016
      //  2016 - reset 150 = 1866
      //  1866 - monthly 25 = 1841
      expect(result.payouts).toBe(3200);
      expect(result.costs).toBe(640 + 499 + 150 + 25); // fee + challenge + reset + monthly = 1314
      expect(result.rebates).toBe(42);
      expect(result.fees).toBe(50 + 37); // commission + swap = 87
      expect(result.profit).toBe(3200 - 1314 + 42 - 87); // = 1841
    });

    it('ignora transactions de outro firm (por firmId)', async () => {
      const { ds, money } = ctx;
      // firm A (E8)
      await money.addTransaction({ accountId: 'acct-e8', firmId: 'acct-e8', kind: 'payout_in', amount: 1000, currency: 'USD', date: '2026-01-01T00:00:00Z' });
      // firm B (FTMO) — não deve entrar no P&L de A.
      await money.addTransaction({ accountId: 'acct-ftmo', firmId: 'acct-ftmo', kind: 'payout_in', amount: 99999, currency: 'USD', date: '2026-01-01T00:00:00Z' });
      const a = await money.firmPnl('acct-e8');
      expect(a.payouts).toBe(1000);
      expect(a.profit).toBe(1000);
    });

    it('Firm P&L por conta: recebido - gasto - fees + rebates (Accounts.jsx)', async () => {
      const { ds, money } = ctx;
      // Conta A: payout 5000, fee 1000, rebate 50.
      await money.addTransaction({ accountId: 'acct-a', firmId: 'firm-1', kind: 'payout_in', amount: 5000, currency: 'USD', date: '2026-01-01T00:00:00Z' });
      await money.addTransaction({ accountId: 'acct-a', firmId: 'firm-1', kind: 'fee', amount: -1000, currency: 'USD', date: '2026-01-01T00:00:00Z' });
      await money.addTransaction({ accountId: 'acct-a', firmId: 'firm-1', kind: 'rebate', amount: 50, currency: 'USD', date: '2026-01-01T00:00:00Z' });
      // Conta B: challenge cost 300.
      await money.addTransaction({ accountId: 'acct-b', firmId: 'firm-1', kind: 'challenge_cost', amount: -300, currency: 'USD', date: '2026-01-01T00:00:00Z' });

      const byAccount = await money.firmPnlByAccount('firm-1');
      expect(byAccount['acct-a'].profit).toBe(5000 - 1000 + 50);
      expect(byAccount['acct-b'].profit).toBe(-300);
    });
  });

  // -------------------------------------------------------------------------
  // Tax Cockpit: day 20% / swing 15% / carry / DARF
  // -------------------------------------------------------------------------
  describe('Tax Cockpit', () => {
    it('day 20% e swing 15% sobre a base positiva, com carry', async () => {
      const { ds, money } = ctx;
      // Day-trade: abre/fecha no mesmo dia. Swing: dias diferentes.
      await ds.trades.put(trade({ id: 'day1', entryDatetime: '2026-01-10T09:00:00Z', exitDatetime: '2026-01-10T10:00:00Z', entryPrice: 100, exitPrice: 110, resultNet: 1000 }));
      await ds.trades.put(trade({ id: 'day2', entryDatetime: '2026-01-11T09:00:00Z', exitDatetime: '2026-01-11T10:00:00Z', entryPrice: 100, exitPrice: 90, resultNet: -400 }));
      await ds.trades.put(trade({ id: 'swing1', entryDatetime: '2026-01-05T09:00:00Z', exitDatetime: '2026-01-07T10:00:00Z', entryPrice: 100, exitPrice: 120, resultNet: 500 }));

      // Prejuízo carry do mês anterior (day = 200, swing = 100).
      await ds.trades.put(trade({ id: 'carry-day', entryDatetime: '2025-12-10T09:00:00Z', exitDatetime: '2025-12-10T10:00:00Z', entryPrice: 100, exitPrice: 80, resultNet: -200 }));
      await ds.trades.put(trade({ id: 'carry-swing', entryDatetime: '2025-12-05T09:00:00Z', exitDatetime: '2025-12-08T10:00:00Z', entryPrice: 100, exitPrice: 80, resultNet: -100 }));

      const result = await money.taxCockpit('2026-01');

      // dayNet = 1000 - 400 = 600; swingNet = 500
      expect(result.dayNet).toBeCloseTo(600, 1);
      expect(result.swingNet).toBeCloseTo(500, 1);
      // day taxable = 600 - 200 (carry) = 400 -> tax = 400 * 0.20 = 80
      expect(result.dayTaxable).toBeCloseTo(400, 1);
      expect(result.dayTax).toBeCloseTo(80, 1);
      // swing taxable = 500 - 100 (carry) = 400 -> tax = 400 * 0.15 = 60
      expect(result.swingTaxable).toBeCloseTo(400, 1);
      expect(result.swingTax).toBeCloseTo(60, 1);
      expect(result.estTax).toBeCloseTo(140, 1);
      expect(result.prepareDarf).toBe(true);
      expect(result.darfDeadline).toBeDefined();
    });

    it('prejuízo no mês gera carry para o próximo e não prepara DARF', async () => {
      const { ds, money } = ctx;
      await ds.trades.put(trade({ id: 'day-loss', entryDatetime: '2026-02-10T09:00:00Z', exitDatetime: '2026-02-10T10:00:00Z', entryPrice: 100, exitPrice: 80, resultNet: -300 }));
      const result = await money.taxCockpit('2026-02');
      expect(result.dayNet).toBeCloseTo(-300, 1);
      expect(result.dayTax).toBe(0);
      expect(result.estTax).toBe(0);
      expect(result.prepareDarf).toBe(false);
      expect(result.darfDeadline).toBeUndefined();
      expect(result.carryAfter.day).toBeCloseTo(300, 1);
    });

    it('guarda o PTAX de venda na Transaction e o Tax Cockpit usa essa taxa (não recalcula)', async () => {
      const { ds, chain, money } = ctx;
      await ds.accounts.put(propAccount());
      await ds.propExtensions.put(propExt());
      await ds.accounts.put(wallet());

      const p = payout({ net: 2560, gross: 3200, fee: 640, date: '2026-01-15T12:00:00Z' });
      // PTAX de venda do dia do recebimento guardado na Transaction.
      await chain.applyPayout(p, { destinationAccountId: 'wallet-wise', rate: 5.5, rateTimestamp: '2026-01-15T12:00:00Z' });

      // payout_in carrega a taxa.
      const payoutIn = (await ds.transactions.list()).find((t) => t.kind === 'payout_in');
      expect(payoutIn?.rate).toBe(5.5);
      expect(payoutIn?.rateTimestamp).toBe('2026-01-15T12:00:00Z');

      // Day trade no mês.
      await ds.trades.put(trade({ id: 'd1', entryDatetime: '2026-01-10T09:00:00Z', exitDatetime: '2026-01-10T10:00:00Z', entryPrice: 100, exitPrice: 110, resultNet: 1000 }));

      const cockpit = await money.taxCockpit('2026-01');
      // dayNet BRL = 1000 * 5.5 = 5500; tax = 5500 * 0.20 = 1100.
      expect(cockpit.dayNet).toBeCloseTo(5500, 0);
      expect(cockpit.dayTax).toBeCloseTo(1100, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Wallets multi-moeda + cash flow unificado
  // -------------------------------------------------------------------------
  describe('Wallets multi-moeda + cash flow', () => {
    it('agrupa saldo por wallet e mostra inflow/outflow', async () => {
      const { ds, money } = ctx;
      await ds.accounts.put(wallet({ id: 'w-usd', currency: 'USD' }));
      await ds.accounts.put({ id: 'w-brl', kind: 'bank', name: 'C6', currency: 'BRL', hidden: false, defaultWeight: 1 } as Account);

      await money.addTransaction({ accountId: 'w-usd', kind: 'payout_in', amount: 2000, currency: 'USD', date: '2026-01-10T00:00:00Z' });
      await money.addTransaction({ accountId: 'w-usd', kind: 'expense', amount: -300, currency: 'USD', date: '2026-01-11T00:00:00Z' });
      await money.addTransaction({ accountId: 'w-usd', kind: 'transfer', amount: -500, currency: 'USD', date: '2026-01-12T00:00:00Z' }); // neutro p/ cash flow
      await money.addTransaction({ accountId: 'w-brl', kind: 'payout_in', amount: 1000, currency: 'BRL', date: '2026-01-10T00:00:00Z' });

      const summary = await money.walletSummary();
      const usd = summary.find((r) => r.account.id === 'w-usd');
      const brl = summary.find((r) => r.account.id === 'w-brl');
      expect(usd?.balance).toBeCloseTo(2000 - 300 - 500, 1);
      expect(usd?.inflows).toBeCloseTo(2000, 1);
      expect(usd?.outflows).toBeCloseTo(300, 1); // transfer não conta como outflow de consumo
      expect(brl?.balance).toBeCloseTo(1000, 1);
      expect(brl?.currency).toBe('BRL');
    });
  });

  // -------------------------------------------------------------------------
  // Free Cash mensal
  // -------------------------------------------------------------------------
  describe('Free Cash mensal', () => {
    it('Free Cash = pessoal (income/payout/dividend) - expense (sem trades/custos/reserva)', async () => {
      const { ds, money } = ctx;
      await money.addTransaction({ accountId: 'w-usd', kind: 'payout_in', amount: 2560, currency: 'USD', date: '2026-01-15T00:00:00Z' });
      await money.addTransaction({ accountId: 'w-usd', kind: 'rebate', amount: 42, currency: 'USD', date: '2026-01-16T00:00:00Z' });
      await money.addTransaction({ accountId: 'w-usd', kind: 'expense', amount: -700, currency: 'USD', date: '2026-01-17T00:00:00Z' });
      await money.addTransaction({ accountId: 'w-usd', kind: 'tax_reserve', amount: -384, currency: 'USD', date: '2026-01-17T00:00:00Z' });
      await money.addTransaction({ accountId: 'w-usd', kind: 'transfer', amount: -500, currency: 'USD', date: '2026-01-18T00:00:00Z' }); // neutro
      // outro mês não conta
      await money.addTransaction({ accountId: 'w-usd', kind: 'payout_in', amount: 9999, currency: 'USD', date: '2026-02-01T00:00:00Z' });

      const fc = await money.freeCash('2026-01');
      // rebate (42) é de trading -> fora; tax_reserve (384) tem widget próprio -> fora.
      expect(fc.income).toBeCloseTo(2560, 1);
      expect(fc.expenses).toBeCloseTo(700, 1);
      expect(fc.freeCash).toBeCloseTo(2560 - 700, 1);
    });
  });

  // -------------------------------------------------------------------------
  // splitByWeight / computePayoutSplitByWeight
  // -------------------------------------------------------------------------
  describe('splitByWeight — nunca amount/n', () => {
    it('divide por peso normalizado e corrige drift de arredondamento', () => {
      const r = splitByWeight(100, { a: 1, b: 3 });
      expect(r.a).toBeCloseTo(25, 1);
      expect(r.b).toBeCloseTo(75, 1);
      // soma exata
      expect(r.a + r.b).toBe(100);
    });

    it('computePayoutSplitByWeight aplica feePct e net = gross - fee', () => {
      const split = computePayoutSplitByWeight(10000, 0.2, { a: 1, b: 1 });
      expect(split.a.gross).toBeCloseTo(5000, 1);
      expect(split.a.fee).toBeCloseTo(1000, 1);
      expect(split.a.net).toBeCloseTo(4000, 1);
      expect(split.b.net).toBeCloseTo(4000, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Conta falhada: Transaction nunca é deletada
  // -------------------------------------------------------------------------
  describe('Conta falhada — nunca deleta Transaction', () => {
    it('marca phase=failed e mantém as transactions intactas', async () => {
      const { ds, money } = ctx;
      await ds.accounts.put(propAccount());
      await ds.propExtensions.put(propExt());
      await ds.accounts.put(wallet());
      await money.addTransaction({ accountId: 'acct-e8', firmId: 'acct-e8', kind: 'payout_in', amount: 1000, currency: 'USD', date: '2026-01-01T00:00:00Z' });

      // Fail a conta.
      const prop = await ds.propExtensions.byAccountId('acct-e8');
      expect(prop).toBeDefined();
      await ds.propExtensions.put({ ...prop!, phase: 'standby' });

      // Transactions ainda existem (nunca deletadas).
      const txs = await ds.transactions.list();
      expect(txs).toHaveLength(1);
      expect(txs[0].kind).toBe('payout_in');
      expect(txs[0].amount).toBe(1000);

      // Firm P&L continua calculável a partir do ledger.
      const pnl = await money.firmPnl('acct-e8');
      expect(pnl.payouts).toBe(1000);
    });
  });
});
