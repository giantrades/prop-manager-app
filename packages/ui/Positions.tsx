// STAGE 7 — Positions (engine-driven). Lista posições + add/edit + mark-to-market manual.
// Grava via `ds.positions.put` / `wealth.markPosition` (único writer). Proveniência de
// preço: `lastMarkPrice` fresco vs `avgPrice` (velho) — nunca inventa preço.

import { fmtMoney } from './currency';
import React, { useState } from 'react';


function emptyPos(accountId) {
  return { accountId, symbol: '', qty: 0, avgPrice: 0, lastMarkPrice: '' };
}

/**
 * @param {object} props
 * @param {Array<object>} [props.positions]
 * @param {Array<{id:string;name:string}>} [props.accounts]
 * @param {(position:object)=>Promise<void>|void} props.onSave
 * @param {(positionId:string, price:number)=>Promise<void>|void} [props.onMark]
 * @param {(positionId:string)=>Promise<void>|void} [props.onDelete]
 * @param {boolean} [props.loading]
 */
export default function Positions({ positions = [], accounts = [], onSave, onMark, onDelete, loading = false }) {
  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const startNew = () => { setEditing(emptyPos(accounts[0]?.id || '')); setIsNew(true); };
  const startEdit = (p) => { setEditing({ ...p, lastMarkPrice: p.lastMarkPrice || '' }); setIsNew(false); };
  const update = (k, v) => setEditing((e) => ({ ...e, [k]: v }));

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await onSave({ ...editing, qty: Number(editing.qty) || 0, avgPrice: Number(editing.avgPrice) || 0, lastMarkPrice: editing.lastMarkPrice ? Number(editing.lastMarkPrice) : undefined });
      setEditing(null);
      setIsNew(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ps-root ps-loading" role="status" aria-live="polite">
        <div className="ps-skeleton" /><div className="ps-skeleton" />
        <span className="ps-screen-reader">Carregando posições…</span>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="ps-root">
        <div className="ps-form">
          <div className="ps-form-title">{isNew ? 'Nova posição' : 'Editar posição'}</div>
          <div className="ps-grid">
            <label className="ps-field"><span className="ps-label">Conta</span>
              <select className="ps-input" value={editing.accountId} onChange={(e) => update('accountId', e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="ps-field"><span className="ps-label">Símbolo</span>
              <input className="ps-input" value={editing.symbol} onChange={(e) => update('symbol', e.target.value.toUpperCase())} />
            </label>
            <label className="ps-field"><span className="ps-label">Qty</span>
              <input className="ps-input" type="number" value={editing.qty} onChange={(e) => update('qty', e.target.value)} />
            </label>
            <label className="ps-field"><span className="ps-label">Preço médio</span>
              <input className="ps-input" type="number" value={editing.avgPrice} onChange={(e) => update('avgPrice', e.target.value)} />
            </label>
            <label className="ps-field"><span className="ps-label">Marca atual (mark)</span>
              <input className="ps-input" type="number" value={editing.lastMarkPrice} onChange={(e) => update('lastMarkPrice', e.target.value)} />
            </label>
            <label className="ps-field"><span className="ps-label">Moeda</span>
              <select className="ps-input" value={editing.currency || 'BRL'} onChange={(e) => update('currency', e.target.value)}>
                <option value="BRL">BRL</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="ps-field"><span className="ps-label">Tipo</span>
              <select className="ps-input" value={editing.assetKind || 'equity'} onChange={(e) => update('assetKind', e.target.value)}>
                <option value="equity">Variável (ação/cripto)</option>
                <option value="fixed">Renda fixa</option>
              </select>
            </label>
            {(editing.assetKind === 'fixed') && (
              <>
                <label className="ps-field"><span className="ps-label">Taxa a.a. (ex.: 0.12)</span>
                  <input className="ps-input" type="number" min="0" step="0.0001" value={editing.yieldRate ?? ''} onChange={(e) => update('yieldRate', e.target.value === '' ? undefined : Number(e.target.value))} />
                </label>
                <label className="ps-field"><span className="ps-label">Indexação</span>
                  <select className="ps-input" value={editing.yieldType || 'pre'} onChange={(e) => update('yieldType', e.target.value)}>
                    <option value="pre">Pré-fixado (accrual automático)</option>
                    <option value="pos">Pós-fixado (marco manual)</option>
                    <option value="ipca">IPCA+ (marco manual)</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="ps-actions">
            <button className="ps-btn ps-btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            <button className="ps-btn" onClick={() => { setEditing(null); setIsNew(false); }}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-root">
      <div className="ps-head">
        <h3 className="ps-title">Positions</h3>
        <button className="ps-btn ps-btn-primary" onClick={startNew}>+ Nova posição</button>
      </div>
      {positions.length === 0 ? (
        <div className="ps-empty" role="status">Nenhuma posição.</div>
      ) : (
        <div className="ps-list">
          {positions.map((p) => {
            const mark = p.lastMarkPrice != null ? p.lastMarkPrice : p.avgPrice;
            const value = (mark ?? 0) * p.qty;
            return (
              <div key={p.id} className="ps-item">
                <div className="ps-item-head">
                  <div className="ps-item-name">{p.symbol} <span className="ps-account">{(accounts.find((a) => a.id === p.accountId)?.name) || p.accountId}</span></div>
                  <div className="ps-item-actions">
                    <button className="ps-btn ps-btn-sm" onClick={() => startEdit(p)}>Editar</button>
                    {onDelete && <button className="ps-btn ps-btn-sm ps-btn-danger" onClick={() => onDelete(p.id)}>Excluir</button>}
                  </div>
                </div>
                <div className="ps-item-grid">
                  <div className="ps-cell"><span className="ps-label">Qty</span><span>{p.qty}</span></div>
                  <div className="ps-cell"><span className="ps-label">Médio</span><span>{fmtMoney(p.avgPrice)}</span></div>
                  <div className="ps-cell"><span className="ps-label">Marca</span><span>{p.lastMarkPrice != null ? fmtMoney(p.lastMarkPrice) : 'velha'}</span></div>
                  <div className="ps-cell"><span className="ps-label">Valor</span><span style={{ color: 'var(--green)' }}>{fmtMoney(value)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PS_CSS = `
.ps-root { display: flex; flex-direction: column; gap: 14px; }
.ps-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.ps-loading { gap: 8px; }
.ps-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: ps-pulse 1.4s ease-in-out infinite; }
.ps-form { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.ps-form-title { font-size: 14px; font-weight: 800; }
.ps-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.ps-field { display: flex; flex-direction: column; gap: 4px; }
.ps-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.ps-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 9px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 40px; }
.ps-head { display: flex; justify-content: space-between; align-items: center; }
.ps-title { font-size: 15px; font-weight: 800; margin: 0; }
.ps-actions { display: flex; gap: 10px; }
.ps-btn { padding: 9px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; }
.ps-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; font-weight: 700; }
.ps-btn-sm { padding: 5px 10px; min-height: 30px; font-size: 11px; border-radius: 8px; }
.ps-btn-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }
.ps-list { display: flex; flex-direction: column; gap: 10px; }
.ps-item { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.ps-item-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ps-item-name { font-size: 14px; font-weight: 700; }
.ps-account { font-size: 11px; color: var(--muted, #a1a7b3); margin-left: 6px; }
.ps-item-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; }
.ps-cell { display: flex; flex-direction: column; gap: 2px; }
.ps-cell span:last-child { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ps-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
@media (max-width: 719px) { .ps-grid { grid-template-columns: 1fr; } .ps-item-grid { grid-template-columns: repeat(2, 1fr); } }
@keyframes ps-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ps-styles')) {
  const style = document.createElement('style');
  style.id = 'ps-styles';
  style.textContent = PS_CSS;
  document.head.appendChild(style);
}
