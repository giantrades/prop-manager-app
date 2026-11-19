// LIVE — Alerts (container). Alertas objetivos derivados do feed diário.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import LiveAlerts from '@apps/ui/market/LiveAlerts';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { LIVE_SYMBOLS, buildAlerts } from '@apps/lib/db';

export default function LiveAlertsPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('live', LIVE_SYMBOLS, {
    range: '1mo',
    interval: '1d',
    autoRefreshMs: 60000,
  });

  const alerts = useMemo(() => (quotes ? buildAlerts(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Live</h1>
      </div>
      <ModuleTabs module="live" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="os alertas" />
      ) : !alerts ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <LiveAlerts alerts={alerts} at={at} loading={loading} stale={stale} error={error} onRefresh={reload} />
      )}
    </div>
  );
}
