// STAGE 6 — ActionCenter. Lista de ações derivadas de flags que os motores JÁ
// expõem (risk:warning / goal:completed / payout disponível / DARF prazo).
// COMPOSIÇÃO — nenhum cálculo financeiro aqui.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md (Alerts) + 01-tasks.md (T6.3).

import React, { useMemo } from 'react';
import type { ActionItem } from '@apps/lib/db';

interface SeverityMeta {
  label: string;
  emoji: string;
  color: string;
}

const SEVERITY_META: Record<string, SeverityMeta> = {
  warn: { label: 'Atenção', emoji: '⚠️', color: 'var(--red, #e74c3c)' },
  info: { label: 'Info', emoji: 'ℹ️', color: 'var(--yellow, #e1b12c)' },
  good: { label: 'Ok', emoji: '✅', color: 'var(--green, #2ecc71)' },
};

interface ActionCenterProps {
  actions?: ActionItem[];
  loading?: boolean;
}

/**
 * @param {object} props
 * @param {Array<{id:string;kind:string;severity:'warn'|'info'|'good';title:string;detail:string;source:string}>} props.actions
 * @param {boolean} [props.loading]
 */
export default function ActionCenter({ actions = [], loading = false }: ActionCenterProps) {
  const sorted = useMemo(() => {
    const order: Record<string, number> = { warn: 0, info: 1, good: 2 };
    return [...actions].sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
  }, [actions]);

  if (loading) {
    return (
      <div className="ac-root ac-loading" role="status" aria-live="polite">
        <div className="ac-skeleton" />
        <div className="ac-skeleton" />
        <span className="ac-screen-reader">Carregando ações…</span>
      </div>
    );
  }

  return (
    <div className="ac-root">
      <div className="ac-head">
        <h3 className="ac-title">Action Center</h3>
        <span className="ac-count">{actions.length}</span>
      </div>

      {actions.length === 0 ? (
        <div className="ac-empty" role="status">Sem ações em aberto.</div>
      ) : (
        <div className="ac-list">
          {sorted.map((a) => {
            const meta = SEVERITY_META[a.severity] || SEVERITY_META.info;
            return (
              <div key={a.id} className={`ac-item ac-${a.severity}`}>
                <span className="ac-emoji" aria-hidden="true">{meta.emoji}</span>
                <div className="ac-body">
                  <div className="ac-item-title">{a.title}</div>
                  <div className="ac-item-detail">{a.detail}</div>
                  <div className="ac-item-source">fonte: {a.source}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const AC_CSS = `
.ac-root { display: flex; flex-direction: column; gap: 14px; }
.ac-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.ac-loading { gap: 8px; }
.ac-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: ac-pulse 1.4s ease-in-out infinite; }
.ac-skeleton:nth-child(2) { width: 70%; }

.ac-head { display: flex; align-items: center; justify-content: space-between; }
.ac-title { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; margin: 0; }
.ac-count { font-size: 12px; padding: 2px 10px; border-radius: 999px; background: rgba(231,76,60,0.14); color: var(--red, #e74c3c); font-weight: 700; }

.ac-list { display: flex; flex-direction: column; gap: 10px; }
.ac-item { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); }
.ac-warn { border-color: rgba(231,76,60,0.3); }
.ac-info { border-color: rgba(225,177,44,0.3); }
.ac-good { border-color: rgba(46,204,113,0.3); }
.ac-emoji { font-size: 16px; margin-top: 1px; }
.ac-body { display: flex; flex-direction: column; gap: 2px; }
.ac-item-title { font-size: 13px; font-weight: 700; }
.ac-item-detail { font-size: 12px; color: var(--muted, #a1a7b3); }
.ac-item-source { font-size: 10px; color: var(--muted, #a1a7b3); font-family: monospace; opacity: 0.7; }

.ac-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

@keyframes ac-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ac-styles')) {
  const style = document.createElement('style');
  style.id = 'ac-styles';
  style.textContent = AC_CSS;
  document.head.appendChild(style);
}
