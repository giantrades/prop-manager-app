// STAGE 4 — Firm P&L. "Quanto gastei com cada propfirm?" por firm/conta.
// = Σ payout_in - Σ(challenge+reset+monthly+fee) + Σ rebate - Σ(commission+swap).
// Mobile-first 360px.

import { fmtMoney } from './currency';
import React, { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
} from 'recharts';


/**
 * @param {object} props
 * @param {Array<{firmId:string;firmName?:string;payouts:number;costs:number;rebates:number;fees:number;profit:number}>} props.rows
 * @param {Record<string,Array<{accountId:string;accountName?:string;payouts:number;costs:number;rebates:number;fees:number;profit:number}>>} [props.byAccount]
 * @param {{months:Array<string>;firms:Array<string>;rows:Array<object>}} [props.history] — B1: lucro por firm por mês
 * @param {string} [props.currency]
 * @param {boolean} [props.loading]
 */
const FIRM_COLORS = [
  'var(--green,#2ecc71)', 'var(--blue,#3498db)', 'var(--yellow,#e1b12c)', 'var(--brand,#7c5cff)',
  'var(--red,#e74c3c)', 'var(--muted,#a1a7b3)',
];
export default function FirmPnl({ rows = [], byAccount = {}, history = null, currency = 'USD', loading = false, colorById = {} }) {
  const [open, setOpen] = useState(null);
  if (loading) {
    return (
      <div className="fp-root fp-loading" role="status" aria-live="polite">
        <div className="fp-skeleton" />
        <div className="fp-skeleton" />
        <span className="fp-screen-reader">Carregando P&L por firm…</span>
      </div>
    );
  }

  const ranked = [...rows].sort((a, b) => b.profit - a.profit);
  const bestId = ranked.length > 0 ? ranked[0].firmId : null;

  return (
    <div className="fp-root">
      {history && history.months.length > 1 && history.firms.length > 0 && (
        <div className="fp-section">
          <div className="fp-section-title">Lucro por firm por mês</div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={history.rows.map((r) => ({ ...r, ym: String(r.ym).slice(5, 7) + '/' + String(r.ym).slice(2, 4) }))}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
                <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} formatter={(v) => fmtMoney(v, currency)} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#a1a7b3' }} />
                {history.firms.map((f, i) => (
                  <Bar key={f} dataKey={f} fill={colorById[f] || FIRM_COLORS[i % FIRM_COLORS.length]} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {ranked.length > 1 && (
        <div className="fp-section">
          <div className="fp-section-title">Comparador — lucro por firm</div>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranked.map((r) => ({ name: r.firmName || r.firmId, profit: r.profit }))}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a1a7b3' }} interval={0} angle={-12} height={44} />
                <YAxis tick={{ fontSize: 10, fill: '#a1a7b3' }} width={56} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} formatter={(v) => fmtMoney(v, currency)} />
                <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                  {ranked.map((r) => (
                    <Cell key={r.firmId} fill={colorById[r.firmId] || (r.profit >= 0 ? 'var(--green,#2ecc71)' : 'var(--red,#e74c3c)')} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {ranked.map((r) => {
        const spent = r.costs + r.fees;
        const ratio = spent > 0 ? r.profit / spent : null;
        const accs = (byAccount[r.firmId] || []).sort((a, b) => b.profit - a.profit);
        const isOpen = open === r.firmId;
        return (
          <div key={r.firmId} className="fp-card">
            <div className="fp-head">
              <div className="fp-title">
                {r.firmName || r.firmId}
                {r.firmId === bestId && <span className="fp-badge">melhor</span>}
              </div>
              <div className={`fp-profit ${r.profit >= 0 ? 'fp-pos' : 'fp-neg'}`}>
                {fmtMoney(r.profit, currency)}
              </div>
            </div>
            <div className="fp-body">
              <div className="fp-row"><span>Payouts recebidos</span><span className="fp-pos">{fmtMoney(r.payouts, currency)}</span></div>
              <div className="fp-row"><span>Challenges / resets / mensalidades</span><span className="fp-neg">{fmtMoney(-r.costs, currency)}</span></div>
              <div className="fp-row"><span>Fees firm</span><span className="fp-neg">{fmtMoney(-r.fees, currency)}</span></div>
              <div className="fp-row"><span>Rebates</span><span className="fp-pos">{fmtMoney(r.rebates, currency)}</span></div>
              <div className="fp-row"><span>Retorno por $ gasto</span><span>{ratio == null ? '—' : `${ratio >= 0 ? '+' : ''}${ratio.toFixed(2)}x`}</span></div>
            </div>
            {accs.length > 0 && (
              <button
                type="button"
                className="fp-toggle"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : r.firmId)}
              >
                {isOpen ? 'Ocultar por conta' : `Ver por conta (${accs.length})`}
              </button>
            )}
            {isOpen && (
              <div className="fp-accts" role="table" aria-label={`Contas da ${r.firmName || r.firmId}`}>
                {accs.map((a) => (
                  <div key={a.accountId} className="fp-acct" role="row">
                    <span className="fp-acct-name">{a.accountName || a.accountId}</span>
                    <span className={`fp-acct-profit ${a.profit >= 0 ? 'fp-pos' : 'fp-neg'}`}>{fmtMoney(a.profit, currency)}</span>
                    <span className="fp-acct-sub">pag {fmtMoney(a.payouts, currency)} · custo {fmtMoney(a.costs, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {rows.length === 0 && (
        <div className="fp-empty" role="status">Nenhuma firm com P&L calculado.</div>
      )}
    </div>
  );
}

const FP_CSS = `
.fp-root { display: flex; flex-direction: column; gap: 12px; }
.fp-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.fp-loading { gap: 8px; }
.fp-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: fp-pulse 1.4s ease-in-out infinite; }
.fp-card { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.fp-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.fp-title { font-size: 14px; font-weight: 800; }
.fp-profit { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }
.fp-pos { color: var(--green, #2ecc71); }
.fp-neg { color: var(--red, #e74c3c); }
.fp-body { display: grid; gap: 6px; }
.fp-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted, #a1a7b3); }
.fp-row span:last-child { font-variant-numeric: tabular-nums; }
.fp-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }
.fp-section { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.fp-section-title { font-size: 12px; font-weight: 700; color: var(--muted, #a1a7b3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
.fp-badge { font-size: 10px; padding: 2px 10px; border-radius: 999px; background: rgba(46,204,113,0.15); color: var(--green, #2ecc71); font-weight: 800; margin-left: 8px; }
.fp-toggle { margin-top: 10px; background: transparent; border: 1px solid #2a3246; color: var(--text, #e7eaf0); border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; min-height: 36px; }
.fp-accts { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.fp-acct { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; font-size: 12px; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; }
.fp-acct-name { font-weight: 700; }
.fp-acct-profit { font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; }
.fp-acct-sub { grid-column: 1 / -1; color: var(--muted, #a1a7b3); font-size: 11px; font-variant-numeric: tabular-nums; }
@keyframes fp-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;

if (typeof document !== 'undefined' && !document.getElementById('fp-styles')) {
  const style = document.createElement('style');
  style.id = 'fp-styles';
  style.textContent = FP_CSS;
  document.head.appendChild(style);
}
