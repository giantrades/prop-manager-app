// Gastos/Mobills — motor. Datasets sintéticos com valores calculados à mão.
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus } from '../events';
import {
  MoneyService,
  DEFAULT_CATEGORIES,
  listCategories,
  saveCategory,
  categoryOf,
  expensesByCategory,
  incomeByKind,
  monthlySeries,
  getBudgets,
  saveBudget,
  budgetStatus,
  recurringDue,
  computeFreeCash,
  detectRecurringCandidates,
  compareMonths,
  getSavingsGoal,
  saveSavingsGoal,
  getRolloverCats,
  setRolloverCats,
  rolloverAmount,
  pendingBills,
  pendingSummary,
  merchantRanking,
  computeAccountBalance,
} from '../money';
import type { Transaction } from '../types';

function makeService() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId: 'dev-gastos', bus, channel: null });
  const chain = new DataChainEngine(ds);
  return { ds, money: new MoneyService(ds, chain) };
}

function tx(over: Partial<Transaction> & { id: string; kind: Transaction['kind'] }): Transaction {
  return {
    accountId: 'wallet-wise',
    amount: 0,
    currency: 'BRL',
    date: '2026-09-01T12:00:00Z',
    updatedAt: '2026-09-01T12:00:00Z',
    deviceId: 'dev-gastos',
    version: 0,
    ...over,
  } as Transaction;
}

// E1 moradia -1500 (05/set) | E2 alimentacao -800 (10/set) | E3 legado "Moradia — condominio" -300 (12/set)
// E4 moradia -200 (ago) | I1 payout_in +2560 (15/set) | I2 income +2000 (01/set)
// R1 template lazer -50 recorrente (ago)
const SEED: Transaction[] = [
  tx({ id: 'E1', kind: 'expense', category: 'moradia', amount: -1500, date: '2026-09-05T12:00:00Z', note: 'aluguel' }),
  tx({ id: 'E2', kind: 'expense', category: 'alimentacao', amount: -800, date: '2026-09-10T12:00:00Z' }),
  tx({ id: 'E3', kind: 'expense', amount: -300, date: '2026-09-12T12:00:00Z', note: 'Moradia — condominio' }),
  tx({ id: 'E4', kind: 'expense', category: 'moradia', amount: -200, date: '2026-08-20T12:00:00Z' }),
  tx({ id: 'I1', kind: 'payout_in', amount: 2560, date: '2026-09-15T12:00:00Z' }),
  tx({ id: 'I2', kind: 'income', amount: 2000, date: '2026-09-01T12:00:00Z', note: 'salário' }),
  tx({ id: 'R1', kind: 'expense', category: 'lazer', amount: -50, date: '2026-08-05T12:00:00Z', recurrence: { freq: 'monthly', day: 5 } }),
];

describe('gastos — categorias (G1/G9)', () => {
  it('DEFAULT_CATEGORIES tem 9 com ícone e token de cor (sem hex)', () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(9);
    for (const c of DEFAULT_CATEGORIES) {
      expect(c.icon).toMatch(/^[A-Za-z0-9]+$/);
      expect(c.color).not.toMatch(/#/);
    }
  });

  it('categoryOf: campo estruturado primeiro, legado por prefixo, resto null', () => {
    expect(categoryOf(SEED[0])).toBe('moradia');
    expect(categoryOf(SEED[2])).toBe('moradia'); // legado "Moradia — condominio"
    expect(categoryOf(tx({ id: 'X', kind: 'expense', amount: -1, note: 'qualquer' }))).toBeNull();
  });

  it('listCategories: defaults + custom sobrescreve por id', async () => {
    const { ds } = makeService();
    expect((await listCategories(ds))).toHaveLength(9);
    await saveCategory(ds, { id: 'pets', name: 'Pets', icon: 'PawPrint', color: 'brand' });
    const all = await listCategories(ds);
    expect(all).toHaveLength(10);
    expect(all.find((c) => c.id === 'pets')).toMatchObject({ name: 'Pets' });
    await saveCategory(ds, { id: 'lazer', name: 'Lazer & Jogos', icon: 'Gamepad2', color: 'brand' });
    expect((await listCategories(ds)).find((c) => c.id === 'lazer')?.name).toBe('Lazer & Jogos');
  });

  it('recordExpense grava categoria em campo e note limpa (sem prefixo)', async () => {
    const { money } = makeService();
    const t = await money.recordExpense({ accountId: 'w', amount: 100, currency: 'BRL', category: 'lazer', note: 'cinema' });
    expect(t.category).toBe('lazer');
    expect(t.note).toBe('cinema');
    expect(t.amount).toBe(-100);
  });
});

