// Batch G4 — Dashboard do módulo Investimentos (porta de entrada).
// Composição pura: patrimônio (NetWorth + série) e carteira (portfolio).
import React from 'react';
import { NavLink } from 'react-router-dom';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import NetWorth from '@apps/ui/NetWorth';

function fmtMoney(value, currency = 'R$') {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}
function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

export default function InvestmentsDashboardPage() {
  const { loading, data } = useEngineData(async (f) => {
    const [nw, snapshots, portfolio, positions] = await Promise.all([
      f.wealth.netWorth(),
      f.wealth.netWorthSeries(),
      f.wealth.portfolio(),
      f.ds.positions.list(),
    ]);
    const top = (portfolio.rows ?? []).slice().sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)).slice(0, 5);
    return { nw, snapshots, portfolio, positions, top };
  });

  const pf = data?.portfolio;

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Investimentos</h1>
      </div>
      <ModuleTabs module="investimentos" />

      {loading || !pf ? (
        <div className="cmd-msg" role="status" aria-live="polite">Carregando investimentos…</div>
      ) : (
        <>
          <div className="dash-cards">
            <div className="card accent3">
              <h3>Patrimônio</h3>
              <div className="stat">{fmtMoney(data.nw.netWorth)}</div>
              <div className="muted">cash {fmtMoney(data.nw.components.cash)}</div>
            </div>
            <div className={`card ${pf.totalPnl >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>Investido</h3>
              <div className="stat">{fmtMoney(pf.totalValue)}</div>
              <div className="muted">custo {fmtMoney(pf.totalCost)}</div>
            </div>
            <div className={`card ${pf.totalPnl >= 0 ? 'accent1' : 'accent2'}`}>
              <h3>PnL</h3>
              <div className="stat">{fmtMoney(pf.totalPnl)}</div>
              <div className="muted">{fmtPct(pf.pnlPercent)}</div>
            </div>
            <div className="card accent4">
              <h3>Posições</h3>
              <div className="stat">{data.positions.length}</div>
              <div className="muted">{pf.staleCount} marca(s) velha(s)</div>
            </div>
          </div>

          {data.top.length > 0 && (
            <div className="dash-section">
              <div className="dash-title">
                <span>Maiores posições</span>
                <NavLink className="dash-link" to="/positions">holdings →</NavLink>
              </div>
              {data.top.map((p) => (
                <div key={p.id} className="dash-row">
                  <span className="dash-row-name">{p.symbol}</span>
                  <span className="dash-row-sub">{p.qty} un.</span>
                  <span className="dash-row-val">{fmtMoney(p.marketValue)}</span>
                  <span className={`dash-row-val ${(p.pnl ?? 0) >= 0 ? 'dash-pos' : 'dash-neg'}`}>{fmtPct(p.pnlPercent)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="dash-section">
            <div className="dash-title">
              <span>Evolução do patrimônio</span>
              <NavLink className="dash-link" to="/networth">net worth →</NavLink>
            </div>
            <NetWorth netWorth={data.nw} snapshots={data.snapshots} loading={false} />
          </div>
        </>
      )}
    </div>
  );
}
