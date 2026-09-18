// STAGE 4 — PayoutCenter. Gross/Fee/Net + `splitByAccount` por PESO (nunca amount/n)
// + wizard de alocação (Tax reserve -> Living -> Invest -> Cash). Mobile-first 360px.
//
// Fonte: DOCS/05_STAGE4_MONEY_OS/00-produto.md + FINANCIAL_FORMULAS.md (Eligibility checklist).

import { fmtMoney } from './currency';
import React, { useMemo, useState } from 'react';
import type { Payout, PayoutAllocationPlan } from '@apps/lib/db';


function fmtPct(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

function fmtBool(v: boolean) {
  return v ? 'YES' : 'NO';
}

const CHECK_META: Array<[string, string]> = [
  ['equityReachedTarget', 'Equity ≥ target'],
  ['drawdownOk', 'Drawdown ok'],
  ['daysOperatedOk', 'Dias operados'],
  ['consistencyOk', 'Consistency ok'],
];

/** Normaliza pesos pra soma = 1 (distribuição por peso, nunca amount/n). */
function normalizeWeights(weights: Record<string, number>) {
  const sum = Object.values(weights).reduce((s, w) => s + Math.max(0, Number(w) || 0), 0);
  if (sum <= 0) return Object.fromEntries(Object.keys(weights).map((k) => [k, 0])) as Record<string, number>;
  return Object.fromEntries(
    Object.entries(weights).map(([k, w]) => [k, Math.max(0, Number(w) || 0) / sum]),
  ) as Record<string, number>;
}

/**
 * @param {object} props
 * @param {object} props.payout  Payout com fields: id, gross, fee, net, status, method, firmName?, eligible?, checks?
 * @param {Array<{id:string;name:string;currency:string;kind:string}>} [props.wallets]
 * @param {(plan:object)=>void} [props.onAllocate]
 * @param {(payout:object)=>void} [props.onApplyPayout]
 */
type PayoutBucketKey = 'living' | 'invest' | 'cash';

interface PayoutWalletOption {
  id: string;
  name: string;
  currency: string;
  kind: string;
}

interface PayoutCenterPayout extends Payout {
  firmName?: string;
  eligible?: boolean;
  checks?: Record<string, boolean>;
}

interface PayoutCenterProps {
  payout: PayoutCenterPayout;
  wallets?: PayoutWalletOption[];
  onAllocate?: (plan: PayoutAllocationPlan) => void;
  onApplyPayout?: (payout: PayoutCenterPayout) => void;
}
export default function PayoutCenter({ payout, wallets = [], onAllocate, onApplyPayout }: PayoutCenterProps) {
  const [taxPct, setTaxPct] = useState<number>(0.15);
  const [weights, setWeights] = useState<Record<PayoutBucketKey, number>>({ living: 0.4, invest: 0.4, cash: 0.2 });
  const [destWallet, setDestWallet] = useState<string>(wallets[0]?.id ?? '');

  const net = payout.net ?? 0;
  const taxReserve = net * Math.max(0, Number(taxPct) || 0);
  const available = net - taxReserve;

  const normalized = useMemo(() => normalizeWeights(weights), [weights]);
  const splits = useMemo<Record<PayoutBucketKey, number>>(() => {
    const out: Record<PayoutBucketKey, number> = { living: 0, invest: 0, cash: 0 };
    for (const k of ['living', 'invest', 'cash'] as PayoutBucketKey[]) {
      out[k] = available * (normalized[k] ?? 0);
    }
    return out;
  }, [normalized, available]);

  const handleAllocate = () => {
    const plan: PayoutAllocationPlan = {
      payoutId: payout.id,
      destinationAccountId: (destWallet || wallets[0]?.id) ?? '',
      currency: 'USD',
      date: payout.date ?? new Date().toISOString(),
      taxReservePct: Number(taxPct) || 0,
      buckets: [
        { kind: 'expense', accountId: (destWallet || wallets[0]?.id) ?? '', weight: normalized.living ?? 0, note: 'Living' },
        { kind: 'invest', accountId: wallets.find((w) => w.kind === 'investment')?.id ?? destWallet, weight: normalized.invest ?? 0, note: 'Invest' },
        { kind: 'cash', accountId: (destWallet || wallets[0]?.id) ?? '', weight: normalized.cash ?? 0, note: 'Cash' },
      ],
    };
    onAllocate?.(plan);
  };

  const checks = payout.checks;
  const eligible = payout.eligible ?? true;

  return (
    <div className="pc-root">
      <div className="pc-card">
        <div className="pc-head">
          <div>
            <div className="pc-title">
              Payout #{payout.id?.replace(/\D/g, '') || '—'} · {payout.firmName || payout.accountIds?.[0] || 'Firm'}
            </div>
            <div className="pc-sub">{payout.method || 'método'} · {payout.status || 'Pending'}</div>
          </div>
          <span className={`pc-elig ${eligible ? 'pc-elig-yes' : 'pc-elig-no'}`}>
            Eligible {fmtBool(eligible)}
          </span>
        </div>

        <div className="pc-grid">
          <div className="pc-stat">
            <div className="pc-stat-label">Gross</div>
            <div className="pc-stat-value">{fmtMoney(payout.gross, 'USD')}</div>
          </div>
          <div className="pc-stat">
            <div className="pc-stat-label">Fee</div>
            <div className="pc-stat-value pc-neg">{fmtMoney(-(payout.fee ?? 0), 'USD')}</div>
          </div>
          <div className="pc-stat">
            <div className="pc-stat-label">Recebe (Net)</div>
            <div className="pc-stat-value pc-pos">{fmtMoney(net, 'USD')}</div>
          </div>
          <div className="pc-stat">
            <div className="pc-stat-label">Tax est.</div>
            <div className="pc-stat-value">{fmtMoney(taxReserve, 'USD')}</div>
          </div>
        </div>

        {checks && (
          <div className="pc-checks" aria-label="Checklist de elegibilidade">
            {CHECK_META.map(([key, label]) => (
              <div key={key} className={`pc-check ${checks[key] ? 'pc-check-ok' : 'pc-check-fail'}`}>
                <span aria-hidden="true">{checks[key] ? '✓' : '✗'}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pc-wizard">
          <div className="pc-section-title">O que fez com esse payout?</div>

          <div className="pc-field-row">
            <label className="pc-field">
              <span>Destino (wallet)</span>
              <select
                className="pc-input"
                value={destWallet}
                onChange={(e) => setDestWallet(e.target.value)}
                aria-label="Wallet de destino"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
                {wallets.length === 0 && <option value="">Sem wallets</option>}
              </select>
            </label>
            <label className="pc-field">
              <span>Tax reserve (%)</span>
              <input
                className="pc-input"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={taxPct}
                onChange={(e) => setTaxPct(Number(e.target.value))}
                aria-label="Percentual de reserva de imposto"
              />
            </label>
          </div>

          <div className="pc-weight-row">
            {(['living', 'invest', 'cash'] as PayoutBucketKey[]).map((k: PayoutBucketKey) => {
              const labels: Record<PayoutBucketKey, string> = { living: 'Living', invest: 'Invest', cash: 'Cash' };
              return (
                <label key={k} className="pc-weight">
                  <span>{labels[k]} · {fmtMoney(splits[k], 'USD')}</span>
                  <input
                    className="pc-input"
                    type="number"
                    min="0"
                    step="0.1"
                    value={weights[k]}
                    onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) } as Record<PayoutBucketKey, number>))}
                    aria-label={`Peso ${labels[k]}`}
                  />
                </label>
              );
            })}
          </div>

          <div className="pc-actions">
            <button className="pc-btn" onClick={() => onApplyPayout?.(payout)}>
              Sacar {fmtMoney(payout.gross, 'USD')} → líquido {fmtMoney(net, 'USD')}
            </button>
            <button className="pc-btn pc-btn-ghost" onClick={handleAllocate}>
              Alocar {fmtMoney(available, 'USD')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PC_CSS = `
.pc-root { display: flex; flex-direction: column; gap: 16px; }
.pc-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; }
.pc-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.pc-title { font-size: 14px; font-weight: 800; }
.pc-sub { font-size: 11px; color: var(--muted, #a1a7b3); }
.pc-elig { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.pc-elig-yes { background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); }
.pc-elig-no { background: rgba(231,76,60,0.15); color: var(--red, #e74c3c); }
.pc-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 14px; }
.pc-stat { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 12px; }
.pc-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.pc-stat-value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pc-pos { color: var(--green, #2ecc71); }
.pc-neg { color: var(--red, #e74c3c); }
.pc-checks { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.pc-check { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; padding: 4px 10px; border-radius: 999px; }
.pc-check-ok { background: rgba(46,204,113,0.12); color: var(--green, #2ecc71); }
.pc-check-fail { background: rgba(231,76,60,0.12); color: var(--red, #e74c3c); }
.pc-section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); margin-bottom: 12px; }
.pc-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.pc-field { display: grid; gap: 6px; font-size: 11px; color: var(--muted, #a1a7b3); }
.pc-weight-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
.pc-weight { display: grid; gap: 6px; font-size: 11px; color: var(--muted, #a1a7b3); }
.pc-input { background: #111623; border: 1px solid #273044; color: var(--text, #e7eaf0); padding: 9px 10px; border-radius: 10px; width: 100%; font-size: 13px; }
.pc-input:focus { outline: none; border-color: var(--brand, #7c5cff); }
.pc-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.pc-btn { background: var(--brand, #7c5cff); color: white; border: none; padding: 10px 14px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; flex: 1; }
.pc-btn-ghost { background: transparent; border: 1px solid #2a3246; color: var(--text, #e7eaf0); }
.pc-btn:hover { filter: brightness(1.08); }
@media (max-width: 719px) {
  .pc-grid { grid-template-columns: repeat(2, 1fr); }
  .pc-field-row { grid-template-columns: 1fr; }
  .pc-weight-row { grid-template-columns: 1fr; }
  .pc-actions { flex-direction: column; }
  .pc-btn { width: 100%; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('pc-styles')) {
  const style = document.createElement('style');
  style.id = 'pc-styles';
  style.textContent = PC_CSS;
  document.head.appendChild(style);
}