describe('gastos — agregações (G3/G4)', () => {
  it('expensesByCategory soma por categoria no mês (legado incluído)', () => {
    const rows = expensesByCategory(SEED, '2026-09');
    expect(rows).toEqual([
      { categoryId: 'moradia', total: 1800, count: 2 },
      { categoryId: 'alimentacao', total: 800, count: 1 },
    ]);
  });

  it('incomeByKind agrupa ganhos por kind', () => {
    const rows = incomeByKind(SEED, '2026-09');
    expect(rows).toEqual([
      { kind: 'payout_in', total: 2560, count: 1 },
      { kind: 'income', total: 2000, count: 1 },
    ]);
  });

  it('computeFreeCash conta o kind income novo (4560 - 2600 = 1960)', () => {
    expect(computeFreeCash(SEED, '2026-09')).toEqual({ income: 4560, expenses: 2600, freeCash: 1960 });
  });

  it('monthlySeries últimos 2 meses até 2026-09', () => {
    expect(monthlySeries(SEED, 2, '2026-09')).toEqual([
      { ym: '2026-08', income: 0, expenses: 250, balance: -250 },
      { ym: '2026-09', income: 4560, expenses: 2600, balance: 1960 },
    ]);
  });
});

describe('gastos — orçamento (G5)', () => {
  it('budgetStatus: gasto vs meta com % e estouro, ordenado por pct', () => {
    const rows = budgetStatus(SEED, { moradia: 2000, alimentacao: 500 }, '2026-09');
    expect(rows).toEqual([
      { categoryId: 'alimentacao', budget: 500, spent: 800, pct: 160, over: true },
      { categoryId: 'moradia', budget: 2000, spent: 1800, pct: 90, over: false },
    ]);
  });

  it('saveBudget persiste por mês; 0 remove', async () => {
    const { ds } = makeService();
    await saveBudget(ds, '2026-09', 'lazer', 300);
    expect(await getBudgets(ds)).toEqual({ '2026-09': { lazer: 300 } });
    await saveBudget(ds, '2026-09', 'lazer', 0);
    expect(await getBudgets(ds)).toEqual({ '2026-09': {} });
  });
});

describe('gastos — recorrência (G6) + editar/deletar (G8)', () => {
  it('recurringDue lista template sem parcela no mês; generate cria 1x (idempotente)', async () => {
    const { ds, money } = makeService();
    for (const t of SEED) await ds.transactions.put(t, { source: 'local' });
    expect(recurringDue(await ds.transactions.list(), '2026-09').map((t) => t.id)).toEqual(['R1']);
    const gen = await money.generateRecurring('R1', '2026-09');
    expect(gen).toMatchObject({ kind: 'expense', amount: -50, category: 'lazer', ref: { type: 'recurrence', id: 'R1' } });
    expect(String(gen?.date).slice(0, 7)).toBe('2026-09');
    expect(gen?.recurrence).toBeUndefined(); // cópia não carrega o template
    expect(recurringDue(await ds.transactions.list(), '2026-09')).toHaveLength(0);
    expect(await money.generateRecurring('R1', '2026-09')).toBeNull();
  });

  it('update/remove transação', async () => {
    const { ds, money } = makeService();
    for (const t of SEED) await ds.transactions.put(t, { source: 'local' });
    const up = await money.updateTransaction('E2', { amount: -900 });
    expect(up?.amount).toBe(-900);
    await expect(money.updateTransaction('E1', { rate: 0 })).rejects.toThrow();
    await money.removeTransaction('E2');
    expect(await ds.transactions.get('E2')).toBeUndefined();
    expect(await money.updateTransaction('E2', { amount: -1 })).toBeNull();
  });
});

describe('gastos A1 � recorr�ncia inteligente (detec��o)', () => {
  const rec = (id, ym, day, amount = 50, category = 'lazer') => tx({ id, kind: 'expense', category, amount: -amount, date: `${ym}-${String(day).padStart(2, '0')}T12:00:00Z` });

  it('mesma categoria+valor em 3+ meses vira candidata (dia = moda)', () => {
    const list = [rec('r1', '2026-06', 5), rec('r2', '2026-07', 5), rec('r3', '2026-08', 15), rec('r4', '2026-08', 5)];
    const c = detectRecurringCandidates(list);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ categoryId: 'lazer', amount: 50, count: 3, day: 5 });
    expect(c[0].months).toEqual(['2026-06', '2026-07', '2026-08']);
  });

  it('ignora templates, c�pias geradas, ganhos e valores diferentes', () => {
    const list = [
      rec('t1', '2026-06', 5),
      tx({ id: 'tpl', kind: 'expense', category: 'lazer', amount: -50, date: '2026-05-05T12:00:00Z', recurrence: { freq: 'monthly', day: 5 } }),
      tx({ id: 'cp', kind: 'expense', category: 'lazer', amount: -50, date: '2026-07-05T12:00:00Z', ref: { type: 'recurrence', id: 'tpl' } }),
      tx({ id: 'g1', kind: 'income', amount: 50, date: '2026-06-05T12:00:00Z' }),
      rec('v1', '2026-06', 5, 99),
    ];
    expect(detectRecurringCandidates(list)).toHaveLength(0); // s� 1 m�s v�lido
  });
});

