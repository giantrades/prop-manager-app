// MARKET — Heatmap (container). Monta setores via `buildHeatmap` e renderiza o treemap.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MarketHeatmap from '@apps/ui/market/MarketHeatmap';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { MARKET_FULL_SYMBOLS, buildHeatmap } from '@apps/lib/db';

export default function MarketHeatmapPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('market', MARKET_FULL_SYMBOLS, {
    range: '5d',
    interval: '1d',
    autoRefreshMs: 60000,
  });

  const sectors = useMemo(() => (quotes ? buildHeatmap(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Market</h1>
      </div>
      <ModuleTabs module="market" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o heatmap" />
      ) : !sectors ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <MarketHeatmap
          sectors={sectors}
          at={at}
          loading={loading}
          stale={stale}
          error={error}
          onRefresh={reload}
        />
      )}
    </div>
  );
}
