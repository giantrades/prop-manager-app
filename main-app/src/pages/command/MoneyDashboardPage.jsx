// D6 — Dashboard do módulo Dinheiro (porta de entrada, não a primeira aba).
// Composição PURA dos motores: carteiras, free cash do mês, contas a pagar,
// top categorias e payouts pendentes. Nenhum número novo.
import React, { useCallback, useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useFinance } from '@apps/state';
import ModuleTabs from '../../ModuleTabs';
import Wallets from '@apps/ui/Wallets';
import {
  listCategories, getBudgets, expensesByCategory, pendingSummary, pendingBills,
} from '@apps/lib/db';

function fmtMoney(value, currency = 'R$') {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

export default function MoneyDashboardPage() {
  const finance = useFinance();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!finance) return;
    const f = finance;
    setLoading(true);
    try {
      const ym = new Date().toISOString().slice(0, 7);
      const [wallets, freeCash, txs, categories, budgets, payouts] = await Promise.all([
        f.money.walletSummary(),
        f.money.freeCash(ym),
        f.ds.transactions.list(),
        listCategories(f.ds),
        getBudgets(f.ds),
        f.ds.payouts.list(),
      ]);
      const cats = categories ?? [];
      const groups = expensesByCategory(txs, ym, cats);
      const catName = new Map(cats.map((c) => [c.id, c]));
      const topCats = groups.slice(0, 5).map((g) => ({
        id: g.categoryId,
        name: catName.get(g.categoryId)?.name ?? g.categoryId,
        total: g.total,
      }));
      const pending = pendingSummary(txs);
      const bills = pendingBills(txs).slice(0, 5);
      const pendingPayouts = (payouts ?? []).filter((p) => (p.status ?? 'pending') !== 'allocated');
      setData({ wallets, freeCash, topCats, pending, bills, pendingPayouts, budgets, ym });
    } finally {
      setLoading(false);
    }
  }, [finance]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!finance) return;
    const off = finance.ds.bus.on('datastore:change', load);
    return off;
  }, [finance, load]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Dinheiro</h1>
      </div>
      <ModuleTabs module="dinheiro" />

      {loading || !data ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando dinheiro…</div>
      ) : (
        <>
          <div className="grid cards">
            <div className={`card ${data.freeCash.freeCash >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>Free cash do mês</h3>
              <div className="stat">{fmtMoney(data.freeCash.freeCash)}</div>
              <div className="muted">receitas {fmtMoney(data.freeCash.income)} · despesas {fmtMoney(data.freeCash.expenses)}</div>
            </div>
            <div className="card accent4">
              <h3>A pagar</h3>
              <div className="stat">{fmtMoney(data.pending.payable)}</div>
              <div className="muted">{data.pending.count} título(s){data.pending.overdue ? ` · ${data.pending.overdue} atrasado(s)` : ''}</div>
            </div>
            <div className="card accent3">
              <h3>Carteiras</h3>
              <div className="stat">{data.wallets.length}</div>
              <div className="muted">saldos por moeda abaixo</div>
            </div>
            <div className="card accent5">
              <h3>Payouts pendentes</h3>
              <div className="stat">{data.pendingPayouts.length}</div>
              <div className="muted"><NavLink to="/payouts">ver payouts →</NavLink></div>
            </div>
          </div>

          {data.bills.length > 0 && (
            <div className="md-section">
              <div className="md-title">Próximas contas</div>
              {data.bills.map((b) => (
                <div key={b.tx.id} className={`md-row${b.overdue ? ' md-late' : ''}`}>
                  <span className="md-row-name">{b.tx.note || 'Lançamento'}</span>
                  <span className="md-row-sub">vence {b.dueDate || b.tx.date.slice(0, 10)}{b.overdue ? ' · atrasado' : ''}</span>
                  <span className={b.tx.kind === 'expense' ? 'md-neg' : 'md-pos'}>{fmtMoney(Math.abs(b.tx.amount))}</span>
                </div>
              ))}
              <NavLink className="md-link" to="/expenses">gerenciar em Gastos →</NavLink>
            </div>
          )}

          {data.topCats.length > 0 && (
            <div className="md-section">
              <div className="md-title">Onde mais gastei ({data.ym})</div>
              {data.topCats.map((c) => (
                <div key={c.id} className="md-row">
                  <span className="md-row-name">{c.name}</span>
                  <span className="md-neg">{fmtMoney(c.total)}</span>
                </div>
              ))}
              <NavLink className="md-link" to="/expenses">ver todos os gastos →</NavLink>
            </div>
          )}

          <div className="md-section">
            <div className="md-title">Carteiras</div>
            <Wallets rows={data.wallets} loading={false} />
          </div>
        </>
      )}
    </div>
  );
}

const MD_CSS = `
.md-section { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); display: flex; flex-direction: column; gap: 10px; }
.md-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.md-row { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.md-row-name { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-row-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.md-row span:last-child { font-variant-numeric: tabular-nums; font-weight: 700; }
.md-neg { color: var(--red, #e74c3c); }
.md-pos { color: var(--green, #2ecc71); }
.md-late .md-row-sub { color: var(--red, #e74c3c); }
.md-link { font-size: 12px; font-weight: 700; color: var(--brand, #7c5cff); }
.muted a { color: inherit; text-decoration: underline; }
`;
if (typeof document !== 'undefined' && !document.getElementById('md-styles')) {
  const style = document.createElement('style');
  style.id = 'md-styles';
  style.textContent = MD_CSS;
  document.head.appendChild(style);
}
