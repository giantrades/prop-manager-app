// MARKET — ETF map (container). Calcula `buildEtfMap` e renderiza o treemap de ETFs.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MarketEtfMap from '@apps/ui/market/MarketEtfMap';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { MARKET_FULL_SYMBOLS, buildEtfMap } from '@apps/lib/db';

export default function MarketEtfMapPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('market', MARKET_FULL_SYMBOLS, {
    range: '5d',
    interval: '1d',
    autoRefreshMs: 60000,
  });

  const categories = useMemo(() => (quotes ? buildEtfMap(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Market</h1>
      </div>
      <ModuleTabs module="market" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o ETF map" />
      ) : !categories ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <MarketEtfMap categories={categories} at={at} loading={loading} stale={stale} error={error} onRefresh={reload} />
      )}
    </div>
  );
}
