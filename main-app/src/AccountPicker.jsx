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

const AP_CSS = `
.ap-root { position: relative; display: inline-block; align-self: flex-start; max-width: 100%; }
.ap-btn { display: inline-flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); font-size: 12px; font-weight: 600; min-height: 38px; cursor: pointer; }
.ap-btn:hover { background: rgba(255,255,255,0.07); }
.ap-btn.active { border-color: rgba(124,92,255,0.45); }
.ap-btn-label { white-space: nowrap; }
.ap-badge { font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 999px; background: rgba(124,92,255,0.2); border: 1px solid rgba(124,92,255,0.45); color: #cbbcff; }
.ap-chev { transition: transform 140ms ease; opacity: 0.7; }
.ap-chev.open { transform: rotate(180deg); }
.ap-panel { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; width: 340px; max-width: 92vw; max-height: 62vh; display: flex; flex-direction: column; background: linear-gradient(180deg, #171c27 0%, #12161f 100%); border: 1px solid #1f2734; border-radius: 14px; box-shadow: 0 18px 48px rgba(0,0,0,0.55); padding: 10px; }
.ap-search-wrap { display: flex; align-items: center; gap: 7px; padding: 0 10px; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; background: rgba(255,255,255,0.03); color: var(--muted, #a1a7b3); }
.ap-search { flex: 1; background: transparent; border: none; outline: none; color: var(--text, #e7eaf0); font-size: 12.5px; height: 36px; }
.ap-x { background: transparent; border: none; color: var(--muted, #a1a7b3); cursor: pointer; display: inline-flex; }
.ap-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 8px 0 4px; }
.ap-count { font-size: 11px; color: var(--muted, #a1a7b3); }
.ap-mini { font-size: 11px; padding: 4px 8px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text, #e7eaf0); cursor: pointer; }
.ap-mini:hover { background: rgba(255,255,255,0.08); }
.ap-mini:disabled { opacity: 0.4; cursor: default; }
.ap-list { overflow-y: auto; display: flex; flex-direction: column; gap: 1px; flex: 1; min-height: 0; padding: 2px 0; }
.ap-item { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 9px; padding: 8px; border: none; background: transparent; border-radius: 9px; cursor: pointer; font-size: 12.5px; color: var(--text, #e7eaf0); text-align: left; width: 100%; }
.ap-item:hover { background: rgba(255,255,255,0.05); }
.ap-item.on { background: rgba(124,92,255,0.1); }
.ap-check { width: 16px; height: 16px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.25); display: inline-flex; align-items: center; justify-content: center; color: #fff; }
.ap-check.on { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; }
.ap-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.ap-kind { font-size: 10px; font-weight: 700; color: var(--muted, #a1a7b3); background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 999px; padding: 1px 7px; }
.ap-empty { padding: 14px; text-align: center; color: var(--muted, #a1a7b3); font-size: 12px; }
.ap-actions { display: flex; justify-content: space-between; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.07); }
.ap-clear, .ap-done { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text, #e7eaf0); min-height: 34px; }
.ap-clear:disabled { opacity: 0.4; cursor: default; }
.ap-done { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; color: #fff; font-weight: 700; }
@media (max-width: 560px) { .ap-panel { position: fixed; left: 10px; right: 10px; width: auto; top: auto; bottom: 10px; max-height: 72vh; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ap-styles')) {
  const style = document.createElement('style');
  style.id = 'ap-styles';
  style.textContent = AP_CSS;
  document.head.appendChild(style);
}
