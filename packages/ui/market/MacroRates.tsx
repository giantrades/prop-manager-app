// MACRO — Juros & liquidez. Yields do Treasury + ETFs de duration/crédito + stress de crédito.
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { changeClass, fmtPct, fmtPrice, injectMarketStyles } from './marketUi';
import type { CreditStress, RateRow } from '@apps/lib/db';

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="mk-kpi">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mk-kpi-sub">{sub}</div>}
    </div>
  );
}

interface MacroRatesProps {
  rows: RateRow[];
  credit: CreditStress;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function MacroRates({ rows, credit, at, loading = false, stale = false, error = null, onRefresh }: MacroRatesProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const riskColor = credit.riskAppetite == null ? undefined : credit.riskAppetite >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)';

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : 'Juros & liquidez'}
        </span>
        {at && <span className="mk-status">atualizado {new Date(at).toLocaleTimeString('pt-BR')}</span>}
        <span className="mk-toolbar-spacer" />
        {onRefresh && (
          <button type="button" className="mk-btn" onClick={onRefresh} disabled={loading} aria-busy={loading}>
            <RefreshCw size={14} /> {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        )}
      </div>

      {error && <div className="cmd-warn" role="alert">Feed indisponível ({error}). Mostrando cache quando houver.</div>}

      <div className="mk-kpis">
        <Kpi label="Apetite a risco (crédito)" value={credit.label} sub="HY vs Treasury (período)" color={riskColor} />
        <Kpi label="High yield (período)" value={fmtPct(credit.hyg1m)} sub="HYG" color={credit.hyg1m != null && credit.hyg1m >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'} />
        <Kpi label="Investment grade (período)" value={fmtPct(credit.lqd1m)} sub="LQD" />
        <Kpi label="Treasury longo (período)" value={fmtPct(credit.tlt1m)} sub="TLT" />
      </div>

      <section className="mk-group" aria-label="Juros e liquidez">
        <div className="mk-table">
          <div className="mk-table-head">
            <span>Instrumento</span>
            <span className="mk-num">Último</span>
            <span className="mk-num">1d</span>
            <span className="mk-num">Período</span>
          </div>
          {rows.map((r) => (
            <div key={r.symbol} className="mk-table-row">
              <span className="mk-table-name">
                <span className="mk-table-sym">{r.label}</span>
                <span className="mk-table-sub">{r.symbol}</span>
              </span>
              <span className="mk-num">{r.kind === 'yield' ? (r.value != null ? `${r.value.toFixed(2)}%` : '—') : fmtPrice(r.value)}</span>
              <span className={`mk-num ${changeClass(r.change1d)}`}>{fmtPct(r.change1d, 2)}</span>
              <span className={`mk-num ${r.changeBp != null ? (r.changeBp >= 0 ? 'mk-up' : 'mk-down') : changeClass(r.changePeriod)}`}>
                {r.kind === 'yield' && r.changeBp != null ? `${r.changeBp >= 0 ? '+' : ''}${r.changeBp.toFixed(0)} bp` : fmtPct(r.changePeriod, 2)}
              </span>
            </div>
          ))}
        </div>
      </section>
      <p className="mk-subtitle" style={{ marginTop: 10 }}>Período = ~1 mês. Yields em pontos-base para mostrar a variação absoluta do juro.</p>
    </div>
  );
}
