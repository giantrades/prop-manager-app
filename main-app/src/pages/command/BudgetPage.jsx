// Módulo Gastos — aba Orçamento (H0/H11). "Quanto ainda posso gastar" (e por dia),
// sugestão de meta pela média de 3 meses, copiar do mês anterior, visão por grupo,
// rollover (B1) e alerta ao passar de X%. Compõe selectors do motor — sem fórmula nova.
import React, { useCallback, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import ModuleTabsWithPeriod from '../../ModuleTabsWithPeriod';
import useEngineData from '../../useEngineData';
import { usePeriod } from '@apps/state';
import { useToast } from '@apps/ui/Toast';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { fmtMoney } from '@apps/ui/currency';
import {
  House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp,
  Briefcase, GraduationCap, Tag, Receipt, Coins, Gift, Wallet, PiggyBank, Copy, Sparkles, ArrowRight,
} from 'lucide-react';
import {
  listCategories, getBudgets, saveBudget, budgetStatus, rolloverAmount, getRolloverCats,
  setRolloverCats, suggestBudget, expensesByCategoryPeriod, periodMonths, currentYm,
} from '@apps/lib/db';

const ICONS = { House, UtensilsCrossed, Car, HeartPulse, Gamepad2, Landmark, TrendingUp, Briefcase, GraduationCap, Tag, Receipt, Coins, Gift, Wallet, PiggyBank };
const COLORS = { blue: 'var(--blue,#3498db)', green: 'var(--green,#2ecc71)', yellow: 'var(--yellow,#e1b12c)', red: 'var(--red,#e74c3c)', brand: 'var(--brand,#7c5cff)', gray: 'var(--gray,#5b6270)' };

function CatIcon({ name, color, size = 16 }) {
  const Cmp = ICONS[name] || Tag;
  return <span className="bp-ico" style={{ color: COLORS[color] || COLORS.gray, borderColor: COLORS[color] || COLORS.gray }}><Cmp size={size} strokeWidth={2} /></span>;
}

const ALERT_PCT = 80;

export default function BudgetPage() {
  const { period, setPeriod } = usePeriod();
  const { toast } = useToast();
  const ym = period.mode === 'month' ? (period.ym ?? currentYm()) : currentYm();
  const { loading, data, error, reload, finance } = useEngineData(async (f) => {
    const [txs, categories, budgets, rolloverCats] = await Promise.all([
      f.ds.transactions.list(), listCategories(f.ds), getBudgets(f.ds), getRolloverCats(f.ds),
    ]);
    return { txs, categories, budgets, rolloverCats };
  });

  const [editor, setEditor] = useState({ catId: '', amount: '' });
  const [busy, setBusy] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const cats = data.categories ?? [];
    const catById = new Map(cats.map((c) => [c.id, c]));
    const monthBudgets = data.budgets[ym] ?? {};
    const rows = budgetStatus(data.txs, monthBudgets, ym, cats);
    const rollovers = rolloverAmount(data.txs, data.budgets, data.rolloverCats, ym, cats);
    const rolloverByCat = new Map(rollovers.map((r) => [r.categoryId, r]));
    const totalBudget = rows.reduce((s, r) => s + (r.budget || 0), 0);
    const totalSpent = rows.reduce((s, r) => s + (r.spent || 0), 0);
    const remaining = Number((totalBudget - totalSpent).toFixed(2));
    // Dias restantes no mês (0 se o mês de referência não é o atual).
    const now = new Date();
    const isCurrent = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` === ym;
    const lastDay = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
    const daysLeft = isCurrent ? Math.max(1, lastDay - now.getDate() + 1) : lastDay;
    const perDay = remaining > 0 ? Number((remaining / daysLeft).toFixed(2)) : 0;
    // Sugestões = média dos 3 meses anteriores, ignorando o que já tem meta.
    const suggestions = suggestBudget(data.txs, ym, 3, cats)
      .filter((s) => !(monthBudgets[s.categoryId] > 0))
      .slice(0, 8);
    // Uso por grupo (ex.: Impostos) — roll-up simples pelo campo `group`.
    const groupTotals = new Map();
    for (const g of expensesByCategoryPeriod(data.txs, { mode: 'month', ym }, cats)) {
      const grp = catById.get(g.categoryId)?.group ?? 'geral';
      groupTotals.set(grp, Number(((groupTotals.get(grp) ?? 0) + g.total).toFixed(2)));
    }
    return { cats, catById, rows, rolloverByCat, totalBudget, totalSpent, remaining, perDay, daysLeft, suggestions, groupTotals: [...groupTotals.entries()].sort((a, b) => b[1] - a[1]), monthsCount: periodMonths({ mode: 'month', ym }, data.txs).length };
  }, [data, ym, period]);

  const doSave = useCallback(async (catId, amount) => {
    const f = finance;
    if (!f || !catId) return;
    await saveBudget(f.ds, ym, catId, Number(amount) || 0);
    const cats = data?.categories ?? [];
    const spent = (data?.txs ?? []).filter((t) => t.kind === 'expense' && t.date.slice(0, 7) === ym);
    const rows = budgetStatus(spent, { [catId]: Number(amount) || 0 }, ym, cats);
    const r = rows.find((x) => x.categoryId === catId);
    if (r && r.budget > 0 && r.pct >= ALERT_PCT) {
      toast(`${catId} em ${Math.round(r.pct)}% da meta (${fmtMoney(r.spent, 'USD')} / ${fmtMoney(r.budget, 'USD')})`, { type: 'warn' });
    }
  }, [finance, ym, data, toast]);

  const copyPrevious = useCallback(async () => {
    const f = finance;
    if (!f || !data) return;
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    const prevYm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prev = data.budgets[prevYm] ?? {};
    if (Object.keys(prev).length === 0) { toast('Mês anterior sem orçamento.', { type: 'warn' }); return; }
    setBusy(true);
    try {
      for (const [catId, amount] of Object.entries(prev)) await saveBudget(f.ds, ym, catId, amount);
      toast(`Orçamento de ${prevYm} copiado.`);
    } finally {
      setBusy(false);
    }
  }, [finance, data, ym, toast]);

  const applySuggestions = useCallback(async () => {
    const f = finance;
    if (!f || !view) return;
    setBusy(true);
    try {
      for (const s of view.suggestions) await saveBudget(f.ds, ym, s.categoryId, s.average);
      toast(`${view.suggestions.length} meta(s) sugerida(s) aplicada(s).`);
    } finally {
      setBusy(false);
    }
  }, [finance, view, ym, toast]);

  const toggleRollover = useCallback(async (catId) => {
    const f = finance;
    if (!f || !data) return;
    const cur = data.rolloverCats ?? [];
    await setRolloverCats(f.ds, cur.includes(catId) ? cur.filter((c) => c !== catId) : [...cur, catId]);
  }, [finance, data]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Orçamento</h1>
        <NavLink className="cmd-refresh" to="/expenses" style={{ textDecoration: 'none' }}>Lançamentos →</NavLink>
      </div>
      <ModuleTabsWithPeriod module="gastos" period={period} onChange={setPeriod} />

      {error && view && <ActionableError stale error={error} onRetry={reload} label="o Orçamento" />}
      {error && !view ? (
        <ActionableError error={error} onRetry={reload} label="o Orçamento" />
      ) : loading || !view ? (
        <DashSkeleton cards={3} widgets={2} />
      ) : (
        <>
          <div className="bp-cards">
            <div className="bp-card bp-card-in">
              <span className="bp-label">Orçamento do mês</span>
              <span className="bp-value">{fmtMoney(view.totalBudget, 'USD')}</span>
              <span className="bp-sub">{view.rows.length} categoria(s) com meta</span>
            </div>
            <div className="bp-card bp-card-out">
              <span className="bp-label">Gasto</span>
              <span className="bp-value bp-neg">{fmtMoney(view.totalSpent, 'USD')}</span>
              <span className="bp-sub">{view.totalBudget > 0 ? `${Math.round((view.totalSpent / view.totalBudget) * 100)}% da meta` : 'sem metas'}</span>
            </div>
            <div className={`bp-card ${view.remaining >= 0 ? 'bp-card-in' : 'bp-card-out'}`}>
              <span className="bp-label">Ainda posso gastar</span>
              <span className={`bp-value ${view.remaining >= 0 ? 'bp-pos' : 'bp-neg'}`}>{fmtMoney(view.remaining, 'USD')}</span>
              <span className="bp-sub">{view.daysLeft} dia(s) restante(s) · {view.perDay > 0 ? `${fmtMoney(view.perDay, 'USD')}/dia` : 'sem folga'}</span>
            </div>
          </div>

          {/* Visão por grupo (ex.: Impostos) */}
          {view.groupTotals.length > 0 && (
            <div className="dash-section">
              <div className="dash-title"><span><PiggyBank size={14} /> Gasto por grupo</span></div>
              {view.groupTotals.map(([grp, total]) => (
                <div key={grp} className="bp-row">
                  <span className="bp-row-name">{grp === 'geral' ? 'Geral' : grp}</span>
                  <span className="bp-row-val bp-neg">{fmtMoney(total, 'USD')}</span>
                </div>
              ))}
            </div>
          )}

          {/* Metas por categoria */}
          <div className="dash-section">
            <div className="dash-title"><span><PiggyBank size={14} /> Metas por categoria</span><span className="bp-sub">{ym}</span></div>
            {view.rows.length === 0 && <div className="bp-empty">Sem metas. Defina abaixo ou aplique as sugestões.</div>}
            {view.rows.map((b) => {
              const cat = view.catById.get(b.categoryId) ?? { name: b.categoryId, icon: 'Tag', color: 'gray' };
              const ro = view.rolloverByCat.get(b.categoryId);
              const opted = (data?.rolloverCats ?? []).includes(b.categoryId);
              return (
                <div key={b.categoryId} className={`bp-budget${b.over ? ' over' : ''}`}>
                  <CatIcon name={cat.icon} color={cat.color} />
                  <div className="bp-budget-main">
                    <div className="bp-budget-top"><span>{cat.name}</span><span>{fmtMoney(b.spent, 'USD')} / {fmtMoney(b.budget, 'USD')}</span></div>
                    <div className="bp-bar-wrap"><span className="bp-bar" style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
                    {opted && ro && ro.rollover > 0 && <div className="bp-sub">+{fmtMoney(ro.rollover, 'USD')} de rollover → efetivo {fmtMoney(ro.effective, 'USD')}</div>}
                  </div>
                  <span className="bp-pct">{Math.round(b.pct)}%{b.over ? ' ⚠️' : ''}</span>
                  <button className={`bp-mini${opted ? ' on' : ''}`} onClick={() => toggleRollover(b.categoryId)} title={opted ? 'Desativar rollover' : 'Ativar rollover'} aria-pressed={opted}>↻</button>
                </div>
              );
            })}

            <div className="bp-editor">
              <select className="bp-input" value={editor.catId} onChange={(e) => setEditor((s) => ({ ...s, catId: e.target.value }))} aria-label="Categoria da meta">
                <option value="">Categoria…</option>
                {view.cats.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <input className="bp-input" type="number" min="0" step="0.01" value={editor.amount} onChange={(e) => setEditor((s) => ({ ...s, amount: e.target.value }))} placeholder="Meta" aria-label="Valor da meta" />
              <button className="bp-btn" disabled={!editor.catId || !(Number(editor.amount) >= 0)} onClick={() => { doSave(editor.catId, editor.amount); setEditor({ catId: '', amount: '' }); }}>Salvar meta</button>
            </div>
          </div>

          {/* Sugestões + copiar */}
          <div className="dash-section">
            <div className="dash-title"><span><Sparkles size={14} /> Sugestões (média 3 meses)</span></div>
            {view.suggestions.length === 0 ? (
              <div className="bp-empty">Sem sugestões — todas as categorias com gasto já têm meta.</div>
            ) : (
              <>
                {view.suggestions.map((s) => (
                  <div key={s.categoryId} className="bp-row">
                    <CatIcon name={(view.catById.get(s.categoryId) ?? {}).icon} color={(view.catById.get(s.categoryId) ?? {}).color} />
                    <span className="bp-row-name">{view.catById.get(s.categoryId)?.name ?? s.categoryId}</span>
                    <span className="bp-row-val">{fmtMoney(s.average, 'USD')}</span>
                    <button className="bp-mini" onClick={() => doSave(s.categoryId, s.average)} title={`Usar ${fmtMoney(s.average, 'USD')}`}>usar</button>
                  </div>
                ))}
                <button className="bp-btn" disabled={busy} onClick={applySuggestions}>Aplicar todas as sugestões</button>
              </>
            )}
            <div className="bp-actions">
              <button className="bp-btn-ghost" disabled={busy} onClick={copyPrevious}><Copy size={14} /> Copiar do mês anterior</button>
              <NavLink className="bp-btn-ghost" to="/expenses">Ver lançamentos <ArrowRight size={14} /></NavLink>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const BP_CSS = `
.bp-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; }
.bp-card { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 14px; border: 1px solid #1a2232; background: linear-gradient(180deg, #161b25 0%, #131825 100%); box-shadow: 0 6px 16px rgba(0,0,0,0.22); }
.bp-card-in { background: linear-gradient(180deg, #1a3a2b 0%, #142428 100%); border-color: rgba(46,204,113,0.25); }
.bp-card-out { background: linear-gradient(180deg, #3a1a1a 0%, #241414 100%); border-color: rgba(231,76,60,0.25); }
.bp-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.bp-value { font-size: 1.28rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.bp-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.bp-pos { color: var(--green, #2ecc71); }
.bp-neg { color: var(--red, #e74c3c); }
.bp-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
.bp-row:last-child { border-bottom: none; }
.bp-row-name { flex: 1; font-weight: 600; }
.bp-row-val { font-weight: 700; font-variant-numeric: tabular-nums; }
.bp-empty { padding: 16px; text-align: center; color: var(--muted, #a1a7b3); font-size: 12px; }
.bp-ico { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; border: 1px solid; background: rgba(255,255,255,0.03); }
.bp-budget { display: flex; gap: 10px; align-items: center; padding: 6px 0; }
.bp-budget.over .bp-pct { color: var(--red, #e74c3c); font-weight: 800; }
.bp-budget-main { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.bp-budget-top { display: flex; justify-content: space-between; font-size: 12px; gap: 8px; font-variant-numeric: tabular-nums; }
.bp-bar-wrap { height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.bp-bar { display: block; height: 100%; background: linear-gradient(90deg, var(--brand, #7c5cff), #a78bfa); border-radius: 999px; }
.bp-budget.over .bp-bar { background: linear-gradient(90deg, var(--red, #e74c3c), #ff7b6b); }
.bp-pct { font-size: 12px; font-variant-numeric: tabular-nums; min-width: 44px; text-align: right; }
.bp-mini { background: transparent; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: var(--muted, #a1a7b3); padding: 6px 9px; cursor: pointer; min-height: 34px; font-size: 11px; font-weight: 700; }
.bp-mini.on { color: var(--green, #2ecc71); border-color: rgba(46,204,113,0.4); }
.bp-editor { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.bp-input { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 9px 10px; border-radius: 10px; font-size: 13px; min-height: 42px; flex: 1; min-width: 120px; font-family: inherit; }
.bp-btn { background: linear-gradient(135deg, #7c5cff, #6d4df2); color: #fff; border: none; border-radius: 11px; font-weight: 800; font-size: 13px; padding: 10px 14px; min-height: 42px; cursor: pointer; }
.bp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.bp-btn-ghost { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid #2a3246; color: var(--text, #e7eaf0); border-radius: 11px; font-weight: 700; font-size: 13px; padding: 10px 14px; min-height: 42px; cursor: pointer; text-decoration: none; }
.bp-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('bp-styles')) {
  const style = document.createElement('style');
  style.id = 'bp-styles';
  style.textContent = BP_CSS;
  document.head.appendChild(style);
}
