// Dashboard do módulo Planejamento (porta de entrada).
// Composição pura: metas (progresso derivado) + marcos + safável.
import { fmtMoney as fmtMoneyShared } from '@apps/ui/currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import Goals from '@apps/ui/Goals';
import WidgetGrid from '@apps/ui/WidgetGrid';
import StatRow from '@apps/ui/StatRow';
import { Sparkles, ShoppingCart } from 'lucide-react';
import { usePeriod } from '@apps/state';
import PeriodPicker from '@apps/ui/PeriodPicker';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { inPeriod } from '@apps/lib/db';


export default function PlanningDashboardPage() {
  const { period, setPeriod } = usePeriod();
  const [buyAmount, setBuyAmount] = useState('');
  const { loading, data, error, reload } = useEngineData(async (f) => {
    const [goals, safeAvailable, marcos, txs, forecast] = await Promise.all([
      f.wealth.goals(),
      f.wealth.safeAvailable(),
      f.wealth.listJournalEvents(),
      f.ds.transactions.list(),
      f.wealth.forecast(),
    ]);
    // Runway: caixa livre / gasto médio mensal (últimos 3 meses com despesa).
    const byMonth = new Map();
    for (const t of txs) {
      if (t.kind !== 'expense') continue;
      const ym = (t.date || '').slice(0, 7);
      if (!ym) continue;
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + Math.abs(t.amount || 0));
    }
    const months = [...byMonth.keys()].sort().slice(-3);
    const avgMonthlyExpense = months.length ? months.reduce((s, m) => s + byMonth.get(m), 0) / months.length : 0;
    const runway = avgMonthlyExpense > 0 ? Number((Number(safeAvailable) / avgMonthlyExpense).toFixed(1)) : null;
    return { goals, safeAvailable, marcos, runway, avgMonthlyExpense: Number(avgMonthlyExpense.toFixed(2)), forecast };
  });

  const goals = data?.goals ?? [];
  const completed = goals.filter((g) => g.completed).length;
  const marcos = (data?.marcos ?? []).filter((m) => inPeriod(m.date, period));

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Planejamento</h1>
      </div>
      <ModuleTabs module="planejamento" />
      <PeriodPicker period={period} onChange={setPeriod} />

      {error && data && <ActionableError stale error={error} onRetry={reload} label="o Planejamento" />}
      {error && !data ? (
        <ActionableError error={error} onRetry={reload} label="o Planejamento" />
      ) : loading || !data ? (
        <DashSkeleton cards={4} widgets={3} />
      ) : (
        <>
          <div className="dash-cards">
            <div className="card accent1">
              <h3>Metas</h3>
              <div className="stat">{goals.length}</div>
              <div className="muted">{completed} concluída(s)</div>
            </div>
            <div className="card accent4">
              <h3>Safe Available</h3>
              <div className="stat">{fmtMoney(data.safeAvailable, 'USD')}</div>
              <div className="muted">posso comprar isso?</div>
            </div>
            <div className="card accent1">
              <h3>Runway</h3>
              <div className="stat">{data.runway != null ? `${data.runway} meses` : '—'}</div>
              <div className="muted">caixa livre ÷ gasto médio ({fmtMoney(data.avgMonthlyExpense, 'USD')}/mês)</div>
            </div>
            <div className="card accent3">
              <h3>Marcos</h3>
              <div className="stat">{marcos.length}</div>
              <div className="muted">momentos registrados</div>
            </div>
          </div>

          <WidgetGrid storageKey="planejamento">
          <div className="dash-section" key="simulator">
            <div className="dash-title"><span><ShoppingCart size={14} /> Posso comprar isso?</span></div>
            <div className="pl-sim">
              <input className="pl-sim-input" type="number" step="0.01" placeholder="Valor da compra (R$)" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} aria-label="Valor da compra" />
            </div>
            {(() => {
              const value = Number(String(buyAmount).replace(',', '.')) || 0;
              const safe = Number(data.safeAvailable) || 0;
              const after = safe - value;
              return (
                <>
                  <div className="dash-row"><span className="dash-row-name">Safe available</span><span className="dash-row-val">{fmtMoney(safe, 'USD')}</span></div>
                  <div className="dash-row"><span className="dash-row-name">Depois da compra</span><span className={`dash-row-val ${after >= 0 ? 'dash-pos' : 'dash-neg'}`}>{fmtMoney(after, 'USD')}</span></div>
                  {value > 0 && (
                    <div className={`pl-sim-verdict ${after >= 0 ? 'is-ok' : 'is-bad'}`}>
                      {after >= 0 ? 'Cabe no seu caixa livre.' : 'Fica abaixo do seu caixa livre — repense o valor.'}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <div className="dash-section" key="marcos">
            <div className="dash-title">
              <span>Marcos recentes</span>
              <NavLink className="dash-link" to="/journal-events">ver todos →</NavLink>
            </div>
            {marcos.length === 0 ? (
              <div className="muted">Nenhum marco ainda — crie em Marcos.</div>
            ) : marcos.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5).map((m) => (
              <StatRow
                key={m.id}
                icon={<Sparkles size={14} />}
                color="#7c5cff"
                label={m.title}
                sub={String(m.date).slice(0, 10)}
                value={m.amount != null ? fmtMoney(m.amount, 'USD') : ''}
              />
            ))}
          </div>

          <div className="dash-section" key="projection">
            <div className="dash-title"><span><Sparkles size={14} /> Projeção de metas</span></div>
            {(() => {
              const netMonthly = Number(data.forecast?.netMonthly) || 0;
              const list = (goals ?? []).filter((g) => !g.completed && g.target > g.current);
              if (list.length === 0) return <div className="muted">Nenhuma meta em aberto.</div>;
              if (netMonthly <= 0) return <div className="muted">Fluxo mensal líquido ≤ 0 — sem projeção.</div>;
              return list.map((g) => {
                const months = Math.ceil((g.target - g.current) / netMonthly);
                const d = new Date();
                d.setMonth(d.getMonth() + months);
                const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                return (
                  <div key={g.goal.id} className="dash-row">
                    <span className="dash-row-name">{g.goal.kind}</span>
                    <span className="dash-row-sub">{fmtMoney(g.current, 'USD')} / {fmtMoney(g.target, 'USD')}</span>
                    <span className="dash-row-val">{months} m · {label}</span>
                  </div>
                );
              });
            })()}
            <div className="dash-row-sub">no ritmo do fluxo mensal líquido: {fmtMoney(data.forecast?.netMonthly ?? 0)}/mês</div>
          </div>

          <div className="dash-section" key="scenario">
            <div className="dash-title"><span><Sparkles size={14} /> Cenário do forecast (30/60/90d)</span></div>
            {(() => {
              const f = data.forecast ?? {};
              const rows = [
                { label: 'Hoje', v: f.today },
                { label: '30 dias', v: f.d30 },
                { label: '60 dias', v: f.d60 },
                { label: '90 dias', v: f.d90 },
              ];
              const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r.v) || 0)));
              return rows.map((r) => (
                <div key={r.label} className="ac-wf-row">
                  <span className="ac-wf-label">{r.label}</span>
                  <span className="ac-wf-bar-wrap"><span className={`ac-wf-bar ${(Number(r.v) || 0) < 0 ? 'is-neg' : 'is-pos'}`} style={{ width: `${Math.round((Math.abs(Number(r.v) || 0) / max) * 100)}%` }} /></span>
                  <span className={`ac-wf-val ${(Number(r.v) || 0) < 0 ? 'dash-neg' : 'dash-pos'}`}>{fmtMoney(r.v ?? 0)}</span>
                </div>
              ));
            })()}
            <div className="dash-row-sub">fluxo mensal líquido: {fmtMoney(data.forecast?.netMonthly ?? 0)}/mês</div>
          </div>

          <div className="dash-section" key="metas">
            <div className="dash-title">
              <span>Metas</span>
              <NavLink className="dash-link" to="/goals">gerenciar →</NavLink>
            </div>
            <Goals goals={goals} loading={false} />
          </div>

          </WidgetGrid>
        </>
      )}
    </div>
  );
}
