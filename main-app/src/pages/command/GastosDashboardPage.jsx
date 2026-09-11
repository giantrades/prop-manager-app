// Módulo Gastos — dashboard (porta de entrada). Composição pura dos motores de
// dinheiro: free cash, orçamento, top categorias, contas a pagar e últimos lançamentos.
import { fmtMoney as fmtMoneyShared } from '@apps/ui/currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React from 'react';
import { NavLink } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import {
  listCategories, getBudgets, expensesByCategory, budgetStatus,
  pendingBills, pendingSummary, computeFreeCash, categoryOf,
} from '@apps/lib/db';


export default function GastosDashboardPage() {
  const { loading, data } = useEngineData(async (f) => {
    const ym = new Date().toISOString().slice(0, 7);
    const [txs, categories, budgets] = await Promise.all([
      f.ds.transactions.list(), listCategories(f.ds), getBudgets(f.ds),
    ]);
    const cats = categories ?? [];
    const groups = expensesByCategory(txs, ym, cats).slice(0, 6);
    const bStatus = budgetStatus(txs, budgets[ym] || {}, ym, cats);
    const budget = bStatus.reduce((s, b) => s + (b.budget || 0), 0);
    const spentBudget = bStatus.reduce((s, b) => s + (b.spent || 0), 0);
    const recent = txs
      .filter((t) => (t.date || '').slice(0, 7) === ym && (t.kind === 'expense' || ['payout_in', 'rebate', 'income'].includes(t.kind)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 6);
    return {
      ym, freeCash: computeFreeCash(txs, ym), groups, cats,
      budget, spentBudget, pending: pendingSummary(txs), bills: pendingBills(txs).slice(0, 5), recent,
    };
  });

  const catName = new Map((data?.cats ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Gastos</h1>
      </div>
      <ModuleTabs module="gastos" />

      {loading || !data ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando gastos…</div>
      ) : (
        <>
          <div className="dash-cards">
            <div className="card accent2">
              <h3>Gasto do mês</h3>
              <div className="stat">{fmtMoney(data.freeCash.expenses)}</div>
              <div className="muted">receitas {fmtMoney(data.freeCash.income)}</div>
            </div>
            <div className={`card ${data.spentBudget > data.budget && data.budget > 0 ? 'accent2' : 'accent1'}`}>
              <h3>Orçamento</h3>
              <div className="stat">{data.budget > 0 ? `${Math.round((data.spentBudget / data.budget) * 100)}%` : '—'}</div>
              <div className="muted">{data.budget > 0 ? `${fmtMoney(data.spentBudget)} / ${fmtMoney(data.budget)}` : 'sem metas'}</div>
            </div>
            <div className="card accent4">
              <h3>A pagar</h3>
              <div className="stat">{fmtMoney(data.pending.payable)}</div>
              <div className="muted">{data.pending.count} título(s){data.pending.overdue ? ` · ${data.pending.overdue} atrasado(s)` : ''}</div>
            </div>
            <div className={`card ${data.freeCash.freeCash >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>Saldo do mês</h3>
              <div className="stat">{fmtMoney(data.freeCash.freeCash)}</div>
              <div className="muted"><NavLink className="dash-link" to="/expenses">lançamentos →</NavLink></div>
            </div>
          </div>

          {data.bills.length > 0 && (
            <div className="dash-section">
              <div className="dash-title"><span>Próximas contas</span><NavLink className="dash-link" to="/expenses">gerenciar →</NavLink></div>
              {data.bills.map((b) => (
                <div key={b.tx.id} className="dash-row">
                  <span className="dash-row-name">{b.tx.note || catName.get(categoryOf(b.tx, data.cats) ?? 'outros') || 'Lançamento'}</span>
                  <span className={`dash-row-sub ${b.overdue ? 'dash-neg' : ''}`}>vence {b.dueDate || b.tx.date.slice(0, 10)}{b.overdue ? ' · atrasado' : ''}</span>
                  <span className={`dash-row-val ${b.tx.kind === 'expense' ? 'dash-neg' : 'dash-pos'}`}>{fmtMoney(Math.abs(b.tx.amount))}</span>
                </div>
              ))}
            </div>
          )}

          {data.groups.length > 0 && (
            <div className="dash-section">
              <div className="dash-title"><span>Top categorias ({data.ym})</span><NavLink className="dash-link" to="/expenses">ver todas →</NavLink></div>
              {data.groups.map((g) => (
                <div key={g.categoryId} className="dash-row">
                  <span className="dash-row-name">{catName.get(g.categoryId) ?? g.categoryId}</span>
                  <span className="dash-row-sub">{g.count}x</span>
                  <span className="dash-row-val dash-neg">{fmtMoney(g.total)}</span>
                </div>
              ))}
            </div>
          )}

          {data.recent.length > 0 && (
            <div className="dash-section">
              <div className="dash-title"><span>Últimos lançamentos</span></div>
              {data.recent.map((t) => (
                <div key={t.id} className="dash-row">
                  <span className="dash-row-name">{t.note || catName.get(categoryOf(t, data.cats) ?? 'outros') || 'Lançamento'}</span>
                  <span className="dash-row-sub">{(t.date || '').slice(0, 10)}</span>
                  <span className={`dash-row-val ${t.amount >= 0 ? 'dash-pos' : 'dash-neg'}`}>{fmtMoney(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
