// MACRO — Vol regime. VIX, estrutura a termo (9D/VIX/3M/6M), contango/backwardation e regime.
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { changeClass, fmtPct, injectMarketStyles } from './marketUi';
import type { VolRegime } from '@apps/lib/db';

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="mk-kpi">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mk-kpi-sub">{sub}</div>}
    </div>
  );
}

interface MacroVolProps {
  vol: VolRegime;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function MacroVol({ vol, at, loading = false, stale = false, error = null, onRefresh }: MacroVolProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const maxTerm = Math.max(1, ...vol.term.map((t) => t.value ?? 0));
  const regimeColor =
    vol.regime === 'ALTA' ? 'var(--red, #e74c3c)' :
    vol.regime === 'ELEVADA' ? 'var(--yellow, #e1b12c)' :
    vol.regime === 'NORMAL' ? 'var(--text, #e7eaf0)' : 'var(--green, #2ecc71)';
  const structColor = vol.structure === 'BACKWARDATION' ? 'var(--red, #e74c3c)' : 'var(--green, #2ecc71)';

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : 'Vol regime'}
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
        <Kpi label="VIX" value={vol.vix != null ? vol.vix.toFixed(2) : '—'} sub="índice de volatilidade" color={regimeColor} />
        <Kpi label="Regime" value={vol.regime} sub="por nível de VIX" color={regimeColor} />
        <Kpi label="Estrutura" value={vol.structure} sub="VIX vs 3M" color={structColor} />
        <Kpi label="VIX / VIX3M" value={vol.contangoRatio != null ? vol.contangoRatio.toFixed(3) : '—'} sub={vol.structure === 'CONTANGO' ? 'normal (contango)' : 'estresse (backwardation)'} />
      </div>

      <section className="mk-group" aria-label="Estrutura a termo da volatilidade">
        <div className="mk-group-head">
          <span className="mk-group-title">Estrutura a termo (VIX complex)</span>
        </div>
        <div className="mk-dist">
          {vol.term.map((t) => (
            <div key={t.symbol} className="mk-dist-col">
              <span className="mk-dist-count">{t.value != null ? t.value.toFixed(1) : '—'}</span>
              <span className="mk-dist-bar" style={{ height: `${Math.max(4, ((t.value ?? 0) / maxTerm) * 100)}%`, background: 'var(--accent, #4f8cff)' }} aria-hidden="true" />
              <span className="mk-dist-label">{t.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mk-group" aria-label="Volatility term">
        <div className="mk-table">
          <div className="mk-table-head">
            <span>Índice</span>
            <span className="mk-num">Valor</span>
            <span className="mk-num">1d</span>
          </div>
          {vol.term.map((t) => (
            <div key={t.symbol} className="mk-table-row">
              <span className="mk-table-name">
                <span className="mk-table-sym">{t.label}</span>
                <span className="mk-table-sub">{t.symbol}</span>
              </span>
              <span className="mk-num">{t.value != null ? t.value.toFixed(2) : '—'}</span>
              <span className={`mk-num ${changeClass(t.changePct)}`}>{fmtPct(t.changePct, 2)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
