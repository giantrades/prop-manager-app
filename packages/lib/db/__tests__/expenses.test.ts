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
  invoiceCycle,
  invoiceStatus,
  subcategoriesOf,
  rollupByParent,
  suggestBudget,
  openingBalance,
  dailyBalance,
  upcomingBills,
  upcomingSummary,
  reassignCategory,
  mergeCategories,
  removeCategory,
  getCategoryOrder,
  setCategoryOrder,
  categoryUsage,
  installmentSeries,
  subscriptions,
  monthProjection,
  dividendHistory,
  dividendIncomeByMonth,
  dividendByAsset,
  dividendCalendar,
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
  it('DEFAULT_CATEGORIES: 9 gerais + tipos de imposto (ícone e token de cor, sem hex)', () => {
    expect(DEFAULT_CATEGORIES.filter((c) => c.group !== 'imposto')).toHaveLength(8);
    expect(DEFAULT_CATEGORIES.filter((c) => c.group === 'imposto').length).toBeGreaterThanOrEqual(7);
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
    expect((await listCategories(ds))).toHaveLength(DEFAULT_CATEGORIES.length);
    await saveCategory(ds, { id: 'pets', name: 'Pets', icon: 'PawPrint', color: 'brand' });
    const all = await listCategories(ds);
    expect(all).toHaveLength(DEFAULT_CATEGORIES.length + 1);
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
    const t = await money.recordExpense({ accountId: 'w', amount: 90, currency: 'BRL', category: 'moradia', date: '2026-09-20T12:00:00Z', paid: false, dueDate: '2026-09-25T00:00:00Z' });
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

describe('#1 — cartão/fatura vinculados à entidade', () => {
  it('recordExpense persiste card (nome) + cardId', async () => {
    const { ds, money } = makeService();
    const tx = await money.recordExpense({ accountId: 'w', amount: 100, currency: 'BRL', card: 'Nubank', cardId: 'card-1', category: 'compras' });
    expect(tx.card).toBe('Nubank');
    expect(tx.cardId).toBe('card-1');
    expect((await ds.transactions.list())[0].cardId).toBe('card-1');
  });

  it('invoiceCycle antes do fechamento fecha no mês corrente', () => {
    const c = invoiceCycle(15, new Date(Date.UTC(2026, 8, 10))); // 10/set, fecha dia 15
    expect(c.end.slice(0, 10)).toBe('2026-09-15');
    expect(c.start.slice(0, 10)).toBe('2026-08-16');
  });

  it('invoiceCycle depois do fechamento fecha no mês seguinte', () => {
    const c = invoiceCycle(15, new Date(Date.UTC(2026, 8, 20))); // 20/set
    expect(c.end.slice(0, 10)).toBe('2026-10-15');
    expect(c.start.slice(0, 10)).toBe('2026-09-16');
  });

  it('recordInstallments propaga cardId em todas as parcelas', async () => {
    const { money } = makeService();
    const out = await money.recordInstallments({ accountId: 'w', currency: 'BRL', totalAmount: 300, count: 3, card: 'Nubank', cardId: 'card-1', firstDate: '2026-09-05T12:00:00Z' });
    expect(out).toHaveLength(3);
    expect(out.every((t) => t.cardId === 'card-1')).toBe(true);
  });
});

describe('#4 — dividendos (histórico, renda e calendário)', () => {
  const tx = (over) => ({
    id: over.id, kind: 'dividend', amount: over.amount, currency: 'BRL',
    accountId: 'inv', date: over.date, ref: { type: 'investmentId', id: over.positionId },
  });

  const ROWS = [
    tx({ id: 'd1', positionId: 'p1', amount: 30, date: '2026-08-10T12:00:00Z' }),
    tx({ id: 'd2', positionId: 'p2', amount: 20, date: '2026-08-20T12:00:00Z' }),
    tx({ id: 'd3', positionId: 'p1', amount: 50, date: '2026-09-05T12:00:00Z' }),
    // não-dividendo é ignorado
    { id: 'x', kind: 'expense', amount: -10, currency: 'BRL', accountId: 'w', date: '2026-09-05T12:00:00Z' },
  ];

  it('dividendHistory só pega kind=dividend ligado a posição, mais recente primeiro', () => {
    const rows = dividendHistory(ROWS as never);
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe('d3');
    expect(rows.every((r) => r.positionId)).toBe(true);
  });

  it('dividendIncomeByMonth agrega por mês', () => {
    const rows = dividendHistory(ROWS as never);
    expect(dividendIncomeByMonth(rows)).toEqual([
      { ym: '2026-08', amount: 50, count: 2 },
      { ym: '2026-09', amount: 50, count: 1 },
    ]);
  });

  it('dividendByAsset ranqueia por valor com símbolo', () => {
    const rows = dividendHistory(ROWS as never);
    expect(dividendByAsset(rows, { p1: 'PETR4', p2: 'ITSA4' })).toEqual([
      { positionId: 'p1', symbol: 'PETR4', amount: 80, count: 2 },
      { positionId: 'p2', symbol: 'ITSA4', amount: 20, count: 1 },
    ]);
  });

  it('dividendCalendar marca recebido por dia e anúncios (data-com)', () => {
    const rows = dividendHistory(ROWS as never);
    const cal = dividendCalendar(rows, [{ symbol: 'PETR4', exDate: '2026-09-18' }], '2026-09');
    expect(cal).toHaveLength(30); // setembro
    expect(cal.find((d) => d.day === 5)?.received).toBe(50);
    expect(cal.find((d) => d.day === 18)?.announced[0].symbol).toBe('PETR4');
    expect(cal.find((d) => d.day === 10)?.received).toBe(0);
  });
});

describe('H5 — fatura do cartão: aberta/fechada/paga/parcial', () => {
  const CARD = { id: 'card-1', name: 'Nubank', closingDay: 15, dueDay: 25 };
  const exp = (id, day, amount, cardId = 'card-1') => tx({
    id, kind: 'expense', amount: -amount, cardId, date: `2026-09-${String(day).padStart(2, '0')}T12:00:00Z`,
  });

  it('fatura aberta: ciclo corrente, total e vencimento após fechamento', () => {
    const txs = [exp('e1', 5, 100), exp('e2', 10, 50)];
    const st = invoiceStatus(CARD, txs, new Date(Date.UTC(2026, 8, 10))); // 10/set, fecha 15
    expect(st.competencia).toBe('2026-09');
    expect(st.fechamento.slice(0, 10)).toBe('2026-09-15');
    expect(st.vencimento.slice(0, 10)).toBe('2026-09-25'); // dia 25 após o fechamento 15
    expect(st.total).toBe(150);
    expect(st.estado).toBe('aberta');
    expect(st.restante).toBe(150);
  });

  it('após o fechamento fica "fechada"; sem despesas fica "aberta"', () => {
    const txs = [exp('e1', 5, 100)];
    const st = invoiceStatus(CARD, txs, new Date(Date.UTC(2026, 8, 20))); // 20/set > 15
    expect(st.competencia).toBe('2026-10'); // a aberta agora fecha em out
    expect(st.total).toBe(0);
    expect(st.estado).toBe('aberta');
    // E a fatura de setembro (fechada) — referência 10/set mostra o ciclo ainda aberto.
    const set = invoiceStatus(CARD, txs, new Date(Date.UTC(2026, 8, 16)));
    expect(set.competencia).toBe('2026-10');
  });

  it('baixa total marca "paga"; parcial abate e marca "parcial"', () => {
    const txs = [exp('e1', 5, 100), exp('e2', 10, 50)];
    const st = invoiceStatus(CARD, txs, new Date(Date.UTC(2026, 8, 10)));
    const pay = (amount) => tx({ id: `p-${amount}`, kind: 'transfer', amount: -amount, date: '2026-09-12T12:00:00Z', invoice: { cardId: 'card-1', competencia: st.competencia } });
    const parcial = invoiceStatus(CARD, [...txs, pay(60)], new Date(Date.UTC(2026, 8, 10)));
    expect(parcial.pago).toBe(60);
    expect(parcial.restante).toBe(90);
    expect(parcial.estado).toBe('parcial');
    const paga = invoiceStatus(CARD, [...txs, pay(150)], new Date(Date.UTC(2026, 8, 10)));
    expect(paga.restante).toBe(0);
    expect(paga.estado).toBe('paga');
  });

  it('payCardInvoice cria transfer neutro no caixa e casa pela competência', async () => {
    const { ds, money } = makeService();
    for (const t of [exp('e1', 5, 200)]) await ds.transactions.put(t, { source: 'local' });
    const st = invoiceStatus(CARD, await ds.transactions.list(), new Date(Date.UTC(2026, 8, 10)));
    await money.payCardInvoice({ cardId: 'card-1', competencia: st.competencia, accountId: 'banco', amount: 120, currency: 'BRL', date: '2026-09-12T12:00:00Z' });
    const all = await ds.transactions.list();
    expect(computeFreeCash(all, '2026-09')).toEqual({ income: 0, expenses: 200, freeCash: -200 });
    const after = invoiceStatus(CARD, all, new Date(Date.UTC(2026, 8, 10)));
    expect(after.pago).toBe(120);
    expect(after.estado).toBe('parcial');
    await money.payCardInvoice({ cardId: 'card-1', competencia: st.competencia, accountId: 'banco', amount: 80, currency: 'BRL', date: '2026-09-13T12:00:00Z' });
    const done = invoiceStatus(CARD, await ds.transactions.list(), new Date(Date.UTC(2026, 8, 10)));
    expect(done.estado).toBe('paga');
  });

  it('payCardInvoice rejeita valor 0 e competência ausente', async () => {
    const { money } = makeService();
    await expect(money.payCardInvoice({ cardId: 'c', competencia: '2026-09', accountId: 'a', amount: 0, currency: 'BRL' })).rejects.toThrow();
    await expect(money.payCardInvoice({ cardId: '', competencia: '', accountId: 'a', amount: 10, currency: 'BRL' })).rejects.toThrow();
  });
});

describe('H6 — subcategorias (1 nível) com roll-up', () => {
  const CATS = [
    { id: 'moradia', name: 'Moradia', icon: 'House', color: 'blue' },
    { id: 'moradia-aluguel', name: 'Aluguel', icon: 'House', color: 'blue', parent: 'moradia' },
    { id: 'moradia-cond', name: 'Condomínio', icon: 'House', color: 'blue', parent: 'moradia' },
    { id: 'lazer', name: 'Lazer', icon: 'Gamepad2', color: 'brand' },
  ];

  it('subcategoriesOf lista as filhas diretas', () => {
    expect(subcategoriesOf(CATS, 'moradia').map((c) => c.id)).toEqual(['moradia-aluguel', 'moradia-cond']);
    expect(subcategoriesOf(CATS, 'lazer')).toEqual([]);
  });

  it('rollupByParent soma as filhas no pai; raiz intacta; pai inexistente fica', () => {
    const rows = [
      { categoryId: 'moradia-aluguel', total: 1000, count: 1 },
      { categoryId: 'moradia-cond', total: 300, count: 1 },
      { categoryId: 'lazer', total: 200, count: 1 },
      { categoryId: 'orfa', total: 50, count: 1, parent: 'nao-existe' } as never,
    ];
    const out = rollupByParent(rows, CATS as never);
    expect(out.find((r) => r.categoryId === 'moradia')).toEqual({ categoryId: 'moradia', total: 1300, count: 2 });
    expect(out.find((r) => r.categoryId === 'lazer')?.total).toBe(200);
    expect(out.find((r) => r.categoryId === 'orfa')?.total).toBe(50);
  });

  it('soma por pai = soma das filhas (via expensesByCategory)', () => {
    const list = [
      tx({ id: 's1', kind: 'expense', category: 'moradia-aluguel', amount: -1000, date: '2026-09-05T12:00:00Z' }),
      tx({ id: 's2', kind: 'expense', category: 'moradia-cond', amount: -300, date: '2026-09-06T12:00:00Z' }),
    ];
    const byCat = expensesByCategory(list, '2026-09', CATS as never);
    const roll = rollupByParent(byCat, CATS as never);
    expect(roll).toHaveLength(1);
    expect(roll[0]).toEqual({ categoryId: 'moradia', total: 1300, count: 2 });
  });

  it('saveCategory/listCategories preservam parent', async () => {
    const { ds } = makeService();
    await saveCategory(ds, { id: 'moradia-iptu', name: 'IPTU', icon: 'House', color: 'blue', parent: 'moradia' });
    const all = await listCategories(ds);
    expect(all.find((c) => c.id === 'moradia-iptu')?.parent).toBe('moradia');
  });
});


describe('H11 — sugestao de meta (media 3 meses)', () => {
  const e = (id, ym, day, category, amount) => tx({ id, kind: 'expense', category, amount: -amount, date: `${ym}-${String(day).padStart(2, '0')}T12:00:00Z` });
  const list = [
    e('a', '2026-06', 5, 'alimentacao', 300),
    e('b', '2026-07', 5, 'alimentacao', 600),
    e('c', '2026-08', 5, 'alimentacao', 900),
    e('d', '2026-08', 6, 'moradia', 1000),
    e('x', '2026-09', 1, 'alimentacao', 9999),
  ];

  it('media dos 3 meses anteriores (mes sem gasto conta 0)', () => {
    const s = suggestBudget(list, '2026-09', 3);
    expect(s.find((r) => r.categoryId === 'alimentacao')).toMatchObject({ average: 600, months: 3 });
    expect(s.find((r) => r.categoryId === 'moradia')).toMatchObject({ average: 333.33 });
    expect(s.some((r) => r.categoryId === 'outros')).toBe(false);
  });
});

describe('H8 — saldo acumulado por dia (extrato)', () => {
  const list = [
    tx({ id: 'i1', kind: 'income', amount: 1000, date: '2026-09-05T12:00:00Z' }),
    tx({ id: 'e1', kind: 'expense', amount: -200, date: '2026-09-06T12:00:00Z' }),
    tx({ id: 'e2', kind: 'expense', amount: -100, date: '2026-09-10T12:00:00Z', paid: false }),
    tx({ id: 'prev', kind: 'income', amount: 500, date: '2026-08-20T12:00:00Z' }),
  ];

  it('openingBalance soma meses anteriores (ignora pendentes)', () => {
    expect(openingBalance(list, '2026-09')).toBe(500);
  });

  it('saldo final fecha com computeFreeCash do mes', () => {
    const opening = openingBalance(list, '2026-09');
    const rows = dailyBalance(list, ['2026-09'], opening);
    expect(rows.map((r) => r.day)).toEqual(['2026-09-05', '2026-09-06']);
    expect(rows[0]).toMatchObject({ income: 1000, expenses: 0, net: 1000, balance: 1500 });
    expect(rows[1]).toMatchObject({ income: 0, expenses: 200, net: -200, balance: 1300 });
    const fc = computeFreeCash(list, '2026-09');
    expect(rows[rows.length - 1].balance).toBe(opening + fc.freeCash);
  });
});

describe('H9 — proximas contas a vencer (janela)', () => {
  const list = [
    tx({ id: 'p1', kind: 'expense', amount: -100, paid: false, dueDate: '2026-09-20T00:00:00Z' }),
    tx({ id: 'p2', kind: 'expense', amount: -50, paid: false, dueDate: '2026-09-10T00:00:00Z' }),
    tx({ id: 'far', kind: 'expense', amount: -900, paid: false, dueDate: '2026-10-30T00:00:00Z' }),
    tx({ id: 'r1', kind: 'expense', amount: -80, category: 'lazer', date: '2026-08-25T12:00:00Z', recurrence: { freq: 'monthly', day: 25 } }),
  ];

  it('inclui atrasados + janela + recorrentes do mes, ordenado por vencimento', () => {
    const rows = upcomingBills(list, '2026-09-15T12:00:00Z', 15);
    expect(rows.map((r) => r.tx.id)).toEqual(['p2', 'p1', 'r1']);
    expect(rows.find((r) => r.tx.id === 'p2').overdue).toBe(true);
    expect(rows.find((r) => r.tx.id === 'p1').days).toBe(5);
    expect(rows.find((r) => r.tx.id === 'r1').source).toBe('recurring');
    expect(rows.some((r) => r.tx.id === 'far')).toBe(false);
  });

  it('upcomingSummary soma a pagar/receber e atrasos', () => {
    const s = upcomingSummary(list, '2026-09-15T12:00:00Z', 15);
    expect(s.payable).toBe(230); // 100 + 50 + 80
    expect(s.count).toBe(3);
    expect(s.overdue).toBe(1);
  });
});

describe('H12 — mesclar / remover / reordenar categorias', () => {
  it('reassignCategory move campo estruturado e legado por prefixo', async () => {
    const { ds } = makeService();
    for (const t of [
      tx({ id: 'e1', kind: 'expense', category: 'lazer', amount: -10, date: '2026-09-01T12:00:00Z' }),
      tx({ id: 'e2', kind: 'expense', amount: -20, date: '2026-09-02T12:00:00Z', note: 'Lazer — cinema' }),
    ]) await ds.transactions.put(t, { source: 'local' });
    const moved = await reassignCategory(ds, 'lazer', 'alimentacao');
    expect(moved).toBe(2);
    const all = await ds.transactions.list();
    expect(all.find((t) => t.id === 'e1')?.category).toBe('alimentacao');
    expect(all.find((t) => t.id === 'e2')?.category).toBe('alimentacao');
    expect(all.find((t) => t.id === 'e2')?.note).toBe('cinema');
  });

  it('mergeCategories oculta a origem e lista deixa de mostra-la', async () => {
    const { ds } = makeService();
    await ds.transactions.put(tx({ id: 'e1', kind: 'expense', category: 'lazer', amount: -10, date: '2026-09-01T12:00:00Z' }), { source: 'local' });
    await mergeCategories(ds, 'lazer', 'alimentacao');
    const cats = await listCategories(ds);
    expect(cats.some((c) => c.id === 'lazer')).toBe(false);
    expect(cats.some((c) => c.id === 'alimentacao')).toBe(true);
  });

  it('removeCategory reatribui e oculta (default nao some do codigo, mas da lista)', async () => {
    const { ds } = makeService();
    await ds.transactions.put(tx({ id: 'e1', kind: 'expense', category: 'saude', amount: -10, date: '2026-09-01T12:00:00Z' }), { source: 'local' });
    await removeCategory(ds, 'saude', 'outros');
    expect((await ds.transactions.list())[0].category).toBe('outros');
    expect((await listCategories(ds)).some((c) => c.id === 'saude')).toBe(false);
  });

  it('ordem customizada persiste e e aplicada', async () => {
    const { ds } = makeService();
    expect(await getCategoryOrder(ds)).toEqual([]);
    await setCategoryOrder(ds, ['lazer', 'moradia', 'lazer']);
    expect(await getCategoryOrder(ds)).toEqual(['lazer', 'moradia']);
    const cats = await listCategories(ds);
    expect(cats[0].id).toBe('lazer');
    expect(cats[1].id).toBe('moradia');
  });

  it('categoryUsage soma o uso por categoria', async () => {
    const { ds } = makeService();
    for (const t of [
      tx({ id: 'e1', kind: 'expense', category: 'lazer', amount: -30, date: '2026-09-01T12:00:00Z' }),
      tx({ id: 'e2', kind: 'expense', category: 'lazer', amount: -20, date: '2026-09-02T12:00:00Z' }),
    ]) await ds.transactions.put(t, { source: 'local' });
    const usage = await categoryUsage(ds);
    expect(usage.find((u) => u.categoryId === 'lazer')).toEqual({ categoryId: 'lazer', total: 50, count: 2 });
  });
});

describe('H-debt — merchant dedicado no ranking', () => {
  it('merchant tem prioridade sobre note', () => {
    const list = [
      tx({ id: 'm1', kind: 'expense', amount: -30, note: 'compra', merchant: 'iFood', date: '2026-09-02T12:00:00Z' }),
      tx({ id: 'm2', kind: 'expense', amount: -20, note: 'iFood', date: '2026-09-03T12:00:00Z' }),
    ];
    const rows = merchantRanking(list, '2026-09');
    expect(rows.find((r) => r.name === 'iFood')).toMatchObject({ total: 50, count: 2 });
  });
});

describe('I1 — serie de parcelas (editar/cancelar)', () => {
  it('installmentSeries ordena por n', async () => {
    const { money } = makeService();
    const list = await money.recordInstallments({ accountId: 'w', currency: 'BRL', totalAmount: 300, count: 3, category: 'compras', firstDate: '2026-09-05T12:00:00Z', note: 'Fone' });
    const series = installmentSeries(await money.allTransactions(), list[0].installments.groupId);
    expect(series.map((t) => t.installments.n)).toEqual([1, 2, 3]);
  });

  it('updateInstallmentSeries a partir de N e removeInstallmentSeries', async () => {
    const { ds, money } = makeService();
    const list = await money.recordInstallments({ accountId: 'w', currency: 'BRL', totalAmount: 300, count: 3, category: 'compras', firstDate: '2026-09-05T12:00:00Z' });
    const gid = list[0].installments.groupId;
    const n = await money.updateInstallmentSeries(gid, { amount: -111, category: 'lazer' }, 2);
    expect(n).toBe(2);
    const after = installmentSeries(await ds.transactions.list(), gid);
    expect(after.map((t) => t.amount)).toEqual([-100, -111, -111]);
    expect(after[1].category).toBe('lazer');
    const removed = await money.removeInstallmentSeries(gid, 3);
    expect(removed).toBe(1);
    expect(installmentSeries(await ds.transactions.list(), gid)).toHaveLength(2);
  });
});

describe('I7/B — assinaturas', () => {
  it('detecta mesmo nome+valor em 2+ meses, ignora parcela/recorrente', () => {
    const list = [
      tx({ id: 's1', kind: 'expense', amount: -30, merchant: 'Netflix', date: '2026-07-05T12:00:00Z' }),
      tx({ id: 's2', kind: 'expense', amount: -30, merchant: 'Netflix', date: '2026-08-05T12:00:00Z' }),
      tx({ id: 's3', kind: 'expense', amount: -30, merchant: 'Netflix', date: '2026-09-05T12:00:00Z' }),
      tx({ id: 'x1', kind: 'expense', amount: -30, merchant: 'Uber', date: '2026-09-06T12:00:00Z' }),
      tx({ id: 'p1', kind: 'expense', amount: -50, merchant: 'Loja', date: '2026-08-01T12:00:00Z', installments: { n: 1, of: 3, groupId: 'g' } }),
      tx({ id: 'p2', kind: 'expense', amount: -50, merchant: 'Loja', date: '2026-09-01T12:00:00Z', installments: { n: 2, of: 3, groupId: 'g' } }),
    ];
    const subs = subscriptions(list);
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ name: 'Netflix', amount: 30, months: 3 });
  });
});

describe('I7/B — projecao de fechamento do mes', () => {
  it('extrapola o ritmo pelos dias corridos', () => {
    const list = [
      tx({ id: 'e1', kind: 'expense', amount: -100, date: '2026-09-05T12:00:00Z' }),
      tx({ id: 'e2', kind: 'expense', amount: -100, date: '2026-09-10T12:00:00Z' }),
    ];
    // ref dia 10, gastou 200 em 10 dias => projeta 200 * (30/10) = 600
    const p = monthProjection(list, '2026-09', '2026-09-10T12:00:00Z');
    expect(p.isCurrent).toBe(true);
    expect(p.spentSoFar).toBe(200);
    expect(p.projectedSpend).toBe(600);
    expect(p.daysInMonth).toBe(30);
  });
});
