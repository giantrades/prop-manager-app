// OptionAnalytics — opções por subjacente no Journal: prêmio, win rate, P/L médio e R.
// R = P/L realizado ÷ perda máxima DEFINIDA da estratégia (estratégias de risco ilimitado
// ficam fora do R, com a amostra declarada). Considera todo o histórico de opções (os
// filtros de período/conta do Journal são de trades). Não renderiza sem opções.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (F4 — Journal/Trades) e § Opções.
import React, { useMemo } from 'react';
import { optionAnalyticsByUnderlying } from '@apps/lib/db';
import { fmtMoney } from '../currency';
import { ensureOptionStyles } from './optionStyles';
import { useOptionData } from './useOptionData';

ensureOptionStyles();

export default function OptionAnalytics({ currency = 'USD' }: { currency?: string }) {
  const { loading, legs } = useOptionData();
  const rows = useMemo(() => optionAnalyticsByUnderlying(legs), [legs]);

  if (loading || rows.length === 0) return null;

  const money = (v: number) => fmtMoney(v, currency);
  const tone = (v: number) => (v >= 0 ? 'opx-pos' : 'opx-neg');

  return (
    <section className="card opx-panel" aria-label="Opções por subjacente">
      <div className="opx-row">
        <span className="opx-title opx-grow">Opções por subjacente</span>
        <span className="opx-small opx-muted">todo o histórico de opções</span>
      </div>
      <div className="opx-scroll">
        <table className="opx-table">
          <thead>
            <tr>
              <th className="left" scope="col">Ativo</th>
              <th scope="col">Fechadas</th>
              <th scope="col">Win rate</th>
              <th scope="col">Realizado</th>
              <th scope="col">P/L médio</th>
              <th scope="col">Prêmio líq.</th>
              <th scope="col" title="P/L realizado ÷ perda máxima definida">R médio</th>
              <th scope="col">Abertas</th>
              <th scope="col">Prêmio aberto</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.underlying}>
                <td className="left"><b>{r.underlying}</b></td>
                <td>{r.closedGroups}</td>
                <td>{r.winRate != null ? `${(r.winRate * 100).toFixed(0)}%` : '—'}</td>
                <td className={tone(r.realized)}>{money(r.realized)}</td>
                <td className={r.avgPnl != null ? tone(r.avgPnl) : undefined}>{r.avgPnl != null ? money(r.avgPnl) : '—'}</td>
                <td className={tone(r.premiumClosed)}>{money(r.premiumClosed)}</td>
                <td className={r.avgR != null ? tone(r.avgR) : undefined} title={r.rSamples > 0 ? `${r.rSamples} estratégia(s) com risco definido` : 'sem estratégia de risco definido'}>
                  {r.avgR != null ? `${r.avgR.toFixed(2)}R` : '—'}
                  {r.avgR != null && r.rSamples < 5 && <span className="opx-badge warn" style={{ marginLeft: 6 }}>n={r.rSamples}</span>}
                </td>
                <td>{r.openGroups}</td>
                <td className={tone(r.openPremium)}>{money(r.openPremium)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="opx-small opx-muted">Amostras pequenas (n&lt;5) não são estatística: servem para acompanhar, não para concluir.</span>
    </section>
  );
}
