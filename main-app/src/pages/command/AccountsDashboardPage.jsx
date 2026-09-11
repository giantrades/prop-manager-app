// Batch G3 — Dashboard do módulo Contas (porta de entrada).
// Composição pura: risco por conta (RiskService), payouts e P&L por firm.
import React from 'react';
import { NavLink } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import { firmPnlByFirm } from '@apps/lib/db';

function fmtMoney(value, currency = 'R$') {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

const STATUS_CLASS = { SAFE: 'dash-pill-safe', WARN: 'dash-pill-warn', STOP: 'dash-pill-stop' };

export default function AccountsDashboardPage() {
  const { loading, data } = useEngineData(async (f) => {
    const [risk, payouts, txs] = await Promise.all([
      f.risk.snapshot(),
      f.ds.payouts.list(),
      f.ds.transactions.list(),
    ]);
    const firms = firmPnlByFirm(txs).slice(0, 5);
    return { risk, payouts, firms };
  });

  const risk = data?.risk;
  const rows = risk?.rows ?? [];
  const propRows = rows.filter((r) => r.account.kind === 'prop');
  const equityTotal = propRows.reduce((s, r) => s + (r.metrics.equity ?? 0), 0);
  const pendingPayouts = (data?.payouts ?? []).filter((p) => (p.status ?? 'pending') !== 'allocated');

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Contas</h1>
      </div>
      <ModuleTabs module="contas" />

      {loading || !risk ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando contas…</div>
      ) : (
        <>
          <div className="dash-cards">
            <div className="card accent1">
              <h3>Contas prop ativas</h3>
              <div className="stat">{propRows.length}</div>
              <div className="muted">{rows.length} rastreadas</div>
            </div>
            <div className="card accent3">
              <h3>Equity total (prop)</h3>
              <div className="stat">{fmtMoney(equityTotal)}</div>
              <div className="muted">soma das contas prop</div>
            </div>
            <div className={`card ${risk.counts.STOP > 0 ? 'accent2' : 'accent1'}`}>
              <h3>Risco</h3>
              <div className="stat">{risk.counts.STOP} STOP · {risk.counts.WARN} WARN</div>
              <div className="muted">PnL hoje {fmtMoney(risk.pnlToday)}</div>
            </div>
            <div className="card accent4">
              <h3>Payouts pendentes</h3>
              <div className="stat">{pendingPayouts.length}</div>
              <div className="muted"><NavLink className="dash-link" to="/payouts">ver payouts →</NavLink></div>
            </div>
          </div>

          <div className="dash-section">
            <div className="dash-title">
              <span>Contas e risco</span>
              <NavLink className="dash-link" to="/accounts">gerenciar →</NavLink>
            </div>
            {rows.length === 0 ? (
              <div className="muted">Nenhuma conta rastreada.</div>
            ) : rows.map((r) => (
              <div key={r.account.id} className="dash-row">
                <span className="dash-row-name">{r.account.name}</span>
                <span className="dash-row-sub">{r.account.kind}{r.prop ? ` · ${r.prop.phase}` : ''}</span>
                <span className="dash-row-val">{fmtMoney(r.metrics.equity ?? 0)}</span>
                <span className={`dash-pill ${STATUS_CLASS[r.status.status] ?? ''}`}>{r.status.status}</span>
              </div>
            ))}
          </div>

          {data.firms.length > 0 && (
            <div className="dash-section">
              <div className="dash-title">
                <span>P&L por firm</span>
                <NavLink className="dash-link" to="/firms">detalhar →</NavLink>
              </div>
              {data.firms.map((firm) => (
                <div key={firm.firmId} className="dash-row">
                  <span className="dash-row-name">{firm.firmId}</span>
                  <span className="dash-row-sub">payouts {fmtMoney(firm.payouts)}</span>
                  <span className={`dash-row-val ${firm.profit >= 0 ? 'dash-pos' : 'dash-neg'}`}>{fmtMoney(firm.profit)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
