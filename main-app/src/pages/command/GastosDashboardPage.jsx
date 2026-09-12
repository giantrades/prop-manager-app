// Módulo Gastos — dashboard (porta de entrada). Resumo completo e interativo:
// KPIs (entrou/gastou/saldo/a pagar/orçamento), donut por categoria (clicável),
// barras entrou×gastou (6m), ranking de estabelecimentos, próximas contas e
// últimos lançamentos com ícones. Composição pura dos motores.
import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import WidgetGrid from '@apps/ui/WidgetGrid';
import { fmtMoney, convertMoney, fmtDisplay } from '@apps/ui/currency';
import {
  House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp, Briefcase,
  GraduationCap, Tag, Receipt, Coins, Gift, Wallet, PiggyBank,
} from 'lucide-react';
import {
  listCategories, getBudgets, getSavingsGoal, expensesByCategory, incomeByKind,
  budgetStatus, monthlySeries, computeFreeCash, pendingBills, pendingSummary,
  merchantRanking, compareMonths, categoryOf,
} from '@apps/lib/db';

const ICONS = { House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp, Briefcase, GraduationCap, Tag, Receipt, Coins, Gift, Wallet, PiggyBank };
const COLORS = { blue: '#3498db', green: '#2ecc71', yellow: '#e1b12c', red: '#e74c3c', brand: '#7c5cff', gray: '#8b94a5' };

function CatIcon({ name, color, size = 16 }) {
  const Cmp = ICONS[name] || Tag;
  return (
    <span className="gd-ico" style={{ color: COLORS[color] || COLORS.gray, borderColor: COLORS[color] || COLORS.gray }}>
      <Cmp size={size} strokeWidth={2} />
    </span>
  );
}

