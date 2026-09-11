// STAGE 7 — Accounts (engine-driven). Editor de Account + PropExtension. Grava via
// `ds.accounts.put` + `ds.propExtensions.put` (único writer). Nenhuma fórmula nova.
//
// Fonte: DOCS/02_STAGE1_DOMAIN/00-DOMAIN_MODEL.md + DOCS/04_STAGE3_TRADING_OS (Prop Engine 2.0).

import React, { useState } from 'react';
import { FIRM_TEMPLATES, applyTemplate, templateNeedsCheck } from '@apps/lib/db';

const KINDS = ['prop', 'bank', 'wallet', 'investment', 'crypto', 'cash'];
const PHASES = ['challenge1', 'challenge2', 'funded', 'paused', 'failed'];
const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'];

function emptyAccount() {
  return {
    kind: 'wallet', name: '', currency: 'USD', institution: '', hidden: false, defaultWeight: 1,
  };
}

function emptyProp() {
  return {
    nominalSize: 100000, challengeCost: 0, phase: 'challenge1', target: 100000,
    maxDD: 0.1, trailingDD: 0.1, dailyDD: 0.05, consistencyPct: 0.4, minDays: 1,
    payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Rise' },
    profitSplit: 0.8, payoutFrequency: 'monthly',
  };
}

/**
 * @param {object} props
 * @param {Array<object>} [props.accounts] contas (com `id`).
 * @param {Record<string,object>} [props.props] accountId -> PropExtension.
 * @param {(account:object, prop:object|null)=>Promise<void>|void} props.onSave
 * @param {(accountId:string)=>Promise<void>|void} [props.onDelete]
 * @param {(accountId:string)=>void} [props.onSelect] — abrir dashboard da conta (F1)
 * @param {boolean} [props.loading]
 */
