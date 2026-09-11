// STAGE 5 — Net Worth (DERIVADO, nunca fonte primária). Soma Accounts(cash-like) +
// Positions(mark-to-market) + receivables - liabilities. `snapshots_networth` só
// histórico. Posição com marcação velha some do "atualizado agora" (proveniência).
// Mobile-first 360px.
//
// Fonte: DOCS/06_STAGE5_WEALTH_OS/00-produto.md + 02-FINANCIAL_FORMULAS.md.
// Dados: `computeNetWorth` (packages/lib/db/wealth.ts) — NUNCA digitado na tela.

import { fmtMoney as fmtMoneyShared } from './currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';


/**
 * @param {object} props
 * @param {{netWorth:number;components:{cash:number;investments:number;investmentsFresh:number;investmentsStale:number;receivables:number;liabilities:number};stalePositions:Array<{symbol:string;value:number;ageDays?:number|null}>;updatedAt:string}} [props.netWorth]
 * @param {Array<{netWorth:number;snapshotAt:string}>} [props.snapshots]
 * @param {string} [props.currency]
 * @param {boolean} [props.loading]
 */
export default function NetWorth({ netWorth = null, snapshots = [], currency = 'R$', loading = false }) {
  if (loading) {
    return (
      <div className="nw-root nw-loading" role="status" aria-live="polite">
        <div className="nw-skeleton" />
        <div className="nw-skeleton" />
        <div className="nw-skeleton" />
        <span className="nw-screen-reader">Carregando patrimônio…</span>
      </div>
    );
  }

  if (!netWorth) {
    return <div className="nw-empty" role="status">Sem patrimônio calculado.</div>;
  }

  const c = netWorth.components;
  const rows = [
    { label: 'Caixa (bank/wallet/cash)', value: c.cash, cls: '' },
    { label: 'Investimentos + cripto (mark-to-market)', value: c.investments, cls: '' },
    { label: 'Recebíveis (payouts pendentes)', value: c.receivables, cls: '' },
  ];
  if (c.liabilities > 0) rows.push({ label: 'Passivos', value: -c.liabilities, cls: 'nw-neg' });

  return (
    <div className="nw-root">
      {/* Total */}
      <div className="nw-total-card">
        <div className="nw-total-label">Patrimônio líquido (derivado)</div>
        <div className="nw-total-value">{fmtMoney(netWorth.netWorth, currency)}</div>
        <div className="nw-total-updated">Atualizado {netWorth.updatedAt ? new Date(netWorth.updatedAt).toLocaleString() : ''}</div>
      </div>

      {/* Breakdown */}
      <div className="nw-breakdown">
        {rows.map((r) => (
          <div key={r.label} className="nw-row">
            <span className="nw-row-label">{r.label}</span>
            <span className={`nw-row-value ${r.cls}`}>{fmtMoney(r.value, currency)}</span>
          </div>
        ))}
      </div>

      {/* Proveniência: posições com marcação antiga */}
      {netWorth.stalePositions && netWorth.stalePositions.length > 0 && (
        <div className="nw-provenance" role="note">
          <div className="nw-prov-title">⚠️ Marcas antigas (proveniência)</div>
          <div className="nw-prov-list">
            {netWorth.stalePositions.map((p) => (
              <div key={`${p.symbol}-${p.value}`} className="nw-prov-row">
                <span className="nw-prov-symbol">{p.symbol}</span>
                <span className="nw-prov-value">{fmtMoney(p.value, currency)}</span>
                <span className="nw-prov-age">{p.ageDays != null ? `${p.ageDays}d` : 'sem marca'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico (snapshots) */}
      {snapshots.length > 0 && (
        <div className="nw-section">
          <div className="nw-section-title">Evolução (snapshots)</div>
          <div className="nw-chart">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={snapshots.map((s) => ({ ...s, label: s.snapshotAt.slice(0, 10) }))} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" tick={{ fill: '#a1a7b3', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" />
                <YAxis tick={{ fill: '#a1a7b3', fontSize: 10 }} stroke="rgba(255,255,255,0.1)" width={54} />
                <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} labelStyle={{ color: '#a1a7b3' }} />
                <Area type="monotone" dataKey="netWorth" stroke="var(--brand, #7c5cff)" fill="rgba(124,92,255,0.15)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="nw-series">
            {snapshots.map((s) => (
              <div key={s.snapshotAt} className="nw-series-item">
                <span className="nw-series-date">{s.snapshotAt.slice(0, 10)}</span>
                <span className="nw-series-value">{fmtMoney(s.netWorth, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const NW_CSS = `
.nw-root { display: flex; flex-direction: column; gap: 16px; }
.nw-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.nw-loading { gap: 8px; }
.nw-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: nw-pulse 1.4s ease-in-out infinite; }
.nw-skeleton:nth-child(2) { width: 80%; }
.nw-skeleton:nth-child(3) { width: 60%; }

.nw-total-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 20px; }
.nw-total-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.nw-total-value { font-size: 32px; font-weight: 800; font-variant-numeric: tabular-nums; margin: 4px 0; }
.nw-total-updated { font-size: 11px; color: var(--muted, #a1a7b3); }

.nw-breakdown { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.nw-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.nw-row-label { color: var(--muted, #a1a7b3); }
.nw-row-value { font-weight: 700; font-variant-numeric: tabular-nums; }
.nw-neg { color: var(--red, #e74c3c); }

.nw-provenance { background: rgba(225,177,44,0.06); border: 1px solid rgba(225,177,44,0.2); border-radius: 14px; padding: 14px; }
.nw-prov-title { font-size: 12px; font-weight: 700; color: var(--yellow, #e1b12c); margin-bottom: 10px; }
.nw-prov-list { display: flex; flex-direction: column; gap: 8px; }
.nw-prov-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; font-size: 12px; }
.nw-prov-symbol { font-weight: 600; }
.nw-prov-value { font-variant-numeric: tabular-nums; }
.nw-prov-age { color: var(--muted, #a1a7b3); font-size: 11px; }

.nw-section { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.nw-chart { margin-bottom: 10px; }
.nw-section-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.nw-series { display: flex; flex-direction: column; gap: 8px; }
.nw-series-item { display: grid; grid-template-columns: 80px 1fr auto; align-items: center; gap: 10px; font-size: 12px; }
.nw-series-date { color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; }
.nw-series-bar-wrap { height: 8px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.nw-series-bar { display: block; height: 100%; background: linear-gradient(90deg, var(--green, #2ecc71), #82e0aa); border-radius: 999px; }
.nw-series-value { font-variant-numeric: tabular-nums; font-weight: 600; }

.nw-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

@keyframes nw-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('nw-styles')) {
  const style = document.createElement('style');
  style.id = 'nw-styles';
  style.textContent = NW_CSS;
  document.head.appendChild(style);
}
