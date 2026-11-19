// MACRO — Events (container). Calendário econômico do mês corrente (fonte free).
import React, { useCallback, useEffect, useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import MacroEvents from '@apps/ui/market/MacroEvents';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { fetchEconomicEvents, monthRange } from '@apps/lib/db';

function currentMonthRange() {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return monthRange(ym);
}

export default function MacroEventsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [at, setAt] = useState(null);

  const load = useCallback(async (showLoading) => {
    if (showLoading) setLoading(true);
    const { from, to } = currentMonthRange();
    try {
      const data = await fetchEconomicEvents(from, to);
      setEvents(data);
      setAt(new Date().toISOString());
      setError(null);
    } catch (err) {
      setError(err?.message || 'falha ao buscar o calendário');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(true); }, [load]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Macro</h1>
      </div>
      <ModuleTabs module="macro" />

      {error && events.length === 0 ? (
        <ActionableError error={error} onRetry={() => load(true)} label="o calendário econômico" />
      ) : loading && events.length === 0 ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <MacroEvents events={events} at={at} loading={loading} error={error} onRefresh={() => load(false)} />
      )}
    </div>
  );
}