export default function Accounts({ accounts = [], props = {}, onSave, onDelete, onSelect, loading = false }) {
  const [editing, setEditing] = useState(null); // { account, prop } | null
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templateId, setTemplateId] = useState('');

  // A2 — preset da firm preenche a conta nova (editável depois).
  const applyFirmTemplate = (id) => {
    setTemplateId(id);
    if (!id) return;
    const applied = applyTemplate(editing?.account?.name ?? '', id);
    if (!applied) return;
    setEditing((e) => ({
      account: { ...e.account, ...applied.accountPatch },
      prop: { ...(e.prop || {}), ...applied.prop },
    }));
  };

  const startNew = () => {
    setEditing({ account: emptyAccount(), prop: null });
    setIsNew(true);
    setTemplateId('');
  };
  const startEdit = (a) => {
    setEditing({ account: a, prop: props[a.id] ?? null });
    setIsNew(false);
  };

  const update = (k, v) => setEditing((e) => ({ ...e, account: { ...e.account, [k]: v } }));
  const updateProp = (k, v) => setEditing((e) => ({ ...e, prop: { ...(e.prop || emptyProp()), [k]: v } }));

  const handleSave = async () => {
    if (!editing?.account?.name) return;
    setSaving(true);
    try {
      await onSave(editing.account, editing.account.kind === 'prop' ? editing.prop : null);
      setEditing(null);
      setIsNew(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ac2-root ac2-loading" role="status" aria-live="polite">
        <div className="ac2-skeleton" /><div className="ac2-skeleton" />
        <span className="ac2-screen-reader">Carregando contas…</span>
      </div>
    );
  }

  if (editing) {
    const { account, prop } = editing;
    const isProp = account.kind === 'prop';
    return (
      <div className="ac2-root">
        <div className="ac2-form">
          <div className="ac2-form-title">{isNew ? 'Nova conta' : 'Editar conta'}</div>
          {isNew && (
            <div className="ac2-template">
              <label className="ac2-field"><span className="ac2-label">Template da firm (opcional)</span>
                <select className="ac2-input" value={templateId} onChange={(e) => applyFirmTemplate(e.target.value)} aria-label="Template da firm">
                  <option value="">Sem template (manual)</option>
                  {FIRM_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>{t.firm} — {t.plan}</option>
                  ))}
                </select>
              </label>
              {templateId && (() => {
                const t = FIRM_TEMPLATES.find((x) => x.id === templateId);
                return t && templateNeedsCheck(t) ? (
                  <div className="ac2-warn" role="note">⚠️ Template não verificado — confira o regulamento atual da {t.firm} antes de operar.</div>
                ) : null;
              })()}
            </div>
          )}
          <div className="ac2-grid">
            <label className="ac2-field"><span className="ac2-label">Nome</span>
              <input className="ac2-input" value={account.name} onChange={(e) => update('name', e.target.value)} />
            </label>
            <label className="ac2-field"><span className="ac2-label">Tipo (kind)</span>
              <select className="ac2-input" value={account.kind} onChange={(e) => update('kind', e.target.value)}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="ac2-field"><span className="ac2-label">Moeda</span>
              <input className="ac2-input" value={account.currency} onChange={(e) => update('currency', e.target.value)} />
            </label>
            <label className="ac2-field"><span className="ac2-label">Instituição</span>
              <input className="ac2-input" value={account.institution || ''} onChange={(e) => update('institution', e.target.value)} />
            </label>
            <label className="ac2-field"><span className="ac2-label">ID na plataforma (Quantower/cTrader)</span>
              <input className="ac2-input" value={account.platformAccountId || ''} onChange={(e) => update('platformAccountId', e.target.value || undefined)} placeholder="ex.: ct_123" />
            </label>
            <label className="ac2-field"><span className="ac2-label">Plataforma</span>
              <select className="ac2-input" value={account.platformName || ''} onChange={(e) => update('platformName', e.target.value || undefined)}>
                <option value="">—</option>
                <option value="quantower">Quantower</option>
                <option value="ctrader">cTrader</option>
              </select>
            </label>
            <label className="ac2-field"><span className="ac2-label">Peso default (rateio)</span>
              <input className="ac2-input" type="number" value={account.defaultWeight} onChange={(e) => update('defaultWeight', Number(e.target.value) || 1)} />
            </label>
            <label className="ac2-check"><input type="checkbox" checked={account.hidden} onChange={(e) => update('hidden', e.target.checked)} /> Oculta</label>
          </div>

          {isProp && prop && (
            <div className="ac2-prop">
              <div className="ac2-prop-title">Prop Extension</div>
              <div className="ac2-grid">
                <label className="ac2-field"><span className="ac2-label">Nominal</span>
                  <input className="ac2-input" type="number" value={prop.nominalSize} onChange={(e) => updateProp('nominalSize', Number(e.target.value))} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Custo challenge</span>
                  <input className="ac2-input" type="number" value={prop.challengeCost} onChange={(e) => updateProp('challengeCost', Number(e.target.value))} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Fase</span>
                  <select className="ac2-input" value={prop.phase} onChange={(e) => updateProp('phase', e.target.value)}>
                    {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label className="ac2-field"><span className="ac2-label">Target</span>
                  <input className="ac2-input" type="number" value={prop.target} onChange={(e) => updateProp('target', Number(e.target.value))} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Max DD</span>
                  <input className="ac2-input" type="number" step="0.01" value={prop.maxDD} onChange={(e) => updateProp('maxDD', Number(e.target.value))} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Trailing DD</span>
                  <input className="ac2-input" type="number" step="0.01" value={prop.trailingDD} onChange={(e) => updateProp('trailingDD', Number(e.target.value))} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Daily DD</span>
                  <input className="ac2-input" type="number" step="0.01" value={prop.dailyDD} onChange={(e) => updateProp('dailyDD', Number(e.target.value))} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Consistency %</span>
                  <input className="ac2-input" type="number" step="0.01" value={prop.consistencyPct} onChange={(e) => updateProp('consistencyPct', Number(e.target.value))} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Min days</span>
                  <input className="ac2-input" type="number" value={prop.minDays} onChange={(e) => updateProp('minDays', Number(e.target.value))} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Fee %</span>
                  <input className="ac2-input" type="number" step="0.01" value={prop.payoutRules?.feePct} onChange={(e) => updateProp('payoutRules', { ...prop.payoutRules, feePct: Number(e.target.value) })} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Profit split</span>
                  <input className="ac2-input" type="number" step="0.01" value={prop.profitSplit} onChange={(e) => updateProp('profitSplit', Number(e.target.value))} />
                </label>
                <label className="ac2-field"><span className="ac2-label">Frequência payout</span>
                  <select className="ac2-input" value={prop.payoutFrequency} onChange={(e) => updateProp('payoutFrequency', e.target.value)}>
                    {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </label>
              </div>
            </div>
          )}

          <div className="ac2-actions">
            <button className="ac2-btn ac2-btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            <button className="ac2-btn" onClick={() => { setEditing(null); setIsNew(false); }}>Cancelar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ac2-root">
      <div className="ac2-head">
        <h3 className="ac2-title">Accounts</h3>
        <button className="ac2-btn ac2-btn-primary" onClick={startNew}>+ Nova conta</button>
      </div>
      {accounts.length === 0 ? (
        <div className="ac2-empty" role="status">Nenhuma conta.</div>
      ) : (
        <div className="ac2-list">
          {accounts.map((a) => (
            <div key={a.id} className="ac2-item">
              <div className="ac2-item-head">
                <div className="ac2-item-name">{a.name} <span className="ac2-kind">{a.kind}</span></div>
                <div className="ac2-item-actions">
                  {onSelect && <button className="ac2-btn ac2-btn-sm ac2-btn-primary" onClick={() => onSelect(a.id)}>Dashboard</button>}
                  <button className="ac2-btn ac2-btn-sm" onClick={() => startEdit(a)}>Editar</button>
                  {onDelete && <button className="ac2-btn ac2-btn-sm ac2-btn-danger" onClick={() => onDelete(a.id)}>Excluir</button>}
                </div>
              </div>
              <div className="ac2-item-meta">{a.currency} · {a.institution || '—'}{a.hidden ? ' · oculta' : ''}</div>
              {props[a.id] && <div className="ac2-item-prop">Nominal {props[a.id].nominalSize} · fase {props[a.id].phase} · target {props[a.id].target}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const AC2_CSS = `
.ac2-root { display: flex; flex-direction: column; gap: 14px; }
.ac2-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.ac2-loading { gap: 8px; }
.ac2-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: ac2-pulse 1.4s ease-in-out infinite; }

.ac2-form, .ac2-prop { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.ac2-form-title, .ac2-prop-title { font-size: 14px; font-weight: 800; }
.ac2-template { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 10px; background: rgba(52,152,219,0.07); border: 1px solid rgba(52,152,219,0.25); }
.ac2-warn { font-size: 12px; color: var(--yellow, #e1b12c); }
.ac2-prop { background: rgba(124,92,255,0.05); border-color: rgba(124,92,255,0.2); }
.ac2-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.ac2-field { display: flex; flex-direction: column; gap: 4px; }
.ac2-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.ac2-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 9px 12px; color: var(--text, #e7eaf0); font-size: 13px; min-height: 40px; }
.ac2-check { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted, #a1a7b3); }

.ac2-head { display: flex; justify-content: space-between; align-items: center; }
.ac2-title { font-size: 15px; font-weight: 800; margin: 0; }
.ac2-actions { display: flex; gap: 10px; }
.ac2-btn { padding: 9px 16px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 40px; }
.ac2-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; font-weight: 700; }
.ac2-btn-sm { padding: 5px 10px; min-height: 30px; font-size: 11px; border-radius: 8px; }
.ac2-btn-danger { color: var(--red, #e74c3c); border-color: rgba(231,76,60,0.3); }

.ac2-list { display: flex; flex-direction: column; gap: 10px; }
.ac2-item { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.ac2-item-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.ac2-item-name { font-size: 14px; font-weight: 700; }
.ac2-kind { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(124,92,255,0.15); color: var(--brand, #7c5cff); margin-left: 6px; text-transform: capitalize; }
.ac2-item-meta { font-size: 12px; color: var(--muted, #a1a7b3); margin-top: 6px; }
.ac2-item-prop { font-size: 11px; color: var(--muted, #a1a7b3); margin-top: 4px; }

.ac2-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

@media (max-width: 719px) { .ac2-grid { grid-template-columns: 1fr; } }
@keyframes ac2-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ac2-styles')) {
  const style = document.createElement('style');
  style.id = 'ac2-styles';
  style.textContent = AC2_CSS;
  document.head.appendChild(style);
}
