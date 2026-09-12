// Batch G4 — Dashboard do módulo Investimentos (porta de entrada).
// Composição pura: patrimônio (NetWorth + série) e carteira (portfolio).
import { fmtMoney as fmtMoneyShared } from '@apps/ui/currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import NetWorth from '@apps/ui/NetWorth';

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
    const payouts = await f.ds.payouts.list();
    return { nw, snapshots, portfolio, positions, top, payouts };
  });

  const pf = data?.portfolio;

  const byClass = useMemo(() => {
    const rows = data?.portfolio?.rows ?? [];
    const map = { equity: 0, fixed: 0, other: 0 };
    for (const r of rows) map[r.assetKind || 'equity'] = (map[r.assetKind || 'equity'] ?? 0) + (r.marketValue ?? 0);
    const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
    const label = { equity: 'Variável', fixed: 'Renda fixa', other: 'Outros ativos' };
    return Object.entries(map).filter(([, v]) => v > 0).map(([k, v]) => ({ k, label: label[k] ?? k, value: v, pct: v / total }));
  }, [data]);

  const payoutSeries = useMemo(() => {
    const payouts = data?.payouts ?? [];
    const byMonth = new Map();
    for (const p of payouts) {
      const ym = String(p.date || p.updatedAt || '').slice(0, 7);
      if (!ym) continue;
      byMonth.set(ym, (byMonth.get(ym) ?? 0) + (Number(p.net) || 0));
    }
    const months = [...byMonth.keys()].sort().slice(-12);
    let cum = 0;
    return months.map((ym) => { cum += byMonth.get(ym); return { ym: ym.slice(5, 7) + '/' + ym.slice(2, 4), payout: Number(cum.toFixed(2)) }; });
  }, [data]);

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

          <div className="inv-widgets">
            {data.top.length > 0 && (
              <div className="dash-section">
                <div className="dash-title">
                  <span>Maiores posições</span>
                  <NavLink className="dash-link" to="/portfolio">portfolio →</NavLink>
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
                <span>Payouts acumulados</span>
                <NavLink className="dash-link" to="/payouts">payouts →</NavLink>
              </div>
              {payoutSeries.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={payoutSeries} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="inv-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                    <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'USD')} />
                    <Area type="monotone" dataKey="payout" stroke="#10b981" strokeWidth={2} fill="url(#inv-grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="muted">Sem payouts ainda.</div>
              )}
            </div>

            <div className="dash-section inv-span2">
              <div className="dash-title">
                <span>Evolução do patrimônio</span>
              </div>
              <NetWorth netWorth={data.nw} snapshots={data.snapshots} loading={false} />
            </div>

            {byClass.length > 0 && (
              <div className="dash-section inv-span2">
                <div className="dash-title"><span>Composição por classe</span></div>
                {byClass.map((c) => (
                  <div key={c.k} className="dash-row">
                    <span className="dash-row-name">{c.label}</span>
                    <span className="inv-bar-wrap"><span className="inv-bar" style={{ width: `${Math.round(c.pct * 100)}%` }} /></span>
                    <span className="dash-row-sub">{Math.round(c.pct * 100)}%</span>
                    <span className="dash-row-val">{fmtMoney(c.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const INV_CSS = `
.inv-widgets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.inv-span2 { grid-column: 1 / -1; }
.inv-bar-wrap { flex: 1; height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.inv-bar { display: block; height: 100%; background: linear-gradient(90deg, #7c5cff, #a78bfa); border-radius: 999px; }
@media (max-width: 900px) { .inv-widgets { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('inv-styles')) {
  const style = document.createElement('style');
  style.id = 'inv-styles';
  style.textContent = INV_CSS;
  document.head.appendChild(style);
}
