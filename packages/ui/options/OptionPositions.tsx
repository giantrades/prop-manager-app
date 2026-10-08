// OptionPositions — posições de opções agrupadas por estratégia (derivadas de `option_legs`).
// Mostra prêmio, P/L realizado, e (com spot) máx lucro/perda, breakevens e gregas líquidas.
// Fonte: DOCS/10_MODULES/options/00-spec.md (sub-aba Posições).
import React, { useMemo } from 'react';
import { groupOptionLegs, summarizeOptionStrategy } from '@apps/lib/db';
import type { OptionLeg } from '@apps/lib/db';
import { fmtMoney } from '../currency';

interface Props {
  legs: OptionLeg[];
  spot?: number;
  rate?: number;
  onDelete?: (legIds: string[]) => void;
  onAssign?: (leg: OptionLeg) => void;
}

const KIND_LABEL: Record<string, string> = {
  'single-call': 'Call', 'single-put': 'Put', vertical: 'Vertical', straddle: 'Straddle',
  strangle: 'Strangle', condor: 'Condor', butterfly: 'Borboleta', calendar: 'Calendário', custom: 'Custom',
};

function fmtSigned(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

export default function OptionPositions({ legs, spot, rate = 0.05, onDelete, onAssign }: Props) {
  const groups = useMemo(() => groupOptionLegs(legs), [legs]);

  if (groups.length === 0) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <span className="muted">Nenhuma posição de opções. Monte uma no Desk (+1/−1) e salve, ou importe do bridge.</span>
      </div>
    );
  }

  return (
    <div className="opg-root">
      {groups.map((g) => {
        const summary =
          spot != null
            ? summarizeOptionStrategy(g.legs, { S: spot, r: rate, rangePct: 0.5, points: 41 })
            : null;
        return (
          <div key={g.id} className="card opg-card">
            <div className="opg-head">
              <div className="opg-title">
                <b>{g.underlying}</b>
                <span className="chip">{KIND_LABEL[g.kind] ?? g.kind}</span>
                <span className={`opg-badge ${g.open ? 'open' : 'closed'}`}>{g.open ? 'aberta' : 'fechada'}</span>
              </div>
              <div className="opg-nums">
                <span>Prêmio <b className={g.netPremium >= 0 ? 'pos' : 'neg'}>{fmtMoney(g.netPremium, 'USD')}</b></span>
                <span>Realizado <b className={g.realizedPnl >= 0 ? 'pos' : 'neg'}>{fmtMoney(g.realizedPnl, 'USD')}</b></span>
                {onDelete && (
                  <button type="button" className="cmd-refresh" onClick={() => onDelete(g.legs.map((l) => l.id))}>Excluir</button>
                )}
              </div>
            </div>

            {summary && g.open && (
              <div className="opg-summary">
                <span>Máx lucro <b className="pos">{summary.maxProfitUnbounded ? '∞' : fmtMoney(summary.maxProfit, 'USD')}</b></span>
                <span>Máx perda <b className="neg">{summary.maxLossUnbounded ? '∞' : fmtMoney(summary.maxLoss, 'USD')}</b></span>
                <span>Breakevens <b>{summary.breakevens.length ? summary.breakevens.map((b) => b.toFixed(2)).join(' / ') : '—'}</b></span>
                <span>Δ <b>{summary.greeks.delta.toFixed(2)}</b></span>
                <span>Θ <b>{summary.greeks.theta.toFixed(1)}</b></span>
              </div>
            )}

            <div className="opg-scroll">
              <table className="opg-table">
                <thead>
                  <tr><th>Lado</th><th>Tipo</th><th>Strike</th><th>Venc.</th><th>Qtd</th><th>Entrada</th><th>Saída</th><th>IV</th><th aria-hidden="true" /></tr>
                </thead>
                <tbody>
                  {g.legs.map((l) => (
                    <tr key={l.id}>
                      <td className={l.qty >= 0 ? 'pos' : 'neg'}>{l.qty >= 0 ? 'Long' : 'Short'}</td>
                      <td>{l.right === 'call' ? 'Call' : 'Put'}</td>
                      <td>{l.strike.toFixed(2)}</td>
                      <td>{l.expiry}</td>
                      <td>{Math.abs(l.qty)}</td>
                      <td>{l.entryPrice.toFixed(2)}</td>
                      <td>{l.exitPrice != null ? l.exitPrice.toFixed(2) : '—'}</td>
                      <td>{l.ivEntry != null ? `${(l.ivEntry * 100).toFixed(0)}%` : '—'}</td>
                      <td>
                        {onAssign && l.exitPrice == null && l.qty < 0 ? (
                          <button type="button" className="cmd-refresh" onClick={() => onAssign(l)} aria-label={`Registrar assignment ${l.symbol}`}>Exercer</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <style>{OPG_CSS}</style>
    </div>
  );
}

const OPG_CSS = `
.opg-root { display: flex; flex-direction: column; gap: 12px; }
.opg-card { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.opg-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.opg-title { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.opg-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; }
.opg-badge.open { background: rgba(46,204,113,0.14); color: var(--green, #2ecc71); }
.opg-badge.closed { background: rgba(161,167,179,0.14); color: var(--muted, #a1a7b3); }
.opg-nums { display: flex; align-items: center; gap: 12px; font-size: 12px; flex-wrap: wrap; }
.opg-nums .pos, .opg-summary .pos, .opg-table .pos { color: var(--green, #2ecc71); }
.opg-nums .neg, .opg-summary .neg, .opg-table .neg { color: var(--red, #e74c3c); }
.opg-summary { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--muted, #a1a7b3); }
.opg-scroll { overflow-x: auto; }
.opg-table { border-collapse: collapse; width: 100%; font-size: 12px; font-variant-numeric: tabular-nums; min-width: 520px; }
.opg-table th, .opg-table td { padding: 6px 8px; text-align: right; white-space: nowrap; }
.opg-table th { color: var(--muted, #a1a7b3); font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.08); }
.opg-table tbody tr { border-bottom: 1px solid rgba(255,255,255,0.04); }
`;

if (typeof document !== 'undefined' && !document.getElementById('opg-styles')) {
  const s = document.createElement('style');
  s.id = 'opg-styles';
  s.textContent = OPG_CSS;
  document.head.appendChild(s);
}
