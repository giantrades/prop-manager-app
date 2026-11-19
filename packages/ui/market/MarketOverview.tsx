// MARKET — Environment (painel cross-asset, estilo terminal). Apresentação pura:
// recebe grupos já calculados pelo motor (`buildOverview`/`buildRiskComposite`/
// `buildBreadth`) e só renderiza.
import React, { useEffect } from 'react';
import { RefreshCw, Activity } from 'lucide-react';
import Sparkline from './Sparkline';
import {
  changeClass,
  fmtPct,
  fmtPrice,
  injectMarketStyles,
  isStale,
} from './marketUi';
import type { BreadthRow, MarketQuote, OverviewGroup, RiskComposite } from '@apps/lib/db';

export interface OverviewSummary {
  advancers: number;
  decliners: number;
  total: number;
  sectorsUp: number;
  sectorsTotal: number;
}

interface MarketOverviewProps {
  groups: OverviewGroup[];
  risk: RiskComposite;
  breadth: BreadthRow[];
  summary: OverviewSummary;
  vix: MarketQuote | null;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="mk-kpi">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mk-kpi-sub">{sub}</div>}
    </div>
  );
}

function QuoteRow({ symbol, label, quote }: { symbol: string; label: string; quote: MarketQuote | null }) {
  const chg = quote?.changePct ?? null;
  return (
    <div className="mk-row">
      <div className="mk-row-name">
        <span className="mk-row-sym">
          {symbol}
          {isStale(quote) && <span className="mk-stale-tag">cache</span>}
        </span>
        <span className="mk-row-label">{label}</span>
      </div>
      <div className="mk-row-spark">
        {quote && quote.series.length > 1 ? (
          <Sparkline series={quote.series} changePct={chg} width={78} height={24} ariaLabel={`${symbol} sparkline`} />
        ) : null}
      </div>
      <div className="mk-row-price">{fmtPrice(quote?.price ?? null)}</div>
      <div className={`mk-row-chg ${changeClass(chg)}`}>{fmtPct(chg)}</div>
    </div>
  );
}

export default function MarketOverview({
  groups,
  risk,
  breadth,
  summary,
  vix,
  at,
  loading = false,
  stale = false,
  error = null,
  onRefresh,
}: MarketOverviewProps) {
  useEffect(() => { injectMarketStyles(); }, []);

  const breadthPct = summary.total > 0 ? summary.advancers / summary.total : 0;
  const riskColor = risk.label === 'RISK-ON' ? 'var(--green, #2ecc71)' : risk.label === 'RISK-OFF' ? 'var(--red, #e74c3c)' : 'var(--muted, #a1a7b3)';

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache (feed indisponível)' : 'Ao vivo · Yahoo Finance'}
        </span>
        {at && <span className="mk-status">atualizado {new Date(at).toLocaleTimeString('pt-BR')}</span>}
        <span className="mk-toolbar-spacer" />
        {onRefresh && (
          <button type="button" className="mk-btn" onClick={onRefresh} disabled={loading} aria-busy={loading}>
            <RefreshCw size={14} /> {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        )}
      </div>

      {error && (
        <div className="cmd-warn" role="alert">
          Feed de mercado indisponível ({error}). Exibindo o último valor em cache quando houver.
        </div>
      )}

      <div className="mk-kpis">
        <Kpi
          label="Apetite a risco"
          value={risk.label}
          sub={`score ${(risk.score * 100).toFixed(2)}%`}
          color={riskColor}
        />
        <Kpi
          label="Breadth (ações)"
          value={`${(breadthPct * 100).toFixed(0)}%`}
          sub={`${summary.advancers} em alta · ${summary.decliners} em baixa`}
          color={breadthPct >= 0.5 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'}
        />
        <Kpi
          label="Setores em alta"
          value={`${summary.sectorsUp}/${summary.sectorsTotal}`}
          sub="SPDR vs fech. anterior"
        />
        <Kpi
          label="VIX"
          value={fmtPrice(vix?.price ?? null, 2)}
          sub={vix ? fmtPct(vix.changePct) : '—'}
          color={vix?.changePct != null && vix.changePct > 0 ? 'var(--red, #e74c3c)' : 'var(--green, #2ecc71)'}
        />
      </div>

      <div className="mk-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {groups.map((g) => (
          <section key={g.id} className="mk-group" aria-label={g.label}>
            <div className="mk-group-head">
              <span className="mk-group-title">{g.label}</span>
              <span className="mk-group-breadth">
                <span className="mk-up">{g.advancers}</span>
                {' / '}
                <span className="mk-down">{g.decliners}</span>
              </span>
            </div>
            {g.rows.map((r) => (
              <QuoteRow key={r.symbol} symbol={r.symbol} label={r.label} quote={r.quote} />
            ))}
          </section>
        ))}
      </div>

      {breadth.length > 0 && (
        <section className="mk-group" aria-label="Breadth por setor">
          <div className="mk-group-head">
            <span className="mk-group-title"><Activity size={13} style={{ verticalAlign: '-2px' }} /> Breadth por setor · % acima do fechamento anterior</span>
          </div>
          {[...breadth].sort((a, b) => b.pctAbove - a.pctAbove).map((b) => (
            <div key={b.id} className="mk-breadth-row">
              <span className="mk-breadth-name">{b.label}</span>
              <span className="mk-breadth-bar" aria-hidden="true">
                <span className="mk-breadth-fill" style={{ width: `${(b.pctAbove * 100).toFixed(0)}%` }} />
              </span>
              <span className="mk-breadth-pct">
                {(b.pctAbove * 100).toFixed(0)}%
                <span className={changeClass(b.etfChangePct)} style={{ marginLeft: 8 }}>{fmtPct(b.etfChangePct, 1)}</span>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
