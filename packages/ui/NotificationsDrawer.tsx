// Gaveta de notificações (ações em aberto). Abre pela navbar; ao ler, o item sai e o
// sinal some. COMPOSIÇÃO — os itens vêm prontos do Command Center (nenhum cálculo aqui).
import React, { useState } from 'react';
import { X, Bell, CheckCheck, Plus, Trash2, Clock, ExternalLink } from 'lucide-react';

const SEVERITY_META = {
  critical: { label: 'Crítico', color: 'var(--red, #e74c3c)', dot: '#e74c3c' },
  warn: { label: 'Atenção', color: 'var(--yellow, #e1b12c)', dot: '#e1b12c' },
  info: { label: 'Info', color: 'var(--blue, #3498db)', dot: '#3498db' },
  good: { label: 'Ok', color: 'var(--green, #2ecc71)', dot: '#2ecc71' },
};

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {()=>void} props.onClose
 * @param {Array<{id:string;severity:string;title:string;detail:string;source:string}>} props.items não lidas
 * @param {(id:string)=>void} [props.onRead] — marca 1 como lida
 * @param {()=>void} [props.onReadAll]
 * @param {()=>void} [props.onGoActions] — abrir o Action Center completo
 */
export default function NotificationsDrawer({ open, onClose, items = [], onRead, onReadAll, onGoActions, onCreate, onDelete, onOpen, onSnooze, onDismiss }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState('info');
  if (!open) return null;
  const order = { critical: 0, warn: 1, info: 2, good: 3 };
  const sorted = [...items].sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));

  return (
    <>
      <div className="nb-overlay" onClick={onClose} />
      <aside className="nb-drawer" role="dialog" aria-modal="true" aria-label="Notificações">
        <div className="nb-head">
          <span className="nb-title"><Bell size={16} /> Notificações {items.length > 0 && <span className="nb-count">{items.length}</span>}</span>
          <div className="nb-head-actions">
            {items.length > 0 && onReadAll && (
              <button className="nb-btn nb-btn-ghost" onClick={onReadAll}><CheckCheck size={14} /> Marcar todas</button>
            )}
            <button className="nb-icon" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
          </div>
        </div>

        <div className="nb-body">
          {sorted.length === 0 ? (
            <div className="nb-empty" role="status">Tudo em ordem — nenhuma notificação.</div>
          ) : sorted.map((a) => {
            const meta = SEVERITY_META[a.severity] || SEVERITY_META.info;
            return (
              <div key={a.id} className={`nb-item nb-${a.severity}`}>
                <button type="button" className="nb-item-main" onClick={() => onRead?.(a.id)} title="Marcar como lida">
                  <span className="nb-dot" style={{ background: meta.dot }} aria-hidden="true" />
                  <span className="nb-item-body">
                    <span className="nb-item-sev" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="nb-item-title">{a.title}</span>
                    <span className="nb-item-detail">{a.detail}</span>
                    <span className="nb-item-source">{a.kind === 'manual' ? 'lembrete' : `fonte: ${a.source}`}</span>
                  </span>
                </button>
                <div className="nb-item-actions">
                  {a.href && onOpen && (
                    <button type="button" className="nb-icon" onClick={() => { onRead?.(a.id); onOpen(a.href); }} title="Abrir contexto" aria-label={`Abrir ${a.title}`}><ExternalLink size={13} /></button>
                  )}
                  {onSnooze && (
                    <button type="button" className="nb-icon" onClick={() => onSnooze(a.id)} title="Adiar 1 dia" aria-label={`Adiar ${a.title}`}><Clock size={13} /></button>
                  )}
                  {onDismiss && (
                    <button type="button" className="nb-icon" onClick={() => onDismiss(a.id)} title="Dispensar" aria-label={`Dispensar ${a.title}`}><X size={13} /></button>
                  )}
                  {a.kind === 'manual' && onDelete && (
                    <button type="button" className="nb-icon nb-item-del" onClick={() => onDelete(a.id)} aria-label={`Excluir ${a.title}`}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            );
          })}

          {onCreate && (
            <div className="nb-create">
              {showForm ? (
                <>
                  <input className="nb-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Novo lembrete (ex.: pagar DARF)" aria-label="Título do lembrete" />
                  <div className="nb-create-row">
                    <select className="nb-input" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severidade">
                      <option value="warn">Atenção</option>
                      <option value="info">Info</option>
                      <option value="good">Ok</option>
                    </select>
                    <button className="nb-btn nb-btn-primary" disabled={!title.trim()} onClick={() => { onCreate(title.trim(), severity); setTitle(''); setShowForm(false); }}>Adicionar</button>
                    <button className="nb-btn nb-btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <button className="nb-btn nb-btn-ghost" onClick={() => setShowForm(true)}><Plus size={14} /> Nova ação / lembrete</button>
              )}
            </div>
          )}
        </div>

        {onGoActions && (
          <div className="nb-foot">
            <button className="nb-btn nb-btn-ghost" onClick={onGoActions}>Configurar ações</button>
          </div>
        )}
      </aside>
    </>
  );
}

const NB_CSS = `
.nb-overlay { position: fixed; inset: 0; z-index: 80; background: rgba(7,9,14,0.55); backdrop-filter: blur(2px); }
.nb-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 81; width: 380px; max-width: 92vw; display: flex; flex-direction: column; background: linear-gradient(180deg, #171c27 0%, #12161f 100%); border-left: 1px solid #1f2734; box-shadow: -16px 0 48px rgba(0,0,0,0.5); animation: nb-slide 180ms ease; }
@keyframes nb-slide { from { transform: translateX(24px); opacity: 0.4; } to { transform: translateX(0); opacity: 1; } }
.nb-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.nb-title { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 800; }
.nb-count { font-size: 11px; padding: 1px 8px; border-radius: 999px; background: rgba(231,76,60,0.16); color: var(--red, #e74c3c); }
.nb-head-actions { display: flex; align-items: center; gap: 6px; }
.nb-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.nb-empty { padding: 40px 16px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; }
.nb-item { display: flex; gap: 10px; align-items: flex-start; text-align: left; width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); color: var(--text, #e7eaf0); cursor: pointer; transition: background 120ms ease; }
.nb-item:hover { background: rgba(255,255,255,0.05); }
.nb-warn { border-color: rgba(225,177,44,0.3); }
.nb-critical { border-color: rgba(231,76,60,0.45); }
.nb-info { border-color: rgba(52,152,219,0.3); }
.nb-good { border-color: rgba(46,204,113,0.3); }
.nb-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.nb-item-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.nb-item-sev { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; }
.nb-item-actions { display: flex; flex-direction: column; gap: 4px; }
.nb-item-actions .nb-icon { width: 28px; height: 28px; }
.nb-item-title { font-size: 13px; font-weight: 700; }
.nb-item-detail { font-size: 12px; color: var(--muted, #a1a7b3); }
.nb-item-source { font-size: 10px; color: var(--muted, #a1a7b3); opacity: 0.7; }
.nb-foot { padding: 12px 16px; border-top: 1px solid rgba(255,255,255,0.06); }
.nb-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer; min-height: 36px; }
.nb-btn-ghost { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); }
.nb-btn-ghost:hover { background: rgba(255,255,255,0.09); }
.nb-icon { width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border-radius: 9px; background: transparent; border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); cursor: pointer; }
@media (max-width: 560px) { .nb-drawer { width: 100%; max-width: 100%; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('nb-styles')) {
  const style = document.createElement('style');
  style.id = 'nb-styles';
  style.textContent = NB_CSS;
  document.head.appendChild(style);
}
