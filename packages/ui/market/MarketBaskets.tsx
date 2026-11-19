// MARKET — Themes / Factors (cestas pontuadas). Componente compartilhado: recebe os
// `BasketScore` já calculados (`buildThemes`/`buildFactors`) e renderiza.
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { changeClass, fmtPct, injectMarketStyles } from './marketUi';
import type { BasketScore } from '@apps/lib/db';

interface MarketBasketsProps {
  title: string;
  subtitle: string;
  scores: BasketScore[];
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

function BasketCard({ b }: { b: BasketScore }) {
  const color = b.avgChangePct >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)';
  const breadthPct = b.breadth * 100;
  return (
    <section className="mk-basket" aria-label={b.label}>
      <div className="mk-basket-head">
        <span className="mk-basket-name">{b.label}</span>
        <span className="mk-basket-score" style={{ color }}>{fmtPct(b.avgChangePct)}</span>
      </div>
      <div className="mk-basket-meta">
        <span>{breadthPct.toFixed(0)}% em alta</span>
        <span className={changeClass(b.relToBench)}>rel SPY {fmtPct(b.relToBench)}</span>
        <span>{b.n} ativos</span>
      </div>
      <div className="mk-basket-bar" aria-hidden="true">
        <span className="mk-basket-bar-fill" style={{ width: `${breadthPct.toFixed(0)}%`, background: breadthPct >= 50 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)' }} />
      </div>
      <div className="mk-basket-members">
        {b.members.slice(0, 10).map((m) => (
          <span key={m.symbol} className={`mk-chip ${changeClass(m.changePct)}`}>
            {m.symbol} {fmtPct(m.changePct, 1)}
          </span>
        ))}
      </div>
    </section>
  );
}

export default function MarketBaskets({ title, subtitle, scores, at, loading = false, stale = false, error = null, onRefresh }: MarketBasketsProps) {
  useEffect(() => { injectMarketStyles(); }, []);

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : 'Ao vivo · Yahoo Finance'}
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

      <div className="mk-note">{subtitle}</div>

      {scores.length === 0 ? (
        <div className="mk-group"><div className="mk-empty">Sem dados. Verifique o feed de mercado.</div></div>
      ) : (
        <div className="mk-baskets">
          {scores.map((b) => <BasketCard key={b.id} b={b} />)}
        </div>
      )}
    </div>
  );
}
