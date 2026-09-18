// STAGE 7 — Positions (engine-driven). Lista posições + add/edit + mark-to-market manual.
// Grava via `ds.positions.put` / `wealth.markPosition` (único writer). Proveniência de
// preço: `lastMarkPrice` fresco vs `avgPrice` (velho) — nunca inventa preço.

import { fmtMoney } from './currency';
import React, { useState } from 'react';
import { TrendingUp, Landmark, Home, Wallet, Plus } from 'lucide-react';

function emptyPos(accountId) {
  return { accountId, symbol: '', qty: 1, avgPrice: 0, lastMarkPrice: '', currency: 'USD', assetKind: 'equity' };
}

const ASSET_KINDS = [
  { key: 'equity', label: 'Variável', icon: TrendingUp, hint: 'Ações, cripto, ETFs' },
  { key: 'fixed', label: 'Renda fixa', icon: Landmark, hint: 'CDB, Tesouro, LCI' },
  { key: 'other', label: 'Outro ativo', icon: Home, hint: 'Imóvel, obra, bem, participação' },
];

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
      const isOther = editing.assetKind === 'other';
      await onSave({
        ...editing,
        qty: isOther ? 1 : Number(editing.qty) || 0,
        avgPrice: Number(editing.avgPrice) || 0,
        lastMarkPrice: editing.lastMarkPrice !== '' && editing.lastMarkPrice != null ? Number(editing.lastMarkPrice) : undefined,
      });
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
    const kind = editing.assetKind || 'equity';
    const isOther = kind === 'other';
    const curSym = '$'; // base única do app: USD (a navbar converte p/ BRL)
    return (
      <div className="ps-root">
        <div className="ps-form">
          <div className="ps-form-title"><Wallet size={16} /> {isNew ? 'Nova posição' : 'Editar posição'}</div>

          <div className="ps-kind" role="group" aria-label="Tipo de ativo">
            {ASSET_KINDS.map(({ key, label, icon: Icon, hint }) => (
              <button key={key} type="button" className={`ps-kind-btn${kind === key ? ' active' : ''}`} onClick={() => update('assetKind', key)} aria-pressed={kind === key}>
                <Icon size={16} /> <span>{label}</span>
                <small>{hint}</small>
              </button>
            ))}
          </div>

          <div className="ps-grid">
            <label className="ps-field"><span className="ps-label">Conta</span>
              <select className="ps-input" value={editing.accountId} onChange={(e) => update('accountId', e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="ps-field"><span className="ps-label">{isOther ? 'Nome do ativo' : 'Símbolo'}</span>
              <input className="ps-input" value={editing.symbol} onChange={(e) => update('symbol', isOther ? e.target.value : e.target.value.toUpperCase())} placeholder={isOther ? 'Ex.: Apartamento' : 'Ex.: PETR4'} />
            </label>

            {isOther ? (
              <>
                <label className="ps-field"><span className="ps-label">Valor investido (custo)</span>
                  <input className="ps-input" type="number" value={editing.avgPrice} onChange={(e) => update('avgPrice', e.target.value)} placeholder={`${curSym} 0,00`} />
                </label>
                <label className="ps-field"><span className="ps-label">Valor atual</span>
                  <input className="ps-input" type="number" value={editing.lastMarkPrice} onChange={(e) => update('lastMarkPrice', e.target.value)} placeholder={`${curSym} 0,00`} />
                </label>
              </>
            ) : (
              <>
                <label className="ps-field"><span className="ps-label">Qty</span>
                  <input className="ps-input" type="number" value={editing.qty} onChange={(e) => update('qty', e.target.value)} />
                </label>
                <label className="ps-field"><span className="ps-label">Preço médio</span>
                  <input className="ps-input" type="number" value={editing.avgPrice} onChange={(e) => update('avgPrice', e.target.value)} placeholder={`${curSym} 0,00`} />
                </label>
                <label className="ps-field"><span className="ps-label">Marca atual</span>
                  <input className="ps-input" type="number" value={editing.lastMarkPrice} onChange={(e) => update('lastMarkPrice', e.target.value)} placeholder={`${curSym} 0,00`} />
                </label>
              </>
            )}

            {kind === 'fixed' && (
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

          {isOther && (
            <p className="ps-hint">Para imóveis/bens/participações: informe o <b>valor investido</b> e o <b>valor atual</b>. A valorização/desvalorização aparece no PnL.</p>
          )}

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
            const pnl = (mark - (p.avgPrice ?? 0)) * p.qty;
            const pnlPct = p.avgPrice > 0 ? (mark - p.avgPrice) / p.avgPrice : 0;
            return (
              <div key={p.id} className="ps-item">
                <div className="ps-item-head">
                  <div className="ps-item-name">
                    {p.symbol}
                    <span className="ps-account">{(accounts.find((a) => a.id === p.accountId)?.name) || p.accountId}</span>
                    
                    {p.assetKind === 'fixed' && <span className="ps-tag">RF</span>}
                    {p.assetKind === 'other' && <span className="ps-tag" style={{ background: 'rgba(225,177,44,0.15)', color: 'var(--yellow,#e1b12c)' }}>OUTRO</span>}
                  </div>
                  <div className="ps-item-actions">
                    <button className="ps-btn ps-btn-sm" onClick={() => startEdit(p)}>Editar</button>
                    {onDelete && <button className="ps-btn ps-btn-sm ps-btn-danger" onClick={() => onDelete(p.id)}>Excluir</button>}
                  </div>
                </div>
                <div className="ps-item-grid">
                  <div className="ps-cell"><span className="ps-label">Qty</span><span>{p.qty}</span></div>
                  <div className="ps-cell"><span className="ps-label">Médio</span><span>{fmtMoney(p.avgPrice, 'USD')}</span></div>
                  <div className="ps-cell"><span className="ps-label">Marca</span><span>{p.lastMarkPrice != null ? fmtMoney(p.lastMarkPrice, 'USD') : 'velha'}</span></div>
                  <div className="ps-cell"><span className="ps-label">Valor</span><span>{fmtMoney(value, 'USD')}</span></div>
                  <div className="ps-cell"><span className="ps-label">PnL</span><span style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(pnl, 'USD')} <small>{(pnlPct * 100).toFixed(1)}%</small></span></div>
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
.ps-form-title { font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
.ps-kind { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.ps-kind-btn { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09); color: var(--muted, #a1a7b3); cursor: pointer; text-align: left; }
.ps-kind-btn span { font-size: 12px; font-weight: 700; color: var(--text, #e7eaf0); display: flex; align-items: center; gap: 6px; }
.ps-kind-btn small { font-size: 10px; color: var(--muted, #a1a7b3); }
.ps-kind-btn.active { background: rgba(124,92,255,0.12); border-color: rgba(124,92,255,0.45); }
.ps-hint { font-size: 12px; color: var(--muted, #a1a7b3); margin: 0; }
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
.ps-item-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 10px; }
.ps-cur { font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: rgba(52,152,219,0.15); color: var(--blue, #3498db); margin-left: 6px; }
.ps-tag { font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: rgba(124,92,255,0.15); color: var(--brand, #7c5cff); margin-left: 6px; }
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
