// STAGE 5 — Forecast 30/60/90 + Safe Available ("posso comprar isso?").
// Mobile-first 360px.
//
// Fonte: DOCS/06_STAGE5_WEALTH_OS/00-produto.md.
// Dados: `computeForecast` + `computeSafeAvailable` (packages/lib/db/wealth.ts).

import { fmtMoney as fmtMoneyShared } from './currency';
function fmtMoney(v, cur = 'R$') { return fmtMoneyShared(v, cur); }
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';


/**
 * @param {object} props
 * @param {{today:number;d30:number;d60:number;d90:number;netMonthly:number}} [props.forecast]
 * @param {number} [props.safeAvailable]
 * @param {string} [props.currency]
 * @param {boolean} [props.loading]
 */
export default function Forecast({ forecast = null, safeAvailable = null, currency = 'USD', loading = false }) {
  if (loading) {
    return (
      <div className="fc-root fc-loading" role="status" aria-live="polite">
        <div className="fc-skeleton" />
        <div className="fc-skeleton" />
        <span className="fc-screen-reader">Carregando forecast…</span>
      </div>
    );
  }

  if (!forecast) {
    return <div className="fc-empty" role="status">Sem forecast.</div>;
  }

  const horizons = [
    { label: 'Hoje', value: forecast.today },
    { label: '30d', value: forecast.d30 },
    { label: '60d', value: forecast.d60 },
    { label: '90d', value: forecast.d90 },
  ];

  const canBuy = safeAvailable != null && safeAvailable > 0;

  return (
    <div className="fc-root">
      {/* Forecast 30/60/90 */}
      <div className="fc-horizons">
        {horizons.map((h, i) => {
          const delta = i === 0 ? null : h.value - horizons[i - 1].value;
          return (
            <div key={h.label} className="fc-horizon">
              <div className="fc-horizon-label">{h.label}</div>
              <div className={`fc-horizon-value ${h.value >= 0 ? 'fc-pos' : 'fc-neg'}`}>{fmtMoney(h.value, currency)}</div>
              {delta != null && (
                <div className={`fc-horizon-delta ${delta >= 0 ? 'fc-pos' : 'fc-neg'}`}>
                  {delta >= 0 ? '+' : ''}{fmtMoney(delta, currency)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="fc-net">Fluxo mensal líquido: <strong>{fmtMoney(forecast.netMonthly, currency)}</strong></div>

      <div className="fc-chart" role="img" aria-label="Gráfico de projeção hoje a 90 dias">
        <div className="fc-chart-title">Projeção</div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={horizons} margin={{ left: -4, right: 8, top: 4, bottom: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a1a7b3' }} />
            <YAxis
              tick={{ fontSize: 10, fill: '#a1a7b3' }}
              width={56}
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
            />
            <Tooltip contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} />
            <Area type="monotone" dataKey="value" stroke="#7c5cff" fill="rgba(124,92,255,0.25)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Safe Available */}
      {safeAvailable != null && (
        <div className={`fc-safe ${canBuy ? 'fc-safe-ok' : 'fc-safe-warn'}`} role="status">
          <div className="fc-safe-label">Safe Available — posso comprar isso?</div>
          <div className="fc-safe-value">{fmtMoney(safeAvailable, currency)}</div>
          <div className="fc-safe-note">
            {canBuy
              ? 'Caixa operacional preservado (30d contas + reserva imposto).'
              : 'Cuidado: comprometeria o caixa dos próximos 30 dias.'}
          </div>
        </div>
      )}
    </div>
  );
}

const FC_CSS = `
.fc-root { display: flex; flex-direction: column; gap: 14px; }
.fc-screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.fc-loading { gap: 8px; }
.fc-skeleton { height: 14px; border-radius: 8px; background: rgba(255,255,255,0.06); animation: fc-pulse 1.4s ease-in-out infinite; }
.fc-skeleton:nth-child(2) { width: 80%; }

.fc-horizons { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.fc-horizon { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.fc-horizon-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.fc-horizon-value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; margin-top: 4px; }
.fc-horizon-delta { font-size: 11px; font-variant-numeric: tabular-nums; margin-top: 2px; opacity: 0.85; }
.fc-pos { color: var(--green, #2ecc71); }
.fc-neg { color: var(--red, #e74c3c); }

.fc-net { font-size: 12px; color: var(--muted, #a1a7b3); }
.fc-chart { background: linear-gradient(180deg, #161b25 0%, #131825 100%); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 14px; }
.fc-chart-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); margin-bottom: 8px; }

.fc-safe { border-radius: 14px; padding: 16px; border: 1px solid; }
.fc-safe-ok { background: rgba(46,204,113,0.08); border-color: rgba(46,204,113,0.3); }
.fc-safe-warn { background: rgba(225,177,44,0.08); border-color: rgba(225,177,44,0.3); }
.fc-safe-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted, #a1a7b3); }
.fc-safe-value { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; margin: 4px 0; }
.fc-safe-note { font-size: 11px; color: var(--muted, #a1a7b3); }

.fc-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 13px; border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px; }

@media (max-width: 719px) { .fc-horizons { grid-template-columns: repeat(2, 1fr); gap: 8px; } }
@keyframes fc-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('fc-styles')) {
  const style = document.createElement('style');
  style.id = 'fc-styles';
  style.textContent = FC_CSS;
  document.head.appendChild(style);
}
