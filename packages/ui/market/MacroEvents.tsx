// MACRO — Events. Calendário econômico (FOMC/CPI etc.) via fonte free.
// Best-effort: se o feed falhar e não houver cache, a UI mostra estado offline.
import React, { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { injectMarketStyles } from './marketUi';
import type { EconomicEvent } from '@apps/lib/db';

const IMP_CLASS: Record<string, string> = { high: 'mk-imp-high', med: 'mk-imp-med', low: 'mk-imp-low' };
const IMP_LABEL: Record<string, string> = { high: 'Alta', med: 'Média', low: 'Baixa' };

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

interface MacroEventsProps {
  events: EconomicEvent[];
  at?: string | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}

export default function MacroEvents({ events, at, loading = false, error = null, onRefresh }: MacroEventsProps) {
  useEffect(() => { injectMarketStyles(); }, []);
  const sorted = [...events].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return (
    <div className="mk-page">
      <div className="mk-toolbar">
        <span className="mk-status">
          <span className="mk-live-dot" aria-hidden="true" />
          Calendário econômico · {sorted.length} eventos
        </span>
        {at && <span className="mk-status">atualizado {new Date(at).toLocaleTimeString('pt-BR')}</span>}
        <span className="mk-toolbar-spacer" />
        {onRefresh && (
          <button type="button" className="mk-btn" onClick={onRefresh} disabled={loading} aria-busy={loading}>
            <RefreshCw size={14} /> {loading ? 'Atualizando…' : 'Atualizar'}
          </button>
        )}
      </div>

      {error && <div className="cmd-warn" role="alert">Calendário indisponível ({error}). Mostrando cache quando houver.</div>}

      {sorted.length === 0 ? (
        <div className="mk-empty">Sem eventos de alta importância no período.</div>
      ) : (
        <section className="mk-group" aria-label="Eventos econômicos">
          <div className="mk-events">
            {sorted.map((e) => (
              <div key={e.id} className="mk-event-row">
                <span className="mk-event-when">{fmtWhen(e.scheduledAt)}</span>
                <span className="mk-event-name">
                  {e.eventName}
                  {e.periodLabel ? <span className="mk-table-sub"> · {e.periodLabel}</span> : null}
                  {(e.forecast || e.previous) && (
                    <span className="mk-table-sub"> · proj. {e.forecast ?? '—'} · ant. {e.previous ?? '—'}</span>
                  )}
                </span>
                <span className={`mk-imp ${IMP_CLASS[e.importance] ?? 'mk-imp-low'}`}>{IMP_LABEL[e.importance] ?? e.importance}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
