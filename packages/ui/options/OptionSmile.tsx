// OptionSmile — IV por strike (smile/skew) para um vencimento, calls e puts.
// Fonte: DOCS/10_MODULES/options/00-spec.md (sub-aba Smile).
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { OptionChainQuote } from '@apps/lib/db';

interface Props {
  quotes: OptionChainQuote[];
  spot?: number;
}

export default function OptionSmile({ quotes, spot }: Props) {
  const underlyings = useMemo(() => [...new Set(quotes.map((q) => q.underlying))].sort(), [quotes]);
  const [underlying, setUnderlying] = useState('');
  const activeUnderlying = underlying || underlyings[0] || '';
  const expiries = useMemo(
    () => [...new Set(quotes.filter((q) => q.underlying === activeUnderlying).map((q) => q.expiry))].sort(),
    [quotes, activeUnderlying],
  );
  const [expiry, setExpiry] = useState('');
  const activeExpiry = expiry || expiries[0] || '';

  const data = useMemo(() => {
    const forExp = quotes.filter(
      (q) => q.underlying === activeUnderlying && q.expiry === activeExpiry && q.iv != null,
    );
    const strikes = [...new Set(forExp.map((q) => q.strike))].sort((a, b) => a - b);
    return strikes.map((strike) => ({
      strike,
      call: (forExp.find((q) => q.strike === strike && q.right === 'call')?.iv ?? null) as number | null,
      put: (forExp.find((q) => q.strike === strike && q.right === 'put')?.iv ?? null) as number | null,
    }));
  }, [quotes, activeUnderlying, activeExpiry]);

  const hasData = data.some((d) => d.call != null || d.put != null);

  return (
    <div className="osm-root">
      <div className="osm-filters">
        <label className="osm-field"><span>Ativo</span>
          <select className="select" value={activeUnderlying} onChange={(e) => { setUnderlying(e.target.value); setExpiry(''); }}>
            {underlyings.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="osm-field"><span>Vencimento</span>
          <select className="select" value={activeExpiry} onChange={(e) => setExpiry(e.target.value)}>
            {expiries.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        {spot != null && <span className="muted osm-spot">spot ≈ {spot.toFixed(2)}</span>}
      </div>

      {hasData ? (
        <div className="card osm-chart">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="strike" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 11 }} stroke="#a1a7b3" tickFormatter={(v: number) => v.toFixed(0)} />
              <YAxis tick={{ fontSize: 11 }} stroke="#a1a7b3" tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} width={48} />
              <Tooltip
                contentStyle={{ background: '#0f1218', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: 12 }}
                formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                labelFormatter={(v: number) => `Strike ${Number(v).toFixed(2)}`}
              />
              <Legend />
              <Line type="monotone" dataKey="call" name="Call IV" stroke="#2ecc71" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="put" name="Put IV" stroke="#e74c3c" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card" style={{ padding: 16 }}><span className="muted">Sem IV disponível para este vencimento.</span></div>
      )}
      <style>{OSM_CSS}</style>
    </div>
  );
}

const OSM_CSS = `
.osm-root { display: flex; flex-direction: column; gap: 10px; }
.osm-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
.osm-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.osm-field span { color: var(--muted, #a1a7b3); }
.osm-spot { font-size: 12px; margin-left: auto; }
.osm-chart { padding: 12px; }
`;

if (typeof document !== 'undefined' && !document.getElementById('osm-styles')) {
  const s = document.createElement('style');
  s.id = 'osm-styles';
  s.textContent = OSM_CSS;
  document.head.appendChild(s);
}
