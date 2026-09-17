// STAGE 3 — RiskCenter (Account Risk genérico). Banner do dia + tabela de contas.
// Mobile-first: legível SEM scroll horizontal em 360×640 (tabela vira lista de cards
// no mobile). Usa CSS variables (nunca hex hardcoded) e `--text-xs` >= 11px.
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/00-produto.md + 05-PWA_MOBILE_SPEC.md

import { fmtMoney } from './currency';
import React from 'react';


function fmtPct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function fmtR(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value >= 0 ? '+' : ''}${Number(value).toFixed(2)}R`;
}

const STATUS_META = {
  SAFE: { label: 'SAFE', emoji: '🟢', color: 'var(--green, #2ecc71)' },
  WARN: { label: 'WARN', emoji: '🟡', color: 'var(--yellow, #e1b12c)' },
  STOP: { label: 'STOP', emoji: '🔴', color: 'var(--red, #e74c3c)' },
};

function RiskStatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.SAFE;
  return (
    <span className="rc-pill" style={{ color: meta.color, borderColor: meta.color }}>
      <span aria-hidden="true">{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}

function fmtBool(v) {
  return v ? 'YES' : 'NO';
}

/**
 * @param {object} props
 * @param {import('../lib/db/risk').RiskSnapshot} props.snapshot
 * @param {boolean} [props.loading]
 */
export default function RiskCenter({ snapshot, loading = false }) {
  if (loading || !snapshot) {
    return (
      <div className="rc-root rc-loading" role="status" aria-live="polite">
        <div className="rc-skeleton" />
        <div className="rc-skeleton" />
        <div className="rc-skeleton" />
        <span className="rc-screen-reader">Carregando risco…</span>
      </div>
    );
  }

  const { rows, counts, worst, pnlToday, tradesToday, calculatedAt } = snapshot;
  const worstStatus = worst?.status?.status || 'SAFE';
  const meta = STATUS_META[worstStatus];
  const totalNominal = rows.reduce((s, r) => s + (r.metrics.nominalSize ?? 0), 0);
  const worstDDUsed = worst
    ? Math.max(worst.metrics.maxDDUsed ?? 0, worst.metrics.trailingDDUsed ?? 0, worst.metrics.dailyDDUsed ?? 0)
    : 0;

  return (
    <div className="rc-root">
      {/* Banner do dia */}
      <div className={`rc-banner rc-banner-${worstStatus.toLowerCase()}`} aria-live="polite">
        <div className="rc-banner-status">
          <span className="rc-banner-emoji" aria-hidden="true">{meta.emoji}</span>
          <div>
            <div className="rc-banner-title">RISK — {meta.label}</div>
            <div className="rc-banner-reason">{worst?.status?.reason || 'Sem risco em aberto'}</div>
          </div>
        </div>
        <div className="rc-banner-stats">
          <div className="rc-stat">
            <div className="rc-stat-label">Nominal</div>
            <div className="rc-stat-value">{fmtMoney(totalNominal)}</div>
          </div>
          <div className="rc-stat">
            <div className="rc-stat-label">PnL hoje</div>
            <div className="rc-stat-value" style={{ color: pnlToday >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {fmtMoney(pnlToday)}
            </div>
          </div>
          <div className="rc-stat">
            <div className="rc-stat-label">DD usado</div>
            <div className="rc-stat-value">{fmtPct(worstDDUsed)}</div>
          </div>
          <div className="rc-stat">
            <div className="rc-stat-label">Headroom</div>
            <div className="rc-stat-value">
              {worst ? `${fmtMoney(worst.status.headroom.value)} · ${fmtPct(worst.status.headroom.percent)}` : '—'}
            </div>
          </div>
          <div className="rc-stat">
            <div className="rc-stat-label">Trades hoje</div>
            <div className="rc-stat-value">
              {tradesToday.win}W / {tradesToday.loss}L
            </div>
          </div>
        </div>
        <div className="rc-banner-counts">
          <span>{counts.SAFE} SAFE</span>
          <span>{counts.WARN} WARN</span>
          <span>{counts.STOP} STOP</span>
        </div>
      </div>

      {/* Tabela de contas (desktop) / lista de cards (mobile) */}
      <div className="rc-table-wrap">
        <table className="rc-table">
          <thead>
            <tr>
              <th>Conta</th>
              <th className="rc-num">Equity</th>
              <th className="rc-num">Peak</th>
              <th className="rc-num">DD restante</th>
              <th className="rc-num">Trailing</th>
              <th>Status</th>
              <th className="rc-num">Eligible</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account.id}>
                <td>
                  <div className="rc-acct-name">{r.account.name}</div>
                  <div className="rc-acct-kind">
                    {r.account.kind}
                    {r.metrics.includesLive && (
                      <span className="rc-live" title={`Inclui PnL não realizado (${r.metrics.liveCount} abertas)`}> • inclui live</span>
                    )}
                  </div>
                </td>
                <td className="rc-num">{fmtMoney(r.metrics.equity)}</td>
                <td className="rc-num">{fmtMoney(r.metrics.peakEquity)}</td>
                <td className="rc-num">
                  {r.metrics.maxDDUsed != null ? fmtPct(Math.max(0, 1 - r.metrics.maxDDUsed)) : '—'}
                </td>
                <td className="rc-num">
                  {r.metrics.trailingDDUsed != null ? fmtPct(r.metrics.trailingDDUsed) : '—'}
                </td>
                <td><RiskStatusPill status={r.status.status} /></td>
                <td className="rc-num">
                  {r.metrics.eligible != null ? fmtBool(r.metrics.eligible) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile: cards empilhados (sem scroll horizontal) */}
        <div className="rc-cards">
          {rows.map((r) => (
            <div key={r.account.id} className="rc-card">
              <div className="rc-card-head">
                <div>
                  <div className="rc-acct-name">{r.account.name}</div>
                  <div className="rc-acct-kind">
                    {r.account.kind}
                    {r.metrics.includesLive && (
                      <span className="rc-live" title={`Inclui PnL não realizado (${r.metrics.liveCount} abertas)`}> • inclui live</span>
                    )}
                  </div>
                </div>
                <RiskStatusPill status={r.status.status} />
              </div>
              <div className="rc-card-grid">
                <div className="rc-stat">
                  <div className="rc-stat-label">Equity</div>
                  <div className="rc-stat-value">{fmtMoney(r.metrics.equity)}</div>
                </div>
                <div className="rc-stat">
                  <div className="rc-stat-label">Peak</div>
                  <div className="rc-stat-value">{fmtMoney(r.metrics.peakEquity)}</div>
                </div>
                <div className="rc-stat">
                  <div className="rc-stat-label">DD us.</div>
                  <div className="rc-stat-value">
                    {r.metrics.maxDDUsed != null ? fmtPct(r.metrics.maxDDUsed) : '—'}
                  </div>
                </div>
                <div className="rc-stat">
                  <div className="rc-stat-label">Eligible</div>
                  <div className="rc-stat-value">
                    {r.metrics.eligible != null ? fmtBool(r.metrics.eligible) : '—'}
                  </div>
                </div>
              </div>
              <div className="rc-card-reason">{r.status.reason}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rc-footer">Atualizado {calculatedAt ? new Date(calculatedAt).toLocaleTimeString() : ''}</div>
    </div>
  );
}

export { RiskStatusPill };

const RISK_CSS = `
.rc-root { display: flex; flex-direction: column; gap: 16px; }
.rc-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.rc-loading { gap: 8px; }
.rc-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: rc-pulse 1.4s ease-in-out infinite; }
.rc-skeleton:nth-child(2) { width: 80%; }
.rc-skeleton:nth-child(3) { width: 60%; }

