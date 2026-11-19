// MARKET — Movers (extremos do mercado): maiores altas/baixas, mais negociadas
// e movimentos incomuns. Dados calculados por `buildMovers`; UI só renderiza.
import React, { useEffect } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Flame, Zap } from 'lucide-react';
import { changeClass, fmtPct, fmtPrice, fmtVolume, injectMarketStyles } from './marketUi';
import { SECTORS } from '@apps/lib/db';
import type { Mover, MoversResult } from '@apps/lib/db';

const SECTOR_LABEL: Record<string, string> = SECTORS.reduce((acc, s) => {
  acc[s.id] = s.short;
  return acc;
}, {} as Record<string, string>);

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="mk-kpi">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mk-kpi-sub">{sub}</div>}
    </div>
  );
}

function MoverRow({ m, rank, showVolume = false }: { m: Mover; rank: number; showVolume?: boolean }) {
  return (
    <div className="mk-mover-row">
      <span className="mk-mover-rank">{rank}</span>
      <span className="mk-mover-name">
        <span className="mk-mover-sym">{m.symbol}</span>
        <span className="mk-mover-sub">{m.name} · {SECTOR_LABEL[m.sector] ?? m.sector}</span>
      </span>
      <span>
        <div className={`mk-mover-chg ${changeClass(m.changePct)}`}>{fmtPct(m.changePct)}</div>
        <div className="mk-mover-price">{showVolume ? fmtVolume(m.volume) : fmtPrice(m.price)}</div>
      </span>
    </div>
  );
}

function MoverPanel({ title, icon, movers, showVolume = false }: { title: string; icon: React.ReactNode; movers: Mover[]; showVolume?: boolean }) {
  return (
    <section className="mk-group" aria-label={title}>
      <div className="mk-group-head">
        <span className="mk-group-title">{icon} {title}</span>
      </div>
      {movers.length === 0 ? (
        <div className="mk-empty">Sem dados.</div>
      ) : (
        movers.map((m, i) => <MoverRow key={m.symbol} m={m} rank={i + 1} showVolume={showVolume} />)
      )}
    </section>
  );
}

interface MarketMoversProps {
  movers: MoversResult;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function MarketMovers({ movers, at, loading = false, stale = false, error = null, onRefresh }: MarketMoversProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const topGainer = movers.gainers[0] ?? null;
  const topLoser = movers.losers[0] ?? null;
  const breadthPct = movers.universeSize > 0 ? movers.advancers / movers.universeSize : 0;

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : `Ao vivo · ${movers.universeSize} ações`}
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
        <Kpi label="Breadth" value={`${(breadthPct * 100).toFixed(0)}%`} sub={`${movers.advancers} ↑ · ${movers.decliners} ↓`} color={breadthPct >= 0.5 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'} />
        <Kpi label="Maior alta" value={topGainer ? fmtPct(topGainer.changePct) : '—'} sub={topGainer ? topGainer.symbol : '—'} color="var(--green, #2ecc71)" />
        <Kpi label="Maior baixa" value={topLoser ? fmtPct(topLoser.changePct) : '—'} sub={topLoser ? topLoser.symbol : '—'} color="var(--red, #e74c3c)" />
        <Kpi label="Universo" value={String(movers.universeSize)} sub="ações monitoradas" />
      </div>

      <div className="mk-movers-cols">
        <MoverPanel title="Maiores altas" icon={<TrendingUp size={13} style={{ verticalAlign: '-2px' }} />} movers={movers.gainers} />
        <MoverPanel title="Maiores baixas" icon={<TrendingDown size={13} style={{ verticalAlign: '-2px' }} />} movers={movers.losers} />
      </div>

      <div className="mk-movers-cols">
        <MoverPanel title="Mais negociadas (volume)" icon={<Flame size={13} style={{ verticalAlign: '-2px' }} />} movers={movers.mostActive} showVolume />
        <MoverPanel title="Movimentos incomuns (|variação|)" icon={<Zap size={13} style={{ verticalAlign: '-2px' }} />} movers={movers.unusual} />
      </div>
    </div>
  );
}
