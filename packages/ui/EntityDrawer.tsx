// EntityDrawer — gaveta lateral genérica para "abrir contexto" (conta/payout/trade/ativo)
// sem navegar. Apresentacional: recebe título + conteúdo.
import React from 'react';
import { X } from 'lucide-react';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {()=>void} props.onClose
 * @param {React.ReactNode} props.children
 */
export default function EntityDrawer({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div className="ed-overlay" onClick={onClose} />
      <aside className="ed-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ed-head">
          <span className="ed-title">{title}</span>
          <button className="ed-icon" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="ed-body">{children}</div>
      </aside>
    </>
  );
}

const ED_CSS = `
.ed-overlay { position: fixed; inset: 0; z-index: 78; background: rgba(7,9,14,0.5); backdrop-filter: blur(2px); }
.ed-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 79; width: 420px; max-width: 94vw; display: flex; flex-direction: column; background: linear-gradient(180deg, #171c27 0%, #12161f 100%); border-left: 1px solid #1f2734; box-shadow: -16px 0 48px rgba(0,0,0,0.5); animation: ed-slide 180ms ease; }
@keyframes ed-slide { from { transform: translateX(24px); opacity: 0.4; } to { transform: translateX(0); opacity: 1; } }
.ed-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.ed-title { font-size: 14px; font-weight: 800; }
.ed-icon { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: transparent; border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); cursor: pointer; }
.ed-body { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.ed-kv { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.ed-kv:last-child { border-bottom: none; }
.ed-k { color: var(--muted, #a1a7b3); }
.ed-v { font-weight: 700; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) { .ed-drawer { width: 100%; max-width: 100%; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ed-styles')) {
  const style = document.createElement('style');
  style.id = 'ed-styles';
  style.textContent = ED_CSS;
  document.head.appendChild(style);
}