describe('gastos A4 � comparativo m�s a m�s + meta de economia', () => {
  const m = (id, ym, day, category, amount) => tx({ id, kind: 'expense', category, amount: -amount, date: `${ym}-${String(day).padStart(2, '0')}T12:00:00Z` });
  const list = [
    m('a1', '2025-12', 5, 'alimentacao', 500),
    m('a2', '2026-01', 5, 'alimentacao', 610),
    m('a3', '2026-01', 6, 'moradia', 1000),
  ];

  it('delta% por categoria com virada de ano correta', () => {
    const rows = compareMonths(list, '2026-01');
    expect(rows.find((r) => r.categoryId === 'alimentacao')).toMatchObject({ cur: 610, prev: 500, deltaPct: 22 });
    expect(rows.find((r) => r.categoryId === 'moradia')).toMatchObject({ cur: 1000, prev: 0, deltaPct: null });
  });

  it('meta de economia persiste por m�s; 0 remove', async () => {
    const { ds } = makeService();
    expect(await getSavingsGoal(ds)).toEqual({});
    await saveSavingsGoal(ds, '2026-09', 8000);
    expect(await getSavingsGoal(ds)).toEqual({ '2026-09': 8000 });
    await saveSavingsGoal(ds, '2026-09', 0);
    expect(await getSavingsGoal(ds)).toEqual({});
  });
});


describe('gastos B1 � rollover de sobra', () => {
  const e = (id, ym, day, category, amount) => tx({ id, kind: 'expense', category, amount: -amount, date: ym + '-' + String(day).padStart(2, '0') + 'T12:00:00Z' });
  // ago: moradia meta 2000 gastou 1500 => sobra 500; lazer meta 300 gastou 400 => 0
  const list = [e('a1', '2026-08', 5, 'moradia', 1500), e('a2', '2026-08', 6, 'lazer', 400)];
  const budgets = { '2026-08': { moradia: 2000, lazer: 300 }, '2026-09': { moradia: 2000 } };

  it('sobra soma na meta; estouro zera; sem opt-in some da lista', () => {
    const rows = rolloverAmount(list, budgets, ['moradia', 'lazer'], '2026-09');
    expect(rows.find((r) => r.categoryId === 'moradia')).toMatchObject({ rollover: 500, base: 2000, effective: 2500 });
    expect(rows.find((r) => r.categoryId === 'lazer')).toMatchObject({ rollover: 0, base: 0, effective: 0 });
    expect(rolloverAmount(list, budgets, [], '2026-09')).toEqual([]);
  });

  it('opt-in persiste em meta', async () => {
    const { ds } = makeService();
    expect(await getRolloverCats(ds)).toEqual([]);
    await setRolloverCats(ds, ['moradia', 'lazer', 'moradia']);
    expect(await getRolloverCats(ds)).toEqual(['moradia', 'lazer']);
  });
});

describe('gastos D1 — contas a pagar/receber (paid/pendente)', () => {
  it('computeFreeCash ignora títulos não pagos (paid=false)', () => {
    const list = [
      tx({ id: 'i1', kind: 'income', amount: 1000, date: '2026-09-05T12:00:00Z' }),
      tx({ id: 'e1', kind: 'expense', amount: -200, date: '2026-09-06T12:00:00Z' }),
      tx({ id: 'e2', kind: 'expense', amount: -500, date: '2026-09-07T12:00:00Z', paid: false }),
    ];
    expect(computeFreeCash(list, '2026-09')).toEqual({ income: 1000, expenses: 200, freeCash: 800 });
  });

  it('pendingBills lista pendentes por vencimento e marca atraso', () => {
    const list = [
      tx({ id: 'p1', kind: 'expense', amount: -100, dueDate: '2026-09-20T00:00:00Z', paid: false }),
      tx({ id: 'p2', kind: 'expense', amount: -50, dueDate: '2026-09-10T00:00:00Z', paid: false }),
      tx({ id: 'ok', kind: 'expense', amount: -30, dueDate: '2026-09-15T00:00:00Z' }),
    ];
    const rows = pendingBills(list, '2026-09-15T12:00:00Z');
    expect(rows.map((r) => r.tx.id)).toEqual(['p2', 'p1']);
    expect(rows.find((r) => r.tx.id === 'p2').overdue).toBe(true);
    expect(rows.find((r) => r.tx.id === 'p1').overdue).toBe(false);
  });

  it('pendingSummary soma a pagar × a receber', () => {
    const list = [
      tx({ id: 'p1', kind: 'expense', amount: -100, paid: false, date: '2026-09-20T12:00:00Z' }),
      tx({ id: 'r1', kind: 'income', amount: 300, paid: false, date: '2026-09-21T12:00:00Z' }),
    ];
    expect(pendingSummary(list, '2026-09-15T12:00:00Z')).toEqual({ payable: 100, receivable: 300, count: 2, overdue: 0 });
  });

  it('recordExpense grava paid=false e dueDate', async () => {
    const { ds, money } = makeService();
    const t = await money.recordExpense({ accountId: 'w', amount: 90, currency: 'BRL', category: 'moradia', paid: false, dueDate: '2026-09-25T00:00:00Z' });
    expect(t.paid).toBe(false);
    expect(t.dueDate).toBe('2026-09-25T00:00:00Z');
    const all = await ds.transactions.list();
    expect(computeFreeCash(all, '2026-09')).toEqual({ income: 0, expenses: 0, freeCash: 0 });
    await money.updateTransaction(t.id, { paid: true });
    const after = await ds.transactions.list();
    expect(computeFreeCash(after, '2026-09')).toEqual({ income: 0, expenses: 90, freeCash: -90 });
  });
});

