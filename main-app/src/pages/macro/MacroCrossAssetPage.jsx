// MACRO — Cross-asset (container). Desempenho normalizado (base 100) no último mês.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MacroCrossAsset from '@apps/ui/market/MacroCrossAsset';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { MACRO_SYMBOLS, CROSS_ASSET, buildCrossAssetSeries } from '@apps/lib/db';

export default function MacroCrossAssetPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('macro', MACRO_SYMBOLS, {
    range: '1mo',
    interval: '1d',
    autoRefreshMs: 120000,
  });

  const data = useMemo(
    () => (quotes ? buildCrossAssetSeries(quotes, CROSS_ASSET, { granularity: 'day' }) : null),
    [quotes],
  );

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Macro</h1>
      </div>
      <ModuleTabs module="macro" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o cross-asset" />
      ) : !data ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <MacroCrossAsset
          title="Cross-asset"
          subtitle="Desempenho normalizado (base 100) no último mês."
          data={data}
          changeLabel="1 mês"
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
