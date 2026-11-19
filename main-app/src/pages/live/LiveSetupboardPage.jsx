// LIVE — Setupboard (container). Regime agregado a partir dos sinais objetivos.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import LiveSetupboard from '@apps/ui/market/LiveSetupboard';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { LIVE_SYMBOLS, buildSetupboard } from '@apps/lib/db';

export default function LiveSetupboardPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('live', LIVE_SYMBOLS, {
    range: '1mo',
    interval: '1d',
    autoRefreshMs: 60000,
  });

  const board = useMemo(() => (quotes ? buildSetupboard(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Live</h1>
      </div>
      <ModuleTabs module="live" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o setupboard" />
      ) : !board ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <LiveSetupboard board={board} at={at} loading={loading} stale={stale} error={error} onRefresh={reload} />
      )}
    </div>
  );
}
