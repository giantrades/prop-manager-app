// LIVE — Setupboard. Painel de regime (trend, breadth, vol, crédito, juros, dólar).
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { changeClass, fmtPct, injectMarketStyles } from './marketUi';
import type { Setupboard } from '@apps/lib/db';

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="mk-kpi">
      <div className="mk-kpi-label">{label}</div>
      <div className="mk-kpi-value" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="mk-kpi-sub">{sub}</div>}
    </div>
  );
}

interface LiveSetupboardProps {
  board: Setupboard;
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function LiveSetupboard({ board, at, loading = false, stale = false, error = null, onRefresh }: LiveSetupboardProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const labelColor =
    board.label === 'RISK-ON' ? 'var(--green, #2ecc71)' :
    board.label === 'RISK-OFF' ? 'var(--red, #e74c3c)' : 'var(--text, #e7eaf0)';

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : 'Setupboard'}
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
        <Kpi label="Regime" value={board.label} sub={`score ${(board.score * 100).toFixed(0)}`} color={labelColor} />
        <Kpi label="Breadth setorial" value={board.breadthPct != null ? `${(board.breadthPct * 100).toFixed(0)}%` : '—'} sub="setores em alta" color={board.breadthPct != null && board.breadthPct >= 0.5 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'} />
        <Kpi label="VIX" value={board.vix != null ? board.vix.toFixed(2) : '—'} sub="volatilidade" />
        <Kpi label="S&P 500 (dia)" value={fmtPct(board.spyChange, 2)} sub="SPY" color={board.spyChange != null && board.spyChange >= 0 ? 'var(--green, #2ecc71)' : 'var(--red, #e74c3c)'} />
      </div>

      <section className="mk-group" aria-label="Sinais de regime">
        <div className="mk-group-head">
          <span className="mk-group-title">Sinais</span>
        </div>
        <div className="mk-signal-grid">
          {board.signals.map((s) => (
            <div key={s.id} className={`mk-signal ${s.tone}`}>
              <span className="mk-signal-label">{s.label}</span>
              <span className={`mk-signal-reading ${s.tone === 'pos' ? 'mk-up' : s.tone === 'neg' ? 'mk-down' : 'mk-flat'}`}>{s.reading}</span>
              <span className="mk-signal-detail">{s.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mk-group" aria-label="Resumo do score">
        <div className="mk-group-head">
          <span className="mk-group-title">Composição do score</span>
        </div>
        <div className="mk-live-rows">
          {board.signals.map((s) => {
            const contribution = (s.tone === 'pos' ? 1 : s.tone === 'neg' ? -1 : 0);
            return (
              <div key={s.id} className="mk-live-row">
                <span>{s.label}</span>
                <span className="mk-live-bar" aria-hidden="true">
                  <span
                    className="mk-live-fill"
                    style={{
                      left: '50%',
                      width: `${Math.abs(contribution) * 50}%`,
                      transform: contribution < 0 ? 'translateX(-100%)' : undefined,
                      background: contribution > 0 ? 'var(--green, #2ecc71)' : contribution < 0 ? 'var(--red, #e74c3c)' : 'transparent',
                    }}
                  />
                </span>
                <span className={`mk-num ${changeClass(contribution)}`}>{contribution > 0 ? '+1' : contribution < 0 ? '−1' : '0'} · peso {s.weight}</span>
              </div>
            );
          })}
        </div>
      </section>
      <p className="mk-subtitle" style={{ marginTop: 10 }}>Regime agregado dos sinais objetivos. Não é recomendação de investimento.</p>
    </div>
  );
}
