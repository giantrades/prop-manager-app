// Dashboard do módulo Trading (porta de entrada). Reaproveita a IDEIA da dashboard
// antiga: cards com glow (Total payouts / Capital / ROI / Contas) + gráfico de área
// (PnL acumulado × Payouts) + o JournalDashboard. COMPOSIÇÃO pura dos motores.
import React, { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import JournalDashboard from '@apps/ui/JournalDashboard';
import { fmtMoney } from '@apps/ui/currency';
import {
  getChecklistTemplate, getDayCheck, nowIso, winrate, profitFactor,
} from '@apps/lib/db';

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function GlowOrb({ color }) {
  return <div aria-hidden="true" style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, background: `radial-gradient(circle, ${color} 0%, transparent 70%)`, borderRadius: '50%' }} />;
}

function StatCard({ label, value, sub, color, glow }) {
  return (
    <div className="td-stat" style={{ borderColor: `${color}33` }}>
      <GlowOrb color={glow} />
      <div className="td-stat-label">{label}</div>
      <div className="td-stat-value" style={{ color }}>{value}</div>
      {sub && <div className="td-stat-sub">{sub}</div>}
    </div>
  );
}

export default function TradingDashboardPage() {
  const { loading, data } = useEngineData(async (f) => {
    const [trades, payouts, risk, propExts, firms, template, checked] = await Promise.all([
      f.ds.trades.list(),
      f.ds.payouts.list(),
      f.risk.snapshot(),
      f.ds.propExtensions.list(),
      (await import('@apps/lib/db')).listFirms(f.ds),
      getChecklistTemplate(f.ds),
      getDayCheck(f.ds, nowIso().slice(0, 10)),
    ]);
    return {
      trades, payouts, risk, propExts, firms,
      checklist: { total: (template ?? []).length, done: Object.values(checked ?? {}).filter(Boolean).length },
    };
  });

  const [seriesTab, setSeriesTab] = useState('pnl');

  const stats = useMemo(() => {
    const trades = data?.trades ?? [];
    const payouts = data?.payouts ?? [];
    const risk = data?.risk;
    const capital = (data?.propExts ?? []).reduce((s, p) => s + (p.nominalSize || 0), 0);
    const netPayouts = payouts.reduce((s, p) => s + (Number(p.net) || 0), 0);
    const roi = capital > 0 ? netPayouts / capital : 0;
    const pf = profitFactor(trades);
    const active = risk ? risk.counts.SAFE + risk.counts.WARN + risk.counts.STOP : 0;
    return { trades, netPayouts, capital, roi, wr: winrate(trades), pf, active, pnlToday: risk?.pnlToday ?? 0 };
  }, [data]);

  const series = useMemo(() => {
    const trades = data?.trades ?? [];
    const payouts = data?.payouts ?? [];
    const byMonth = new Map();
    const touch = (ym) => { if (!byMonth.has(ym)) byMonth.set(ym, { ym, pnl: 0, payout: 0 }); return byMonth.get(ym); };
    for (const t of trades) {
      const stamp = t.exitDatetime || t.entryDatetime;
      if (!stamp) continue;
      touch(String(stamp).slice(0, 7)).pnl += Number(t.resultNet) || 0;
    }
    for (const p of payouts) {
      const ym = String(p.date || p.updatedAt || '').slice(0, 7);
      if (!ym) continue;
      touch(ym).payout += Number(p.net) || 0;
    }
    const months = [...byMonth.keys()].sort().slice(-12);
    let cp = 0; let cpay = 0;
    return months.map((ym) => {
      const m = byMonth.get(ym);
      cp += m.pnl; cpay += m.payout;
      return { ym: ym.slice(5, 7) + '/' + ym.slice(2, 4), pnl: Number(cp.toFixed(2)), payout: Number(cpay.toFixed(2)) };
    });
  }, [data]);

  if (loading || !data) {
    return (
      <div className="cmd-page">
        <div className="cmd-page-head"><h1 className="cmd-page-title">Trading</h1></div>
        <ModuleTabs module="trading" />
        <div className="cmd-msg" role="status" aria-live="polite">Carregando trading…</div>
      </div>
    );
  }

  const checkPct = data.checklist.total > 0 ? Math.round((data.checklist.done / data.checklist.total) * 100) : null;
  const pfLabel = stats.pf === 'n/a' ? '—' : stats.pf === 'infinity' ? '∞' : stats.pf.toFixed(2);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Trading</h1></div>
      <ModuleTabs module="trading" />

      {/* Cards estilo dashboard antiga (glow) */}
      <div className="td-cards">
        <StatCard label="PnL hoje" value={fmtMoney(stats.pnlToday, 'USD')} sub={`${data.risk.tradesToday.win}W / ${data.risk.tradesToday.loss}L`} color={stats.pnlToday >= 0 ? '#10b981' : '#ef4444'} glow={stats.pnlToday >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'} />
        <StatCard label="Capital (nominal)" value={fmtMoney(stats.capital, 'USD')} sub={`${stats.active} conta(s) rastreada(s)`} color="#3b82f6" glow="rgba(59,130,246,0.15)" />
        <StatCard label="Total payouts" value={fmtMoney(stats.netPayouts, 'USD')} sub={`${(data.payouts ?? []).length} payout(s)`} color="#10b981" glow="rgba(16,185,129,0.15)" />
        <StatCard label="ROI" value={fmtPct(stats.roi)} sub="lucro / capital" color={stats.roi >= 0 ? '#7c5cff' : '#ef4444'} glow="rgba(124,92,255,0.15)" />
        <StatCard label="Winrate" value={fmtPct(stats.wr)} sub={`${stats.trades.length} trades`} color="#f59e0b" glow="rgba(245,158,11,0.15)" />
        <StatCard label="Profit factor" value={pfLabel} sub="ganhos / perdas" color="#22d3ee" glow="rgba(34,211,238,0.15)" />
      </div>

      {/* Gráfico de área (toggle) */}
      {series.length > 1 && (
        <div className="td-chart">
          <div className="td-chart-head">
            <span className="td-chart-title">Evolução</span>
            <div className="td-toggle">
              <button className={seriesTab === 'pnl' ? 'active' : ''} onClick={() => setSeriesTab('pnl')}>PnL acumulado</button>
              <button className={seriesTab === 'payout' ? 'active' : ''} onClick={() => setSeriesTab('payout')}>Payouts acumulados</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={series} margin={{ top: 10, right: 12, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="td-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={seriesTab === 'pnl' ? '#7c5cff' : '#10b981'} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={seriesTab === 'pnl' ? '#7c5cff' : '#10b981'} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
              <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
              <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'USD')} />
              <Area type="monotone" dataKey={seriesTab} stroke={seriesTab === 'pnl' ? '#7c5cff' : '#10b981'} strokeWidth={2} fill="url(#td-grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="dash-cards">
        <div className="card accent4">
          <h3>Contas em risco</h3>
          <div className="stat">{data.risk.counts.STOP} STOP</div>
          <div className="muted">{data.risk.counts.WARN} WARN · {data.risk.counts.SAFE} SAFE</div>
        </div>
        <div className="card accent3">
          <h3>Checklist do dia</h3>
          <div className="stat">{checkPct == null ? '—' : `${checkPct}%`}</div>
          <div className="muted">{data.checklist.done}/{data.checklist.total} itens</div>
        </div>
        <div className="card accent5">
          <h3>Estratégias</h3>
          <div className="stat">{new Set((data.trades ?? []).map((t) => t.strategyId).filter(Boolean)).size}</div>
          <div className="muted"><NavLink className="dash-link" to="/playbook">ver playbook →</NavLink></div>
        </div>
        <div className="card accent1">
          <h3>Posições live</h3>
          <div className="stat">→</div>
          <div className="muted"><NavLink className="dash-link" to="/live-positions">gerenciar posições →</NavLink></div>
        </div>
      </div>

      <JournalDashboard trades={data.trades ?? []} payouts={data.payouts ?? []} loading={false} />
    </div>
  );
}

const TD_CSS = `
.td-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.td-stat { position: relative; overflow: hidden; background: rgba(255,255,255,0.02); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 18px 20px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.td-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.7px; font-weight: 600; color: var(--muted, #a1a7b3); margin-bottom: 8px; }
.td-stat-value { font-size: 1.9rem; font-weight: 800; line-height: 1.1; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
.td-stat-sub { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 6px; }
.td-chart { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.td-chart-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.td-chart-title { font-size: 13px; font-weight: 700; }
.td-toggle { display: inline-flex; background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 3px; gap: 2px; }
.td-toggle button { background: transparent; border: none; color: var(--muted, #a1a7b3); font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
.td-toggle button.active { background: linear-gradient(135deg, #7c5cff, #6d4df2); color: #fff; }
@media (max-width: 1000px) { .td-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .td-cards { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('td-styles')) {
  const style = document.createElement('style');
  style.id = 'td-styles';
  style.textContent = TD_CSS;
  document.head.appendChild(style);
}
