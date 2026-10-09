// OptionIncomeDetail — visão de renda de opções para Investimentos: cobertura de covered
// calls sobre as ações da carteira, yield (e anualizado) de calls/puts vendidas abertas,
// risco de assignment por data-com e histórico de assignments (ações recebidas por put
// exercida). Spot por subjacente vem dos parâmetros do módulo Opções; sem spot, sem yield
// de call (nunca estimado). Sem fórmula aqui.
//
// Fonte: DOCS/10_MODULES/options/00-spec.md (F4 — Investimentos).
import React, { useMemo } from 'react';
import { optionCoverage, optionDividendRisks, optionIncomeRows, optionQuoteMid } from '@apps/lib/db';
import { fmtMoney } from '../currency';
import { ensureOptionStyles } from './optionStyles';
import { useOptionData } from './useOptionData';

ensureOptionStyles();

const pct = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);

interface Props {
  currency?: string;
  /** Link para o módulo Opções (a página injeta o NavLink do router; default = âncora simples). */
  renderOptionsLink?: (label: string) => React.ReactNode;
}

export default function OptionIncomeDetail({ currency = 'USD', renderOptionsLink }: Props) {
  const { loading, legs, quotes, positions, spots, dividends } = useOptionData();
  const money = (v: number) => fmtMoney(v, currency);

  const coverage = useMemo(() => optionCoverage(legs, positions), [legs, positions]);
  const income = useMemo(() => optionIncomeRows(legs, { spots }), [legs, spots]);
  const assignments = useMemo(() => positions.filter((p) => p.id.startsWith('optassign:')), [positions]);
  const risks = useMemo(() => {
    const byId = new Map(quotes.map((q) => [q.id, q] as const));
    const marks: Record<string, number | null> = {};
    for (const l of legs) {
      const q = byId.get(`${l.underlying}:${l.expiry}:${l.strike}:${l.right}`);
      marks[l.id] = q ? optionQuoteMid(q) : null;
    }
    return optionDividendRisks(legs, dividends, { spots, marks }).filter((r) => r.level !== 'info');
  }, [legs, quotes, dividends, spots]);

  if (loading) return <div className="opx-skel" role="status" aria-label="Carregando renda de opções" />;
  if (coverage.length === 0 && income.length === 0 && assignments.length === 0) {
    return (
      <div className="opx-empty" role="status">
        <span>Sem calls ou puts vendidas abertas. Registre em Trading → Opções.</span>
        {renderOptionsLink ? renderOptionsLink('Abrir Opções') : <a className="opx-btn small" href="/options">Abrir Opções</a>}
      </div>
    );
  }

  return (
    <div className="opx-stack">
      {risks.length > 0 && (
        <div className={`opx-alert ${risks.some((r) => r.level === 'high') ? 'bad' : 'warn'}`} role="alert">
          <b>Risco de assignment antecipado (data-com)</b>
          {risks.map((r) => (
            <span key={`${r.symbol}${r.exDate}`}>
              {r.underlying} call {r.strike} vendida · data-com {r.exDate} ({r.daysToExDate}d)
              {r.amountPerShare != null && <> · dividendo {money(r.amountPerShare)}/ação</>}
              {r.extrinsic != null && <> · valor extrínseco {r.extrinsic.toFixed(2)}</>}
              {r.level === 'high' && <> — extrínseco menor que o dividendo: exercício antecipado é racional.</>}
            </span>
          ))}
        </div>
      )}

      {coverage.length > 0 && (
        <div>
          <div className="opx-title" style={{ marginBottom: 6 }}>Cobertura das calls vendidas</div>
          <div className="opx-scroll">
            <table className="opx-table" aria-label="Cobertura de covered calls">
              <thead><tr><th className="left" scope="col">Ativo</th><th scope="col">Ações</th><th scope="col">Calls vendidas</th><th scope="col">Cobertas</th><th scope="col">Cobertura</th></tr></thead>
              <tbody>
                {coverage.map((c) => (
                  <tr key={c.underlying}>
                    <td className="left"><b>{c.underlying}</b></td>
                    <td>{c.shares}</td>
                    <td>{c.shortCallContracts}</td>
                    <td>{c.coveredContracts}</td>
                    <td>
                      {(c.coveragePct * 100).toFixed(0)}%{' '}
                      {c.coveragePct < 1 && <span className="opx-badge bad">descoberta</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {income.length > 0 && (
        <div>
          <div className="opx-title" style={{ marginBottom: 6 }}>Yield de prêmios abertos</div>
          <div className="opx-scroll">
            <table className="opx-table" aria-label="Yield de calls e puts vendidas">
              <thead><tr><th className="left" scope="col">Posição</th><th scope="col">Venc.</th><th scope="col">DTE</th><th scope="col">Prêmio</th><th scope="col">Yield</th><th scope="col">Anualizado</th></tr></thead>
              <tbody>
                {income.map((r) => (
                  <tr key={r.groupId}>
                    <td className="left"><b>{r.underlying}</b> {r.kind === 'covered-call' ? 'call' : 'put'} {r.strike} ×{r.contracts}</td>
                    <td>{r.expiry}</td>
                    <td>{r.dte}</td>
                    <td className="opx-pos">{money(r.netPremium)}</td>
                    <td title={r.basis != null ? `base ${money(r.basis)}` : 'informe o spot em Opções → Parâmetros'}>{pct(r.yieldPct)}</td>
                    <td>{pct(r.annualizedPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="opx-small opx-muted">Call: prêmio ÷ (spot × multiplicador × contratos). Put: prêmio ÷ (strike × multiplicador × contratos). Sem spot, o yield da call não é estimado.</span>
        </div>
      )}

      {assignments.length > 0 && (
        <div>
          <div className="opx-title" style={{ marginBottom: 6 }}>Assignments → ações na carteira</div>
          <div className="opx-scroll">
            <table className="opx-table" aria-label="Assignments">
              <thead><tr><th className="left" scope="col">Ativo</th><th scope="col">Ações</th><th scope="col">Custo médio (c/ prêmio)</th></tr></thead>
              <tbody>
                {assignments.map((p) => (
                  <tr key={p.id}><td className="left"><b>{p.symbol}</b></td><td>{p.qty}</td><td>{money(p.avgPrice)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
