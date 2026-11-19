// LIVE — Intraday breadth (container). % acima do open da sessão (barras 5 min).
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import LiveIntradayBreadth from '@apps/ui/market/LiveIntradayBreadth';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { LIVE_BREADTH_SYMBOLS, buildIntradayBreadth } from '@apps/lib/db';

export default function LiveIntradayBreadthPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('live-intraday', LIVE_BREADTH_SYMBOLS, {
    range: '1d',
    interval: '5m',
    autoRefreshMs: 60000,
  });

  const breadth = useMemo(() => (quotes ? buildIntradayBreadth(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Live</h1>
      </div>
      <ModuleTabs module="live" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o intraday breadth" />
      ) : !breadth ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <LiveIntradayBreadth breadth={breadth} at={at} loading={loading} stale={stale} error={error} onRefresh={reload} />
      )}
    </div>
  );
}
