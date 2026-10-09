// OptionSmile — IV por strike (smile/skew) de um vencimento + estrutura a termo (IV ATM por
// vencimento). IV vem da cadeia (bridge/manual) ou calculada localmente (marcada). Sem
// fórmula aqui. Cores só por variável CSS.
// Fonte: DOCS/10_MODULES/options/00-spec.md (sub-aba Smile).
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';
import type { OptionChainQuote } from '@apps/lib/db';
import { ensureOptionStyles } from './optionStyles';

ensureOptionStyles();

interface Props {
  quotes: OptionChainQuote[];
  spots?: Record<string, number>;
}

const tip = { background: 'var(--panel)', border: '1px solid var(--soft)', borderRadius: 10, fontSize: 12 };
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function OptionSmile({ quotes, spots }: Props) {
  const underlyings = useMemo(() => [...new Set(quotes.map((q) => q.underlying))].sort(), [quotes]);
  const [underlying, setUnderlying] = useState('');
  const activeUnderlying = underlyings.includes(underlying) ? underlying : underlyings[0] || '';
  const spot = spots?.[activeUnderlying];
  const expiries = useMemo(
    () => [...new Set(quotes.filter((q) => q.underlying === activeUnderlying).map((q) => q.expiry))].sort(),
    [quotes, activeUnderlying],
  );
  const [expiry, setExpiry] = useState('');
  const activeExpiry = expiries.includes(expiry) ? expiry : expiries[0] || '';

  const data = useMemo(() => {
    const forExp = quotes.filter((q) => q.underlying === activeUnderlying && q.expiry === activeExpiry && q.iv != null);
    const strikes = [...new Set(forExp.map((q) => q.strike))].sort((a, b) => a - b);
    return strikes.map((strike) => ({
      strike,
      call: (forExp.find((q) => q.strike === strike && q.right === 'call')?.iv ?? null) as number | null,
      put: (forExp.find((q) => q.strike === strike && q.right === 'put')?.iv ?? null) as number | null,
    }));
  }, [quotes, activeUnderlying, activeExpiry]);

  // Estrutura a termo: IV do strike mais próximo do spot em cada vencimento (média call/put).
  const term = useMemo(() => {
    if (!(spot && spot > 0)) return [];
    const out: Array<{ expiry: string; iv: number }> = [];
    for (const exp of expiries) {
      const rows = quotes.filter((q) => q.underlying === activeUnderlying && q.expiry === exp && q.iv != null);
      if (rows.length === 0) continue;
      const nearest = rows.reduce((b, q) => (Math.abs(q.strike - spot) < Math.abs(b.strike - spot) ? q : b), rows[0]).strike;
      const atm = rows.filter((q) => q.strike === nearest).map((q) => q.iv as number);
      out.push({ expiry: exp, iv: atm.reduce((s, v) => s + v, 0) / atm.length });
    }
    return out;
  }, [quotes, activeUnderlying, expiries, spot]);

  if (quotes.length === 0) {
    return <div className="card opx-empty" role="status"><b>Sem cadeia para o smile</b><span>Cadastre cotações com IV (ou com bid/ask + spot, que calculam a IV).</span></div>;
  }

  const hasData = data.some((d) => d.call != null || d.put != null);

  return (
    <div className="opx-stack">
      <div className="opx-row">
        <label className="opx-field"><span>Ativo</span>
          <select className="select" value={activeUnderlying} onChange={(e) => { setUnderlying(e.target.value); setExpiry(''); }}>
            {underlyings.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="opx-field"><span>Vencimento</span>
          <select className="select" value={activeExpiry} onChange={(e) => setExpiry(e.target.value)}>
            {expiries.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        {spot != null && <span className="opx-muted opx-small">spot ≈ {spot.toFixed(2)}</span>}
      </div>

      {hasData ? (
        <div className="card opx-panel">
          <span className="opx-title">Smile — IV por strike</span>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--soft)" />
              <XAxis dataKey="strike" type="number" domain={['dataMin', 'dataMax']} tick={{ fontSize: 11 }} stroke="var(--muted)" tickFormatter={(v: number) => v.toFixed(0)} />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} width={48} />
              <Tooltip contentStyle={tip} formatter={(v: number) => pct(v)} labelFormatter={(v: number) => `Strike ${Number(v).toFixed(2)}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {spot != null && <ReferenceLine x={spot} stroke="var(--blue)" strokeDasharray="4 4" />}
              <Line type="monotone" dataKey="call" name="Call IV" stroke="var(--green)" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="put" name="Put IV" stroke="var(--red)" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="card opx-empty">Sem IV disponível para este vencimento.</div>
      )}

      {term.length >= 2 ? (
        <div className="card opx-panel">
          <span className="opx-title">Estrutura a termo — IV ATM por vencimento</span>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={term} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--soft)" />
              <XAxis dataKey="expiry" tick={{ fontSize: 11 }} stroke="var(--muted)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted)" tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} width={48} />
              <Tooltip contentStyle={tip} formatter={(v: number) => pct(v)} />
              <Line type="monotone" dataKey="iv" name="IV ATM" stroke="var(--brand)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <span className="opx-small opx-muted">{spot ? 'A estrutura a termo aparece com IV em ao menos 2 vencimentos.' : 'Informe o spot para ver a estrutura a termo.'}</span>
      )}
    </div>
  );
}
