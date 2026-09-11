// STAGE 7 — Payouts (engine-driven). Cria payout (gross + split por peso + fee%) e o
// aplica no ledger via `onCreate`. Usa `computePayoutSplitByWeight` (fórmula única do motor).
// Nenhuma fórmula nova.
//
// Fonte: DOCS/05_STAGE4_MONEY_OS/00-produto.md (Payout Center).

import React, { useState } from 'react';
import { computePayoutSplitByWeight } from '@apps/lib/db';

function fmtMoney(v, cur = '$') {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v < 0 ? '-' : ''}${Math.abs(v).toFixed(2)}`;
}

/**
 * @param {object} props
 * @param {Array<object>} [props.payouts]
 * @param {Array<{id:string;name:string}>} [props.accounts]
 * @param {(payout:object)=>Promise<void>|void} props.onCreate
 * @param {(payoutId:string)=>Promise<void>|void} [props.onDelete]
 * @param {boolean} [props.loading]
 */
export default function Payouts({ payouts = [], accounts = [], onCreate, onDelete, loading = false }) {
  const [creating, setCreating] = useState(false);
  const [gross, setGross] = useState('');
  const [feePct, setFeePct] = useState(0.2);
  const [method, setMethod] = useState('Wise');
  const [status, setStatus] = useState('Pending');
  const [weights, setWeights] = useState({});
  const [attachments, setAttachments] = useState({});
  const [saving, setSaving] = useState(false);

  const net = gross ? Number(gross) * (1 - Number(feePct)) : 0;

  const handleCreate = async () => {
    if (!gross || Number(gross) <= 0) return;
    setSaving(true);
    try {
      const selected = accounts.filter((a) => (weights[a.id] ?? 0) > 0);
      const accountIds = selected.length > 0 ? selected.map((a) => a.id) : (accounts[0] ? [accounts[0].id] : []);
      const weightMap = selected.length > 0
        ? Object.fromEntries(selected.map((a) => [a.id, weights[a.id]]))
        : { [accountIds[0]]: 1 };
      const splitByAccount = computePayoutSplitByWeight(Number(gross), Number(feePct), weightMap);
      const payout = {
        id: `payout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        accountIds,
        gross: Number(gross),
        fee: Number(gross) * Number(feePct),
        net: net,
        splitByAccount,
        status,
        method,
        attachments,
        date: new Date().toISOString(),
      };
      await onCreate(payout);
      setCreating(false);
      setGross('');
      setWeights({});
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-root py-loading" role="status" aria-live="polite">
        <div className="py-skeleton" /><div className="py-skeleton" />
        <span className="py-screen-reader">Carregando payouts…</span>
      </div>
    );
  }

  return (
    <div className="py-root">
      <div className="py-head">
        <h3 className="py-title">Payouts</h3>
        <button className="py-btn py-btn-primary" onClick={() => setCreating((c) => !c)}>{creating ? 'Cancelar' : '+ Novo payout'}</button>
      </div>

      {creating && (
        <div className="py-form">
          <div className="py-grid">
            <label className="py-field"><span className="py-label">Gross ($)</span>
              <input className="py-input" type="number" value={gross} onChange={(e) => setGross(e.target.value)} />
            </label>
            <label className="py-field"><span className="py-label">Fee %</span>
              <input className="py-input" type="number" step="0.01" value={feePct} onChange={(e) => setFeePct(Number(e.target.value))} />
            </label>
            <label className="py-field"><span className="py-label">Método</span>
              <input className="py-input" value={method} onChange={(e) => setMethod(e.target.value)} />
            </label>
            <label className="py-field"><span className="py-label">Status</span>
              <select className="py-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Paid">Paid</option>
              </select>
            </label>
          </div>

          <div className="py-split">
            <div className="py-split-title">Split por peso (contas prop)</div>
            {accounts.length === 0 && <div className="py-hint">Nenhuma conta — crie contas prop primeiro.</div>}
            {accounts.map((a) => (
              <div key={a.id} className="py-split-row">
                <span className="py-split-name">{a.name}</span>
                <input className="py-input py-split-input" type="number" placeholder="peso"
                  value={weights[a.id] || ''}
                  onChange={(e) => setWeights((w) => ({ ...w, [a.id]: Number(e.target.value) || 0 }))} />
              </div>
            ))}
          </div>

          <div className="py-preview">Net: <b>{fmtMoney(net)}</b> (gross {fmtMoney(Number(gross) || 0)} - fee {fmtMoney((Number(gross) || 0) * Number(feePct))})</div>

          <div className="py-split">
            <div className="py-split-title">Anexos (comprovante)</div>
            <input
              className="py-input"
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  setAttachments((a) => ({ ...a, [file.name]: { name: file.name, dataUrl: reader.result } }));
                };
                reader.readAsDataURL(file);
              }}
            />
            {Object.keys(attachments).length > 0 && (
              <div className="py-attach-list">
                {Object.keys(attachments).map((name) => (
                  <div key={name} className="py-attach-item">
                    <span>{name}</span>
                    <button className="py-btn py-btn-sm py-btn-danger" onClick={() => setAttachments((a) => { const n = { ...a }; delete n[name]; return n; })}>x</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="py-actions">
            <button className="py-btn py-btn-primary" onClick={handleCreate} disabled={saving || !gross}>{saving ? 'Aplicando…' : 'Criar e aplicar'}</button>
          </div>
        </div>
      )}

      {payouts.length === 0 ? (
        <div className="py-empty" role="status">Nenhum payout.</div>
      ) : (
        <div className="py-list">
          {payouts.map((p) => (
            <div key={p.id} className="py-item">
              <div className="py-item-head">
                <div className="py-item-title">Payout {p.id.slice(0, 12)} <span className="py-status">{p.status}</span></div>
                <div className="py-item-actions">
                  {onDelete && <button className="py-btn py-btn-sm py-btn-danger" onClick={() => onDelete(p.id)}>Excluir</button>}
                </div>
              </div>
              <div className="py-item-grid">
                <div className="py-cell"><span className="py-label">Gross</span><span>{fmtMoney(p.gross)}</span></div>
                <div className="py-cell"><span className="py-label">Fee</span><span>{fmtMoney(p.fee)}</span></div>
                <div className="py-cell"><span className="py-label">Net</span><span style={{ color: 'var(--green)' }}>{fmtMoney(p.net)}</span></div>
                <div className="py-cell"><span className="py-label">Método</span><span>{p.method}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PY_CSS = `
.py-root { display: flex; flex-direction: column; gap: 14px; }
.py-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.py-loading { gap: 8px; }
.py-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: py-pulse 1.4s ease-in-out infinite; }

.py-head { display: flex; justify-content: space-between; align-items: center; }
.py-title { font-size: 15px; font-weight: 800; margin: 0; }
.py-btn { padding: 9px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; }
.py-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; font-weight: 700; }
.py-btn-sm { padding: 5px 10px; min-height: 30px; font-size: 11px; border-radius: 8px; }
.py-btn-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }

.py-form { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.py-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.py-field { display: flex; flex-direction: column; gap: 4px; }
.py-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.py-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 9px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 40px; }
.py-split { display: flex; flex-direction: column; gap: 8px; }
.py-split-title { font-size: 12px; font-weight: 700; }
.py-split-row { display: flex; align-items: center; gap: 10px; }
.py-split-name { flex: 1; font-size: 13px; }
.py-split-input { width: 90px; }
.py-hint { font-size: 12px; color: var(--muted, #a1a7b3); }
.py-attach-list { display: flex; flex-direction: column; gap: 6px; }
.py-attach-item { display: flex; align-items: center; justify-content: space-between; font-size: 12px; padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); }
.py-preview { font-size: 13px; }
.py-actions { display: flex; gap: 10px; }

.py-list { display: flex; flex-direction: column; gap: 10px; }
.py-item { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.py-item-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.py-item-title { font-size: 14px; font-weight: 700; }
.py-status { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); margin-left: 6px; }
.py-item-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px; }
.py-cell { display: flex; flex-direction: column; gap: 2px; }
.py-cell span:last-child { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }

.py-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

@media (max-width: 719px) { .py-grid { grid-template-columns: 1fr; } .py-item-grid { grid-template-columns: repeat(2, 1fr); } }
@keyframes py-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('py-styles')) {
  const style = document.createElement('style');
  style.id = 'py-styles';
  style.textContent = PY_CSS;
  document.head.appendChild(style);
}
