// MARKET — Factors (container). Calcula `buildFactors` e renderiza a grade de cestas.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MarketBaskets from '@apps/ui/market/MarketBaskets';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { MARKET_FULL_SYMBOLS, buildFactors } from '@apps/lib/db';

export default function MarketFactorsPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('market', MARKET_FULL_SYMBOLS, {
    range: '5d',
    interval: '1d',
    autoRefreshMs: 60000,
  });

  const scores = useMemo(() => (quotes ? buildFactors(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Market</h1>
      </div>
      <ModuleTabs module="market" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="os fatores" />
      ) : !scores ? (
        <DashSkeleton cards={4} widgets={2} />
      ) : (
        <MarketBaskets
          title="Factors"
          subtitle="Cestas de estilo/fator (Growth, Value, Momentum, Quality, Size, Low Vol, Dividend, Equal Weight) via ETFs, com desempenho relativo ao S&P 500."
          scores={scores}
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
