// DataState — micro UX compartilhada: skeleton estrutural de dashboard e erro
// acionável ("o que aconteceu / o que fazer"). Apresentação pura, sem lógica.
import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

/** Skeleton estrutural de uma dashboard (não uma linha de texto). */
export function DashSkeleton({ cards = 3, widgets = 2 }: { cards?: number; widgets?: number }) {
  return (
    <div className="ds-wrap" role="status" aria-live="polite" aria-label="Carregando dados">
      <div className="ds-cards">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={`c${i}`} className="ds-skel ds-skel-card" />
        ))}
      </div>
      <div className="ds-widgets">
        {Array.from({ length: widgets }).map((_, i) => (
          <div key={`w${i}`} className="ds-skel ds-skel-widget" />
        ))}
      </div>
      <span className="ds-sr">Carregando…</span>
    </div>
  );
}

/**
 * Erro acionável: diz o que houve, por quê e como resolver (retry).
 * Nunca substitui dado já em cache (use `stale` para o banner).
 */
interface ActionableErrorProps {
  error?: { message?: string } | string | null;
  onRetry?: () => void;
  label?: string;
  stale?: boolean;
}
export function ActionableError({ error, onRetry, label = 'os dados', stale = false }: ActionableErrorProps) {
  const message = typeof error === 'string' ? error : error?.message || String(error || 'falha inesperada');
  return (
    <div className={`ds-error ${stale ? 'ds-error-stale' : ''}`} role="alert">
      <div className="ds-error-head">
        <AlertTriangle size={15} />
        <span>{stale ? 'Não foi possível atualizar' : 'Não foi possível carregar'} {label}</span>
      </div>
      <div className="ds-error-why">
        <b>O que houve:</b> {message}.
        <br />
        <b>Como resolver:</b> verifique a conexão e tente novamente. Se persistir, recarregue a página.
      </div>
      {onRetry && (
        <button type="button" className="ds-error-retry" onClick={onRetry}>
          <RotateCw size={13} /> Tentar novamente
        </button>
      )}
    </div>
  );
}

const DS_CSS = `
.ds-wrap { display: flex; flex-direction: column; gap: 14px; }
.ds-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.ds-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.ds-widgets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ds-skel { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 37%, rgba(255,255,255,0.04) 63%); background-size: 400% 100%; border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; animation: ds-shimmer 1.4s ease infinite; }
.ds-skel-card { height: 92px; }
.ds-skel-widget { height: 200px; }
@keyframes ds-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
.ds-error { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius: 14px; background: rgba(231,76,60,0.07); border: 1px solid rgba(231,76,60,0.3); }
.ds-error-stale { background: rgba(225,177,44,0.06); border-color: rgba(225,177,44,0.3); }
.ds-error-head { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
.ds-error-why { font-size: 12.5px; color: var(--muted, #a1a7b3); line-height: 1.5; }
.ds-error-retry { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; min-height: 36px; border-radius: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.14); color: var(--text, #e7eaf0); font-weight: 600; font-size: 12.5px; cursor: pointer; }
.ds-error-retry:hover { background: rgba(255,255,255,0.1); }
@media (max-width: 900px) { .ds-cards { grid-template-columns: repeat(2, 1fr); } .ds-widgets { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .ds-cards { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ds-styles')) {
  const style = document.createElement('style');
  style.id = 'ds-styles';
  style.textContent = DS_CSS;
  document.head.appendChild(style);
}
