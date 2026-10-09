// UnderlyingSearch — combobox com busca para escolher o subjacente. A lista vem do bridge
// (`/options/underlyings`), então você vê quais existem e filtra digitando. Permite texto
// livre (se o subjacente ainda não estiver na lista, digitar e usar serve).
//
// Fonte: DOCS/10_MODULES/options/00-spec.md.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ensureOptionStyles } from './optionStyles';

ensureOptionStyles();

export interface UnderlyingOption {
  underlying: string;
  count?: number;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Array<UnderlyingOption | string>;
  placeholder?: string;
  ariaLabel?: string;
}

export default function UnderlyingSearch({ value, onChange, options, placeholder = 'Buscar subjacente…', ariaLabel = 'Subjacente' }: Props) {
  const opts = useMemo<UnderlyingOption[]>(
    () => (options || []).map((o) => (typeof o === 'string' ? { underlying: o } : o)).filter((o) => o && o.underlying),
    [options],
  );
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const filtered = useMemo(() => {
    const term = q.trim().toUpperCase();
    const base = term ? opts.filter((o) => o.underlying.toUpperCase().includes(term)) : opts;
    return base.slice(0, 60);
  }, [opts, q]);

  const pick = (u: string) => { onChange(u); setQ(''); setOpen(false); };

  return (
    <div className="opxs-root" ref={rootRef}>
      <input
        className="input"
        value={open ? q : value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => { setOpen(true); setQ(''); }}
        onChange={(e) => { const v = e.target.value; setQ(v); onChange(v.toUpperCase()); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && filtered[0]) { e.preventDefault(); pick(filtered[0].underlying); } }}
      />
      {open && (
        <div className="opxs-panel" role="listbox" aria-label={ariaLabel}>
          {filtered.length === 0 ? (
            <div className="opxs-empty">
              Nenhum resultado{q ? ` para “${q}”` : ''}. Digite e use como está para buscar direto no Quantower.
            </div>
          ) : filtered.map((o) => (
            <button
              key={o.underlying}
              type="button"
              className={`opxs-item${o.underlying === value ? ' on' : ''}`}
              role="option"
              aria-selected={o.underlying === value}
              onClick={() => pick(o.underlying)}
            >
              <span className="opxs-name">{o.underlying}</span>
              {o.count != null && <span className="opxs-count">{o.count} contrato(s)</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
