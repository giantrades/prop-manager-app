// STAGE 4 — Wallets. Multi-moeda (USD/BRL/EUR/Crypto) + cash flow unificado.
// Saldo SEMPRE derivado do ledger (nunca escrito direto). Mobile-first 360px.
//
// Fonte: DOCS/05_STAGE4_MONEY_OS/00-produto.md.

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

function fmtMoney(value, currency = 'USD') {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1000) return `${sign}${currency}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${currency}${abs.toFixed(2)}`;
}

const KIND_LABEL = {
  wallet: 'Wallet',
  bank: 'Banco',
  cash: 'Dinheiro',
  crypto: 'Crypto',
};

/**
 * @param {object} props
 * @param {Array<{account:{id:string;name:string;kind:string};currency:string;balance:number;inflows:number;outflows:number}>} props.rows
 *   Resultado de `computeWalletSummary`.
 * @param {boolean} [props.loading]
 */
export default function Wallets({ rows = [], loading = false }: {
  rows?: Array<{ account: { id: string; name: string; kind: string }; currency: string; balance: number; inflows: number; outflows: number }>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="wl-root wl-loading" role="status" aria-live="polite">
        <div className="wl-skeleton" />
        <div className="wl-skeleton" />
        <span className="wl-screen-reader">Carregando wallets…</span>
      </div>
    );
  }

  const totalByCurrency = rows.reduce((acc, r) => {
    acc[r.currency] = (acc[r.currency] ?? 0) + r.balance;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="wl-root">
      <div className="wl-total-card">
        <div className="wl-total-label">Saldo por moeda (multi-moeda)</div>
        <div className="wl-total-sub">
          {Object.entries(totalByCurrency).map(([cur, val]) => (
            <span key={cur} className="wl-total-cur">
              <span className="wl-total-cur-label">{cur}</span>
              <span className={`wl-total-cur-value ${val < 0 ? 'wl-neg' : 'wl-pos'}`}>{fmtMoney(val, cur)}</span>
            </span>
          ))}
          {Object.keys(totalByCurrency).length === 0 && <span className="wl-muted">Sem wallets.</span>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="wl-chart" role="img" aria-label="Gráfico de saldo por carteira">
          <div className="wl-chart-title">Saldo por carteira</div>
          <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 36)}>
            <BarChart data={rows.map((r) => ({ name: r.account.name, saldo: r.balance }))} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#a1a7b3' }} width={96} />
              <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="saldo" radius={[0, 6, 6, 0]}>
                {rows.map((r) => (
                  <Cell key={r.account.id} fill={r.balance >= 0 ? '#2ecc71' : '#e74c3c'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="wl-grid">
        {rows.map((r) => (
          <div key={r.account.id} className="wl-card">
            <div className="wl-card-head">
              <div>
                <div className="wl-name">{r.account.name}</div>
                <div className="wl-kind">{KIND_LABEL[r.account.kind] || r.account.kind} · {r.currency}</div>
              </div>
              <div className={`wl-balance ${r.balance < 0 ? 'wl-neg' : 'wl-pos'}`}>
                {fmtMoney(r.balance, r.currency)}
              </div>
            </div>
            <div className="wl-flow">
              <div className="wl-flow-item">
                <span className="wl-flow-label">In</span>
                <span className="wl-flow-in">{fmtMoney(r.inflows, r.currency)}</span>
              </div>
              <div className="wl-flow-item">
                <span className="wl-flow-label">Out</span>
                <span className="wl-flow-out">{fmtMoney(r.outflows, r.currency)}</span>
              </div>
              <div className="wl-flow-item">
                <span className="wl-flow-label">Net</span>
                <span>{fmtMoney(r.balance, r.currency)}</span>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="wl-empty" role="status">Nenhuma wallet/carteira cadastrada.</div>
        )}
      </div>
    </div>
  );
}

const WL_CSS = `
.wl-root { display: flex; flex-direction: column; gap: 16px; }
.wl-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.wl-loading { gap: 8px; }
.wl-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: wl-pulse 1.4s ease-in-out infinite; }
.wl-skeleton:nth-child(2) { width: 70%; }
.wl-total-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; }
.wl-total-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.wl-total-sub { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; }
.wl-total-cur { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 6px 10px; border-radius: 10px; display: grid; gap: 2px; }
.wl-total-cur-label { color: var(--muted, #a1a7b3); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.wl-total-cur-value { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.wl-muted { color: var(--muted, #a1a7b3); font-size: 12px; }
.wl-chart { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; }
.wl-chart-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); margin-bottom: 8px; }
.wl-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.wl-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.wl-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.wl-name { font-size: 13px; font-weight: 700; }
.wl-kind { font-size: 11px; color: var(--muted, #a1a7b3); text-transform: capitalize; }
.wl-balance { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.wl-pos { color: var(--green, #2ecc71); }
.wl-neg { color: var(--red, #e74c3c); }
.wl-flow { display: flex; gap: 12px; }
.wl-flow-item { display: grid; gap: 2px; font-size: 11px; }
.wl-flow-label { text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); font-size: 11px; }
.wl-flow-in { color: var(--green, #2ecc71); font-variant-numeric: tabular-nums; }
.wl-flow-out { color: var(--red, #e74c3c); font-variant-numeric: tabular-nums; }
.wl-empty { grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
@media (max-width: 1000px) { .wl-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 719px) { .wl-grid { grid-template-columns: 1fr; } }
@keyframes wl-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;

if (typeof document !== 'undefined' && !document.getElementById('wl-styles')) {
  const style = document.createElement('style');
  style.id = 'wl-styles';
  style.textContent = WL_CSS;
  document.head.appendChild(style);
}