describe('gastos D2 — parcelamento e cartão', () => {
  it('recordInstallments divide o total (sobra na última) e cria contas a pagar', async () => {
    const { ds, money } = makeService();
    const list = await money.recordInstallments({
      accountId: 'w', currency: 'BRL', totalAmount: 100, count: 3, category: 'compras', card: 'Nubank', firstDate: '2026-09-15T12:00:00Z', note: 'Fone',
    });
    expect(list).toHaveLength(3);
    expect(list.map((t) => Math.abs(t.amount))).toEqual([33.33, 33.33, 33.34]);
    expect(list.every((t) => t.paid === false)).toBe(true);
    expect(list.every((t) => t.card === 'Nubank')).toBe(true);
    expect(list.map((t) => t.installments.n)).toEqual([1, 2, 3]);
    expect(list.every((t) => t.installments.groupId === list[0].installments.groupId)).toBe(true);
    const all = await ds.transactions.list();
    expect(computeFreeCash(all, '2026-09')).toEqual({ income: 0, expenses: 0, freeCash: 0 });
  });
});

describe('gastos D4 — ranking por estabelecimento', () => {
  it('agrupa despesas pagas por note, maior primeiro, e ignora pendentes', () => {
    const list = [
      tx({ id: 'm1', kind: 'expense', amount: -30, note: 'iFood', date: '2026-09-02T12:00:00Z' }),
      tx({ id: 'm2', kind: 'expense', amount: -20, note: 'ifood', date: '2026-09-03T12:00:00Z' }),
      tx({ id: 'm3', kind: 'expense', amount: -80, note: 'Uber', date: '2026-09-04T12:00:00Z' }),
      tx({ id: 'pend', kind: 'expense', amount: -999, note: 'Uber', date: '2026-09-05T12:00:00Z', paid: false }),
    ];
    expect(merchantRanking(list, '2026-09')).toEqual([
      { name: 'Uber', total: 80, count: 1 },
      { name: 'iFood', total: 50, count: 2 },
    ]);
  });
});

describe('gastos D5 — transferência entre carteiras (dupla entrada)', () => {
  it('debita a origem e credita o destino; neutro no free cash', async () => {
    const { ds, money } = makeService();
    const [out, inn] = await money.recordTransferBetween({
      fromAccountId: 'w-a', toAccountId: 'w-b', amount: 200, currency: 'BRL', date: '2026-09-10T12:00:00Z', note: 'reserva',
    });
    expect(out.amount).toBe(-200);
    expect(inn.amount).toBe(200);
    expect(out.ref.id).toBe(inn.ref.id);
    const all = await ds.transactions.list();
    expect(computeAccountBalance(all, 'w-a')).toBe(-200);
    expect(computeAccountBalance(all, 'w-b')).toBe(200);
    expect(computeFreeCash(all, '2026-09')).toEqual({ income: 0, expenses: 0, freeCash: 0 });
  });

  it('rejeita origem=destino e valor 0', async () => {
    const { money } = makeService();
    await expect(money.recordTransferBetween({ fromAccountId: 'w', toAccountId: 'w', amount: 10, currency: 'BRL' })).rejects.toThrow();
    await expect(money.recordTransferBetween({ fromAccountId: 'a', toAccountId: 'b', amount: 0, currency: 'BRL' })).rejects.toThrow();
  });
});

