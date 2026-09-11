// STAGE 8 — JournalDashboard (engine-driven). Equity curve + drawdown + métricas de
// trading, tudo derivado do motor (tradePnl/winrate/profitFactor/computeMaxDrawdown).
// Nenhuma fórmula nova. Mobile-first 360px.
//
// Fonte: DOCS/08_STAGE7_INTEGRATION/00-plano.md (Fase 8) + DOCS/04_STAGE3_TRADING_OS.

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
} from 'recharts';
import { tradePnl, winrate, profitFactor } from '@apps/lib/db';

function fmtMoney(v, cur = 'R$') {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v < 0 ? '-' : ''}${cur}${Math.abs(v).toFixed(2)}`;
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtPF(pf) {
  if (pf === 'infinity') return '∞';
  if (pf === 'n/a') return 'n/a';
  return Number(pf).toFixed(2);
}

/**
 * @param {object} props
 * @param {Array<object>} [props.trades]
 * @param {Array<object>} [props.payouts] — A6: marcadores na equity (dias com payout)
 * @param {boolean} [props.loading]
 */
export default function JournalDashboard({ trades = [], payouts = [], loading = false }) {
  const [showPayouts, setShowPayouts] = useState(true);
  const data = useMemo(() => {
    const closed = trades
      .filter((t) => t.exitPrice != null)
      .sort((a, b) => (a.exitDatetime || a.entryDatetime).localeCompare(b.exitDatetime || b.entryDatetime));

    const wins = closed.filter((t) => (t.resultNet ?? tradePnl(t)) > 0).length;
    const losses = closed.filter((t) => (t.resultNet ?? tradePnl(t)) < 0).length;
    const wr = winrate(closed);
    const pf = profitFactor(closed);

    const rs = closed.map((t) => t.resultR).filter((r) => r != null);
    const avgR = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : 0;
    const grossWin = closed.filter((t) => (t.resultNet ?? 0) > 0).reduce((s, t) => s + (t.resultNet ?? 0), 0);
    const grossLoss = closed.filter((t) => (t.resultNet ?? 0) < 0).reduce((s, t) => s + Math.abs(t.resultNet ?? 0), 0);
    const expectancy = wins + losses > 0
      ? (wins / (wins + losses)) * (grossWin / Math.max(wins, 1)) - (losses / (wins + losses)) * (grossLoss / Math.max(losses, 1))
      : 0;

    // Equity curve (PnL acumulado).
    let cum = 0;
    const equity = closed.map((t) => {
      cum += tradePnl(t);
      return { at: (t.exitDatetime || t.entryDatetime).slice(0, 10), equity: Number(cum.toFixed(2)) };
    });
    // Drawdown (a partir do pico da equity acumulada).
    let peak = 0;
    const drawdown = equity.map((p) => {
      if (p.equity > peak) peak = p.equity;
      return { at: p.at, dd: Number((p.equity - peak).toFixed(2)) };
    });

    const today = new Date().toISOString().slice(0, 10);
    const todayPnl = closed
      .filter((t) => (t.exitDatetime || t.entryDatetime).slice(0, 10) === today)
      .reduce((s, t) => s + tradePnl(t), 0);

    // Heat por dia da semana (PnL somado).
    const byDow = [0, 0, 0, 0, 0, 0, 0];
    for (const t of closed) {
      const d = new Date(t.exitDatetime || t.entryDatetime).getUTCDay();
      byDow[d] += tradePnl(t);
    }
    const maxAbs = Math.max(1, ...byDow.map((v) => Math.abs(v)));

    return {
      count: closed.length,
      wr,
      pf,
      avgR,
      expectancy,
      todayPnl,
      equity,
      drawdown,
      byDow: byDow.map((v) => Number(v.toFixed(2))),
      maxAbs,
    };
  }, [trades]);

  // A6 — marcadores de payout na equity (mesma chave de data da curva: slice ISO).
  const payoutMarks = useMemo(() => {
    if (!payouts.length || !data.equity.length) return [];
    const byDay = new Map();
    for (const p of payouts) {
      if (p.status === 'Pending') continue;
      const key = String(p.date || '').slice(0, 10);
      if (!key) continue;
      byDay.set(key, (byDay.get(key) ?? 0) + (p.net ?? 0));
    }
    const marks = [];
    let lastY = data.equity[data.equity.length - 1].equity;
    for (const [at, amount] of byDay) {
      const point = [...data.equity].reverse().find((e) => e.at <= at);
      const y = point ? point.equity : lastY;
      lastY = y;
      marks.push({ at, amount: Number(amount.toFixed(2)), y });
    }
    return marks.sort((a, b) => (a.at < b.at ? -1 : 1));
  }, [payouts, data.equity]);

  if (loading) {
    return (
      <div className="jd-root jd-loading" role="status" aria-live="polite">
        <div className="jd-skeleton" /><div className="jd-skeleton" /><div className="jd-skeleton" />
        <span className="jd-screen-reader">Carregando dashboard…</span>
      </div>
    );
  }

  const cards = [
    { label: 'Trades', value: data.count },
    { label: 'Winrate', value: fmtPct(data.wr) },
    { label: 'Profit Factor', value: fmtPF(data.pf) },
    { label: 'Avg R', value: data.avgR ? `${data.avgR.toFixed(2)}R` : '—' },
    { label: 'Expectancy', value: fmtMoney(data.expectancy) },
    { label: 'PnL hoje', value: fmtMoney(data.todayPnl), color: data.todayPnl >= 0 ? 'var(--green)' : 'var(--red)' },
  ];

  const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="jd-root">
      {/* Métricas */}
      <div className="jd-cards">
        {cards.map((c) => (
          <div key={c.label} className="jd-card">
            <div className="jd-card-label">{c.label}</div>
            <div className="jd-card-value" style={c.color ? { color: c.color } : undefined}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Heat por dia da semana */}
      <div className="jd-chart">
        <div className="jd-chart-title">PnL por dia da semana</div>
        <div className="jd-heat">
          {data.byDow.map((v, i) => (
            <div key={i} className="jd-heat-col">
              <span
                className="jd-heat-bar"
                style={{
                  height: `${Math.max(4, (Math.abs(v) / data.maxAbs) * 100)}%`,
                  background: v >= 0 ? `rgba(46,204,113,${0.25 + 0.75 * (Math.abs(v) / data.maxAbs)})` : `rgba(231,76,60,${0.25 + 0.75 * (Math.abs(v) / data.maxAbs)})`,
                }}
                title={`${DOW[i]}: ${fmtMoney(v)}`}
              />
              <span className="jd-heat-day">{DOW[i]}</span>
              <span className="jd-heat-val">{fmtMoney(v)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Equity curve + overlay de payouts (A6) */}
      <div className="jd-chart">
        <div className="jd-chart-head">
          <div className="jd-chart-title">Equity (PnL acumulado)</div>
          {payoutMarks.length > 0 && (
            <button
              className="jd-toggle"
              aria-pressed={showPayouts}
              onClick={() => setShowPayouts((s) => !s)}
              title="Mostrar/ocultar payouts na curva"
            >
              ● payouts {showPayouts ? 'on' : 'off'}
            </button>
          )}
        </div>
        {data.equity.length === 0 ? (
          <div className="jd-empty">Sem trades fechados.</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.equity} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="at" tick={{ fill: '#a1a7b3', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
              <YAxis tick={{ fill: '#a1a7b3', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" width={54} />
              <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#a1a7b3' }} />
              <Line type="monotone" dataKey="equity" stroke="var(--brand, #7c5cff)" strokeWidth={2} dot={false} />
              {showPayouts && payoutMarks.map((m) => (
                <ReferenceDot
                  key={m.at}
                  x={m.at}
                  y={m.y}
                  r={5}
                  fill="var(--yellow, #e1b12c)"
                  stroke="#0f1218"
                  label={{ value: fmtMoney(m.amount), position: 'top', fontSize: 10, fill: '#e1b12c' }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Drawdown */}
      <div className="jd-chart">
        <div className="jd-chart-title">Drawdown (do pico)</div>
        {data.drawdown.length === 0 ? (
          <div className="jd-empty">Sem trades fechados.</div>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data.drawdown} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="at" tick={{ fill: '#a1a7b3', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
              <YAxis tick={{ fill: '#a1a7b3', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" width={54} />
              <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#a1a7b3' }} />
              <Area type="monotone" dataKey="dd" stroke="var(--red, #e74c3c)" fill="rgba(231,76,60,0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const JD_CSS = `
