// LIVE — Alerts. Alertas objetivos derivados dos dados (vol, breadth, curva, crédito, cripto, dólar).
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { injectMarketStyles } from './marketUi';
import type { MarketAlert } from '@apps/lib/db';

const SEV_CLASS: Record<string, string> = { high: 'mk-imp-high', med: 'mk-imp-med', low: 'mk-imp-low' };
const SEV_LABEL: Record<string, string> = { high: 'Alta', med: 'Média', low: 'Baixa' };

interface LiveAlertsProps {
  alerts: MarketAlert[];
  at?: string | null;
  loading?: boolean;
  stale?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function LiveAlerts({ alerts, at, loading = false, stale = false, error = null, onRefresh }: LiveAlertsProps) {
  useEffect(() => { injectMarketStyles(); }, []);

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className={`mk-live-dot${stale ? ' stale' : ''}`} aria-hidden="true" />
          {stale ? 'Dados em cache' : `Alerts · ${alerts.length} ativos`}
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

      {alerts.length === 0 ? (
        <div className="mk-empty">Nenhum alerta objetivo disparado agora.</div>
      ) : (
        <section className="mk-group" aria-label="Alertas de mercado">
          <div className="mk-events">
            {alerts.map((a) => (
              <div key={a.id} className="mk-alert-row">
                <span className={`mk-imp ${SEV_CLASS[a.severity] ?? 'mk-imp-low'}`}>{SEV_LABEL[a.severity] ?? a.severity}</span>
                <span>
                  <span className={`mk-alert-title ${a.tone === 'pos' ? 'mk-up' : a.tone === 'neg' ? 'mk-down' : 'mk-flat'}`}>{a.title}</span>
                  <span className="mk-alert-detail"> — {a.detail}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="mk-subtitle" style={{ marginTop: 10 }}>Regras objetivas sobre o feed (não é notícia nem recomendação).</p>
    </div>
  );
}
