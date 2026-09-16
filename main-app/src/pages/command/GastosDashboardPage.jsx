// Módulo Gastos — dashboard (porta de entrada). Resumo completo e interativo:
// KPIs (entrou/gastou/saldo/a pagar/orçamento), donut por categoria (clicável),
// barras entrou×gastou (6m), ranking de estabelecimentos, próximas contas e
// últimos lançamentos com ícones. Composição pura dos motores.
import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import WidgetGrid from '@apps/ui/WidgetGrid';
import { fmtMoney, convertMoney, fmtDisplay } from '@apps/ui/currency';
import {
  House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp, TrendingDown, Briefcase,
  GraduationCap, Tag, Receipt, Coins, Gift, Wallet, PiggyBank, Activity,
  PieChart as PieChartIcon, CalendarClock, Store, List, CreditCard,
} from 'lucide-react';
import {
  listCategories, getBudgets, getSavingsGoal, expensesByCategoryPeriod, incomeByKindPeriod,
  budgetStatusPeriod, monthlySeries, computeFreeCashPeriod, pendingBills, pendingSummary,
  merchantRankingPeriod, compareMonths, categoryOf, periodMonths, inPeriod, currentYm,
  categoryTrend, shiftYm, ymToList,
} from '@apps/lib/db';
import { usePeriod } from '@apps/state';
import PeriodPicker from '@apps/ui/PeriodPicker';

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
  const [quick, setQuick] = useState({ accountId: '', amount: '', category: 'moradia', note: '' });
  const [quickBusy, setQuickBusy] = useState(false);
  const { period, setPeriod } = usePeriod();
  const { loading, data, finance, reload } = useEngineData(async (f) => {
    const [txs, categories, budgets, savingsGoal, wallets] = await Promise.all([
      f.ds.transactions.list(), listCategories(f.ds), getBudgets(f.ds), getSavingsGoal(f.ds), f.money.walletSummary(),
    ]);
    return { txs, categories, budgets, savingsGoal, wallets };
  });

  // Histórico não é mais necessário (atalhos removidos; o período global cobre tudo).
  const view = useMemo(() => {
    if (!data) return null;
    const { txs, categories, budgets, savingsGoal } = data;
    const cats = categories ?? [];
    const catById = new Map(cats.map((c) => [c.id, c]));
    const months = periodMonths(period, txs);
    const groups = expensesByCategoryPeriod(txs, period, cats);
    const gains = incomeByKindPeriod(txs, period);
    const bStatus = budgetStatusPeriod(txs, budgets, period, cats);
    const budget = bStatus.reduce((s, b) => s + (b.budget || 0), 0);
    const spentBudget = bStatus.reduce((s, b) => s + (b.spent || 0), 0);
    const fc = computeFreeCashPeriod(txs, period);
    const refYm = months[months.length - 1] ?? currentYm();
    const series = monthlySeries(txs, Math.max(months.length, 3), refYm).map((s) => ({
      ym: s.ym.slice(5, 7) + '/' + s.ym.slice(2, 4), Entradas: s.income, Gastos: s.expenses, Saldo: s.balance,
    }));
    const comparison = period.mode === 'month' ? compareMonths(txs, period.ym ?? currentYm(), cats) : [];
    const worstRise = comparison.filter((r) => r.deltaPct != null && r.deltaPct > 0).sort((a, b) => b.deltaPct - a.deltaPct)[0] ?? null;
    const goal = months.reduce((s, m) => s + (savingsGoal[m] ?? 0), 0);
    const recent = txs
      .filter((t) => inPeriod(t.date, period, txs) && (t.kind === 'expense' || ['payout_in', 'rebate', 'income'].includes(t.kind)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);
    // Saldo em contas (valor único, convertido para a moeda de exibição).
    let balanceTotal = 0;
    for (const w of (data.wallets ?? [])) {
      if (!['bank', 'wallet', 'cash', 'crypto'].includes(w.account.kind)) continue;
      balanceTotal += convertMoney(w.balance ?? 0, w.currency);
    }
    // Cartões de crédito: fatura no período, em aberto (não pagas) × fechadas.
    const cardMap = new Map();
    for (const t of txs) {
      if (t.kind !== 'expense' || !t.card) continue;
      if (!inPeriod(t.date, period, txs)) continue;
      const cur = cardMap.get(t.card) ?? { card: t.card, total: 0, open: 0, pending: 0 };
      cur.total += Math.abs(t.amount);
      if (t.paid === false) { cur.open += Math.abs(t.amount); cur.pending += 1; }
      cardMap.set(t.card, cur);
    }
    const cards = [...cardMap.values()].sort((a, b) => b.total - a.total);
    // Savings rate do período (+ do período anterior).
    const savingsRate = fc.income > 0 ? (fc.freeCash / fc.income) * 100 : null;
    let prevSavingsRate = null;
    if (period.mode === 'month' && period.ym) {
      const prev = computeFreeCashPeriod(txs, { mode: 'month', ym: shiftYm(period.ym, -1) });
      prevSavingsRate = prev.income > 0 ? (prev.freeCash / prev.income) * 100 : null;
    } else if (period.mode === 'range' && period.from && period.to) {
      const len = ymToList(period.from, period.to).length || 1;
      const prevTo = shiftYm(period.from, -1);
      const prev = computeFreeCashPeriod(txs, { mode: 'range', from: shiftYm(prevTo, -(len - 1)), to: prevTo });
      prevSavingsRate = prev.income > 0 ? (prev.freeCash / prev.income) * 100 : null;
    }
    // Série empilhada por categoria (top 6 + Outros).
    const trendRaw = categoryTrend(txs, months, cats);
    const topCats = groups.slice(0, 6).map((g) => g.categoryId);
    const trend = trendRaw.map((p) => {
      const row = { ym: p.ym.slice(5, 7) + '/' + p.ym.slice(2, 4) };
      let rest = 0;
      for (const [cid, val] of Object.entries(p.byCategory)) {
        if (topCats.includes(cid)) row[cid] = val;
        else rest += val;
      }
      if (rest > 0) row.__outros = rest;
      return row;
    });
    // Impostos: categorias com group='imposto' (IR, DARF, ITBI, IPTU, IOF, Cripto, Exterior...).
    const taxIds = new Set(cats.filter((c) => c.group === 'imposto').map((c) => c.id));
    const taxGroups = groups.filter((g) => taxIds.has(g.categoryId));
    const taxTotal = taxGroups.reduce((s, g) => s + g.total, 0);
    const taxAllTime = expensesByCategoryPeriod(txs, { mode: 'all' }, cats)
      .filter((g) => taxIds.has(g.categoryId)).reduce((s, g) => s + g.total, 0);
    // Pendências ("a pagar") escopadas ao período selecionado.
    const periodTxs = txs.filter((t) => inPeriod(t.dueDate || t.date, period, txs));
    return {
      ym: period.mode === 'month' ? period.ym : null, catById, groups, gains, budget, spentBudget, fc, series,
      bStatus,
      pending: pendingSummary(periodTxs), bills: pendingBills(periodTxs).slice(0, 5),
      merchants: merchantRankingPeriod(txs, period, 6), recent, worstRise, goal, balanceTotal, cards,
      taxGroups, taxTotal, taxAllTime, savingsRate, prevSavingsRate, trend, topCats,
    };
  }, [data, period]);

  const catName = (id) => view?.catById.get(id)?.name ?? id;
  const catMeta = (id) => view?.catById.get(id) ?? { name: id, icon: 'Tag', color: 'gray' };

  const quickAccounts = (data?.wallets ?? []).filter((w) => ['bank', 'wallet', 'cash', 'crypto'].includes(w.account.kind));
  const quickAdd = async () => {
    const amount = Number(String(quick.amount).replace(',', '.'));
    if (!finance || !quick.accountId || !(amount > 0)) return;
    setQuickBusy(true);
    try {
      const acc = quickAccounts.find((w) => w.account.id === quick.accountId)?.account;
      await finance.money.recordExpense({
        accountId: quick.accountId,
        amount,
        currency: acc?.currency || 'BRL',
        category: quick.category,
        note: quick.note || undefined,
      });
      setQuick((s) => ({ ...s, amount: '', note: '' }));
      reload();
    } finally {
      setQuickBusy(false);
    }
  };

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

      {/* Período: mês · intervalo X→Y · tudo. Toda a dashboard respeita o selecionado. */}
      <div className="gd-monthbar">
        <PeriodPicker period={period} onChange={setPeriod} />
      </div>

      {quickAccounts.length > 0 && (
        <div className="gd-quick" role="group" aria-label="Lançamento rápido">
          <select className="gd-quick-input" value={quick.accountId} onChange={(e) => setQuick((s) => ({ ...s, accountId: e.target.value }))} aria-label="Conta">
            <option value="">Conta…</option>
            {quickAccounts.map((w) => (<option key={w.account.id} value={w.account.id}>{w.account.name}</option>))}
          </select>
          <input className="gd-quick-input" type="number" step="0.01" placeholder="Valor" value={quick.amount} onChange={(e) => setQuick((s) => ({ ...s, amount: e.target.value }))} aria-label="Valor" />
          <select className="gd-quick-input" value={quick.category} onChange={(e) => setQuick((s) => ({ ...s, category: e.target.value }))} aria-label="Categoria">
            {(data.categories ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <input className="gd-quick-input" placeholder="Nota (opcional)" value={quick.note} onChange={(e) => setQuick((s) => ({ ...s, note: e.target.value }))} aria-label="Nota" />
          <button className="gd-quick-btn" disabled={quickBusy || !quick.accountId || !quick.amount} onClick={quickAdd}>{quickBusy ? '…' : 'Adicionar'}</button>
        </div>
      )}

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
            <div className="gd-card gd-in"><span className="gd-ico-badge gd-pos"><TrendingUp size={15} /></span><span className="gd-label">Entrou no mês</span><span className="gd-value gd-pos">{fmtMoney(view.fc.income, 'R$')}</span><span className="gd-sub">{view.gains.reduce((s, g) => s + g.count, 0)} lançamento(s)</span></div>
            <div className="gd-card gd-out"><span className="gd-ico-badge gd-neg"><TrendingDown size={15} /></span><span className="gd-label">Gastou no mês</span><span className="gd-value gd-neg">{fmtMoney(view.fc.expenses, 'R$')}</span><span className="gd-sub">{view.groups.reduce((s, g) => s + g.count, 0)} despesa(s)</span></div>
            <div className={`gd-card ${view.fc.freeCash >= 0 ? 'gd-net' : 'gd-out'}`}><span className="gd-ico-badge"><Wallet size={15} /></span><span className="gd-label">Saldo do mês</span><span className="gd-value">{fmtMoney(view.fc.freeCash, 'R$')}</span><span className="gd-sub">entrou − gastou</span></div>
            <div className="gd-card gd-warn"><span className="gd-ico-badge gd-warn-t"><Landmark size={15} /></span><span className="gd-label">A pagar</span><span className="gd-value">{fmtMoney(view.pending.payable, 'R$')}</span><span className="gd-sub">{view.pending.count} título(s){view.pending.overdue ? ` · ${view.pending.overdue} atrasado(s)` : ''}</span></div>
            <div className={`gd-card ${view.budget > 0 && view.spentBudget > view.budget ? 'gd-out' : 'gd-budget'}`}>
              <span className="gd-ico-badge"><PiggyBank size={15} /></span>
              <span className="gd-label">Orçamento</span>
              <span className="gd-value">{view.budget > 0 ? `${Math.round((view.spentBudget / view.budget) * 100)}%` : '—'}</span>
              <span className="gd-sub">{view.budget > 0 ? `${fmtMoney(view.spentBudget, 'R$')} / ${fmtMoney(view.budget, 'R$')}` : 'sem metas'}</span>
            </div>
            <div className="gd-card">
              <span className="gd-ico-badge"><Activity size={15} /></span>
              <span className="gd-label">{view.worstRise ? 'Maior alta vs mês passado' : 'Maior categoria'}</span>
              <span className="gd-value gd-sm">{view.worstRise ? `${catName(view.worstRise.categoryId)} ▲${view.worstRise.deltaPct}%` : (view.groups[0] ? catName(view.groups[0].categoryId) : '—')}</span>
              <span className="gd-sub">{view.worstRise ? 'subiu vs mês passado' : (view.groups[0] ? fmtMoney(view.groups[0].total, 'R$') : '')}</span>
            </div>
          </div>

          {/* Gráficos */}
          <WidgetGrid storageKey="gastos">
            <div className="dash-section" key="donut">
              <div className="dash-title"><span><PieChartIcon size={14} /> Gastos por categoria</span>{focusCat && <button className="gd-clear" onClick={() => setFocusCat(null)}>limpar filtro</button>}</div>
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
              <div className="dash-title"><span><Activity size={14} /> Entrou × Gastou (6 meses)</span></div>
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

            <div className="dash-section" key="savings">
              <div className="dash-title"><span><PiggyBank size={14} /> Taxa de poupança</span></div>
              {view.savingsRate == null ? (
                <div className="gd-empty">Sem entradas no período.</div>
              ) : (
                <>
                  <div className="gd-row">
                    <span className="gd-row-ico"><PiggyBank size={14} /></span>
                    <span className="gd-row-name">Poupado no período</span>
                    <span className={`gd-row-val ${view.savingsRate >= 0 ? 'gd-pos' : 'gd-neg'}`}>{view.savingsRate.toFixed(1)}%</span>
                  </div>
                  <div className="gd-row">
                    <span className="gd-row-ico"><Activity size={14} /></span>
                    <span className="gd-row-name">vs período anterior</span>
                    <span className={`gd-row-val ${view.prevSavingsRate != null && view.savingsRate >= view.prevSavingsRate ? 'gd-pos' : 'gd-neg'}`}>{view.prevSavingsRate != null ? `${view.prevSavingsRate.toFixed(1)}%` : '—'}</span>
                  </div>
                </>
              )}
            </div>

            <div className="dash-section" key="budget">
              <div className="dash-title"><span><PiggyBank size={14} /> Orçado × realizado</span></div>
              {(() => {
                const rows = (view.bStatus ?? []).filter((b) => b.budget > 0 || b.spent > 0).sort((a, b) => (b.pct || 0) - (a.pct || 0));
                if (!rows.length) return <div className="gd-empty">Sem orçamento definido no período.</div>;
                return rows.map((b) => (
                  <div key={b.categoryId} className="gd-kind-row">
                    <span className="gd-row-ico"><CatIcon name={catMeta(b.categoryId).icon} color={catMeta(b.categoryId).color} /></span>
                    <span className="gd-row-name">{catName(b.categoryId)}</span>
                    <span className="gd-row-sub">{fmtMoney(b.spent, 'R$')} / {fmtMoney(b.budget, 'R$')}</span>
                    <span className="gd-kind-bar-wrap"><span className={`gd-kind-bar ${b.over ? 'gd-bar-over' : 'gd-bar-ok'}`} style={{ width: `${Math.min(100, Math.round((b.pct || 0) * 100))}%` }} /></span>
                    <span className={`gd-row-val ${b.over ? 'gd-neg' : ''}`}>{b.budget > 0 ? `${Math.round((b.pct || 0) * 100)}%` : '—'}</span>
                  </div>
                ));
              })()}
            </div>

            <div className="dash-section" key="trend">
              <div className="dash-title"><span><Activity size={14} /> Composição dos gastos (por mês)</span></div>
              {view.trend.length < 2 ? (
                <div className="gd-empty">Período curto para tendência.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={view.trend} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={52} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                    <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'R$')} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {view.topCats.map((cid) => (
                      <Bar key={cid} dataKey={cid} stackId="a" name={catName(cid)} fill={COLORS[catMeta(cid).color] || COLORS.gray} />
                    ))}
                    <Bar dataKey="__outros" stackId="a" name="Outros" fill={COLORS.gray} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {view.bills.length > 0 && (
              <div className="dash-section" key="bills">
                <div className="dash-title"><span><CalendarClock size={14} /> Próximas contas</span><NavLink className="dash-link" to="/expenses">gerenciar →</NavLink></div>
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
                <div className="dash-title"><span><Store size={14} /> Onde mais gastei</span></div>
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

            {view.taxGroups.length > 0 && (
              <div className="dash-section" key="tax">
                <div className="dash-title">
                  <span><Landmark size={14} /> Impostos</span>
                  <span className="gd-row-sub">desde o início {fmtMoney(view.taxAllTime, 'R$')}</span>
                </div>
                <div className="gd-row">
                  <span className="gd-row-ico"><Receipt size={14} /></span>
                  <span className="gd-row-name">Total no período</span>
                  <span className="gd-row-val gd-neg">{fmtMoney(view.taxTotal, 'R$')}</span>
                </div>
                {(() => {
                  const max = Math.max(1, ...view.taxGroups.map((g) => g.total));
                  return view.taxGroups.map((g) => (
                    <div key={g.categoryId} className="gd-kind-row">
                      <span className="gd-row-ico"><CatIcon name={catMeta(g.categoryId).icon} color={catMeta(g.categoryId).color} /></span>
                      <span className="gd-row-name">{catName(g.categoryId)}</span>
                      <span className="gd-row-sub">{g.count}x</span>
                      <span className="gd-kind-bar-wrap"><span className="gd-kind-bar" style={{ width: `${Math.round((g.total / max) * 100)}%` }} /></span>
                      <span className="gd-row-val gd-neg">{fmtMoney(g.total, 'R$')}</span>
                    </div>
                  ));
                })()}
              </div>
            )}

            <div className="dash-section" key="recent">
              <div className="dash-title"><span><List size={14} /> Últimos lançamentos</span><NavLink className="dash-link" to="/expenses">ver todos →</NavLink></div>
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
                <div className="dash-title"><span><CreditCard size={14} /> Cartões de crédito</span></div>
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
.gd-quick { display: grid; grid-template-columns: 1.2fr 0.8fr 1.1fr 1.4fr auto; gap: 8px; align-items: center; }
.gd-quick-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 8px 10px; color: var(--text, #e7eaf0); font-size: 12px; min-height: 40px; font-family: inherit; }
.gd-quick-btn { padding: 8px 16px; border-radius: 10px; border: none; background: linear-gradient(135deg, #7c5cff, #6d4df2); color: #fff; font-weight: 700; font-size: 12px; cursor: pointer; min-height: 40px; }
.gd-quick-btn:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 900px) { .gd-quick { grid-template-columns: 1fr 1fr; } }
.gd-monthbar { display: flex; flex-direction: column; gap: 8px; }
.gd-monthnav { display: flex; align-items: center; gap: 8px; }
.gd-mnav { width: 38px; height: 38px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 18px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.gd-mnav:hover { background: rgba(124,92,255,0.12); border-color: rgba(124,92,255,0.35); }
.gd-month-label { font-size: 15px; font-weight: 800; min-width: 96px; text-align: center; }
.gd-today { margin-left: 4px; padding: 7px 12px; border-radius: 10px; background: rgba(124,92,255,0.12); border: 1px solid rgba(124,92,255,0.35); color: var(--brand, #7c5cff); font-size: 12px; font-weight: 700; cursor: pointer; }
.gd-months { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
.gd-monthchip { display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 62px; padding: 7px 8px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--muted, #a1a7b3); cursor: pointer; }
.gd-monthchip:hover { background: rgba(255,255,255,0.06); }
.gd-monthchip.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.45); color: var(--text, #e7eaf0); }
.gd-monthchip-m { font-size: 12px; font-weight: 700; }
.gd-monthchip-y { font-size: 10px; opacity: 0.7; }
.gd-monthchip-b { font-size: 10px; font-variant-numeric: tabular-nums; font-weight: 700; }
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
