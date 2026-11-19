// MARKET — Breadth (container). Calcula `buildBreadthDetail` e renderiza.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MarketBreadth from '@apps/ui/market/MarketBreadth';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { MARKET_FULL_SYMBOLS, buildBreadthDetail } from '@apps/lib/db';

export default function MarketBreadthPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('market', MARKET_FULL_SYMBOLS, {
    range: '5d',
    interval: '1d',
    autoRefreshMs: 60000,
  });

  const breadth = useMemo(() => (quotes ? buildBreadthDetail(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Market</h1>
      </div>
      <ModuleTabs module="market" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o breadth" />
      ) : !breadth ? (
        <DashSkeleton cards={4} widgets={2} />
      ) : (
        <MarketBreadth breadth={breadth} at={at} loading={loading} stale={stale} error={error} onRefresh={reload} />
      )}
    </div>
  );
}
