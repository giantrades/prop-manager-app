// AccountPicker — busca + seleção múltipla de contas (para comparar no Trading).
// Pensado para muitas contas (20+): busca, "selecionar todas (filtradas)", contador
// e lista rolável ordenada por tipo/nome. Local à página (o pai controla o valor).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFinance } from '@apps/state';
import { Search, Check, X } from 'lucide-react';

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
    ? `Todas as contas${accounts.length ? ` (${accounts.length})` : ''}`
    : `${selected.length} de ${accounts.length} conta(s)`;

  return (
    <div className="ap-root" ref={rootRef}>
      <button className="ap-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
        {label} ▾
      </button>
      {open && (
        <div className="ap-panel" role="dialog" aria-label="Selecionar contas">
          <div className="ap-search-wrap">
            <Search size={13} />
            <input className="ap-search" autoFocus placeholder="Buscar conta…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conta" />
            {q && <button className="ap-x" onClick={() => setQ('')} aria-label="Limpar busca"><X size={12} /></button>}
          </div>
          <div className="ap-toolbar">
            <span className="ap-count">{selected.length} selecionada(s)</span>
            <button className="ap-mini" onClick={selectAllFiltered} disabled={list.length === 0}>Todas (filtradas)</button>
          </div>
          <div className="ap-list">
            {list.length === 0 ? (
              <div className="ap-empty">Nenhuma conta{q ? ' para esta busca' : ''}.</div>
            ) : list.map((a) => (
              <label key={a.id} className="ap-item">
                <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                <span className="ap-name">{a.name}</span>
                <span className="ap-kind">{KIND_LABEL[a.kind] || a.kind || ''}</span>
              </label>
            ))}
          </div>
          <div className="ap-actions">
            <button className="ap-clear" onClick={() => onChange([])}><X size={12} /> Limpar</button>
            <button className="ap-done" onClick={() => setOpen(false)}><Check size={12} /> Pronto</button>
          </div>
        </div>
      )}
    </div>
  );
}

const AP_CSS = `
.ap-root { position: relative; }
.ap-btn { padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); color: var(--text, #e7eaf0); font-size: 12px; min-height: 38px; cursor: pointer; }
.ap-panel { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; width: 320px; max-width: 92vw; max-height: 60vh; display: flex; flex-direction: column; background: #141a24; border: 1px solid #1f2734; border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,0.5); padding: 8px; }
.ap-search-wrap { display: flex; align-items: center; gap: 6px; padding: 0 8px; border: 1px solid rgba(255,255,255,0.12); border-radius: 9px; background: rgba(255,255,255,0.03); color: var(--muted, #a1a7b3); }
.ap-search { flex: 1; background: transparent; border: none; outline: none; color: var(--text, #e7eaf0); font-size: 12px; height: 34px; }
.ap-x { background: transparent; border: none; color: var(--muted, #a1a7b3); cursor: pointer; display: inline-flex; }
.ap-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
.ap-count { font-size: 11px; color: var(--muted, #a1a7b3); }
.ap-mini { font-size: 11px; padding: 4px 8px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text, #e7eaf0); cursor: pointer; }
.ap-mini:disabled { opacity: 0.4; cursor: default; }
.ap-list { overflow-y: auto; margin: 6px 0; display: flex; flex-direction: column; flex: 1; min-height: 0; }
.ap-item { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 8px; padding: 6px; border-radius: 8px; cursor: pointer; font-size: 12px; color: var(--text, #e7eaf0); }
.ap-item:hover { background: rgba(255,255,255,0.05); }
.ap-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-kind { font-size: 10px; color: var(--muted, #a1a7b3); }
.ap-empty { padding: 12px; text-align: center; color: var(--muted, #a1a7b3); font-size: 12px; }
.ap-actions { display: flex; justify-content: space-between; gap: 8px; }
.ap-clear, .ap-done { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text, #e7eaf0); }
.ap-done { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; color: #fff; font-weight: 700; }
@media (max-width: 560px) { .ap-panel { position: fixed; left: 10px; right: 10px; width: auto; top: auto; bottom: 10px; max-height: 70vh; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ap-styles')) {
  const style = document.createElement('style');
  style.id = 'ap-styles';
  style.textContent = AP_CSS;
  document.head.appendChild(style);
}
