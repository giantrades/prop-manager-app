// Batch G4 — Dashboard do módulo Trading (porta de entrada).
// Reúne o Journal (analytics) + situação de risco + checklist do Playbook.
import { fmtMoney } from '@apps/ui/currency';
import React from 'react';
import { NavLink } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import JournalDashboard from '@apps/ui/JournalDashboard';
import { getChecklistTemplate, getDayCheck, nowIso } from '@apps/lib/db';


export default function TradingDashboardPage() {
  const { loading, data } = useEngineData(async (f) => {
    const [trades, payouts, risk, template, checked] = await Promise.all([
      f.ds.trades.list(),
      f.ds.payouts.list(),
      f.risk.snapshot(),
      getChecklistTemplate(f.ds),
      getDayCheck(f.ds, nowIso().slice(0, 10)),
    ]);
    const total = (template ?? []).length;
    const done = Object.values(checked ?? {}).filter(Boolean).length;
    return { trades, payouts, risk, checklist: { total, done } };
  });

  const risk = data?.risk;
  const check = data?.checklist;
  const checkPct = check && check.total > 0 ? Math.round((check.done / check.total) * 100) : null;

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Trading</h1>
      </div>
      <ModuleTabs module="trading" />

      {loading || !risk ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando trading…</div>
      ) : (
        <>
          <div className="dash-cards">
            <div className={`card ${risk.pnlToday >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>PnL hoje</h3>
              <div className="stat">{fmtMoney(risk.pnlToday)}</div>
              <div className="muted">{risk.tradesToday.win}W / {risk.tradesToday.loss}L</div>
            </div>
            <div className="card accent4">
              <h3>Contas em risco</h3>
              <div className="stat">{risk.counts.STOP} STOP</div>
              <div className="muted">{risk.counts.WARN} WARN · {risk.counts.SAFE} SAFE</div>
            </div>
            <div className="card accent3">
              <h3>Checklist do dia</h3>
              <div className="stat">{checkPct == null ? '—' : `${checkPct}%`}</div>
              <div className="muted">{check?.done ?? 0}/{check?.total ?? 0} itens</div>
            </div>
            <div className="card accent5">
              <h3>Estratégias</h3>
              <div className="stat">{new Set((data.trades ?? []).map((t) => t.strategyId).filter(Boolean)).size}</div>
              <div className="muted"><NavLink className="dash-link" to="/playbook">ver playbook →</NavLink></div>
            </div>
          </div>

          <JournalDashboard trades={data.trades ?? []} payouts={data.payouts ?? []} loading={false} />

          {risk.worst && (
            <div className="dash-section">
              <div className="dash-title"><span>Conta em atenção</span></div>
              <div className="dash-row">
                <span className="dash-row-name">{risk.worst.account.name}</span>
                <span className="dash-row-sub">{risk.worst.status.status}</span>
                <NavLink className="dash-link" to="/risk">abrir risco →</NavLink>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