.rc-banner {
  display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
  padding: 16px; border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(180deg, #161b25 0%, #131825 100%);
}
.rc-banner-safe { border-color: rgba(46,204,113,0.35); }
.rc-banner-warn { border-color: rgba(225,177,44,0.35); }
.rc-banner-stop { border-color: rgba(231,76,60,0.4); }
.rc-banner-status { display: flex; align-items: center; gap: 12px; min-width: 200px; flex: 1; }
.rc-banner-emoji { font-size: 28px; }
.rc-banner-title { font-size: 14px; font-weight: 800; letter-spacing: 0.3px; }
.rc-banner-reason { font-size: 11px; color: var(--muted, #a1a7b3); }
.rc-banner-stats { display: flex; flex-wrap: wrap; gap: 20px; }
.rc-banner-counts { display: flex; gap: 10px; font-size: 11px; color: var(--muted, #a1a7b3); }

.rc-stat { min-width: 72px; }
.rc-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.rc-stat-value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }

.rc-table-wrap { border-radius: 12px; border: 1px solid rgba(255,255,255,0.07); overflow: hidden; }
.rc-table { width: 100%; border-collapse: collapse; }
.rc-table th, .rc-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); }
.rc-table th { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; }
.rc-table td { font-size: 12px; }
.rc-num { font-variant-numeric: tabular-nums; }
.rc-table th.rc-num, .rc-table td.rc-num { text-align: right; }
.rc-acct-name { font-weight: 600; font-size: 13px; }
.rc-acct-kind { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: capitalize; }
.rc-live { color: var(--blue, #3498db); font-weight: 700; text-transform: none; }

.rc-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700;
  border: 1px solid;
  background: rgba(255,255,255,0.02);
}

.rc-footer { font-size: 11px; color: var(--muted, #a1a7b3); text-align: right; }

/* Mobile-first: a tabela some, os cards aparecem (sem scroll horizontal em 360px) */
.rc-cards { display: none; }
@media (max-width: 719px) {
  .rc-table { display: none; }
  .rc-cards { display: flex; flex-direction: column; gap: 12px; }
  .rc-banner { gap: 12px; }
  .rc-banner-stats { gap: 14px; }
}
.rc-card {
  padding: 14px; border-radius: 12px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.07);
}
.rc-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.rc-card-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.rc-card-reason { font-size: 11px; color: var(--muted, #a1a7b3); margin-top: 10px; }

@keyframes rc-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
// injeta CSS uma vez
if (typeof document !== 'undefined' && !document.getElementById('rc-styles')) {
  const style = document.createElement('style');
  style.id = 'rc-styles';
  style.textContent = RISK_CSS;
  document.head.appendChild(style);
}
