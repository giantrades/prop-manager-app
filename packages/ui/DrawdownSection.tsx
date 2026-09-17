// DrawdownSection — porta do widget antigo: métricas (Max/Avg/Recovery/Status),
// gráfico "underwater", piores drawdowns com paginação e insights. Toda a matemática
// vem de `drawdownAnalysis` (motor). A UI só renderiza.
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { TrendingDown } from 'lucide-react';
import { drawdownAnalysis } from '@apps/lib/db';
import { fmtMoney } from './currency';

export default function DrawdownSection({ trades = [], initialFunding = 0, currency = 'USD' }) {
  const analysis = useMemo(() => drawdownAnalysis(trades, initialFunding), [trades, initialFunding]);
  const [page, setPage] = useState(0);
  const perPage = 3;
  const totalPages = Math.max(1, Math.ceil(analysis.drawdowns.length / perPage));
  const pageItems = analysis.drawdowns.slice(page * perPage, page * perPage + perPage);

  return (
    <div className="dd-root">
      <div className="dd-title"><TrendingDown size={14} /> Drawdown</div>

      <div className="dd-metrics">
        <div className="dd-cell"><span className="dd-label">Max drawdown</span><span className="dd-value dd-neg">{fmtMoney(-analysis.maxDD.drawdownAbs, currency)}</span><span className="dd-sub">-{analysis.maxDD.drawdownPct}%</span></div>
        <div className="dd-cell"><span className="dd-label">Avg drawdown</span><span className="dd-value dd-neg">{fmtMoney(-analysis.avgDD, currency)}</span><span className="dd-sub">profundidade média</span></div>
        <div className="dd-cell"><span className="dd-label">Avg recovery</span><span className="dd-value">{analysis.avgRecoveryDays != null ? `${analysis.avgRecoveryDays}d` : '—'}</span><span className="dd-sub">tempo p/ recuperar</span></div>
        <div className="dd-cell"><span className="dd-label">Status</span><span className={`dd-value ${analysis.atPeak ? 'dd-pos' : 'dd-warn'}`}>{analysis.atPeak ? 'No pico ✓' : 'Em drawdown'}</span><span className="dd-sub">{analysis.recoveryRate}% recuperados</span></div>
      </div>

      {analysis.underwater.length > 1 && (
        <div className="dd-chart" role="img" aria-label="Gráfico underwater de drawdown">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={analysis.underwater} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="dd-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#dc2626" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a1a7b3' }} minTickGap={24} />
              <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={48} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => `${v}%`} />
              <Area type="monotone" dataKey="dd" stroke="#dc2626" strokeWidth={2} fill="url(#dd-grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="dd-table-title">Piores drawdowns</div>
      <div className="dd-table-wrap">
        <table className="dd-table">
          <thead>
            <tr><th scope="col">#</th><th scope="col">Período</th><th scope="col" className="dd-num">Max DD</th><th scope="col" className="dd-num">Duração</th><th scope="col" className="dd-num">Recuperação</th></tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr><td colSpan={5} className="dd-empty">Nenhum drawdown detectado.</td></tr>
            ) : pageItems.map((d, i) => (
              <tr key={d.id}>
                <td>{page * perPage + i + 1}</td>
                <td>{d.startDate} — {d.recoveryDate || 'em curso'}</td>
                <td className="dd-num dd-neg">{fmtMoney(-d.drawdownAbs, currency)} ({d.drawdownPct}%)</td>
                <td className="dd-num">{d.durationDays}d</td>
                <td className="dd-num">{d.recovered ? `${d.recoveryDays}d` : <span className="dd-ongoing">EM CURSO</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="dd-pagination">
          <button className="dd-btn" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</button>
          <span>Página {page + 1} / {totalPages}</span>
          <button className="dd-btn" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>›</button>
        </div>
      )}

      <ul className="dd-insights">
        <li>Drawdowns &gt; 5%: <b>{analysis.significant}</b></li>
        <li>Tempo médio em drawdown: <b>{analysis.drawdowns.length ? Math.round(analysis.drawdowns.reduce((s, d) => s + d.durationDays, 0) / analysis.drawdowns.length) : 0} dias</b></li>
        <li>Taxa de recuperação: <b>{analysis.recoveryRate}%</b></li>
        <li>Maior período sem novo pico: <b>{analysis.drawdowns.length ? Math.max(...analysis.drawdowns.map((d) => d.durationDays)) : 0} dias</b></li>
      </ul>
    </div>
  );
}

const DD_CSS = `
.dd-root { display: flex; flex-direction: column; gap: 12px; }
.dd-title { font-size: 13px; font-weight: 700; }
.dd-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.dd-cell { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
.dd-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted, #a1a7b3); }
.dd-value { font-size: 1.1rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.dd-sub { font-size: 10px; color: var(--muted, #a1a7b3); }
.dd-neg { color: var(--red, #e74c3c); }
.dd-pos { color: var(--green, #2ecc71); }
.dd-warn { color: var(--yellow, #e1b12c); }
.dd-chart { width: 100%; }
.dd-table-title { font-size: 12px; font-weight: 700; }
.dd-table-wrap { overflow-x: auto; }
.dd-table { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
.dd-table th, .dd-table td { padding: 8px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); white-space: nowrap; }
.dd-table th.dd-num, .dd-table td.dd-num { text-align: right; }
.dd-table thead th { color: var(--muted, #a1a7b3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
.dd-ongoing { background: #dc2626; color: #fff; border-radius: 6px; padding: 2px 6px; font-size: 10px; font-weight: 700; }
.dd-empty { color: var(--muted, #a1a7b3); }
.dd-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 10px; font-size: 12px; color: var(--muted, #a1a7b3); }
.dd-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); border-radius: 8px; padding: 4px 10px; cursor: pointer; }
.dd-btn:disabled { opacity: 0.5; cursor: default; }
.dd-insights { list-style: none; padding: 10px 12px; margin: 0; border-radius: 12px; background: rgba(26,31,46,0.6); font-size: 12px; line-height: 1.8; color: var(--text, #e7eaf0); }
@media (max-width: 700px) { .dd-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;
if (typeof document !== 'undefined' && !document.getElementById('dd-styles')) {
  const style = document.createElement('style');
  style.id = 'dd-styles';
  style.textContent = DD_CSS;
  document.head.appendChild(style);
}
