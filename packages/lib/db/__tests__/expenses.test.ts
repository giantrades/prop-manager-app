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

