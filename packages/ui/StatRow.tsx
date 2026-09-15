// StatRow — linha padronizada "ícone · nome · sub · barra(proporcional) · valor",
// o mesmo padrão do resumo de Contas. Reusada nos widgets dos módulos.
import React from 'react';

/**
 * @param {object} props
 * @param {React.ReactNode} [props.icon]
 * @param {string} props.label
 * @param {string|number} [props.sub]
 * @param {number} [props.barPct] 0..100
 * @param {string} [props.color]
 * @param {React.ReactNode} props.value
 * @param {string} [props.valueClass]
 */
export default function StatRow({ icon = null, label, sub, barPct, color = '#7c5cff', value, valueClass = '', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`sr-row${onClick ? ' sr-row-btn' : ''}`}
      {...(onClick ? { type: 'button', onClick, 'aria-label': `Abrir ${label}` } : {})}
    >
      <span className="sr-ico" style={icon ? { color, borderColor: color } : { border: 'none' }}>{icon}</span>
      <span className="sr-name">{label}</span>
      {sub != null && <span className="sr-sub">{sub}</span>}
      {barPct != null && (
        <span className="sr-bar-wrap">
          <span className="sr-bar" style={{ width: `${Math.max(0, Math.min(100, barPct))}%`, background: color }} />
        </span>
      )}
      <span className={`sr-val ${valueClass}`}>{value}</span>
    </Tag>
  );
}

const SR_CSS = `
.sr-row { display: grid; grid-template-columns: 26px 1fr auto 90px auto; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
.sr-row-btn { width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.04); color: inherit; text-align: left; cursor: pointer; font: inherit; }
.sr-row-btn:hover { background: rgba(255,255,255,0.04); }
.sr-row:last-child { border-bottom: none; }
.sr-ico { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid; background: rgba(255,255,255,0.03); }
.sr-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr-sub { font-size: 11px; color: var(--muted, #a1a7b3); white-space: nowrap; }
.sr-bar-wrap { height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.sr-bar { display: block; height: 100%; border-radius: 999px; }
.sr-val { font-variant-numeric: tabular-nums; font-weight: 700; text-align: right; }
@media (max-width: 560px) { .sr-row { grid-template-columns: 26px 1fr auto auto; } .sr-bar-wrap { display: none; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('sr-styles')) {
  const style = document.createElement('style');
  style.id = 'sr-styles';
  style.textContent = SR_CSS;
  document.head.appendChild(style);
}
