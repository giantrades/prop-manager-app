// STAGE 5 — Goals 2.0. Progresso SEMPRE derivado do patrimônio (nunca digitado).
// kinds: emergency | networth | property | payout_year | portfolio.
// `windowType: calendar_year|rolling_12m` para payout_year. Proibido `Σ volume`.
// Mobile-first 360px.
//
// Fonte: DOCS/06_STAGE5_WEALTH_OS/00-produto.md + 00-DOMAIN_MODEL.md.
// Dados: `computeGoalProgress` (packages/lib/db/wealth.ts).

import React from 'react';

function fmtMoney(value, currency = 'R$') {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

const KIND_META = {
  emergency: { label: 'Reserva de emergência', emoji: '🛡️' },
  networth: { label: 'Patrimônio líquido', emoji: '🏦' },
  property: { label: 'Imóvel (entrada)', emoji: '🏠' },
  payout_year: { label: 'Payout anual', emoji: '💸' },
  portfolio: { label: 'Portfolio', emoji: '📈' },
};

/**
 * @param {object} props
 * @param {Array<{goal:{id:string;kind:string;targetValue:number;windowType?:string};current:number;target:number;pct:number;completed:boolean;remaining:number;window?:string}>} props.goals
 * @param {string} [props.currency]
 * @param {boolean} [props.loading]
 */
export default function Goals({ goals = [], currency = 'R$', loading = false }) {
  if (loading) {
    return (
      <div className="gl-root gl-loading" role="status" aria-live="polite">
        <div className="gl-skeleton" />
        <div className="gl-skeleton" />
        <div className="gl-skeleton" />
        <span className="gl-screen-reader">Carregando goals…</span>
      </div>
    );
  }

  if (goals.length === 0) {
    return <div className="gl-empty" role="status">Nenhum goal definido.</div>;
  }

  return (
    <div className="gl-root">
      <div className="gl-grid">
        {goals.map((g) => {
          const meta = KIND_META[g.goal.kind] || { label: g.goal.kind, emoji: '🎯' };
          const barWidth = Math.min(100, Math.max(0, g.pct));
          return (
            <div key={g.goal.id} className={`gl-card${g.completed ? ' gl-completed' : ''}`}>
              <div className="gl-card-head">
                <div className="gl-card-title">
                  <span className="gl-emoji" aria-hidden="true">{meta.emoji}</span>
                  <div>
                    <div className="gl-name">{meta.label}</div>
                    {g.goal.kind === 'payout_year' && (
                      <div className="gl-window">{g.goal.windowType === 'rolling_12m' ? 'últimos 12m' : 'ano corrente'}</div>
                    )}
                  </div>
                </div>
                {g.completed && <span className="gl-done">Concluído</span>}
              </div>

              <div className="gl-numbers">
                <div className="gl-current">{fmtMoney(g.current, currency)}</div>
                <div className="gl-target">meta {fmtMoney(g.target, currency)}</div>
              </div>

              <div className="gl-progress" role="progressbar" aria-valuenow={Math.round(g.pct)} aria-valuemin={0} aria-valuemax={100}>
                <div className="gl-progress-fill" style={{ width: `${barWidth}%` }} />
              </div>
              <div className="gl-progress-text">
                <span>{g.pct.toFixed(1)}%</span>
                <span>faltam {fmtMoney(g.remaining, currency)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="gl-foot">Progresso derivado do patrimônio — nunca digitado.</div>
    </div>
  );
}

const GL_CSS = `
.gl-root { display: flex; flex-direction: column; gap: 16px; }
.gl-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.gl-loading { gap: 8px; }
.gl-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: gl-pulse 1.4s ease-in-out infinite; }
.gl-skeleton:nth-child(2) { width: 80%; }
.gl-skeleton:nth-child(3) { width: 60%; }

.gl-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.gl-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.gl-completed { border-color: rgba(46,204,113,0.35); }
.gl-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.gl-card-title { display: flex; align-items: center; gap: 8px; }
.gl-emoji { font-size: 18px; }
.gl-name { font-size: 13px; font-weight: 700; }
.gl-window { font-size: 10px; color: var(--muted, #a1a7b3); }
.gl-done { font-size: 10px; padding: 2px 8px; border-radius: 999px; background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); font-weight: 700; text-transform: uppercase; }

.gl-numbers { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.gl-current { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.gl-target { font-size: 11px; color: var(--muted, #a1a7b3); }

.gl-progress { height: 8px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; }
.gl-progress-fill { height: 100%; background: linear-gradient(90deg, var(--brand, #7c5cff), #a78bfa); border-radius: 999px; transition: width 0.6s ease-out; }
.gl-completed .gl-progress-fill { background: linear-gradient(90deg, var(--green, #2ecc71), #82e0aa); }
.gl-progress-text { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted, #a1a7b3); margin-top: 6px; font-variant-numeric: tabular-nums; }

.gl-foot { font-size: 11px; color: var(--muted, #a1a7b3); text-align: center; }
.gl-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

@media (max-width: 719px) { .gl-grid { grid-template-columns: 1fr; } }
@keyframes gl-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('gl-styles')) {
  const style = document.createElement('style');
  style.id = 'gl-styles';
  style.textContent = GL_CSS;
  document.head.appendChild(style);
}
