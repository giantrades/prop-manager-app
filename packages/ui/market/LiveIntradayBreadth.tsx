// LIVE — Intraday breadth. % de instrumentos acima do open da sessão (barras 5 min).
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { changeClass, fmtPct, injectMarketStyles } from './marketUi';
import type { IntradayBreadth } from '@apps/lib/db';

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="mk-kpi">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mk-kpi-sub">{sub}</div>}
    </div>
  );
}

interface LiveIntradayBreadthProps {
  breadth: IntradayBreadth;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function LiveIntradayBreadth({ breadth, at, loading = false, stale = false, error = null, onRefresh }: LiveIntradayBreadthProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const maxAbs = Math.max(0.001, ...breadth.rows.map((r) => Math.abs(r.changePct ?? 0)));

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : `Intraday · ${breadth.total} instrumentos`}
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
        <Kpi label="% acima do open" value={`${(breadth.pctUp * 100).toFixed(0)}%`} sub={`${breadth.advancers} ↑ · ${breadth.decliners} ↓ · ${breadth.unchanged} =`} color={breadth.pctUp >= 0.5 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'} />
        <Kpi label="Avanços" value={String(breadth.advancers)} sub="acima do open" color="var(--green, #2ecc71)" />
        <Kpi label="Quedas" value={String(breadth.decliners)} sub="abaixo do open" color="var(--red, #e74c3c)" />
        <Kpi label="Variação média" value={fmtPct(breadth.avgChangePct, 2)} sub="na sessão" color={breadth.avgChangePct != null && breadth.avgChangePct >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'} />
      </div>

      <section className="mk-group" aria-label="Intraday por instrumento">
        <div className="mk-group-head">
          <span className="mk-group-title">Desempenho na sessão · acima/abaixo do open</span>
        </div>
        <div className="mk-live-rows">
          {breadth.rows.map((r) => {
            const v = r.changePct ?? 0;
            const w = (Math.abs(v) / maxAbs) * 50;
            return (
              <div key={r.symbol} className="mk-live-row">
                <span>{r.label}</span>
                <span className="mk-live-bar" aria-hidden="true">
                  <span
                    className="mk-live-fill"
                    style={{
                      left: '50%',
                      width: `${w}%`,
                      transform: v < 0 ? 'translateX(-100%)' : undefined,
                      background: v >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)',
                    }}
                  />
                </span>
                <span className={`mk-num ${changeClass(r.changePct)}`}>{fmtPct(r.changePct, 2)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
