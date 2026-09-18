// UX foundation — CommandPalette (Ctrl+K). Navegação + ações + busca de entidades
// (contas, estratégias) num só lugar. Mobile-first (full-width bottom sheet).
// Sem lógica financeira: cada item só tem `run()`.

import React, { useEffect, useMemo, useRef, useState } from 'react';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  group?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items?: CommandItem[];
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {()=>void} props.onClose
 * @param {Array<{id:string;label:string;hint?:string;keywords?:string;group?:string;run:()=>void}>} props.items
 */
export default function CommandPalette({ open, onClose, items = [] }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    return items
      .filter((it) => `${it.label} ${it.hint || ''} ${it.keywords || ''}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [items, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        const it = filtered[index];
        if (it) {
          onClose();
          it.run();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, filtered, index, onClose]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  return (
    <div className="cp-overlay" onClick={onClose} role="presentation">
      <div className="cp-box" role="dialog" aria-modal="true" aria-label="Busca e comandos" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cp-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar página, conta, estratégia ou ação…"
          aria-label="Buscar página, conta, estratégia ou ação"
          autoComplete="off"
        />
        <div className="cp-list" ref={listRef} role="listbox" aria-label="Resultados">
          {filtered.length === 0 && (
            <div className="cp-empty" role="status">Nada encontrado.</div>
          )}
          {filtered.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="option"
              aria-selected={i === index}
              data-active={i === index ? 'true' : 'false'}
              className={`cp-item${i === index ? ' active' : ''}`}
              onClick={() => { onClose(); it.run(); }}
              onMouseEnter={() => setIndex(i)}
            >
              <span className="cp-label">{it.label}</span>
              {it.hint && <span className="cp-hint">{it.hint}</span>}
            </button>
          ))}
        </div>
        <div className="cp-foot">↑↓ navegar · Enter abrir · Esc fechar</div>
      </div>
    </div>
  );
}

const CP_CSS = `
.cp-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.55); display: flex; justify-content: center; align-items: flex-start; padding: 12vh 16px 16px; }
.cp-box { width: min(560px, 100%); background: #141927; border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; overflow: hidden; box-shadow: 0 16px 64px rgba(0,0,0,0.6); }
.cp-input { width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.08); color: var(--text, #e7eaf0); font-size: 15px; padding: 14px 16px; outline: none; }
.cp-list { max-height: 320px; overflow-y: auto; padding: 6px; }
.cp-empty { padding: 18px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; }
.cp-item { display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%; background: transparent; border: none; color: var(--text, #e7eaf0); font-size: 14px; padding: 10px 12px; border-radius: 8px; cursor: pointer; text-align: left; }
.cp-item.active { background: rgba(124,92,255,0.16); }
.cp-label { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-hint { font-size: 11px; color: var(--muted, #a1a7b3); flex-shrink: 0; }
.cp-foot { padding: 8px 14px; font-size: 11px; color: var(--muted, #a1a7b3); border-top: 1px solid rgba(255,255,255,0.06); }
@media (max-width: 719px) { .cp-overlay { padding: 8vh 12px 12px; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('cp-styles')) {
  const style = document.createElement('style');
  style.id = 'cp-styles';
  style.textContent = CP_CSS;
  document.head.appendChild(style);
}
