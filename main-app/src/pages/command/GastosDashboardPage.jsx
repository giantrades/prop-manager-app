// Módulo Gastos — dashboard (porta de entrada). Resumo completo e interativo:
// KPIs (entrou/gastou/saldo/a pagar/orçamento), donut por categoria (clicável),
// barras entrou×gastou (6m), ranking de estabelecimentos, próximas contas e
// últimos lançamentos com ícones. Composição pura dos motores.
import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, ComposedChart, Area, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import ModuleTabsWithPeriod from '../../ModuleTabsWithPeriod';
import useEngineData from '../../useEngineData';
import WidgetGrid from '@apps/ui/WidgetGrid';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { useEntityDrawer } from '@apps/ui/EntityDrawer';
import { fmtMoney } from '@apps/ui/currency';
import {
  House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp, TrendingDown, Briefcase,
  GraduationCap, Tag, Receipt, Coins, Gift, Wallet, PiggyBank, Activity,
  PieChart as PieChartIcon, CalendarClock, Store, List, CreditCard,
} from 'lucide-react';
import {
  listCategories, getBudgets, getSavingsGoal, expensesByCategoryPeriod, incomeByKindPeriod,
  budgetStatusPeriod, monthlySeries, computeFreeCashPeriod, pendingBills, pendingSummary,
  merchantRankingPeriod, compareMonths, categoryOf, periodMonths, inPeriod, currentYm,
  categoryTrend, shiftYm, ymToList, invoiceCycle,
  previousPeriod, rollupByParent, subcategoriesOf, invoiceStatus, recurringDue,
  upcomingBills, upcomingSummary,
} from '@apps/lib/db';
import { usePeriod } from '@apps/state';

const WIDGETS_KEY = 'ui:widgets:gastos';

/** Δ% entre dois valores (null quando não há base anterior). */
function pctDelta(cur, prev) {
  if (prev == null || prev === 0) return null;
  return Number((((cur - prev) / Math.abs(prev)) * 100).toFixed(1));
}

