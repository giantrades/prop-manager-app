// Período global (mês / intervalo / tudo) — fundação para dashboards e widgets.
// NÃO cria fórmula financeira: apenas AGGREGA os resultados dos motores existentes
// (expensesByCategory, incomeByKind, computeFreeCash, ...) ao longo dos meses do período.
import type { Transaction } from './types';
import {
  expensesByCategory,
  incomeByKind,
  computeFreeCash,
  merchantRanking,
  budgetStatus,
  type CategoryTotal,
  type IncomeGroup,
  type MerchantRank,
  type BudgetStatus,
  type CategoryDef,
} from './money';

export type PeriodMode = 'month' | 'range' | 'all';

export interface Period {
  mode: PeriodMode;
  /** 'YYYY-MM' (modo month) */
  ym?: string;
  /** 'YYYY-MM' (modo range) */
  from?: string;
  /** 'YYYY-MM' (modo range) */
  to?: string;
}

export function currentYm(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Soma `delta` meses a um 'YYYY-MM' (UTC-safe). */
export function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const ymKey = (iso: string) => (iso || '').slice(0, 7);

/** Lista de meses 'YYYY-MM' de `from` até `to` (inclusive). */
export function ymToList(from: string, to: string): string[] {
  if (!from || !to) return [];
  const out: string[] = [];
  let cur = from;
  // guarda contra intervalos invertidos/huge
  for (let i = 0; i < 600 && cur <= to; i += 1) {
    out.push(cur);
    cur = shiftYm(cur, 1);
  }
  return out;
}

/** Meses que compõem o período. `all` = do 1º ao último lançamento. */
export function periodMonths(period: Period, transactions: Transaction[]): string[] {
  if (period.mode === 'month') return period.ym ? [period.ym] : [currentYm()];
  if (period.mode === 'range') return ymToList(period.from ?? '', period.to ?? '');
  const months = transactions.map((t) => ymKey(t.date)).filter(Boolean).sort();
  if (months.length === 0) return [currentYm()];
  return ymToList(months[0], months[months.length - 1]);
}

/** Rótulo curto para a UI. */
export function periodLabel(period: Period): string {
  const pt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const fmt = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return `${pt[(m || 1) - 1]}/${y}`;
  };
  if (period.mode === 'month') return fmt(period.ym ?? currentYm());
  if (period.mode === 'range') return `${fmt(period.from ?? '')} – ${fmt(period.to ?? '')}`;
  return 'Todo o período';
}

/** Um lançamento está no período? (`all` = sempre true) */
export function inPeriod(dateIso: string | undefined, period: Period, transactions: Transaction[] = []): boolean {
  if (period.mode === 'all') return true;
  const key = ymKey(dateIso ?? '');
  if (!key) return false;
  return periodMonths(period, transactions).includes(key);
}

// ---------------------------------------------------------------------------
// Agregadores por período (somam os resultados mensais do motor)
// ---------------------------------------------------------------------------

function sumBy<T, K extends string>(months: string[], get: (ym: string) => T[], idOf: (x: T) => K, add: (acc: T, x: T) => T): T[] {
  const map = new Map<K, T>();
  for (const ym of months) {
    for (const item of get(ym)) {
      const id = idOf(item);
      const cur = map.get(id);
      map.set(id, cur ? add(cur, item) : item);
    }
  }
  return [...map.values()];
}

export function expensesByCategoryPeriod(txs: Transaction[], period: Period, cats?: CategoryDef[]): CategoryTotal[] {
  const months = periodMonths(period, txs);
  return sumBy(
    months,
    (ym) => expensesByCategory(txs, ym, cats),
    (x) => x.categoryId,
    (a, b) => ({ categoryId: a.categoryId, total: a.total + b.total, count: a.count + b.count }),
  ).sort((a, b) => b.total - a.total);
}

export function incomeByKindPeriod(txs: Transaction[], period: Period): IncomeGroup[] {
  const months = periodMonths(period, txs);
  return sumBy(
    months,
    (ym) => incomeByKind(txs, ym),
    (x) => x.kind,
    (a, b) => ({ kind: a.kind, total: a.total + b.total, count: a.count + b.count }),
  );
}

export function computeFreeCashPeriod(txs: Transaction[], period: Period): { income: number; expenses: number; freeCash: number } {
  const months = periodMonths(period, txs);
  let income = 0;
  let expenses = 0;
  for (const ym of months) {
    const fc = computeFreeCash(txs, ym);
    income += fc.income;
    expenses += fc.expenses;
  }
  const r2 = (n: number) => Number(n.toFixed(2));
  return { income: r2(income), expenses: r2(expenses), freeCash: r2(income - expenses) };
}

export function merchantRankingPeriod(txs: Transaction[], period: Period, limit = 8): MerchantRank[] {
  const months = periodMonths(period, txs);
  const merged = sumBy(
    months,
    (ym) => merchantRanking(txs, ym, 50),
    (x) => x.name,
    (a, b) => ({ name: a.name, total: a.total + b.total, count: a.count + b.count }),
  );
  return merged.sort((a, b) => b.total - a.total).slice(0, limit);
}

/** Orçamento do período = soma dos orçamentos mensais; gasto por mês. */
export function budgetStatusPeriod(txs: Transaction[], budgets: Record<string, Record<string, number>>, period: Period, cats?: CategoryDef[]): BudgetStatus[] {
  const months = periodMonths(period, txs);
  const merged = sumBy(
    months,
    (ym) => budgetStatus(txs, budgets[ym] || {}, ym, cats),
    (x) => x.categoryId,
    (a, b) => ({ ...a, budget: a.budget + b.budget, spent: a.spent + b.spent, pct: 0, over: false }),
  ).map((b) => {
    const pct = b.budget > 0 ? b.spent / b.budget : 0;
    return { ...b, pct, over: b.budget > 0 && b.spent > b.budget };
  });
  return merged;
}
