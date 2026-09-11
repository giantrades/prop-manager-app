// UX foundation — Toast unificado (substitui msgs ad-hoc `cmd-msg`/locais).
// `toast(msg, { type, action })` com undo via action. aria-live, mobile-first.
//
// Uso: envolva o app em <ToastProvider> e chame useToast() em qualquer tela.

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let seq = 0;

/**
 * @param {string} message
 * @param {object} [opts]
 * @param {'ok'|'warn'|'error'} [opts.type]
 * @param {{label:string;run:()=>void}} [opts.action] — ex.: Desfazer
 * @param {number} [opts.durationMs]
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fora do <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback((message, opts: { type?: 'ok' | 'warn' | 'error'; action?: { label: string; run: () => void }; durationMs?: number } = {}) => {
    const id = `toast-${Date.now().toString(36)}-${(seq += 1)}`;
    const item = {
      id,
      message: String(message ?? ''),
      type: opts.type || 'ok',
      action: opts.action || null,
      durationMs: opts.durationMs ?? (opts.action ? 8000 : 5000),
    };
    setItems((list) => [...list.slice(-3), item]);
    const timer = setTimeout(() => dismiss(id), item.durationMs);
    timers.current.set(id, timer);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="tst-host" role="status" aria-live="polite" aria-label="Notificações">
        {items.map((t) => (
          <div key={t.id} className={`tst-item tst-${t.type}`}>
            <span className="tst-msg">{t.message}</span>
            {t.action && (
              <button className="tst-action" onClick={() => { try { t.action.run(); } finally { dismiss(t.id); } }}>
                {t.action.label}
              </button>
            )}
            <button className="tst-close" onClick={() => dismiss(t.id)} aria-label="Fechar notificação">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TST_CSS = `
.tst-host { position: fixed; left: 50%; transform: translateX(-50%); bottom: 18px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; width: min(440px, calc(100vw - 32px)); }
.tst-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; background: #161b25; border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); font-size: 13px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
.tst-ok { border-color: rgba(46,204,113,0.4); }
.tst-warn { border-color: rgba(225,177,44,0.4); }
.tst-error { border-color: rgba(231,76,60,0.5); }
.tst-msg { flex: 1; min-width: 0; }
.tst-action { background: var(--brand, #7c5cff); border: none; color: #fff; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 700; cursor: pointer; min-height: 36px; }
.tst-close { background: transparent; border: none; color: var(--muted, #a1a7b3); font-size: 18px; cursor: pointer; padding: 4px 8px; min-width: 36px; min-height: 36px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('tst-styles')) {
  const style = document.createElement('style');
  style.id = 'tst-styles';
  style.textContent = TST_CSS;
  document.head.appendChild(style);
}
