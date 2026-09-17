// AccountPicker — filtro de contas (busca + seleção múltipla) para o Trading.
// Muitas contas (20+): busca, ordenar por tipo, "selecionar todas (filtradas)",
// contador e lista rolável. O pai controla o valor; a seleção é persistida na página.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import { Search, Check, X, ChevronDown } from 'lucide-react';

const KIND_LABEL = {
  prop: 'Prop', bank: 'Banco', wallet: 'Carteira', investment: 'Investimento',
  crypto: 'Cripto', cash: 'Dinheiro', other: 'Outro',
};

export default function AccountPicker({ selected = [], onChange }) {
  const finance = useFinance();
  const [accounts, setAccounts] = useState([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!finance) return;
      try {
        const accs = await finance.ds.accounts.list();
        if (alive) setAccounts(accs);
      } catch { /* noop */ }
    })();
    return () => { alive = false; };
  }, [finance]);

  // Fecha ao clicar fora / Esc.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const ordered = useMemo(() => (
    [...accounts].sort((a, b) => (KIND_LABEL[a.kind] || a.kind || '').localeCompare(KIND_LABEL[b.kind] || b.kind || '') || a.name.localeCompare(b.name))
  ), [accounts]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? ordered.filter((a) => a.name.toLowerCase().includes(term)) : ordered;
  }, [ordered, q]);

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const selectAllFiltered = () => onChange([...new Set([...selected, ...list.map((a) => a.id)])]);

  const label = selected.length === 0
    ? 'Todas as contas'
    : `${selected.length} conta${selected.length > 1 ? 's' : ''}`;

  return (
    <div className="ap-root" ref={rootRef}>
      <button className={`ap-btn${selected.length ? ' active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        <span className="ap-btn-label">{label}</span>
        {selected.length > 0 && accounts.length > 0 && <span className="ap-badge">{selected.length}/{accounts.length}</span>}
        <ChevronDown size={14} className={`ap-chev${open ? ' open' : ''}`} />
      </button>
      {open && (
        <div className="ap-panel" role="dialog" aria-label="Filtrar contas">
          <div className="ap-search-wrap">
            <Search size={14} />
            <input className="ap-search" autoFocus placeholder="Buscar conta…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conta" />
            {q && <button className="ap-x" onClick={() => setQ('')} aria-label="Limpar busca"><X size={13} /></button>}
          </div>
          <div className="ap-toolbar">
            <span className="ap-count">{selected.length} selecionada(s) de {accounts.length}</span>
            <button className="ap-mini" onClick={selectAllFiltered} disabled={list.length === 0}>Selecionar filtradas</button>
          </div>
          <div className="ap-list">
            {list.length === 0 ? (
              <div className="ap-empty">Nenhuma conta{q ? ' para esta busca' : ''}.</div>
            ) : list.map((a) => {
              const on = selected.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`ap-item${on ? ' on' : ''}`}
                  onClick={() => toggle(a.id)}
                  aria-pressed={on}
                >
                  <span className={`ap-check${on ? ' on' : ''}`}>{on && <Check size={12} />}</span>
                  <span className="ap-name">{a.name}</span>
                  <span className="ap-kind">{KIND_LABEL[a.kind] || a.kind || ''}</span>
                </button>
              );
            })}
          </div>
          <div className="ap-actions">
            <button className="ap-clear" onClick={() => onChange([])} disabled={selected.length === 0}><X size={12} /> Limpar</button>
            <button className="ap-done" onClick={() => setOpen(false)}><Check size={12} /> Pronto</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Estilos do AccountPicker vivem em `main-app/src/styles.css` (classe `.ap-*`).
// Antes eram injetados via JS aqui; em chunk lazy isso podia pintar sem estilo na
// 1ª entrada. No CSS global (carregado no boot) o estilo está sempre presente.
