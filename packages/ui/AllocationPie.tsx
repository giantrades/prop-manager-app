// AllocationPie — donut + legenda legível (label, %, valor). Reusado no Resumo de
// Investimentos e no Portfolio. Sem cálculo financeiro: só soma/percentual de exibição.
import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { fmtMoney } from './currency';

const PALETTE = ['#7c5cff', '#2ecc71', '#3498db', '#e1b12c', '#f7931a', '#e74c3c', '#a855f7', '#22d3ee', '#f59e0b'];

/**
 * @param {object} props
 * @param {string} [props.title]
 * @param {Array<{label:string;value:number;color?:string;currency?:string}>} props.data
 * @param {string} [props.currency]
 * @param {number} [props.size]
 * @param {string} [props.emptyLabel]
 */
interface AllocationDatum {
  label: string;
  value: number;
  color?: string;
  currency?: string;
}

interface AllocationPieProps {
  title?: string | null;
  data?: AllocationDatum[];
  currency?: string;
  size?: number;
  emptyLabel?: string;
}
export default function AllocationPie({ title = null, data = [], currency = 'USD', size = 168, emptyLabel = 'Sem dados.' }: AllocationPieProps) {
  const items = (data || []).filter((d) => d && d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (items.length === 0) return <div className="ap-empty">{emptyLabel}</div>;

  return (
    <div className="ap-root">
      {title && <div className="ap-title">{title}</div>}
      <div className="ap-body">
        <div className="ap-chart">
          <ResponsiveContainer width={size} height={size}>
            <PieChart>
              <Pie
                data={items}
                dataKey="value"
                nameKey="label"
                innerRadius={Math.round(size * 0.30)}
                outerRadius={Math.round(size * 0.46)}
                paddingAngle={2}
                cornerRadius={4}
                stroke="none"
              >
                {items.map((d, i) => <Cell key={d.label} fill={d.color || PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#161b25', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                formatter={(v) => fmtMoney(v, currency)}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="ap-legend">
          {items.map((d, i) => (
            <div key={d.label} className="ap-legend-row">
              <span className="ap-dot" style={{ background: d.color || PALETTE[i % PALETTE.length] }} />
              <span className="ap-label" title={d.label}>{d.label}</span>
              <span className="ap-pct">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</span>
              <span className="ap-val">{fmtMoney(d.value, currency)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const AP_CSS = `
.ap-root { display: flex; flex-direction: column; gap: 10px; }
.ap-title { font-size: 12px; font-weight: 700; }
.ap-body { display: flex; align-items: center; gap: 14px; }
.ap-chart { flex: 0 0 auto; }
.ap-legend { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ap-legend-row { display: grid; grid-template-columns: 10px 1fr auto auto; align-items: center; gap: 8px; font-size: 12px; }
.ap-dot { width: 10px; height: 10px; border-radius: 50%; }
.ap-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.ap-pct { color: var(--muted, #a1a7b3); font-variant-numeric: tabular-nums; font-size: 11px; }
.ap-val { font-variant-numeric: tabular-nums; font-weight: 700; }
.ap-empty { padding: 24px; text-align: center; color: var(--muted, #a1a7b3); font-size: 12px; }
@media (max-width: 560px) { .ap-body { flex-direction: column; align-items: stretch; } .ap-chart { align-self: center; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('ap-styles')) {
  const style = document.createElement('style');
  style.id = 'ap-styles';
  style.textContent = AP_CSS;
  document.head.appendChild(style);
}
