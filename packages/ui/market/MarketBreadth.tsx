// MARKET — Breadth (amplitude do mercado). Adv/dec, distribuição das variações,
// volume up/down e breadth por setor. Dados de `buildBreadthDetail`.
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { changeClass, fmtPct, injectMarketStyles } from './marketUi';
import type { BreadthDetail } from '@apps/lib/db';

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="mk-kpi">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mk-kpi-sub">{sub}</div>}
    </div>
  );
}

interface MarketBreadthProps {
  breadth: BreadthDetail;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function MarketBreadth({ breadth, at, loading = false, stale = false, error = null, onRefresh }: MarketBreadthProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const maxCount = Math.max(1, ...breadth.distribution.map((d) => d.count));
  const volPct = breadth.volumeRatio != null ? breadth.volumeRatio * 100 : null;

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : `Ao vivo · ${breadth.total} ações`}
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
        <Kpi
          label="% acima do fechamento"
          value={`${(breadth.pctAbove * 100).toFixed(0)}%`}
          sub={`${breadth.advancers} ↑ · ${breadth.decliners} ↓ · ${breadth.unchanged} =`}
          color={breadth.pctAbove >= 0.5 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'}
        />
        <Kpi
          label="Linha A/D"
          value={`${breadth.adLine >= 0 ? '+' : ''}${breadth.adLine}`}
          sub="avanços − quedas"
          color={breadth.adLine >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'}
        />
        <Kpi
          label="Volume up/down"
          value={volPct != null ? `${volPct.toFixed(0)}%` : '—'}
          sub="fração do volume em alta"
          color={volPct != null && volPct >= 50 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'}
        />
        <Kpi
          label="Variação média"
          value={fmtPct(breadth.avgChangePct)}
          sub={`mediana ${fmtPct(breadth.medianChangePct)}`}
          color={breadth.avgChangePct >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'}
        />
      </div>

      <section className="mk-group" aria-label="Distribuição das variações">
        <div className="mk-group-head">
          <span className="mk-group-title">Distribuição das variações (nº de ações por faixa)</span>
        </div>
        <div className="mk-dist">
          {breadth.distribution.map((d) => (
            <div key={d.label} className="mk-dist-col">
              <span className="mk-dist-count">{d.count}</span>
              <span
                className="mk-dist-bar"
                style={{ height: `${Math.max(4, (d.count / maxCount) * 100)}%`, background: d.up ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)' }}
                aria-hidden="true"
              />
              <span className="mk-dist-label">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      {breadth.sectors.length > 0 && (
        <section className="mk-group" aria-label="Breadth por setor">
          <div className="mk-group-head">
            <span className="mk-group-title">Breadth por setor · % acima do fechamento anterior</span>
          </div>
          {[...breadth.sectors].sort((a, b) => b.pctAbove - a.pctAbove).map((b) => (
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
