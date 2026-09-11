// STAGE 6 — HomeCommandCenter. COMPOSIÇÃO PURA. NÃO tem lógica financeira própria:
// só agrega os números que os motores das fases 2/3/4 expõem (via `useCommandSnapshot`).
// Header patrimonial + 4 quadrants (Trading Today / Investments / Goals / Action Center)
// + camada de Insights (AI leitura-only, com fonte citável).
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Home = composição) + 01-tasks.md (T6.1).
//
// Regra dura: se precisar de dado novo, volta ao stage dono. Nada de calcular aqui.

import React from 'react';

function fmtMoney(value, currency = 'R$') {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

function fmtPct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

const RISK_META = {
  SAFE: { label: 'SAFE', emoji: '🟢', color: 'var(--green, #2ecc71)' },
  WARN: { label: 'WARN', emoji: '🟡', color: 'var(--yellow, #e1b12c)' },
  STOP: { label: 'STOP', emoji: '🔴', color: 'var(--red, #e74c3c)' },
};

function RiskPill({ status }) {
  const meta = RISK_META[status] || RISK_META.SAFE;
  return (
    <span className="hc-pill" style={{ color: meta.color, borderColor: meta.color }}>
      <span aria-hidden="true">{meta.emoji}</span>
      <span>{meta.label}</span>
    </span>
  );
}

/**
 * @param {object} props
 * @param {import('../lib/db/financialIntelligence').CommandSnapshot} [props.snapshot]
 * @param {import('../lib/db/financialIntelligence').ActionItem[]} [props.actions]
 * @param {import('../lib/db/financialIntelligence').Insight[]} [props.insights]
 * @param {boolean} [props.loading]
 * @param {Array<string>} [props.hidden] ids de seção ocultas (risk|investments|goals|actions|insights)
 */
export default function HomeCommandCenter({ snapshot = null, actions = [], insights = [], loading = false, hidden = [] }) {
  const hide = (id) => (hidden || []).includes(id);
  if (loading || !snapshot) {
    return (
      <div className="hc-root hc-loading" role="status" aria-live="polite">
        <div className="hc-skeleton" />
        <div className="hc-skeleton" />
        <div className="hc-skeleton" />
        <span className="hc-screen-reader">Carregando Command Center…</span>
      </div>
    );
  }

  const nw = snapshot.netWorth;
  const risk = snapshot.risk;
  const portfolio = snapshot.portfolio;
  const goals = snapshot.goals;
  const riskStatus = risk.rows.some((r) => r.status.status === 'STOP')
    ? 'STOP'
    : risk.rows.some((r) => r.status.status === 'WARN')
      ? 'WARN'
      : 'SAFE';

  const header = [
    { label: 'Net Worth', value: fmtMoney(nw.netWorth), cls: '' },
    { label: 'Cash', value: fmtMoney(nw.components.cash), cls: '' },
    { label: 'Invest', value: fmtMoney(nw.components.investments), cls: '' },
    { label: 'Pendente', value: fmtMoney(nw.components.receivables), cls: '' },
  ];

  return (
    <div className="hc-root">
      {/* Header patrimonial */}
      <div className="hc-hero">
        <div className="hc-hero-label">Patrimônio líquido (derivado)</div>
        <div className="hc-hero-value">{fmtMoney(nw.netWorth)}</div>
        <div className="hc-hero-grid">
          {header.map((h) => (
            <div key={h.label} className={`hc-hero-cell ${h.cls}`}>
              <div className="hc-hero-cell-label">{h.label}</div>
              <div className="hc-hero-cell-value">{h.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quadrants */}
      <div className="hc-quadrants">
        {/* Trading Today */}
        {!hide('risk') && (<section className="hc-quad hc-quad-risk" aria-label="Trading Today">
          <div className="hc-quad-head">
            <h3 className="hc-quad-title">Trading Today</h3>
            <RiskPill status={riskStatus} />
          </div>
          <div className="hc-quad-stats">
            <div className="hc-stat">
              <span className="hc-stat-label">PnL hoje</span>
              <span className="hc-stat-value" style={{ color: risk.pnlToday >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {fmtMoney(risk.pnlToday, 'USD')}
              </span>
            </div>
            <div className="hc-stat">
              <span className="hc-stat-label">Trades</span>
              <span className="hc-stat-value">{risk.tradesToday.win}W / {risk.tradesToday.loss}L</span>
            </div>
            <div className="hc-stat">
              <span className="hc-stat-label">Nominal</span>
              <span className="hc-stat-value">
                {fmtMoney(risk.rows.reduce((s, r) => s + (r.metrics.nominalSize ?? 0), 0), 'USD')}
              </span>
            </div>
          </div>
          <div className="hc-quad-counts">
            <span>{risk.counts.SAFE} SAFE</span>
            <span>{risk.counts.WARN} WARN</span>
            <span>{risk.counts.STOP} STOP</span>
          </div>
        </section>)}

        {/* Action Center — attention-first: logo após Trading Today */}
        {!hide('actions') && (<section className="hc-quad" aria-label="Action Center">
          <div className="hc-quad-head">
            <h3 className="hc-quad-title">Action Center</h3>
            {actions.length > 0 && <span className="hc-action-count">{actions.length}</span>}
          </div>
          <div className="hc-actions">
            {actions.length === 0 ? (
              <div className="hc-empty">Sem ações em aberto.</div>
            ) : (
              actions.slice(0, 5).map((a) => (
                <div key={a.id} className={`hc-action hc-action-${a.severity}`}>
                  <span className="hc-action-dot" aria-hidden="true" />
                  <div className="hc-action-body">
                    <div className="hc-action-title">{a.title}</div>
                    <div className="hc-action-detail">{a.detail}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>)}

        {/* Investments */}
        {!hide('investments') && (<section className="hc-quad" aria-label="Investments">
          <div className="hc-quad-head">
            <h3 className="hc-quad-title">Investments</h3>
          </div>
          <div className="hc-quad-stats">
            <div className="hc-stat">
              <span className="hc-stat-label">Total</span>
              <span className="hc-stat-value">{fmtMoney(portfolio.totalValue)}</span>
            </div>
            <div className="hc-stat">
              <span className="hc-stat-label">PnL</span>
              <span className="hc-stat-value" style={{ color: portfolio.totalPnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {fmtPct(portfolio.pnlPercent)}
              </span>
            </div>
            <div className="hc-stat">
              <span className="hc-stat-label">Marcas velhas</span>
              <span className="hc-stat-value">{portfolio.staleCount}</span>
            </div>
          </div>
        </section>)}

        {/* Goals */}
        {!hide('goals') && (<section className="hc-quad" aria-label="Goals">
          <div className="hc-quad-head">
            <h3 className="hc-quad-title">Goals</h3>
          </div>
          <div className="hc-goals">
            {goals.length === 0 ? (
              <div className="hc-empty">Nenhum goal definido.</div>
            ) : (
              goals.slice(0, 4).map((g) => (
                <div key={g.goal.id} className="hc-goal">
                  <div className="hc-goal-row">
                    <span className="hc-goal-name">{g.goal.kind}</span>
                    <span className="hc-goal-pct">{g.pct.toFixed(0)}%</span>
                  </div>
                  <div className="hc-goal-bar">
                    <div className="hc-goal-fill" style={{ width: `${Math.min(100, g.pct)}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>)}

      </div>

      {/* AI Insights (leitura-only, fonte citável) */}
      {insights.length > 0 && !hide('insights') && (
        <section className="hc-insights" aria-label="Insights">
          <div className="hc-insights-title">Insights (leitura-only)</div>
          <div className="hc-insights-list">
            {insights.slice(0, 4).map((ins) => (
              <div key={ins.id} className="hc-insight">
                <div className="hc-insight-text">{ins.text}</div>
                <div className="hc-insight-source">fonte: {ins.source}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const HC_CSS = `
.hc-root { display: flex; flex-direction: column; gap: 16px; }
.hc-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.hc-loading { gap: 8px; }
.hc-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: hc-pulse 1.4s ease-in-out infinite; }
.hc-skeleton:nth-child(2) { width: 80%; }
.hc-skeleton:nth-child(3) { width: 60%; }

.hc-hero { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px; }
.hc-hero-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.hc-hero-value { font-size: 34px; font-weight: 800; font-variant-numeric: tabular-nums; margin: 4px 0 14px; }
.hc-hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.hc-hero-cell-label { font-size: 11px; color: var(--muted, #a1a7b3); }
.hc-hero-cell-value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }

.hc-quadrants { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.hc-quad { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.hc-quad-risk { border-color: rgba(46,204,113,0.2); }
.hc-quad-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.hc-quad-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; margin: 0; }
.hc-quad-stats { display: flex; flex-wrap: wrap; gap: 16px; }
.hc-stat { display: flex; flex-direction: column; gap: 2px; }
.hc-stat-label { font-size: 11px; color: var(--muted, #a1a7b3); }
.hc-stat-value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.hc-quad-counts { display: flex; gap: 10px; font-size: 11px; color: var(--muted, #a1a7b3); }

.hc-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; border: 1px solid; background: rgba(255,255,255,0.02); }

.hc-goals { display: flex; flex-direction: column; gap: 10px; }
.hc-goal-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
.hc-goal-name { text-transform: capitalize; }
.hc-goal-pct { font-variant-numeric: tabular-nums; }
.hc-goal-bar { height: 6px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; }
.hc-goal-fill { height: 100%; background: linear-gradient(90deg, var(--brand, #7c5cff), #a78bfa); border-radius: 999px; }

.hc-action-count { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(231,76,60,0.15); color: var(--red, #e74c3c); font-weight: 700; }
.hc-actions { display: flex; flex-direction: column; gap: 8px; }
.hc-action { display: flex; gap: 8px; align-items: flex-start; }
.hc-action-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--yellow, #e1b12c); margin-top: 4px; flex-shrink: 0; }
.hc-action-warn .hc-action-dot { background: var(--red, #e74c3c); }
.hc-action-good .hc-action-dot { background: var(--green, #2ecc71); }
.hc-action-title { font-size: 12px; font-weight: 700; }
.hc-action-detail { font-size: 11px; color: var(--muted, #a1a7b3); }

.hc-insights { background: rgba(124,92,255,0.04); border: 1px solid rgba(124,92,255,0.18); border-radius: 14px; padding: 16px; }
.hc-insights-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.hc-insights-list { display: flex; flex-direction: column; gap: 12px; }
.hc-insight-text { font-size: 13px; }
.hc-insight-source { font-size: 10px; color: var(--muted, #a1a7b3); font-family: monospace; margin-top: 2px; }

.hc-empty { font-size: 12px; color: var(--muted, #a1a7b3); }

@media (max-width: 719px) {
  .hc-hero-grid { grid-template-columns: repeat(2, 1fr); }
  .hc-quadrants { grid-template-columns: 1fr; }
}
@keyframes hc-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('hc-styles')) {
  const style = document.createElement('style');
  style.id = 'hc-styles';
  style.textContent = HC_CSS;
  document.head.appendChild(style);
}