.jd-root { display: flex; flex-direction: column; gap: 16px; }
.jd-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.jd-loading { gap: 8px; }
.jd-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: jd-pulse 1.4s ease-in-out infinite; }

.jd-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.jd-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 12px; }
.jd-card-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.jd-card-value { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; margin-top: 4px; }

.jd-chart { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.jd-chart-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.jd-chart-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; }
.jd-chart-head .jd-chart-title { margin-bottom: 0; }
.jd-toggle { background: transparent; border: 1px solid #2a3246; color: var(--text, #e7eaf0); border-radius: 8px; padding: 6px 10px; font-size: 11px; font-weight: 600; cursor: pointer; min-height: 36px; }
.jd-toggle[aria-pressed="false"] { opacity: 0.55; }

.jd-empty { padding: 20px; text-align: center; color: var(--muted, #a1a7b3); font-size: 12px; }

.jd-heat { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; align-items: end; }
.jd-heat-col { display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 110px; justify-content: flex-end; }
.jd-heat-bar { width: 100%; max-width: 34px; border-radius: 6px 6px 0 0; display: block; }
.jd-heat-day { font-size: 10px; color: var(--muted, #a1a7b3); }
.jd-heat-val { font-size: 10px; font-variant-numeric: tabular-nums; }

@media (max-width: 719px) { .jd-cards { grid-template-columns: repeat(2, 1fr); } }
@keyframes jd-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('jd-styles')) {
  const style = document.createElement('style');
  style.id = 'jd-styles';
  style.textContent = JD_CSS;
  document.head.appendChild(style);
}
