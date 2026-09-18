// STAGE 4 — Tax Cockpit (cockpit, NÃO ERP). Day 20% / Swing 15% / carry prejuízo /
// DARF prazo. Payout internacional convertido na PTAX de venda do dia do recebimento
// (guardada na Transaction). Mobile-first 360px.
//
// Fonte: DOCS/02_STAGE1_DOMAIN/02-FINANCIAL_FORMULAS.md (§ Fiscal).

import { fmtMoney as fmtMoneyShared } from './currency';
function fmtMoney(v, cur = 'USD') { return fmtMoneyShared(v, cur); }
import React from 'react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';


function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(0)}%`;
}

/**
 * @param {object} props
 * @param {object} props.cockpit Resultado de `computeTaxCockpit`.
 * @param {string} [props.currency]
 * @param {string} [props.yearMonth]
 * @param {()=>void} [props.onExportCSV]
 * @param {boolean} [props.loading]
 */
export default function TaxCockpit({ cockpit, currency = 'USD', yearMonth, onExportCSV, loading = false }) {
  if (loading || !cockpit) {
    return (
      <div className="tx-root tx-loading" role="status" aria-live="polite">
        <div className="tx-skeleton" />
        <div className="tx-skeleton" />
        <span className="tx-screen-reader">Carregando cockpit fiscal…</span>
      </div>
    );
  }

  return (
    <div className="tx-root">
      <div className="tx-head">
        <div className="tx-title">Tax Cockpit {yearMonth ? `· ${yearMonth}` : ''}</div>
        {onExportCSV && (
          <button className="tx-btn tx-btn-ghost" onClick={onExportCSV}>Export CSV</button>
        )}
      </div>

      <div className="tx-summary">
        <div className="tx-stat">
          <div className="tx-stat-label">Day-trade (20%)</div>
          <div className="tx-stat-value">{fmtMoney(cockpit.dayNet, currency)}</div>
          <div className="tx-stat-tax">IR {fmtMoney(cockpit.dayTax, currency)}</div>
        </div>
        <div className="tx-stat">
          <div className="tx-stat-label">Swing (15%)</div>
          <div className="tx-stat-value">{fmtMoney(cockpit.swingNet, currency)}</div>
          <div className="tx-stat-tax">IR {fmtMoney(cockpit.swingTax, currency)}</div>
        </div>
        <div className="tx-stat tx-stat-total">
          <div className="tx-stat-label">Est. IR</div>
          <div className="tx-stat-value">{fmtMoney(cockpit.estTax, currency)}</div>
        </div>
      </div>

      <div className="tx-chart" role="img" aria-label="Gráfico day vs swing: líquido e IR">
        <div className="tx-chart-title">Day vs Swing — líquido e IR</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart
            data={[
              { m: 'Day', líquido: cockpit.dayNet, IR: cockpit.dayTax },
              { m: 'Swing', líquido: cockpit.swingNet, IR: cockpit.swingTax },
            ]}
            margin={{ left: -4, right: 8, top: 4, bottom: 4 }}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="m" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
            <YAxis
              tick={{ fontSize: 10, fill: '#a1a7b3' }}
              width={56}
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
            />
            <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="líquido" fill="#3498db" radius={[6, 6, 0, 0]} />
            <Bar dataKey="IR" fill="#e1b12c" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="tx-detail">
        <div className="tx-row">
          <span>Fees informativas</span>
          <span>{fmtMoney(cockpit.fees, currency)}</span>
        </div>
        <div className="tx-row">
          <span>Base tributável day</span>
          <span>{fmtMoney(cockpit.dayTaxable, currency)}</span>
        </div>
        <div className="tx-row">
          <span>Base tributável swing</span>
          <span>{fmtMoney(cockpit.swingTaxable, currency)}</span>
        </div>
        <div className="tx-row">
          <span>Carry prejuízo day (próx.)</span>
          <span>{fmtMoney(cockpit.carryAfter?.day, currency)}</span>
        </div>
        <div className="tx-row">
          <span>Carry prejuízo swing (próx.)</span>
          <span>{fmtMoney(cockpit.carryAfter?.swing, currency)}</span>
        </div>
      </div>

      {cockpit.prepareDarf ? (
        <div className="tx-darf tx-darf-warn" role="alert" aria-live="assertive">
          ⚠ Prepare DARF — prazo {cockpit.darfDeadline ? new Date(cockpit.darfDeadline).toLocaleDateString('pt-BR') : 'n/d'}
          <span className="tx-darf-note">(contador decide o regime; estimativa não é consulta)</span>
        </div>
      ) : (
        <div className="tx-darf tx-darf-ok" role="status">
          Sem DARF a preparar neste mês (prejuízo carregado).
        </div>
      )}
    </div>
  );
}

const TX_CSS = `
.tx-root { display: flex; flex-direction: column; gap: 16px; }
.tx-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.tx-loading { gap: 8px; }
.tx-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: tx-pulse 1.4s ease-in-out infinite; }
.tx-head { display: flex; justify-content: space-between; align-items: center; }
.tx-title { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
.tx-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.tx-stat { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 12px; }
.tx-stat-total { background: linear-gradient(180deg, #2e2b12 0%, #1b2010 100%); border-color: rgba(225,177,44,0.3); }
.tx-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.tx-stat-value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tx-stat-tax { font-size: 11px; color: var(--yellow, #e1b12c); margin-top: 2px; }
.tx-chart { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 12px 14px; }
.tx-chart-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); margin-bottom: 8px; }
.tx-detail { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 12px 14px; display: grid; gap: 8px; }
.tx-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted, #a1a7b3); }
.tx-row span:last-child { color: var(--text, #e7eaf0); font-variant-numeric: tabular-nums; }
.tx-darf { padding: 12px 14px; border-radius: 12px; font-size: 13px; font-weight: 600; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tx-darf-warn { background: rgba(231,76,60,0.12); border: 1px solid rgba(231,76,60,0.3); color: var(--red, #e74c3c); }
.tx-darf-ok { background: rgba(46,204,113,0.1); border: 1px solid rgba(46,204,113,0.25); color: var(--green, #2ecc71); }
.tx-darf-note { font-size: 11px; font-weight: 400; color: var(--muted, #a1a7b3); }
.tx-btn { background: var(--brand, #7c5cff); color: white; border: none; padding: 8px 12px; border-radius: 10px; font-weight: 700; font-size: 12px; cursor: pointer; }
.tx-btn-ghost { background: transparent; border: 1px solid #2a3246; color: var(--text, #e7eaf0); }
@media (max-width: 719px) { .tx-summary { grid-template-columns: 1fr; } .tx-darf { flex-direction: column; align-items: flex-start; } }
@keyframes tx-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;

if (typeof document !== 'undefined' && !document.getElementById('tx-styles')) {
  const style = document.createElement('style');
  style.id = 'tx-styles';
  style.textContent = TX_CSS;
  document.head.appendChild(style);
}
