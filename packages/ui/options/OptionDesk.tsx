// OptionDesk — cadeia de opções (estilo Quantower): strikes × calls/puts com IV, Δ e OI,
// destaque do ATM e botões de paper (+1 / −1). Dados vêm por props (cache `option_chain`).
// Sem cálculo financeiro aqui.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (sub-aba Desk).
import React, { useMemo, useState } from 'react';
import type { OptionChainQuote } from '@apps/lib/db';

interface Props {
  quotes: OptionChainQuote[];
  spot?: number;
  onAddPaper?: (quote: OptionChainQuote, qty: number) => void;
}

function fmt(v: number | null | undefined, digits = 2): string {
  return v == null ? '—' : v.toFixed(digits);
}

export default function OptionDesk({ quotes, spot, onAddPaper }: Props) {
  const underlyings = useMemo(() => [...new Set(quotes.map((q) => q.underlying))].sort(), [quotes]);
  const [underlying, setUnderlying] = useState<string>('');
  const activeUnderlying = underlying || underlyings[0] || '';

  const expiries = useMemo(
    () => [...new Set(quotes.filter((q) => q.underlying === activeUnderlying).map((q) => q.expiry))].sort(),
    [quotes, activeUnderlying],
  );
  const [expiry, setExpiry] = useState<string>('');
  const activeExpiry = expiry || expiries[0] || '';

  const rows = useMemo(() => {
    const forExp = quotes.filter((q) => q.underlying === activeUnderlying && q.expiry === activeExpiry);
    const strikes = [...new Set(forExp.map((q) => q.strike))].sort((a, b) => a - b);
    return strikes.map((strike) => ({
      strike,
      call: forExp.find((q) => q.strike === strike && q.right === 'call'),
      put: forExp.find((q) => q.strike === strike && q.right === 'put'),
    }));
  }, [quotes, activeUnderlying, activeExpiry]);

  const atmStrike = useMemo(() => {
    if (spot == null || rows.length === 0) return null;
    return rows.reduce((best, r) => (Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best), rows[0]).strike;
  }, [rows, spot]);

  if (quotes.length === 0) {
    return <div className="card" style={{ padding: 16 }}><span className="muted">Sem cadeia carregada. Importe/atualize cotações (bridge) ou use o Analyzer offline.</span></div>;
  }

  return (
    <div className="od-root">
      <div className="od-filters">
        <label className="od-field"><span>Ativo</span>
          <select className="select" value={activeUnderlying} onChange={(e) => { setUnderlying(e.target.value); setExpiry(''); }}>
            {underlyings.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="od-field"><span>Vencimento</span>
          <select className="select" value={activeExpiry} onChange={(e) => setExpiry(e.target.value)}>
            {expiries.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <span className="od-hint muted">Δ por ação · IV em % · toque em +1/−1 p/ paper</span>
      </div>

      <div className="od-scroll">
        <table className="od-table">
          <thead>
            <tr>
              <th colSpan={6} className="od-th-call">CALLS</th>
              <th className="od-th-strike">Strike</th>
              <th colSpan={6} className="od-th-put">PUTS</th>
            </tr>
            <tr>
              <th>OI</th><th>IV%</th><th>Δ</th><th>Bid</th><th>Ask</th><th>Paper</th>
              <th className="od-th-strike" />
              <th>Paper</th><th>Bid</th><th>Ask</th><th>Δ</th><th>IV%</th><th>OI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ strike, call, put }) => (
              <tr key={strike} className={atmStrike === strike ? 'od-atm' : ''}>
                <td>{call?.oi ?? '—'}</td>
                <td>{call?.iv != null ? (call.iv * 100).toFixed(0) : '—'}</td>
                <td>{fmt(call?.greeks?.delta)}</td>
                <td className="od-bid">{fmt(call?.bid)}</td>
                <td className="od-ask">{fmt(call?.ask)}</td>
                <td className="od-paper">
                  <button type="button" className="od-pbtn" disabled={!call || !onAddPaper} aria-label={`Paper long call ${strike}`} onClick={() => call && onAddPaper?.(call, 1)}>+1</button>
                  <button type="button" className="od-pbtn" disabled={!call || !onAddPaper} aria-label={`Paper short call ${strike}`} onClick={() => call && onAddPaper?.(call, -1)}>−1</button>
                </td>
                <td className="od-th-strike">{strike.toFixed(2)}</td>
                <td className="od-paper">
                  <button type="button" className="od-pbtn" disabled={!put || !onAddPaper} aria-label={`Paper long put ${strike}`} onClick={() => put && onAddPaper?.(put, 1)}>+1</button>
                  <button type="button" className="od-pbtn" disabled={!put || !onAddPaper} aria-label={`Paper short put ${strike}`} onClick={() => put && onAddPaper?.(put, -1)}>−1</button>
                </td>
                <td className="od-bid">{fmt(put?.bid)}</td>
                <td className="od-ask">{fmt(put?.ask)}</td>
                <td>{fmt(put?.greeks?.delta)}</td>
                <td>{put?.iv != null ? (put.iv * 100).toFixed(0) : '—'}</td>
                <td>{put?.oi ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{OD_CSS}</style>
    </div>
  );
}

const OD_CSS = `
.od-root { display: flex; flex-direction: column; gap: 10px; }
.od-filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
.od-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.od-field span { color: var(--muted, #a1a7b3); }
.od-hint { font-size: 11px; margin-left: auto; }
.od-scroll { overflow-x: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; }
.od-table { border-collapse: collapse; width: 100%; font-size: 12px; font-variant-numeric: tabular-nums; min-width: 720px; }
.od-table th, .od-table td { padding: 6px 8px; text-align: right; white-space: nowrap; }
.od-table thead th { color: var(--muted, #a1a7b3); font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.08); }
.od-th-call { text-align: center !important; color: var(--green, #2ecc71) !important; }
.od-th-put { text-align: center !important; color: var(--red, #e74c3c) !important; }
.od-th-strike { text-align: center !important; background: rgba(255,255,255,0.03); font-weight: 700; }
.od-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.04); }
.od-atm td { background: rgba(124,92,255,0.10); }
.od-bid { color: var(--green, #2ecc71); }
.od-ask { color: var(--red, #e74c3c); }
.od-paper { white-space: nowrap; }
.od-pbtn { padding: 2px 6px; margin: 0 1px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: var(--text, #e7eaf0); font-size: 11px; cursor: pointer; }
.od-pbtn:disabled { opacity: 0.35; cursor: default; }
`;

if (typeof document !== 'undefined' && !document.getElementById('od-styles')) {
  const s = document.createElement('style');
  s.id = 'od-styles';
  s.textContent = OD_CSS;
  document.head.appendChild(s);
}
