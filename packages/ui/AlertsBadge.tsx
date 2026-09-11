// STAGE 6 — AlertsBadge para a Navbar. Mostra o total de ações em aberto
// (risk:warning + goal:completed + payout disponível + DARF). Alvo de toque >= 44px.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Alerts — badge Navbar) + 01-tasks.md (T6.3).

import React from 'react';

/**
 * @param {object} props
 * @param {number} props.count — total de ações em aberto.
 * @param {() => void} [props.onClick]
 * @param {string} [props.label]
 */
export default function AlertsBadge({ count = 0, onClick, label = 'Ações' }) {
  const hasAlert = count > 0;
  return (
    <button
      type="button"
      className="ab-badge"
      onClick={onClick}
      aria-label={`${label}: ${count} em aberto`}
      aria-haspopup="true"
    >
      <span className="ab-bell" aria-hidden="true">🔔</span>
      <span className="ab-label">{label}</span>
      {hasAlert && <span className="ab-count">{count}</span>}
    </button>
  );
}

const AB_CSS = `
.ab-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--text); cursor: pointer;
  font-size: 12px; font-weight: 700;
  min-height: 36px;
  transition: background 0.2s;
}
.ab-badge:hover { background: rgba(255,255,255,0.07); }
.ab-bell { font-size: 13px; }
.ab-label { font-size: 11px; }
.ab-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 4px;
  border-radius: 999px; font-size: 11px; font-weight: 800;
  background: var(--red, #e74c3c); color: #fff;
}
@media (max-width: 719px) {
  .ab-badge { min-height: 44px; }
}
`;
if (typeof document !== 'undefined' && !document.getElementById('ab-styles')) {
  const style = document.createElement('style');
  style.id = 'ab-styles';
  style.textContent = AB_CSS;
  document.head.appendChild(style);
}
