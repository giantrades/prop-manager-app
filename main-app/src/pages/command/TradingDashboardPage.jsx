// Dashboard do módulo Trading (porta de entrada) — cards glass + evolução do PnL
// acumulado com marcadores de payout/withdrawal + widgets (calendário, drawdown,
// histograma). Sem seções redundantes. COMPOSIÇÃO pura dos motores.
import React, { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot,
} from 'recharts';
import ModuleTabs from '../../ModuleTabs';
import useEngineData from '../../useEngineData';
import { fmtMoney } from '@apps/ui/currency';
import PnLCalendar from '@apps/ui/PnLCalendar';
import HistogramR from '@apps/ui/HistogramR';
import DrawdownSection from '@apps/ui/DrawdownSection';
import WidgetGrid from '@apps/ui/WidgetGrid';
import { CalendarDays, BarChart3 } from 'lucide-react';
import {
  winrate, profitFactor, inPeriod, periodMonths,
} from '@apps/lib/db';
import { usePeriod } from '@apps/state';
import PeriodPicker from '@apps/ui/PeriodPicker';

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
  const { period, setPeriod } = usePeriod();
  const { loading, data } = useEngineData(async (f) => {
    const [trades, payouts, propExts] = await Promise.all([
      f.ds.trades.list(),
      f.ds.payouts.list(),
      f.ds.propExtensions.list(),
    ]);
    return { trades, payouts, propExts };
  });

  // Trades/payouts escopados ao período selecionado.
  const trades = useMemo(
    () => (data?.trades ?? []).filter((t) => inPeriod(t.exitDatetime || t.entryDatetime, period, [])),
    [data, period],
  );
  const payouts = useMemo(
    () => (data?.payouts ?? []).filter((p) => inPeriod(p.date || p.updatedAt, period, [])),
    [data, period],
  );

  const stats = useMemo(() => {
    const capital = (data?.propExts ?? []).reduce((s, p) => s + (p.nominalSize || 0), 0);
    const netPayouts = payouts.reduce((s, p) => s + (Number(p.net) || 0), 0);
    const closed = trades.filter((t) => t.exitDatetime);
    const pnlTotal = closed.reduce((s, t) => s + (Number(t.resultNet) || 0), 0);
    const payoutYield = capital > 0 ? netPayouts / capital : 0;
    const pf = profitFactor(trades);
    return { trades, netPayouts, capital, payoutYield, wr: winrate(trades), pf, pnlTotal, payoutsCount: payouts.length };
  }, [data, trades, payouts]);

  const series = useMemo(() => {
    const allTrades = data?.trades ?? [];
    // Acumulado DESDE O INÍCIO (inception-to-date): o último ponto = total real.
    const pnlByMonth = new Map();
    for (const t of allTrades) {
      const stamp = t.exitDatetime || t.entryDatetime;
      if (!stamp) continue;
      const ym = String(stamp).slice(0, 7);
      pnlByMonth.set(ym, (pnlByMonth.get(ym) ?? 0) + (Number(t.resultNet) || 0));
    }
    const allMonths = [...pnlByMonth.keys()].sort();
    const cumByMonth = new Map();
    let cum = 0;
    for (const ym of allMonths) { cum += pnlByMonth.get(ym) ?? 0; cumByMonth.set(ym, Number(cum.toFixed(2))); }
    // Janela desenhada = período selecionado (sem cap).
    const win = new Set(periodMonths(period, allTrades));
    const displayMonths = period.mode === 'all' ? allMonths : allMonths.filter((ym) => win.has(ym));
    const payoutByMonth = new Map();
    for (const p of payouts) {
      const ym = String(p.date || p.updatedAt || '').slice(0, 7);
      if (!ym) continue;
      payoutByMonth.set(ym, (payoutByMonth.get(ym) ?? 0) + (Number(p.net) || 0));
    }
    return displayMonths.map((ym) => ({
      ym: ym.slice(5, 7) + '/' + ym.slice(2, 4),
      pnl: cumByMonth.get(ym) ?? 0,
      payout: Number((payoutByMonth.get(ym) ?? 0).toFixed(2)),
    }));
  }, [data, payouts, period]);

  if (loading || !data) {
    return (
      <div className="cmd-page">
        <div className="cmd-page-head"><h1 className="cmd-page-title">Trading</h1></div>
        <ModuleTabs module="trading" />
        <div className="cmd-msg" role="status" aria-live="polite">Carregando trading…</div>
      </div>
    );
  }

  const pfLabel = stats.pf === 'n/a' ? '—' : stats.pf === 'infinity' ? '∞' : stats.pf.toFixed(2);
  const markers = series.filter((s) => s.payout > 0);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head"><h1 className="cmd-page-title">Trading</h1></div>
      <ModuleTabs module="trading" />
      <PeriodPicker period={period} onChange={setPeriod} />

      <div className="td-cards">
        <StatCard label="PnL total" value={fmtMoney(stats.pnlTotal, 'USD')} sub={`${stats.trades.length} trades`} color={stats.pnlTotal >= 0 ? '#10b981' : '#ef4444'} glow={stats.pnlTotal >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'} />
        <StatCard label="Winrate" value={fmtPct(stats.wr)} sub="trades fechados" color="#f59e0b" glow="rgba(245,158,11,0.15)" />
        <StatCard label="Profit factor" value={pfLabel} sub="ganhos / perdas" color="#22d3ee" glow="rgba(34,211,238,0.15)" />
        <StatCard label="Capital (nominal)" value={fmtMoney(stats.capital, 'USD')} sub="contas prop" color="#3b82f6" glow="rgba(59,130,246,0.15)" />
        <StatCard label="Total payouts" value={fmtMoney(stats.netPayouts, 'USD')} sub={`${stats.payoutsCount} payout(s)`} color="#10b981" glow="rgba(16,185,129,0.15)" />
        <StatCard label="Payout Yield" value={fmtPct(stats.payoutYield)} sub="payouts / capital nominal" color={stats.payoutYield >= 0 ? '#7c5cff' : '#ef4444'} glow="rgba(124,92,255,0.15)" />
      </div>

      {series.length > 1 && (
        <div className="td-chart">
          <div className="td-chart-head">
            <span className="td-chart-title">PnL acumulado</span>
            <span className="td-chart-legend"><span className="td-dot" style={{ background: '#10b981' }} /> ponto de payout/withdrawal</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={series} margin={{ top: 12, right: 14, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="td-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c5cff" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#7c5cff" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
              <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
              <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => fmtMoney(v, 'USD')} />
              <Area type="monotone" dataKey="pnl" stroke="#7c5cff" strokeWidth={2} fill="url(#td-grad)" />
              {markers.map((m) => (
                <ReferenceDot key={m.ym} x={m.ym} y={m.pnl} r={5} fill="#10b981" stroke="#0f1218" strokeWidth={2} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <WidgetGrid
        storageKey="trading"
        items={[
          { id: 'calendar', node: (<div className="td-widget"><div className="td-chart-title"><CalendarDays size={14} /> Calendário de PnL</div><PnLCalendar trades={trades} loading={false} /></div>) },
          { id: 'hist', node: (<div className="td-widget"><div className="td-chart-title"><BarChart3 size={14} /> Histograma de R</div><HistogramR trades={trades} bucketSize={0.5} loading={false} /></div>) },
          { id: 'drawdown', defaultSpan: 2, node: (<div className="td-widget"><DrawdownSection trades={trades} initialFunding={stats.capital} currency="USD" /></div>) },
        ]}
      />
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
.td-chart-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; }
.td-chart-legend { font-size: 11px; color: var(--muted, #a1a7b3); display: inline-flex; align-items: center; gap: 6px; }
.td-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }

.td-widgets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.td-widget { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid #1a2232; border-radius: 16px; padding: 16px; box-shadow: 0 8px 20px rgba(0,0,0,0.25); }
.td-span2 { grid-column: 1 / -1; }
.td-dd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.td-dd-cell { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
.td-dd-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.td-dd-value { font-size: 1.6rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.td-neg { color: var(--red, #e74c3c); }
.td-warn { color: var(--yellow, #e1b12c); }
.td-dd-hint { font-size: 11px; color: var(--muted, #a1a7b3); margin-top: 10px; }

@media (max-width: 1000px) { .td-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .td-cards { grid-template-columns: 1fr; } .td-widgets { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('td-styles')) {
  const style = document.createElement('style');
  style.id = 'td-styles';
  style.textContent = TD_CSS;
  document.head.appendChild(style);
}
