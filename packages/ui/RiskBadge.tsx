// STAGE 3 — RiskBadge para a Navbar. Mostra o status agregado de risco (SAFE/WARN/STOP)
// e a contagem. Usa CSS variables, alvo de toque >= 44x44 no mobile.
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/01-tasks.md (T3.2) + 05-PWA_MOBILE_SPEC.md

import React from 'react';

const META = {
  SAFE: { label: 'Risco OK', emoji: '🟢', color: 'var(--green, #2ecc71)' },
  WARN: { label: 'Atenção', emoji: '🟡', color: 'var(--yellow, #e1b12c)' },
  STOP: { label: 'Parar', emoji: '🔴', color: 'var(--red, #e74c3c)' },
};

/**
 * @param {object} props
 * @param {'SAFE'|'WARN'|'STOP'} props.status
 * @param {{SAFE:number, WARN:number, STOP:number}} [props.counts]
 * @param {() => void} [props.onClick]
 */
export default function RiskBadge({ status = 'SAFE', counts, onClick }) {
  const meta = META[status] || META.SAFE;
  const alertCount = (counts?.WARN || 0) + (counts?.STOP || 0);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Risco: ${meta.label}${alertCount ? ` (${alertCount} em alerta)` : ''}`}
      className="rc-badge"
      style={{ color: meta.color, borderColor: meta.color }}
    >
      <span aria-hidden="true">{meta.emoji}</span>
      <span className="rc-badge-label">{meta.label}</span>
      {alertCount > 0 && <span className="rc-badge-count">{alertCount}</span>}
    </button>
  );
}

const BADGE_CSS = `
.rc-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px;
  background: rgba(255,255,255,0.03);
  border: 1px solid; cursor: pointer;
  font-size: 12px; font-weight: 700;
  min-height: 36px;
  transition: background 0.2s;
}
.rc-badge:hover { background: rgba(255,255,255,0.07); }
.rc-badge-label { font-size: 11px; }
.rc-badge-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 4px;
  border-radius: 999px; font-size: 11px; font-weight: 700;
  background: rgba(255,255,255,0.12); color: inherit;
}
@media (max-width: 719px) {
  .rc-badge { min-height: 44px; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('rc-badge-styles')) {
  const style = document.createElement('style');
  style.id = 'rc-badge-styles';
  style.textContent = BADGE_CSS;
  document.head.appendChild(style);
}
