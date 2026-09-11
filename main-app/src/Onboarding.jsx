// UX foundation — Onboarding de primeira abertura. Aparece quando não há
// nenhuma conta nem trade (app vazio) e nunca foi dispensado. Guia em 3 passos.
// Sem lógica financeira.

import React from 'react';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {()=>void} props.onDone
 * @param {(to:string)=>void} props.onGo
 */
export default function Onboarding({ open, onDone, onGo }) {
  if (!open) return null;
  const steps = [
    { n: '1', title: 'Crie sua 1ª conta', sub: 'Prop, corretora, banco ou cash.', to: '/accounts', cta: 'Criar conta' },
    { n: '2', title: 'Traga seus dados', sub: 'Sync Quantower ou importe CSV.', to: '/quantower', cta: 'Conectar' },
    { n: '3', title: 'Veja seu risco', sub: 'Abra o Risk antes de operar.', to: '/risk', cta: 'Ver Risk' },
  ];
  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="Bem-vindo — primeiros passos" onClick={onDone}>
      <div className="ob-box" onClick={(e) => e.stopPropagation()}>
        <div className="ob-title">Bem-vindo ao FinanceOS 👋</div>
        <div className="ob-sub">3 passos para começar:</div>
        {steps.map((s) => (
          <div key={s.n} className="ob-step">
            <span className="ob-num">{s.n}</span>
            <div className="ob-step-main">
              <div className="ob-step-title">{s.title}</div>
              <div className="ob-step-sub">{s.sub}</div>
            </div>
            <button className="ob-btn" onClick={() => { onDone(); onGo(s.to); }}>{s.cta}</button>
          </div>
        ))}
        <button className="ob-dismiss" onClick={onDone}>Agora não</button>
      </div>
    </div>
  );
}

const OB_CSS = `
.ob-overlay { position: fixed; inset: 0; z-index: 10001; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; padding: 16px; }
.ob-box { width: min(440px, 100%); background: #141927; border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.ob-title { font-size: 17px; font-weight: 800; }
.ob-sub { font-size: 13px; color: var(--muted, #a1a7b3); }
.ob-step { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 10px 12px; }
.ob-num { width: 30px; height: 30px; min-width: 30px; border-radius: 999px; background: rgba(124,92,255,0.16); color: var(--brand, #7c5cff); font-weight: 800; display: flex; align-items: center; justify-content: center; }
.ob-step-main { flex: 1; min-width: 0; }
.ob-step-title { font-size: 14px; font-weight: 700; }
.ob-step-sub { font-size: 12px; color: var(--muted, #a1a7b3); }
.ob-btn { background: var(--brand, #7c5cff); border: none; color: #fff; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 700; cursor: pointer; min-height: 38px; }
.ob-dismiss { background: transparent; border: none; color: var(--muted, #a1a7b3); font-size: 12px; cursor: pointer; padding: 8px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('ob-styles')) {
  const style = document.createElement('style');
  style.id = 'ob-styles';
  style.textContent = OB_CSS;
  document.head.appendChild(style);
}
