// AccountPicker — busca de contas com seleção múltipla (para comparar). Local à página.
import React, { useEffect, useMemo, useState } from 'react';
import { useFinance } from '@apps/state';
import { Search, Check, X } from 'lucide-react';

export default function AccountPicker({ selected = [], onChange }) {
  const finance = useFinance();
  const [accounts, setAccounts] = useState([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

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

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? accounts.filter((a) => a.name.toLowerCase().includes(term)) : accounts;
  }, [accounts, q]);

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="ap-root">
      <button className="ap-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {selected.length === 0 ? 'Todas as contas' : `${selected.length} conta(s)`} ▾
      </button>
      {open && (
        <div className="ap-panel" role="dialog" aria-label="Selecionar contas">
          <div className="ap-search-wrap">
            <Search size={13} />
            <input className="ap-search" autoFocus placeholder="Buscar conta…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="ap-list">
            {list.length === 0 ? (
              <div className="ap-empty">Nenhuma conta.</div>
            ) : list.map((a) => (
              <label key={a.id} className="ap-item">
                <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                <span className="ap-name">{a.name}</span>
                <span className="ap-kind">{a.kind}</span>
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
.ap-panel { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; width: 280px; max-height: 320px; display: flex; flex-direction: column; background: #141a24; border: 1px solid #1f2734; border-radius: 12px; box-shadow: 0 16px 40px rgba(0,0,0,0.5); padding: 8px; }
.ap-search-wrap { display: flex; align-items: center; gap: 6px; padding: 0 8px; border: 1px solid rgba(255,255,255,0.12); border-radius: 9px; background: rgba(255,255,255,0.03); color: var(--muted, #a1a7b3); }
.ap-search { flex: 1; background: transparent; border: none; outline: none; color: var(--text, #e7eaf0); font-size: 12px; height: 34px; }
.ap-list { overflow-y: auto; margin: 8px 0; display: flex; flex-direction: column; }
.ap-item { display: grid; grid-template-columns: 18px 1fr auto; align-items: center; gap: 8px; padding: 6px 6px; border-radius: 8px; cursor: pointer; font-size: 12px; color: var(--text, #e7eaf0); }
.ap-item:hover { background: rgba(255,255,255,0.05); }
.ap-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-kind { font-size: 10px; color: var(--muted, #a1a7b3); }
.ap-empty { padding: 12px; text-align: center; color: var(--muted, #a1a7b3); font-size: 12px; }
.ap-actions { display: flex; justify-content: space-between; gap: 8px; }
.ap-clear, .ap-done { display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 8px; font-size: 12px; cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text, #e7eaf0); }
.ap-done { background: linear-gradient(135deg, #7c5cff, #6d4df2); border-color: transparent; color: #fff; font-weight: 700; }
`;
if (typeof document !== 'undefined' && !document.getElementById('ap-styles')) {
  const style = document.createElement('style');
  style.id = 'ap-styles';
  style.textContent = AP_CSS;
  document.head.appendChild(style);
}
