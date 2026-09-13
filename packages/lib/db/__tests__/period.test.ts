// Período global — helpers e agregação por período (soma dos resultados mensais).
import { describe, it, expect } from 'vitest';
import { periodMonths, expensesByCategoryPeriod, inPeriod, shiftYm, ymToList, periodLabel } from '../period';

const tx = (id, date, amount, kind = 'expense', category = 'moradia') => ({
  id, date, amount, kind, category, accountId: 'a', currency: 'BRL',
  updatedAt: date, deviceId: 'd', version: 0,
});

const TXS = [
  tx('t1', '2026-01-10', -100),
  tx('t2', '2026-02-10', -200),
  tx('t3', '2026-02-15', -50),
];

describe('período — helpers', () => {
  it('shiftYm/ymToList/periodLabel', () => {
    expect(shiftYm('2026-01', 1)).toBe('2026-02');
    expect(shiftYm('2026-01', -1)).toBe('2025-12');
    expect(ymToList('2026-01', '2026-03')).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(periodLabel({ mode: 'all' })).toBe('Todo o período');
  });

  it('periodMonths: all = do 1º ao último lançamento; range e month', () => {
    expect(periodMonths({ mode: 'all' }, TXS)).toEqual(['2026-01', '2026-02']);
    expect(periodMonths({ mode: 'range', from: '2026-01', to: '2026-02' }, TXS)).toEqual(['2026-01', '2026-02']);
    expect(periodMonths({ mode: 'month', ym: '2026-02' }, TXS)).toEqual(['2026-02']);
  });

  it('inPeriod', () => {
    expect(inPeriod('2026-02-10', { mode: 'month', ym: '2026-02' }, TXS)).toBe(true);
    expect(inPeriod('2026-01-10', { mode: 'month', ym: '2026-02' }, TXS)).toBe(false);
    expect(inPeriod('2020-05-01', { mode: 'all' }, TXS)).toBe(true);
  });

  it('expensesByCategoryPeriod soma as contagens dos meses do período', () => {
    const g = expensesByCategoryPeriod(TXS, { mode: 'range', from: '2026-01', to: '2026-02' });
    expect(g.find((x) => x.categoryId === 'moradia')?.count).toBe(3);
    const jan = expensesByCategoryPeriod(TXS, { mode: 'month', ym: '2026-01' });
    expect(jan.find((x) => x.categoryId === 'moradia')?.count).toBe(1);
  });
});