export default function GastosDashboardPage() {
  const [focusCat, setFocusCat] = useState(null);
  const { loading, data } = useEngineData(async (f) => {
    const ym = new Date().toISOString().slice(0, 7);
    const [txs, categories, budgets, savingsGoal, wallets] = await Promise.all([
      f.ds.transactions.list(), listCategories(f.ds), getBudgets(f.ds), getSavingsGoal(f.ds), f.money.walletSummary(),
    ]);
    return { txs, categories, budgets, savingsGoal, wallets, ym };
  });

  const view = useMemo(() => {
    if (!data) return null;
    const { txs, categories, budgets, savingsGoal, ym } = data;
    const cats = categories ?? [];
    const catById = new Map(cats.map((c) => [c.id, c]));
    const groups = expensesByCategory(txs, ym, cats);
    const gains = incomeByKind(txs, ym);
    const bStatus = budgetStatus(txs, budgets[ym] || {}, ym, cats);
    const budget = bStatus.reduce((s, b) => s + (b.budget || 0), 0);
    const spentBudget = bStatus.reduce((s, b) => s + (b.spent || 0), 0);
    const fc = computeFreeCash(txs, ym);
    const series = monthlySeries(txs, 6, ym).map((s) => ({
      ym: s.ym.slice(5, 7) + '/' + s.ym.slice(2, 4), Entradas: s.income, Gastos: s.expenses, Saldo: s.balance,
    }));
    const comparison = compareMonths(txs, ym, cats);
    const worstRise = comparison.filter((r) => r.deltaPct != null && r.deltaPct > 0).sort((a, b) => b.deltaPct - a.deltaPct)[0] ?? null;
    const goal = savingsGoal[ym] ?? 0;
    const recent = txs
      .filter((t) => (t.date || '').slice(0, 7) === ym && (t.kind === 'expense' || ['payout_in', 'rebate', 'income'].includes(t.kind)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
    // Saldo em contas (valor único, convertido para a moeda de exibição).
    let balanceTotal = 0;
    for (const w of (data.wallets ?? [])) {
      if (!['bank', 'wallet', 'cash', 'crypto'].includes(w.account.kind)) continue;
      balanceTotal += convertMoney(w.balance ?? 0, w.currency);
    }
    // Cartões de crédito: fatura do mês, em aberto (não pagas) × fechadas.
    const cardMap = new Map();
    for (const t of txs) {
      if (t.kind !== 'expense' || !t.card) continue;
      if ((t.date || '').slice(0, 7) !== ym) continue;
      const cur = cardMap.get(t.card) ?? { card: t.card, total: 0, open: 0, pending: 0 };
      cur.total += Math.abs(t.amount);
      if (t.paid === false) { cur.open += Math.abs(t.amount); cur.pending += 1; }
      cardMap.set(t.card, cur);
    }
    const cards = [...cardMap.values()].sort((a, b) => b.total - a.total);
    return {
      ym, catById, groups, gains, budget, spentBudget, fc, series,
      pending: pendingSummary(txs), bills: pendingBills(txs).slice(0, 5),
      merchants: merchantRanking(txs, ym, 6), recent, worstRise, goal, balanceTotal, cards,
    };
  }, [data]);

  const catName = (id) => view?.catById.get(id)?.name ?? id;
  const catMeta = (id) => view?.catById.get(id) ?? { name: id, icon: 'Tag', color: 'gray' };

  const donut = (view?.groups ?? []).map((g) => ({
    id: g.categoryId, name: catName(g.categoryId), value: g.total,
    color: COLORS[catMeta(g.categoryId).color] || COLORS.gray,
  }));
  const donutShown = focusCat ? donut.filter((d) => d.id === focusCat) : donut;

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Gastos</h1>
        <NavLink className="cmd-refresh" to="/expenses" style={{ textDecoration: 'none' }}>Lançamentos →</NavLink>
      </div>
      <ModuleTabs module="gastos" />

      {loading || !view ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando gastos…</div>
      ) : (
        <>
          {/* Saldo em contas (topo, estilo Mobills) */}
          <div className="gd-balance">
            <span className="gd-label">Saldo em contas</span>
            <span className={`gd-balance-value ${view.balanceTotal >= 0 ? 'gd-pos' : 'gd-neg'}`}>{fmtDisplay(view.balanceTotal)}</span>
            <span className="gd-sub">soma das carteiras/contas (na moeda do app)</span>
          </div>

          {/* KPIs */}
          <div className="gd-cards">
            <div className="gd-card gd-in"><span className="gd-label">Entrou no mês</span><span className="gd-value gd-pos">{fmtMoney(view.fc.income, 'R$')}</span><span className="gd-sub">{view.gains.reduce((s, g) => s + g.count, 0)} lançamento(s)</span></div>
            <div className="gd-card gd-out"><span className="gd-label">Gastou no mês</span><span className="gd-value gd-neg">{fmtMoney(view.fc.expenses, 'R$')}</span><span className="gd-sub">{view.groups.reduce((s, g) => s + g.count, 0)} despesa(s)</span></div>
            <div className={`gd-card ${view.fc.freeCash >= 0 ? 'gd-net' : 'gd-out'}`}><span className="gd-label">Saldo do mês</span><span className="gd-value">{fmtMoney(view.fc.freeCash, 'R$')}</span><span className="gd-sub">entrou − gastou</span></div>
            <div className="gd-card gd-warn"><span className="gd-label">A pagar</span><span className="gd-value">{fmtMoney(view.pending.payable, 'R$')}</span><span className="gd-sub">{view.pending.count} título(s){view.pending.overdue ? ` · ${view.pending.overdue} atrasado(s)` : ''}</span></div>
            <div className={`gd-card ${view.budget > 0 && view.spentBudget > view.budget ? 'gd-out' : 'gd-budget'}`}>
              <span className="gd-label">Orçamento</span>
              <span className="gd-value">{view.budget > 0 ? `${Math.round((view.spentBudget / view.budget) * 100)}%` : '—'}</span>
              <span className="gd-sub">{view.budget > 0 ? `${fmtMoney(view.spentBudget, 'R$')} / ${fmtMoney(view.budget, 'R$')}` : 'sem metas'}</span>
            </div>
            <div className="gd-card">
              <span className="gd-label">{view.worstRise ? 'Maior alta vs mês passado' : 'Maior categoria'}</span>
              <span className="gd-value gd-sm">{view.worstRise ? `${catName(view.worstRise.categoryId)} ▲${view.worstRise.deltaPct}%` : (view.groups[0] ? catName(view.groups[0].categoryId) : '—')}</span>
              <span className="gd-sub">{view.worstRise ? 'subiu vs mês passado' : (view.groups[0] ? fmtMoney(view.groups[0].total, 'R$') : '')}</span>
            </div>
          </div>

          {/* Gráficos */}
          <WidgetGrid storageKey="gastos">
            <div className="dash-section" key="donut">
              <div className="dash-title"><span>Gastos por categoria</span>{focusCat && <button className="gd-clear" onClick={() => setFocusCat(null)}>limpar filtro</button>}</div>
              {donut.length === 0 ? (
                <div className="gd-empty">Sem despesas neste mês.</div>
              ) : (
                <div className="gd-donut">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={donutShown} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={2}
                        onClick={(d) => setFocusCat((c) => (c === d?.id ? null : d?.id))}
                      >
                        {donutShown.map((d) => <Cell key={d.id} fill={d.color} cursor="pointer" opacity={focusCat && focusCat !== d.id ? 0.35 : 1} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'R$')} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="gd-legend">
                    {donut.map((d) => {
                      const total = donut.reduce((s, x) => s + x.value, 0) || 1;
                      return (
                        <button key={d.id} className={`gd-legend-row${focusCat === d.id ? ' active' : ''}`} onClick={() => setFocusCat((c) => (c === d.id ? null : d.id))}>
                          <span className="gd-dot" style={{ background: d.color }} />
                          <CatIcon name={catMeta(d.id).icon} color={catMeta(d.id).color} />
                          <span className="gd-legend-name">{d.name}</span>
                          <span className="gd-legend-pct">{Math.round((d.value / total) * 100)}%</span>
                          <span className="gd-legend-val">{fmtMoney(d.value, 'R$')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="dash-section" key="cashflow">
              <div className="dash-title"><span>Entrou × Gastou (6 meses)</span></div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={view.series} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                  <defs>
                    <linearGradient id="gd-in" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2ecc71" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#2ecc71" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gd-out" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#e74c3c" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#e74c3c" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={52} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                  <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'R$')} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Entradas" stroke="#2ecc71" fill="url(#gd-in)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Gastos" stroke="#e74c3c" fill="url(#gd-out)" strokeWidth={2} />
                  <Line type="monotone" dataKey="Saldo" stroke="#7c5cff" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {view.bills.length > 0 && (
              <div className="dash-section" key="bills">
                <div className="dash-title"><span>Próximas contas</span><NavLink className="dash-link" to="/expenses">gerenciar →</NavLink></div>
                {view.bills.map((b) => (
                  <div key={b.tx.id} className={`gd-row${b.overdue ? ' gd-row-late' : ''}`}>
                    <CatIcon name={catMeta(categoryOf(b.tx, data.categories) ?? 'outros').icon} color={catMeta(categoryOf(b.tx, data.categories) ?? 'outros').color} />
                    <span className="gd-row-name">{b.tx.note || catName(categoryOf(b.tx, data.categories) ?? 'outros')}</span>
                    <span className="gd-row-sub">vence {b.dueDate || b.tx.date.slice(0, 10)}{b.overdue ? ' · atrasado' : ''}</span>
                    <span className={`gd-row-val ${b.tx.kind === 'expense' ? 'gd-neg' : 'gd-pos'}`}>{fmtMoney(Math.abs(b.tx.amount), 'R$')}</span>
                  </div>
                ))}
              </div>
            )}

            {view.merchants.length > 0 && (
              <div className="dash-section" key="merchants">
                <div className="dash-title"><span>Onde mais gastei</span></div>
                {(() => {
                  const max = Math.max(1, ...view.merchants.map((m) => m.total));
                  return view.merchants.map((m) => (
                    <div key={m.name} className="gd-kind-row">
                      <span className="gd-row-ico"><Tag size={14} /></span>
                      <span className="gd-row-name">{m.name}</span>
                      <span className="gd-row-sub">{m.count}x</span>
                      <span className="gd-kind-bar-wrap"><span className="gd-kind-bar" style={{ width: `${Math.round((m.total / max) * 100)}%` }} /></span>
                      <span className="gd-row-val gd-neg">{fmtMoney(m.total, 'R$')}</span>
                    </div>
                  ));
                })()}
              </div>
            )}

            <div className="dash-section" key="recent">
              <div className="dash-title"><span>Últimos lançamentos</span><NavLink className="dash-link" to="/expenses">ver todos →</NavLink></div>
              {view.recent.length === 0 ? (
                <div className="gd-empty">Nada lançado neste mês.</div>
              ) : view.recent.map((t) => {
                const meta = catMeta(categoryOf(t, data.categories) ?? 'outros');
                return (
                  <div key={t.id} className="gd-row">
                    <CatIcon name={meta.icon} color={meta.color} />
                    <span className="gd-row-name">{t.note || meta.name}</span>
                    <span className="gd-row-sub">{(t.date || '').slice(0, 10)}{t.paid === false ? ' · pendente' : ''}</span>
                    <span className={`gd-row-val ${t.amount >= 0 ? 'gd-pos' : 'gd-neg'}`}>{fmtMoney(t.amount, 'R$')}</span>
                  </div>
                );
              })}
            </div>

            {view.cards.length > 0 && (
              <div className="dash-section" key="cards">
                <div className="dash-title"><span>Cartões de crédito</span></div>
                {view.cards.map((c) => (
                  <div key={c.card} className="gd-card-row">
                    <span className="gd-card-badge"><Landmark size={14} /></span>
                    <div className="gd-card-info">
                      <div className="gd-row-name">{c.card}</div>
                      <div className="gd-row-sub">{c.pending > 0 ? `${c.pending} em aberto · ` : ''}fatura do mês</div>
                    </div>
                    <div className="gd-card-amt">
                      <span className="gd-row-val gd-neg">{fmtMoney(c.total, 'R$')}</span>
                      {c.open > 0 && <span className="gd-card-open">em aberto {fmtMoney(c.open, 'R$')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </WidgetGrid>
        </>
      )}
    </div>
  );
}

const GD_CSS = `
.gd-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.gd-card { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; border-radius: 16px; border: 1px solid #1a2232; background: linear-gradient(180deg, #161b25 0%, #131825 100%); box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.gd-in { background: linear-gradient(180deg, #1a3a2b 0%, #142428 100%); border-color: rgba(46,204,113,0.25); }
.gd-out { background: linear-gradient(180deg, #3a1a1a 0%, #241414 100%); border-color: rgba(231,76,60,0.25); }
.gd-net { background: linear-gradient(180deg, #1a3a2b 0%, #142428 100%); border-color: rgba(46,204,113,0.25); }
.gd-budget { background: linear-gradient(180deg, #1e2740 0%, #161b2b 100%); border-color: rgba(52,152,219,0.25); }
.gd-warn { background: linear-gradient(180deg, #2e2b12 0%, #1b2010 100%); border-color: rgba(225,177,44,0.25); }
.gd-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.gd-value { font-size: 1.6rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.gd-value.gd-sm { font-size: 1.05rem; }
.gd-sub { font-size: 11px; color: rgba(255,255,255,0.45); }
.gd-pos { color: var(--green, #2ecc71); }
.gd-neg { color: var(--red, #e74c3c); }

.gd-balance { display: flex; flex-direction: column; gap: 2px; padding: 16px 20px; border-radius: 16px; border: 1px solid #1a2232; background: linear-gradient(180deg, #1e2740 0%, #161b2b 100%); box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.gd-balance-value { display: flex; gap: 14px; font-size: 1.8rem; font-weight: 800; font-variant-numeric: tabular-nums; flex-wrap: wrap; }
.gd-card-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.gd-card-row:last-child { border-bottom: none; }
.gd-card-badge { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: rgba(52,152,219,0.15); color: var(--blue, #3498db); flex-shrink: 0; }
.gd-card-info { flex: 1; min-width: 0; }
.gd-card-amt { text-align: right; display: flex; flex-direction: column; }
.gd-card-open { font-size: 10px; color: var(--yellow, #e1b12c); }

.gd-charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.gd-lists { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.gd-empty { padding: 20px; text-align: center; color: var(--muted, #a1a7b3); font-size: 12px; }
.gd-clear { background: transparent; border: 1px solid #2a3246; color: var(--brand, #7c5cff); border-radius: 8px; padding: 3px 8px; font-size: 10px; cursor: pointer; }

.gd-donut { display: flex; flex-direction: column; gap: 8px; }
.gd-legend { display: flex; flex-direction: column; gap: 4px; }
.gd-legend-row { display: grid; grid-template-columns: 10px 22px 1fr auto auto; align-items: center; gap: 8px; background: transparent; border: 1px solid transparent; border-radius: 10px; padding: 6px 8px; cursor: pointer; text-align: left; color: var(--text, #e7eaf0); }
.gd-legend-row:hover { background: rgba(255,255,255,0.03); }
.gd-legend-row.active { background: rgba(124,92,255,0.1); border-color: rgba(124,92,255,0.3); }
.gd-dot { width: 10px; height: 10px; border-radius: 50%; }
.gd-legend-name { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gd-legend-pct { font-size: 11px; color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.gd-legend-val { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }

.gd-ico { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid; background: rgba(255,255,255,0.03); }
.gd-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
.gd-row:last-child { border-bottom: none; }
.gd-row-late .gd-row-sub { color: var(--red, #e74c3c); }
.gd-row-ico { color: var(--muted, #a1a7b3); }
.gd-row-name { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gd-row-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.gd-row-val { font-variant-numeric: tabular-nums; font-weight: 700; }
@media (max-width: 1000px) { .gd-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 800px) { .gd-charts, .gd-lists { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .gd-cards { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('gd-styles')) {
  const style = document.createElement('style');
  style.id = 'gd-styles';
  style.textContent = GD_CSS;
  document.head.appendChild(style);
}
