// MACRO — Rates & liquidity (container). Yields, duration/crédito e stress de crédito.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MacroRates from '@apps/ui/market/MacroRates';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { MACRO_SYMBOLS, buildRatesLiquidity, buildCreditStress } from '@apps/lib/db';

export default function MacroRatesPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('macro', MACRO_SYMBOLS, {
    range: '1mo',
    interval: '1d',
    autoRefreshMs: 120000,
  });

  const rows = useMemo(() => (quotes ? buildRatesLiquidity(quotes) : null), [quotes]);
  const credit = useMemo(() => (quotes ? buildCreditStress(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Macro</h1>
      </div>
      <ModuleTabs module="macro" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="os juros e liquidez" />
      ) : !rows || !credit ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <MacroRates rows={rows} credit={credit} at={at} loading={loading} stale={stale} error={error} onRefresh={reload} />
      )}
    </div>
  );
}
