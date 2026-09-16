// STAGE 7 — TradeForm (novo, engine-driven). Form de trade em steps (Info → Contas →
// Execuções → Review) + Quick Entry <30s + Position Size Calc. NÃO grava sozinho:
// entrega um `Trade` via `onSubmit`; o container persiste via `DataChainEngine.syncTrade`.
//
// Regra dura: nenhuma fórmula nova. Preview de PnL/R usa `tradePnl`/`calcR`
// (02-FINANCIAL_FORMULAS.md) importadas do motor.
//
// Fonte: DOCS/04_STAGE3_TRADING_OS/00-produto.md (Journal) + 01-tasks.md (T3.5).

import { fmtMoney } from './currency';
import React, { useMemo, useState } from 'react';
import { tradePnl, calcR, vwapOfExecutions } from '@apps/lib/db';
import NotesEditor from './NotesEditor';


/**
 * @param {object} props
 * @param {object} [props.trade] trade existente (edit) ou null (novo).
 * @param {Array<{id:string;name:string;kind:string;currency:string}>} [props.accounts]
 * @param {Array<{id:string;name?:string}>} [props.strategies]
 * @param {(trade:object)=>Promise<void>|void} props.onSubmit
 * @param {()=>void} [props.onCancel]
 */
export default function TradeForm({ trade = null, accounts = [], strategies = [], onSubmit, onCancel }) {
  const [step, setStep] = useState(0);
  const [quick, setQuick] = useState(!trade);
  const [form, setForm] = useState(() => ({
    id: trade?.id ?? `trade-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    symbol: trade?.symbol ?? '',
    direction: trade?.direction ?? 'long',
    qty: trade?.qty ?? 1,
    entryPrice: trade?.entryPrice ?? '',
    exitPrice: trade?.exitPrice ?? '',
    entryDatetime: trade?.entryDatetime ?? new Date().toISOString().slice(0, 16),
    exitDatetime: trade?.exitDatetime ?? '',
    commission: trade?.commission ?? 0,
    fees: trade?.fees ?? 0,
    swap: trade?.swap ?? 0,
    rebate: trade?.rebate ?? 0,
    multiplier: trade?.multiplier ?? 1,
    stopPrice: trade?.stopPrice ?? '',
    strategyId: trade?.strategyId ?? '',
    strategyVersion: trade?.strategyVersion ?? '',
    accountId: trade?.accountId ?? accounts[0]?.id ?? '',
    accounts: trade?.accounts ?? [],
    source: trade?.source ?? 'manual',
    notes: trade?.notes ?? '',
    tagsText: ((trade?.tags ?? []).join(', ')),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [executions, setExecutions] = useState(trade?.executions ?? []);
  const [fill, setFill] = useState({ side: 'entry', price: '', quantity: '' });
  const [newStrategyName, setNewStrategyName] = useState('');

  // Position Size Calc: riskAmount / (|entry-stop| * qty * multiplier).
  const [posSize, setPosSize] = useState({ riskAmount: 100 });

  const preview = useMemo(() => {
    const draft = {
      ...form,
      entryPrice: Number(form.entryPrice) || 0,
      exitPrice: form.exitPrice ? Number(form.exitPrice) : undefined,
      qty: Number(form.qty) || 0,
      multiplier: Number(form.multiplier) || 1,
      commission: Number(form.commission) || 0,
      fees: Number(form.fees) || 0,
      swap: Number(form.swap) || 0,
      stopPrice: form.stopPrice ? Number(form.stopPrice) : undefined,
    };
    if (draft.exitPrice == null) return { pnl: null, r: null };
    return {
      pnl: tradePnl(draft as any),
      r: calcR(draft as any),
    };
  }, [form]);

  const suggestedQty = useMemo(() => {
    const entry = Number(form.entryPrice);
    const stop = form.stopPrice ? Number(form.stopPrice) : null;
    const mult = Number(form.multiplier) || 1;
    if (entry > 0 && stop != null && entry !== stop) {
      const risk = Math.abs(entry - stop) * mult;
      if (risk > 0) return Math.round((Number(posSize.riskAmount) / risk) * 100) / 100;
    }
    return null;
  }, [form.entryPrice, form.stopPrice, form.multiplier, posSize.riskAmount]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addFill = () => {
    const price = Number(fill.price);
    const quantity = Number(fill.quantity);
    if (!price || !quantity) return;
    setExecutions((xs) => [...xs, { side: fill.side, price, quantity, timestamp: new Date().toISOString() }]);
    setFill({ side: 'entry', price: '', quantity: '' });
  };
  const removeFill = (i) => setExecutions((xs) => xs.filter((_, idx) => idx !== i));
  const entryVwap = vwapOfExecutions(executions.filter((x) => x.side === 'entry'));
  const exitVwap = vwapOfExecutions(executions.filter((x) => x.side === 'exit'));
  const applyVwap = () => {
    if (entryVwap != null) set('entryPrice', entryVwap);
    if (exitVwap != null) set('exitPrice', exitVwap);
  };

  const handleQuickSubmit = async () => {
    if (!form.symbol || !form.entryPrice) {
      setError('Preencha símbolo e preço de entrada.');
      return;
    }
    await doSubmit();
  };

  const doSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const strategyId = form.strategyId === '__new__'
        ? newStrategyName.trim() || undefined
        : form.strategyId || undefined;
      // J12 — tags livres: minúsculas, sem espaços, sem duplicadas.
      const tags = [...new Set(
        String(form.tagsText || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      )];
      const { tagsText: _tagsText, ...rest } = form;
      const tradePayload = {
        ...rest,
        tags,
        qty: Number(form.qty) || 0,
        entryPrice: Number(form.entryPrice) || 0,
        exitPrice: form.exitPrice ? Number(form.exitPrice) : undefined,
        commission: Number(form.commission) || 0,
        fees: Number(form.fees) || 0,
        swap: Number(form.swap) || 0,
        rebate: Number(form.rebate) || 0,
        multiplier: Number(form.multiplier) || 1,
        stopPrice: form.stopPrice ? Number(form.stopPrice) : undefined,
        strategyId,
        strategyVersion: form.strategyVersion?.trim() || undefined,
        accountId: form.accountId || undefined,
        executions: executions.length > 0 ? executions : undefined,
        resultNet: preview.pnl != null ? Number(preview.pnl.toFixed(2)) : 0,
        resultR: preview.r != null ? Number(preview.r.toFixed(4)) : null,
      };
      await onSubmit(tradePayload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[trade] falha ao salvar', err);
      setError('Falha ao salvar trade.');
    } finally {
      setSaving(false);
    }
  };

  const STEPS = ['Info', 'Contas', 'Execuções', 'Review'];

  return (
    <div className="tf-root">
      {/* Quick Entry */}
      {quick && (
        <div className="tf-quick">
          <div className="tf-quick-title">Quick Entry <span className="tf-quick-badge">&lt;30s</span></div>
          <div className="tf-quick-grid">
            <label className="tf-field"><span className="tf-label">Símbolo</span>
              <input className="tf-input" value={form.symbol} onChange={(e) => set('symbol', e.target.value.toUpperCase())} placeholder="EURUSD" />
            </label>
            <label className="tf-field"><span className="tf-label">Direção</span>
              <select className="tf-input" value={form.direction} onChange={(e) => set('direction', e.target.value)}>
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </label>
            <label className="tf-field"><span className="tf-label">Qty</span>
              <input className="tf-input" type="number" value={form.qty} onChange={(e) => set('qty', e.target.value)} />
            </label>
            <label className="tf-field"><span className="tf-label">Entrada</span>
              <input className="tf-input" type="number" value={form.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} placeholder="1.0850" />
            </label>
            <label className="tf-field"><span className="tf-label">Saída</span>
              <input className="tf-input" type="number" value={form.exitPrice} onChange={(e) => set('exitPrice', e.target.value)} placeholder="1.0900" />
            </label>
            <label className="tf-field"><span className="tf-label">Stop</span>
              <input className="tf-input" type="number" value={form.stopPrice} onChange={(e) => set('stopPrice', e.target.value)} placeholder="1.0800" />
            </label>
          </div>
          <div className="tf-quick-preview">
            <span>PnL: <b style={{ color: (preview.pnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(preview.pnl)}</b></span>
            <span>R: <b>{preview.r != null ? fmtMoney(preview.r) : 'n/a'}</b></span>
          </div>
          <div className="tf-actions">
            <button className="tf-btn tf-btn-primary" onClick={handleQuickSubmit} disabled={saving}>{saving ? 'Salvando…' : 'Salvar (Quick)'}</button>
            <button className="tf-btn" onClick={() => setQuick(false)}>Abrir completo</button>
          </div>
        </div>
      )}

      {/* Form completo em steps */}
      {!quick && (
        <>
          <div className="tf-steps">
            {STEPS.map((s, i) => (
              <button key={s} className={`tf-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`} onClick={() => setStep(i)}>
                <span className="tf-step-num">{i + 1}</span> {s}
              </button>
            ))}
          </div>

          {step === 0 && (
            <div className="tf-step-body">
              <div className="tf-grid2">
                <label className="tf-field"><span className="tf-label">Símbolo</span>
                  <input className="tf-input" value={form.symbol} onChange={(e) => set('symbol', e.target.value.toUpperCase())} />
                </label>
                <label className="tf-field"><span className="tf-label">Direção</span>
                  <select className="tf-input" value={form.direction} onChange={(e) => set('direction', e.target.value)}>
                    <option value="long">Long</option><option value="short">Short</option>
                  </select>
                </label>
                <label className="tf-field"><span className="tf-label">Qty</span>
                  <input className="tf-input" type="number" value={form.qty} onChange={(e) => set('qty', e.target.value)} />
                </label>
                <label className="tf-field"><span className="tf-label">Multiplier (contract size)</span>
                  <input className="tf-input" type="number" value={form.multiplier} onChange={(e) => set('multiplier', e.target.value)} />
                </label>
                <label className="tf-field"><span className="tf-label">Entrada</span>
                  <input className="tf-input" type="number" value={form.entryPrice} onChange={(e) => set('entryPrice', e.target.value)} />
                </label>
                <label className="tf-field"><span className="tf-label">Saída</span>
                  <input className="tf-input" type="number" value={form.exitPrice} onChange={(e) => set('exitPrice', e.target.value)} />
                </label>
                <label className="tf-field"><span className="tf-label">Stop (p/ R)</span>
                  <input className="tf-input" type="number" value={form.stopPrice} onChange={(e) => set('stopPrice', e.target.value)} />
                </label>
                <label className="tf-field"><span className="tf-label">Estratégia</span>
                  <select className="tf-input" value={form.strategyId} onChange={(e) => set('strategyId', e.target.value)}>
                    <option value="">—</option>
                    {strategies.map((s) => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
                    <option value="__new__">＋ Nova estratégia…</option>
                  </select>
                </label>
                <label className="tf-field"><span className="tf-label">Versão do playbook</span>
                  <input className="tf-input" placeholder="ex.: v2" value={form.strategyVersion} onChange={(e) => set('strategyVersion', e.target.value)} />
                </label>
                {form.strategyId === '__new__' && (
                  <label className="tf-field"><span className="tf-label">Nome da nova estratégia</span>
                    <input className="tf-input" value={newStrategyName} onChange={(e) => setNewStrategyName(e.target.value)} placeholder="ex.: rompimento-ny-am" />
                  </label>
                )}
              </div>
              <div className="tf-position-size">
                <div className="tf-ps-title">Position Size Calc</div>
                <div className="tf-ps-grid">
                  <label className="tf-field"><span className="tf-label">Risco ($)</span>
                    <input className="tf-input" type="number" value={posSize.riskAmount} onChange={(e) => setPosSize({ riskAmount: Number(e.target.value) })} />
                  </label>
                  <div className="tf-ps-result">Qty sugerida: <b>{suggestedQty ?? '—'}</b></div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="tf-step-body">
              <div className="tf-accounts">
                <label className="tf-field"><span className="tf-label">Conta principal</span>
                  <select className="tf-input" value={form.accountId} onChange={(e) => set('accountId', e.target.value)}>
                    <option value="">—</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
                  </select>
                </label>
                <div className="tf-hint">Rateio por peso (opcional): informe pesos por conta se o trade for multi-conta.</div>
                {accounts.length > 0 && (
                  <div className="tf-split">
                    {accounts.map((a) => {
                      const w = form.accounts.find((x) => x.accountId === a.id)?.weight ?? 0;
                      return (
                        <div key={a.id} className="tf-split-row">
                          <span className="tf-split-name">{a.name}</span>
                          <input className="tf-input tf-split-input" type="number" placeholder="peso" value={w || ''}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              set('accounts', form.accounts.filter((x) => x.accountId !== a.id).concat({ accountId: a.id, weight: val }));
                            }} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="tf-step-body">
              <div className="tf-grid2">
                <label className="tf-field"><span className="tf-label">Comissão</span>
                  <input className="tf-input" type="number" value={form.commission} onChange={(e) => set('commission', e.target.value)} />
                </label>
                <label className="tf-field"><span className="tf-label">Fees</span>
                  <input className="tf-input" type="number" value={form.fees} onChange={(e) => set('fees', e.target.value)} />
                </label>
                <label className="tf-field"><span className="tf-label">Swap</span>
                  <input className="tf-input" type="number" value={form.swap} onChange={(e) => set('swap', e.target.value)} />
                </label>
                <label className="tf-field"><span className="tf-label">Rebate</span>
                  <input className="tf-input" type="number" value={form.rebate} onChange={(e) => set('rebate', e.target.value)} />
                </label>
              </div>

              <div className="tf-executions">
                <div className="tf-ps-title">Execuções (fills)</div>
                <div className="tf-exec-row">
                  <select className="tf-input tf-exec-select" value={fill.side} onChange={(e) => setFill({ ...fill, side: e.target.value })}>
                    <option value="entry">Entry</option>
                    <option value="exit">Exit</option>
                  </select>
                  <input className="tf-input" type="number" placeholder="preço" value={fill.price} onChange={(e) => setFill({ ...fill, price: e.target.value })} />
                  <input className="tf-input" type="number" placeholder="qty" value={fill.quantity} onChange={(e) => setFill({ ...fill, quantity: e.target.value })} />
                  <button className="tf-btn" onClick={addFill}>+ Add</button>
                </div>
                {executions.length > 0 && (
                  <div className="tf-exec-list">
                    {executions.map((x, i) => (
                      <div key={i} className="tf-exec-item">
                        <span className={`tf-exec-side tf-${x.side}`}>{x.side}</span>
                        <span>{x.price}</span>
                        <span>{x.quantity}</span>
                        <button className="tf-btn tf-btn-sm" onClick={() => removeFill(i)}>x</button>
                      </div>
                    ))}
                    <div className="tf-exec-vwap">
                      <span>VWAP entry: <b>{entryVwap != null ? fmtMoney(entryVwap) : '—'}</b> · exit: <b>{exitVwap != null ? fmtMoney(exitVwap) : '—'}</b></span>
                      <button className="tf-btn tf-btn-sm" onClick={applyVwap}>Aplicar VWAP</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="tf-step-body">
              <div className="tf-review">
                <div className="tf-review-row"><span>Símbolo</span><b>{form.symbol}</b></div>
                <div className="tf-review-row"><span>Direção / Qty</span><b>{form.direction} · {form.qty}</b></div>
                <div className="tf-review-row"><span>Entrada / Saída</span><b>{form.entryPrice} → {form.exitPrice || '—'}</b></div>
                <div className="tf-review-row"><span>Stop</span><b>{form.stopPrice || '—'}</b></div>
                <div className="tf-review-row"><span>PnL (net)</span><b style={{ color: (preview.pnl ?? 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(preview.pnl)}</b></div>
                <div className="tf-review-row"><span>R</span><b>{preview.r != null ? fmtMoney(preview.r) : 'n/a (sem stop)'}</b></div>
              </div>
              <label className="tf-field"><span className="tf-label">Tags (separadas por vírgula)</span>
                <input className="tf-input" value={form.tagsText} onChange={(e) => set('tagsText', e.target.value)} placeholder="ex.: rompimento, london, erro-entrada" aria-label="Tags do trade" />
              </label>
              <label className="tf-field"><span className="tf-label">Notas / review pós-trade</span>
                <NotesEditor value={form.notes} onChange={(md) => set('notes', md)} ariaLabel="Notas do trade" />
              </label>
            </div>
          )}

          <div className="tf-actions">
            <button className="tf-btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Voltar</button>
            {step < STEPS.length - 1 ? (
              <button className="tf-btn tf-btn-primary" onClick={() => setStep((s) => s + 1)}>Avançar</button>
            ) : (
              <button className="tf-btn tf-btn-primary" onClick={doSubmit} disabled={saving}>{saving ? 'Salvando…' : 'Salvar trade'}</button>
            )}
            {onCancel && <button className="tf-btn tf-btn-ghost" onClick={onCancel}>Cancelar</button>}
          </div>
        </>
      )}

      {error && <div className="tf-error" role="alert">{error}</div>}
    </div>
  );
}

const TF_CSS = `
.tf-root { display: flex; flex-direction: column; gap: 16px; }
.tf-quick { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.tf-quick-title { font-size: 14px; font-weight: 800; }
.tf-quick-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(124,92,255,0.18); color: var(--brand, #7c5cff); font-weight: 700; margin-left: 8px; }
.tf-quick-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.tf-quick-preview { display: flex; gap: 16px; font-size: 13px; color: var(--muted, #a1a7b3); }

.tf-steps { display: flex; gap: 6px; flex-wrap: wrap; }
.tf-step { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: var(--muted, #a1a7b3); font-size: 12px; cursor: pointer; }
.tf-step.active { background: rgba(124,92,255,0.14); border-color: rgba(124,92,255,0.4); color: var(--text, #e7eaf0); font-weight: 700; }
.tf-step.done { color: var(--green, #2ecc71); }
.tf-step-num { font-weight: 800; }

.tf-step-body { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; }
.tf-grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.tf-field { display: flex; flex-direction: column; gap: 4px; }
.tf-label { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.4px; }
.tf-input { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 12px; color: var(--text, #e7eaf0); font-size: 14px; min-height: 42px; font-family: inherit; }
.tf-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.tf-textarea { min-height: 96px; resize: vertical; line-height: 1.5; }

.tf-position-size { margin-top: 16px; padding: 12px; border-radius: 10px; background: rgba(124,92,255,0.06); border: 1px solid rgba(124,92,255,0.2); }
.tf-ps-title { font-size: 12px; font-weight: 700; margin-bottom: 8px; }
.tf-ps-grid { display: flex; gap: 16px; align-items: flex-end; }
.tf-ps-result { font-size: 13px; padding-bottom: 10px; }

.tf-accounts { display: flex; flex-direction: column; gap: 12px; }
.tf-hint { font-size: 12px; color: var(--muted, #a1a7b3); }
.tf-split { display: flex; flex-direction: column; gap: 8px; }
.tf-split-row { display: flex; align-items: center; gap: 10px; }
.tf-split-name { flex: 1; font-size: 13px; }
.tf-split-input { width: 90px; }

.tf-review { display: flex; flex-direction: column; gap: 8px; }
.tf-review-row { display: flex; justify-content: space-between; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px; }

.tf-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.tf-btn { padding: 10px 18px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text, #e7eaf0); font-size: 13px; cursor: pointer; min-height: 42px; }
.tf-btn-primary { background: var(--brand, #7c5cff); border-color: var(--brand, #7c5cff); color: #fff; font-weight: 700; }
.tf-btn-ghost { background: transparent; }
.tf-btn:disabled { opacity: 0.5; cursor: default; }

.tf-error { padding: 10px 12px; border-radius: 10px; background: rgba(231,76,60,0.12); border: 1px solid rgba(231,76,60,0.3); color: var(--red, #e74c3c); font-size: 13px; }

.tf-executions { margin-top: 16px; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); }
.tf-exec-row { display: flex; gap: 8px; flex-wrap: wrap; }
.tf-exec-select { width: 110px; }
.tf-exec-list { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.tf-exec-item { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.tf-exec-side { font-size: 11px; padding: 2px 8px; border-radius: 999px; text-transform: capitalize; }
.tf-entry { background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); }
.tf-exit { background: rgba(231,76,60,0.15); color: var(--red, #e74c3c); }
.tf-exec-vwap { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; color: var(--muted, #a1a7b3); margin-top: 10px; }
.tf-btn-sm { padding: 5px 10px; min-height: 30px; font-size: 11px; border-radius: 8px; }

@media (max-width: 719px) { .tf-quick-grid { grid-template-columns: repeat(2, 1fr); } .tf-grid2 { grid-template-columns: 1fr; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('tf-styles')) {
  const style = document.createElement('style');
  style.id = 'tf-styles';
  style.textContent = TF_CSS;
  document.head.appendChild(style);
}