/** Sparkline SVG mínima (sem lib) — só desenha a série normalizada. */
function Sparkline({ values = [], color = 'var(--brand, #7c5cff)', width = 72, height = 22 }) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = width / (pts.length - 1);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(' ');
  return (
    <svg className="gd-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Badge de tendência (Δ vs período anterior). */
function TrendBadge({ delta, invert = false }) {
  if (delta == null) return null;
  const up = delta > 0;
  // invert: subir é ruim (gastos). Sem invert: subir é bom (entradas/saldo).
  const good = invert ? !up : up;
  return (
    <span className={`gd-trend ${good ? 'gd-pos' : 'gd-neg'}`} title="vs período anterior">
      {up ? '▲' : '▼'}{Math.abs(delta)}%
    </span>
  );
}

const ICONS = { House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp, Briefcase, GraduationCap, Tag, Receipt, Coins, Gift, Wallet, PiggyBank };
const COLORS = { blue: '#3498db', green: '#2ecc71', yellow: '#e1b12c', red: '#e74c3c', brand: '#7c5cff', gray: '#8b94a5' };

const INVOICE_LABEL = { aberta: 'Aberta', fechada: 'Fechada', paga: 'Paga', parcial: 'Parcial' };

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
  const [payCard, setPayCard] = useState(null);
  const [payAccount, setPayAccount] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const drawer = useEntityDrawer();
  const { period, setPeriod } = usePeriod();
  const { loading, data, error, reload, finance } = useEngineData(async (f) => {
    const [txs, categories, budgets, savingsGoal, wallets, cards, layoutRec, forecast, safeAvailable, accounts] = await Promise.all([
      f.ds.transactions.list(), listCategories(f.ds), getBudgets(f.ds), getSavingsGoal(f.ds), f.money.walletSummary(), f.ds.cards.list(),
      f.ds.meta.getKey(WIDGETS_KEY), f.wealth.forecast(), f.wealth.safeAvailable(), f.ds.accounts.list(),
    ]);
    return { txs, categories, budgets, savingsGoal, wallets, cards, layout: layoutRec?.value ?? null, forecast, safeAvailable, accounts };
  });

  // H1 — layout dos widgets persistido no meta (sincroniza entre dispositivos).
  const onLayoutChange = useMemo(() => (layout) => {
    try { finance?.ds?.meta?.setKey(WIDGETS_KEY, layout); } catch { /* noop */ }
  }, [finance]);

  // H5 — abrir o modal "Pagar fatura".
  const openPay = (card, status) => {
    setPayCard({ card, status });
    setPayAccount(card.accountId || (data?.accounts ?? [])[0]?.id || '');
    setPayAmount(String(status.restante ?? ''));
  };
  const confirmPay = async () => {
    if (!payCard || !finance) return;
    const amt = Number(payAmount);
    if (!(amt > 0) || !payAccount) return;
    const cards = await finance.ds.cards.list();
    const card = cards.find((c) => c.id === payCard.card.id);
    await finance.money.payCardInvoice({
      cardId: payCard.card.id, competencia: payCard.status.competencia,
      accountId: payAccount, toAccountId: card?.accountId, amount: amt, currency: 'USD',
    });
    setPayCard(null);
  };

  // H9 — quitar/receber uma conta direto do Resumo.
  const payBill = async (tx) => {
    if (!finance || !tx) return;
    await finance.money.updateTransaction(tx.id, { paid: true });
  };

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
      balanceTotal += w.balance ?? 0; // cru (USD); conversão só na formatação
    }
    // Cartões de crédito: fatura no período + fatura ABERTA (por fechamento) + uso do limite.
    const cardById = new Map((data.cards ?? []).map((c) => [c.id, c]));
    const cardByName = new Map((data.cards ?? []).map((c) => [c.name, c]));
    const cardMap = new Map();
    for (const t of txs) {
      const key = t.cardId || t.card;
      if (t.kind !== 'expense' || !key) continue;
      if (!inPeriod(t.date, period, txs)) continue;
      const meta = cardById.get(t.cardId) || cardByName.get(t.card);
      const cur = cardMap.get(key) ?? {
        key, card: meta?.name ?? t.card, limit: meta?.creditLimit ?? 0,
        closingDay: meta?.closingDay, dueDay: meta?.dueDay, total: 0, open: 0, pending: 0, invoice: 0,
      };
      cur.total += Math.abs(t.amount);
      if (t.paid === false) { cur.open += Math.abs(t.amount); cur.pending += 1; }
      cardMap.set(key, cur);
    }
    // Fatura aberta (ignora o período; é a janela do ciclo de fechamento).
    for (const c of (data.cards ?? [])) {
      const cyc = invoiceCycle(c.closingDay);
      let inv = 0;
      for (const t of txs) {
        if (t.kind !== 'expense') continue;
        if ((t.cardId || t.card) !== c.id && t.card !== c.name) continue;
        if (t.date >= cyc.start && t.date <= cyc.end) inv += Math.abs(t.amount);
      }
      const cur = cardMap.get(c.id) ?? {
        key: c.id, card: c.name, limit: c.creditLimit ?? 0, closingDay: c.closingDay, dueDay: c.dueDay, total: 0, open: 0, pending: 0, invoice: 0,
      };
      cur.invoice = inv;
      cur.limit = c.creditLimit ?? 0;
      cur.closingDay = c.closingDay;
      cur.dueDay = c.dueDay;
      cardMap.set(c.id, cur);
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
    // Reserva de imposto: impostos lançados como ainda não pagos (a pagar).
    const taxPending = txs
      .filter((t) => t.kind === 'expense' && t.paid === false && taxIds.has(categoryOf(t, cats) ?? ''))
      .reduce((s, t) => s + Math.abs(t.amount || 0), 0);
    // Pendências ("a pagar") escopadas ao período selecionado.
    const periodTxs = txs.filter((t) => inPeriod(t.dueDate || t.date, period, txs));
    // H2 — Δ vs período anterior (composição de selectors; sem série nova).
    const prevPeriod = previousPeriod(period, txs);
    const prevFc = prevPeriod ? computeFreeCashPeriod(txs, prevPeriod) : null;
    const delta = {
      income: prevFc ? pctDelta(fc.income, prevFc.income) : null,
      expenses: prevFc ? pctDelta(fc.expenses, prevFc.expenses) : null,
      freeCash: prevFc ? pctDelta(fc.freeCash, prevFc.freeCash) : null,
      merchants: null,
    };
    // H6 — donut consolidado pelo PAI (drill-down para as filhas).
    const rollup = rollupByParent(groups, cats);
    // H5 — estado das faturas (aberta/fechada/paga/parcial).
    const cardInvoices = (data.cards ?? [])
      .map((c) => ({ card: c, status: invoiceStatus(c, txs) }))
      .filter((x) => x.status.total > 0 || x.status.pago > 0)
      .sort((a, b) => b.status.total - a.status.total);
    // H7 — projeção de caixa (reusa wealth.forecast/safeAvailable + pendências).
    const projection = data.forecast
      ? {
        ...data.forecast,
        safe: data.safeAvailable,
        pending: pendingSummary(txs),
        dueCount: recurringDue(txs, currentYm()).length,
      }
      : null;
    return {
      ym: period.mode === 'month' ? period.ym : null, catById, groups, gains, budget, spentBudget, fc, series,
      bStatus,
      pending: pendingSummary(periodTxs), bills: pendingBills(periodTxs).slice(0, 5),
      upcoming: upcomingBills(txs, undefined, 15).slice(0, 8), upcomingSum: upcomingSummary(txs, undefined, 15),
      merchants: merchantRankingPeriod(txs, period, 6), recent, worstRise, goal, balanceTotal, cards,
      taxGroups, taxTotal, taxAllTime, savingsRate, prevSavingsRate, trend, topCats,
      taxPending: Number(taxPending.toFixed(2)),
      delta, rollup, cardInvoices, projection,
      spark: { income: series.map((s) => s.Entradas), expenses: series.map((s) => s.Gastos), balance: series.map((s) => s.Saldo) },
    };
  }, [data, period]);

  const catName = (id) => view?.catById.get(id)?.name ?? id;
  const catMeta = (id) => view?.catById.get(id) ?? { name: id, icon: 'Tag', color: 'gray' };
  // H6 — subcategorias diretas de um pai (para drill-down do donut).
  const subsOf = (parentId) => (view?.groups ?? []).filter((g) => catMeta(g.categoryId).parent === parentId);
  const hasSubs = !!focusCat && subsOf(focusCat).length > 0;
  const donutBase = hasSubs ? subsOf(focusCat) : (view?.rollup ?? []);
  const donut = donutBase.map((g) => ({
    id: g.categoryId, name: catName(g.categoryId), value: g.total,
    color: COLORS[catMeta(g.categoryId).color] || COLORS.gray,
  }));
  const donutShown = hasSubs ? donut : (focusCat ? donut.filter((d) => d.id === focusCat) : donut);

  // B6 — abrir o lançamento sem sair da dashboard.
  const openTx = (t, meta) => drawer.open({
    title: t.note || meta?.name || 'Lançamento',
    subtitle: `${meta?.name ?? 'Lançamento'}${t.paid === false ? ' · pendente' : ''}`,
    href: '/expenses',
    rows: [
      { k: 'Valor', v: fmtMoney(t.amount, 'USD'), color: t.amount >= 0 ? 'var(--green)' : 'var(--red)' },
      { k: 'Data', v: String(t.date || '').slice(0, 10) || '—' },
      { k: 'Conta', v: (data?.wallets ?? []).find((w) => w.account.id === t.accountId)?.account.name ?? '—' },
      ...(t.card ? [{ k: 'Cartão', v: t.card }] : []),
      ...(t.installments ? [{ k: 'Parcelas', v: `${t.installments.n}x` }] : []),
    ],
  });

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Gastos</h1>
        <NavLink className="cmd-refresh" to="/expenses" style={{ textDecoration: 'none' }}>Lançamentos →</NavLink>
      </div>
      {/* Abas + período na mesma linha (ganha espaço vertical). */}
      <ModuleTabsWithPeriod module="gastos" period={period} onChange={setPeriod} />

      {error && view && <ActionableError stale error={error} onRetry={reload} label="os Gastos" />}
      {error && !view ? (
        <ActionableError error={error} onRetry={reload} label="os Gastos" />
      ) : loading || !view ? (
        <DashSkeleton cards={6} widgets={4} />
      ) : (
        <>
          {/* Saldo em contas (topo, estilo Mobills) */}
          <div className="gd-balance">
            <span className="gd-label">Saldo em contas</span>
            <span className={`gd-balance-value ${view.balanceTotal >= 0 ? 'gd-pos' : 'gd-neg'}`}>{fmtMoney(view.balanceTotal, 'USD')}</span>
            <span className="gd-sub">soma das carteiras/contas (na moeda do app)</span>
          </div>

          {/* KPIs */}
          <div className="gd-cards">
            <div className="gd-card gd-in"><span className="gd-ico-badge gd-pos"><TrendingUp size={15} /></span><span className="gd-label">Entrou no mês</span><span className="gd-value gd-pos">{fmtMoney(view.fc.income, 'USD')}</span><span className="gd-sub"><TrendBadge delta={view.delta.income} /> {view.gains.reduce((s, g) => s + g.count, 0)} lançamento(s)</span><Sparkline values={view.spark.income} color="var(--green, #2ecc71)" /></div>
            <div className="gd-card gd-out"><span className="gd-ico-badge gd-neg"><TrendingDown size={15} /></span><span className="gd-label">Gastou no mês</span><span className="gd-value gd-neg">{fmtMoney(view.fc.expenses, 'USD')}</span><span className="gd-sub"><TrendBadge delta={view.delta.expenses} invert /> {view.groups.reduce((s, g) => s + g.count, 0)} despesa(s)</span><Sparkline values={view.spark.expenses} color="var(--red, #e74c3c)" /></div>
            <div className={`gd-card ${view.fc.freeCash >= 0 ? 'gd-net' : 'gd-out'}`}><span className="gd-ico-badge"><Wallet size={15} /></span><span className="gd-label">Saldo do mês</span><span className="gd-value">{fmtMoney(view.fc.freeCash, 'USD')}</span><span className="gd-sub"><TrendBadge delta={view.delta.freeCash} /> entrou − gastou</span><Sparkline values={view.spark.balance} color="var(--brand, #7c5cff)" /></div>
            <div className="gd-card gd-warn"><span className="gd-ico-badge gd-warn-t"><Landmark size={15} /></span><span className="gd-label">A pagar</span><span className="gd-value">{fmtMoney(view.pending.payable, 'USD')}</span><span className="gd-sub">{view.pending.count} título(s){view.pending.overdue ? ` · ${view.pending.overdue} atrasado(s)` : ''}</span></div>
            <div className={`gd-card ${view.budget > 0 && view.spentBudget > view.budget ? 'gd-out' : 'gd-budget'}`}>
              <span className="gd-ico-badge"><PiggyBank size={15} /></span>
              <span className="gd-label">Orçamento</span>
              <span className="gd-value">{view.budget > 0 ? `${Math.round((view.spentBudget / view.budget) * 100)}%` : '—'}</span>
              <span className="gd-sub">{view.budget > 0 ? `${fmtMoney(view.spentBudget, 'USD')} / ${fmtMoney(view.budget, 'USD')}` : 'sem metas'}</span>
            </div>
            <div className="gd-card">
              <span className="gd-ico-badge"><Activity size={15} /></span>
              <span className="gd-label">{view.worstRise ? 'Maior alta vs mês passado' : 'Maior categoria'}</span>
              <span className="gd-value gd-sm">{view.worstRise ? `${catName(view.worstRise.categoryId)} ▲${view.worstRise.deltaPct}%` : (view.groups[0] ? catName(view.groups[0].categoryId) : '—')}</span>
              <span className="gd-sub">{view.worstRise ? 'subiu vs mês passado' : (view.groups[0] ? fmtMoney(view.groups[0].total, 'USD') : '')}</span>
            </div>
          </div>

          {/* Gráficos */}
          <WidgetGrid storageKey="gastos" layout={data?.layout} onLayoutChange={onLayoutChange}>
            <div className="dash-section" key="donut" data-label="Gastos por categoria">
              <div className="dash-title"><span><PieChartIcon size={14} /> Gastos por categoria <TrendBadge delta={view.delta.expenses} invert /></span>{focusCat && <button className="gd-clear" onClick={() => setFocusCat(null)}>{hasSubs ? '← voltar' : 'limpar filtro'}</button>}</div>
              {donut.length === 0 ? (
                <div className="gd-empty">Sem despesas no período. <NavLink className="dash-link" to="/expenses">lançar →</NavLink></div>
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
                      <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'USD')} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="gd-legend">
                    {donutShown.map((d) => {
                      const total = donut.reduce((s, x) => s + x.value, 0) || 1;
                      return (
                        <button key={d.id} className={`gd-legend-row${focusCat === d.id ? ' active' : ''}`} onClick={() => setFocusCat((c) => (c === d.id ? null : d.id))}>
                          <span className="gd-dot" style={{ background: d.color }} />
                          <CatIcon name={catMeta(d.id).icon} color={catMeta(d.id).color} />
                          <span className="gd-legend-name">{d.name}</span>
                          <span className="gd-legend-pct">{Math.round((d.value / total) * 100)}%</span>
                          <span className="gd-legend-val">{fmtMoney(d.value, 'USD')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="dash-section" key="cashflow" data-label="Entrou × Gastou">
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
                  <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'USD')} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Entradas" stroke="#2ecc71" fill="url(#gd-in)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Gastos" stroke="#e74c3c" fill="url(#gd-out)" strokeWidth={2} />
                  <Line type="monotone" dataKey="Saldo" stroke="#7c5cff" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="dash-section" key="savings" data-label="Taxa de poupança">
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

            {view.projection && (
              <div className="dash-section" key="projection" data-label="Projeção de caixa">
                <div className="dash-title"><span><Activity size={14} /> Projeção de caixa</span><span className="gd-row-sub">30/60/90 dias</span></div>
                <div className="gd-row"><span className="gd-row-ico"><Wallet size={14} /></span><span className="gd-row-name">Caixa hoje</span><span className="gd-row-val">{fmtMoney(view.projection.today, 'USD')}</span></div>
                <div className="gd-row"><span className="gd-row-ico"><TrendingUp size={14} /></span><span className="gd-row-name">Em 30 dias</span><span className="gd-row-val">{fmtMoney(view.projection.d30, 'USD')}</span></div>
                <div className="gd-row"><span className="gd-row-ico"><TrendingUp size={14} /></span><span className="gd-row-name">Em 60 dias</span><span className="gd-row-val">{fmtMoney(view.projection.d60, 'USD')}</span></div>
                <div className="gd-row"><span className="gd-row-ico"><TrendingUp size={14} /></span><span className="gd-row-name">Em 90 dias</span><span className="gd-row-val">{fmtMoney(view.projection.d90, 'USD')}</span></div>
                <div className="gd-row"><span className="gd-row-ico"><PiggyBank size={14} /></span><span className="gd-row-name">Fluxo mensal líquido</span><span className={`gd-row-val ${view.projection.netMonthly >= 0 ? 'gd-pos' : 'gd-neg'}`}>{fmtMoney(view.projection.netMonthly, 'USD')}</span></div>
                <div className="gd-row"><span className="gd-row-ico"><Activity size={14} /></span><span className="gd-row-name">Posso comprar (safe)</span><span className="gd-row-val">{fmtMoney(view.projection.safe, 'USD')}</span></div>
                <div className="gd-hint">A pagar {fmtMoney(view.projection.pending.payable, 'USD')} · {view.projection.dueCount} recorrente(s) a gerar</div>
              </div>
            )}

            <div className="dash-section" key="budget" data-label="Orçado × realizado">
              <div className="dash-title"><span><PiggyBank size={14} /> Orçado × realizado</span></div>
              {(() => {
                const rows = (view.bStatus ?? []).filter((b) => b.budget > 0 || b.spent > 0).sort((a, b) => (b.pct || 0) - (a.pct || 0));
                if (!rows.length) return <div className="gd-empty">Sem orçamento definido no período.</div>;
                return rows.map((b) => (
                  <div key={b.categoryId} className="gd-kind-row">
                    <span className="gd-row-ico"><CatIcon name={catMeta(b.categoryId).icon} color={catMeta(b.categoryId).color} /></span>
                    <span className="gd-row-name">{catName(b.categoryId)}</span>
                    <span className="gd-row-sub">{fmtMoney(b.spent, 'USD')} / {fmtMoney(b.budget, 'USD')}</span>
                    <span className="gd-kind-bar-wrap"><span className={`gd-kind-bar ${b.over ? 'gd-bar-over' : 'gd-bar-ok'}`} style={{ width: `${Math.min(100, Math.round((b.pct || 0) * 100))}%` }} /></span>
                    <span className={`gd-row-val ${b.over ? 'gd-neg' : ''}`}>{b.budget > 0 ? `${Math.round((b.pct || 0) * 100)}%` : '—'}</span>
                  </div>
                ));
              })()}
            </div>

            <div className="dash-section" key="trend" data-label="Composição dos gastos">
              <div className="dash-title"><span><Activity size={14} /> Composição dos gastos (por mês)</span></div>
              {view.trend.length < 2 ? (
                <div className="gd-empty">Período curto para tendência.</div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={view.trend} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={52} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                    <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'USD')} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {view.topCats.map((cid) => (
                      <Bar key={cid} dataKey={cid} stackId="a" name={catName(cid)} fill={COLORS[catMeta(cid).color] || COLORS.gray} />
                    ))}
                    <Bar dataKey="__outros" stackId="a" name="Outros" fill={COLORS.gray} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {view.upcoming.length > 0 && (
              <div className="dash-section" key="upcoming" data-label="Próximas a vencer">
                <div className="dash-title">
                  <span><CalendarClock size={14} /> Próximas a vencer (15 dias)</span>
                  <span className="gd-row-sub">
                    {view.upcomingSum.payable > 0 ? `a pagar ${fmtMoney(view.upcomingSum.payable, 'USD')}` : ''}
                    {view.upcomingSum.receivable > 0 ? ` · a receber ${fmtMoney(view.upcomingSum.receivable, 'USD')}` : ''}
                  </span>
                </div>
                {view.upcoming.map((b) => {
                  const isIncome = b.tx.kind !== 'expense';
                  const meta = catMeta(categoryOf(b.tx, data.categories) ?? 'outros');
                  return (
                    <div key={`${b.tx.id}-${b.dueDate}`} className={`gd-row${b.overdue ? ' gd-row-late' : ''}`}>
                      <CatIcon name={isIncome ? 'Gift' : meta.icon} color={isIncome ? 'green' : meta.color} />
                      <span className="gd-row-name">{b.tx.note || meta.name}</span>
                      <span className="gd-row-sub">
                        {b.overdue ? `${Math.abs(b.days)}d atrasado` : b.days === 0 ? 'hoje' : `em ${b.days}d`}
                        {b.source === 'recurring' ? ' · recorrente' : ''}
                      </span>
                      <span className={`gd-row-val ${isIncome ? 'gd-pos' : 'gd-neg'}`}>{fmtMoney(Math.abs(b.tx.amount), 'USD')}</span>
                      <button className="gd-pay" onClick={() => payBill(b.tx)}>{isIncome ? 'Receber' : 'Pagar'}</button>
                    </div>
                  );
                })}
              </div>
            )}

            {view.bills.length > 0 && (
              <div className="dash-section" key="bills" data-label="Próximas contas">
                <div className="dash-title"><span><CalendarClock size={14} /> Próximas contas</span><NavLink className="dash-link" to="/expenses">gerenciar →</NavLink></div>
                {view.bills.map((b) => (
                  <div key={b.tx.id} className={`gd-row${b.overdue ? ' gd-row-late' : ''}`}>
                    <CatIcon name={catMeta(categoryOf(b.tx, data.categories) ?? 'outros').icon} color={catMeta(categoryOf(b.tx, data.categories) ?? 'outros').color} />
                    <span className="gd-row-name">{b.tx.note || catName(categoryOf(b.tx, data.categories) ?? 'outros')}</span>
                    <span className="gd-row-sub">vence {b.dueDate || b.tx.date.slice(0, 10)}{b.overdue ? ' · atrasado' : ''}</span>
                    <span className={`gd-row-val ${b.tx.kind === 'expense' ? 'gd-neg' : 'gd-pos'}`}>{fmtMoney(Math.abs(b.tx.amount), 'USD')}</span>
                  </div>
                ))}
              </div>
            )}

            {view.merchants.length > 0 && (
              <div className="dash-section" key="merchants" data-label="Onde mais gastei">
                <div className="dash-title"><span><Store size={14} /> Onde mais gastei</span></div>
                {(() => {
                  const max = Math.max(1, ...view.merchants.map((m) => m.total));
                  return view.merchants.map((m) => (
                    <div key={m.name} className="gd-kind-row">
                      <span className="gd-row-ico"><Tag size={14} /></span>
                      <span className="gd-row-name">{m.name}</span>
                      <span className="gd-row-sub">{m.count}x</span>
                      <span className="gd-kind-bar-wrap"><span className="gd-kind-bar" style={{ width: `${Math.round((m.total / max) * 100)}%` }} /></span>
                      <span className="gd-row-val gd-neg">{fmtMoney(m.total, 'USD')}</span>
                    </div>
                  ));
                })()}
              </div>
            )}

            {view.taxGroups.length > 0 && (
              <div className="dash-section" key="tax" data-label="Impostos">
                <div className="dash-title">
                  <span><Landmark size={14} /> Impostos</span>
                  <span className="gd-row-sub">desde o início {fmtMoney(view.taxAllTime, 'USD')}</span>
                </div>
                <div className="gd-row">
                  <span className="gd-row-ico"><Receipt size={14} /></span>
                  <span className="gd-row-name">Total no período</span>
                  <span className="gd-row-val gd-neg">{fmtMoney(view.taxTotal, 'USD')}</span>
                </div>
                <div className="gd-row">
                  <span className="gd-row-ico"><PiggyBank size={14} /></span>
                  <span className="gd-row-name">A pagar (reservar)</span>
                  <span className="gd-row-val gd-warn-t">{fmtMoney(view.taxPending, 'USD')}</span>
                </div>
                {(() => {
                  const max = Math.max(1, ...view.taxGroups.map((g) => g.total));
                  return view.taxGroups.map((g) => (
                    <div key={g.categoryId} className="gd-kind-row">
                      <span className="gd-row-ico"><CatIcon name={catMeta(g.categoryId).icon} color={catMeta(g.categoryId).color} /></span>
                      <span className="gd-row-name">{catName(g.categoryId)}</span>
                      <span className="gd-row-sub">{g.count}x</span>
                      <span className="gd-kind-bar-wrap"><span className="gd-kind-bar" style={{ width: `${Math.round((g.total / max) * 100)}%` }} /></span>
                      <span className="gd-row-val gd-neg">{fmtMoney(g.total, 'USD')}</span>
                    </div>
                  ));
                })()}
              </div>
            )}

            <div className="dash-section" key="recent" data-label="Últimos lançamentos">
              <div className="dash-title"><span><List size={14} /> Últimos lançamentos</span><NavLink className="dash-link" to="/expenses">ver todos →</NavLink></div>
              {view.recent.length === 0 ? (
                <div className="gd-empty">Nada lançado neste mês.</div>
              ) : view.recent.map((t) => {
                const meta = catMeta(categoryOf(t, data.categories) ?? 'outros');
                return (
                  <button key={t.id} type="button" className="gd-row gd-row-click" onClick={() => openTx(t, meta)}>
                    <CatIcon name={meta.icon} color={meta.color} />
                    <span className="gd-row-name">{t.note || meta.name}</span>
                    <span className="gd-row-sub">{(t.date || '').slice(0, 10)}{t.paid === false ? ' · pendente' : ''}</span>
                    <span className={`gd-row-val ${t.amount >= 0 ? 'gd-pos' : 'gd-neg'}`}>{fmtMoney(t.amount, 'USD')}</span>
                  </button>
                );
              })}
            </div>

            {view.cardInvoices.length > 0 && (
              <div className="dash-section" key="cards" data-label="Cartões de crédito">
                <div className="dash-title"><span><CreditCard size={14} /> Cartões de crédito</span></div>
                {view.cardInvoices.map(({ card, status }) => {
                  const limit = card.creditLimit || 0;
                  const usedPct = limit > 0 ? Math.min(100, (status.total / limit) * 100) : null;
                  return (
                    <div key={card.id} className="gd-card-row">
                      <span className="gd-card-badge"><Landmark size={14} /></span>
                      <div className="gd-card-info">
                        <div className="gd-row-name">
                          {card.name}
                          <span className={`gd-st gd-st-${status.estado}`}>{INVOICE_LABEL[status.estado]}</span>
                        </div>
                        <div className="gd-row-sub">
                          competência {status.competencia} · fecha {status.fechamento.slice(0, 10)}
                          {status.dueDay ? ` · vence ${status.vencimento.slice(0, 10)}` : ''}
                        </div>
                        {status.pago > 0 && (
                          <div className="gd-row-sub">pago {fmtMoney(status.pago, 'USD')} · restante {fmtMoney(status.restante, 'USD')}</div>
                        )}
                        {usedPct != null && (
                          <div className="gd-card-bar" aria-label={`Uso do limite ${Math.round(usedPct)}%`}>
                            <span className="gd-card-fill" style={{ width: `${usedPct}%`, background: usedPct >= 80 ? 'var(--red, #e74c3c)' : 'var(--brand, #7c5cff)' }} />
                          </div>
                        )}
                      </div>
                      <div className="gd-card-amt">
                        <span className="gd-row-val gd-neg">{fmtMoney(status.total, 'USD')}</span>
                        {status.restante > 0 && (
                          <button className="gd-pay" onClick={() => openPay(card, status)}>Pagar fatura</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </WidgetGrid>
        </>
      )}
      {payCard && (
        <div className="gd-overlay" onClick={() => setPayCard(null)}>
          <div className="gd-modal" role="dialog" aria-modal="true" aria-label="Pagar fatura do cartão" onClick={(e) => e.stopPropagation()}>
            <div className="gd-modal-head">
              <span>Pagar fatura · {payCard.card.name}</span>
              <button className="gd-modal-x" onClick={() => setPayCard(null)} aria-label="Fechar">✕</button>
            </div>
            <div className="gd-modal-body">
              <div className="gd-modal-line">Competência <b>{payCard.status.competencia}</b> · total {fmtMoney(payCard.status.total, 'USD')} · restante {fmtMoney(payCard.status.restante, 'USD')}</div>
              <label className="gd-modal-field"><span>Conta de origem</span>
                <select className="gd-modal-input" value={payAccount} onChange={(e) => setPayAccount(e.target.value)} aria-label="Conta de origem">
                  <option value="">—</option>
                  {(data?.accounts ?? []).map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
                </select>
              </label>
              <label className="gd-modal-field"><span>Valor (pode ser parcial)</span>
                <input className="gd-modal-input" type="number" min="0" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} aria-label="Valor do pagamento" />
              </label>
              <div className="gd-modal-note">É um transferência interna (neutra no caixa) — os gastos já contam quando lançados no cartão.</div>
              <div className="gd-modal-actions">
                <button className="gd-btn-primary" onClick={confirmPay} disabled={!(Number(payAmount) > 0) || !payAccount}>Confirmar pagamento</button>
                <button className="gd-btn-ghost" onClick={() => setPayCard(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {drawer.node}
    </div>
  );
}

const GD_CSS = `

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
.gd-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
.gd-card { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 14px; border: 1px solid #1a2232; background: linear-gradient(180deg, #161b25 0%, #131825 100%); box-shadow: 0 6px 16px rgba(0,0,0,0.22); }
.gd-in { background: linear-gradient(180deg, #1a3a2b 0%, #142428 100%); border-color: rgba(46,204,113,0.25); }
.gd-out { background: linear-gradient(180deg, #3a1a1a 0%, #241414 100%); border-color: rgba(231,76,60,0.25); }
.gd-net { background: linear-gradient(180deg, #1a3a2b 0%, #142428 100%); border-color: rgba(46,204,113,0.25); }
.gd-budget { background: linear-gradient(180deg, #1e2740 0%, #161b2b 100%); border-color: rgba(52,152,219,0.25); }
.gd-warn { background: linear-gradient(180deg, #2e2b12 0%, #1b2010 100%); border-color: rgba(225,177,44,0.25); }
.gd-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.gd-value { font-size: 1.28rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.15; }
.gd-value.gd-sm { font-size: 0.95rem; }
.gd-sub { font-size: 10px; color: rgba(255,255,255,0.45); }
.gd-pos { color: var(--green, #2ecc71); }
.gd-neg { color: var(--red, #e74c3c); }

.gd-balance { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 12px; padding: 12px 16px; border-radius: 14px; border: 1px solid #1a2232; background: linear-gradient(180deg, #1e2740 0%, #161b2b 100%); box-shadow: 0 6px 16px rgba(0,0,0,0.22); }
.gd-balance-value { display: inline-flex; gap: 14px; font-size: 1.4rem; font-weight: 800; font-variant-numeric: tabular-nums; flex-wrap: wrap; }
.gd-card-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
.gd-card-row:last-child { border-bottom: none; }
.gd-card-badge { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: rgba(52,152,219,0.15); color: var(--blue, #3498db); flex-shrink: 0; }
.gd-card-info { flex: 1; min-width: 0; }
.gd-card-amt { text-align: right; display: flex; flex-direction: column; }
.gd-card-open { font-size: 10px; color: var(--yellow, #e1b12c); }
.gd-card-bar { height: 5px; margin-top: 5px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; max-width: 220px; }
.gd-card-fill { display: block; height: 100%; border-radius: 999px; }

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
.gd-row-click { width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.04); color: inherit; font: inherit; text-align: left; cursor: pointer; border-radius: 8px; }
.gd-row-click:hover { background: rgba(255,255,255,0.03); }
.gd-row-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.gd-row-val { font-variant-numeric: tabular-nums; font-weight: 700; }
@media (max-width: 800px) { .gd-charts, .gd-lists { grid-template-columns: 1fr; } }
@media (max-width: 380px) { .gd-cards { grid-template-columns: 1fr 1fr; gap: 8px; } }

/* ── H2: tendência + sparkline ── */
.gd-spark { display: block; margin-top: 4px; opacity: 0.85; }
.gd-trend { font-weight: 800; font-variant-numeric: tabular-nums; margin-right: 4px; }
.gd-hint { font-size: 11px; color: var(--muted, #a1a7b3); }

/* ── H5: faturas + pagar ── */
.gd-st { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; padding: 2px 7px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16); color: var(--muted, #a1a7b3); margin-left: 8px; }
.gd-st-aberta { color: var(--blue, #3498db); border-color: rgba(52,152,219,0.45); }
.gd-st-fechada, .gd-st-parcial { color: var(--yellow, #e1b12c); border-color: rgba(225,177,44,0.45); }
.gd-st-paga { color: var(--green, #2ecc71); border-color: rgba(46,204,113,0.45); }
.gd-pay { margin-top: 5px; background: rgba(124,92,255,0.14); border: 1px solid rgba(124,92,255,0.4); color: var(--brand, #7c5cff); border-radius: 9px; font-size: 11px; font-weight: 700; padding: 5px 9px; cursor: pointer; min-height: 34px; }
.gd-overlay { position: fixed; inset: 0; z-index: 70; background: rgba(7,9,14,0.72); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 20px; }
.gd-modal { width: 100%; max-width: 420px; background: linear-gradient(180deg, #171c27 0%, #12161f 100%); border: 1px solid #1f2734; border-radius: 18px; box-shadow: 0 18px 50px rgba(0,0,0,0.5); }
.gd-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: 800; }
.gd-modal-x { background: transparent; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: var(--muted, #a1a7b3); width: 30px; height: 30px; cursor: pointer; }
.gd-modal-body { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.gd-modal-line { font-size: 12px; color: var(--muted, #a1a7b3); }
.gd-modal-field { display: grid; gap: 6px; font-size: 11px; color: var(--muted, #a1a7b3); }
.gd-modal-input { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 9px 10px; border-radius: 10px; font-size: 13px; min-height: 42px; font-family: inherit; }
.gd-modal-note { font-size: 11px; color: var(--muted, #a1a7b3); }
.gd-modal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.gd-btn-primary { background: linear-gradient(135deg, #7c5cff, #6d4df2); color: #fff; border: none; border-radius: 11px; font-weight: 800; font-size: 13px; padding: 10px 14px; min-height: 42px; cursor: pointer; }
.gd-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.gd-btn-ghost { background: rgba(255,255,255,0.03); border: 1px solid #2a3246; color: var(--text, #e7eaf0); border-radius: 11px; font-weight: 700; font-size: 13px; padding: 10px 14px; min-height: 42px; cursor: pointer; }
`;
if (typeof document !== 'undefined' && !document.getElementById('gd-styles')) {
  const style = document.createElement('style');
  style.id = 'gd-styles';
  style.textContent = GD_CSS;
  document.head.appendChild(style);
}
