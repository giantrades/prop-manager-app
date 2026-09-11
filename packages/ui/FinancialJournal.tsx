// STAGE 5 — Financial Journal. Eventos de vida ligados ao patrimônio.
// Automático sempre nasce não-confirmado; a UI pede confirmação antes de persistir.
// Mobile-first 360px.
//
// Fonte: DOCS/06_STAGE5_WEALTH_OS/00-produto.md.
// Dados: `deriveJournalEvents` + `WealthService.suggestJournalEvents` (packages/lib/db/wealth.ts).

import React from 'react';

function fmtMoney(value, currency = 'R$') {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

const TYPE_META = {
  first_payout: { label: 'Primeiro payout', emoji: '🎉' },
  payout_milestone: { label: 'Marco de payout', emoji: '💰' },
  networth_milestone: { label: 'Marco de patrimônio', emoji: '🏦' },
  investment: { label: 'Aporte', emoji: '📈' },
  monthly_income: { label: 'Renda recorrente', emoji: '🔁' },
  custom: { label: 'Evento', emoji: '📝' },
};

/**
 * @param {object} props
 * @param {Array<{id:string;date:string;type:string;title:string;amount?:number;note?:string;confirmed:boolean}>} props.events
 * @param {(event:object)=>void} [props.onConfirm] — confirma um evento automático
 * @param {string} [props.currency]
 * @param {boolean} [props.loading]
 */
export default function FinancialJournal({ events = [], onConfirm, currency = 'R$', loading = false }) {
  if (loading) {
    return (
      <div className="fj-root fj-loading" role="status" aria-live="polite">
        <div className="fj-skeleton" />
        <div className="fj-skeleton" />
        <span className="fj-screen-reader">Carregando journal…</span>
      </div>
    );
  }

  if (events.length === 0) {
    return <div className="fj-empty" role="status">Nenhum evento de patrimônio.</div>;
  }

  return (
    <div className="fj-root">
      {events.map((e) => {
        const meta = TYPE_META[e.type] || TYPE_META.custom;
        return (
          <div key={e.id} className={`fj-card${e.confirmed ? ' fj-confirmed' : ''}`}>
            <div className="fj-card-head">
              <span className="fj-emoji" aria-hidden="true">{meta.emoji}</span>
              <div className="fj-head-text">
                <div className="fj-title">{e.title}</div>
                <div className="fj-date">{e.date ? e.date.slice(0, 10) : ''} · {meta.label}</div>
              </div>
            </div>
            {e.amount != null && (
              <div className="fj-amount">{fmtMoney(e.amount, currency)}</div>
            )}
            {e.note && <div className="fj-note">{e.note}</div>}
            {!e.confirmed && onConfirm && (
              <button className="fj-confirm-btn" onClick={() => onConfirm(e)}>Confirmar</button>
            )}
            {e.confirmed && <span className="fj-badge">confirmado</span>}
          </div>
        );
      })}
    </div>
  );
}

const FJ_CSS = `
.fj-root { display: flex; flex-direction: column; gap: 12px; }
.fj-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.fj-loading { gap: 8px; }
.fj-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: fj-pulse 1.4s ease-in-out infinite; }
.fj-skeleton:nth-child(2) { width: 80%; }

.fj-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.fj-confirmed { border-color: rgba(46,204,113,0.25); }
.fj-card-head { display: flex; align-items: center; gap: 10px; }
.fj-emoji { font-size: 20px; }
.fj-head-text { flex: 1; min-width: 0; }
.fj-title { font-size: 13px; font-weight: 700; }
.fj-date { font-size: 11px; color: var(--muted, #a1a7b3); }
.fj-amount { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; margin: 8px 0 2px; }
.fj-note { font-size: 11px; color: var(--muted, #a1a7b3); }
.fj-confirm-btn { margin-top: 10px; font-size: 12px; padding: 6px 14px; border-radius: 10px; background: rgba(124,92,255,0.12); border: 1px solid rgba(124,92,255,0.3); color: var(--brand, #7c5cff); font-weight: 700; cursor: pointer; }
.fj-confirm-btn:hover { background: rgba(124,92,255,0.2); }
.fj-badge { display: inline-block; margin-top: 8px; font-size: 10px; padding: 2px 8px; border-radius: 999px; background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); font-weight: 700; text-transform: uppercase; }
.fj-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

@keyframes fj-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('fj-styles')) {
  const style = document.createElement('style');
  style.id = 'fj-styles';
  style.textContent = FJ_CSS;
  document.head.appendChild(style);
}
