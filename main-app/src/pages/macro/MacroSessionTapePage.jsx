// MACRO — Session tape (container). Intraday normalizado (5 min) no open da sessão.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MacroCrossAsset from '@apps/ui/market/MacroCrossAsset';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { SESSION_SYMBOLS, SESSION_TAPE, buildCrossAssetSeries } from '@apps/lib/db';

export default function MacroSessionTapePage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('macro-session', SESSION_SYMBOLS, {
    range: '1d',
    interval: '5m',
    autoRefreshMs: 60000,
  });

  const data = useMemo(
    () => (quotes ? buildCrossAssetSeries(quotes, SESSION_TAPE, { granularity: '5m' }) : null),
    [quotes],
  );

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Macro</h1>
      </div>
      <ModuleTabs module="macro" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o session tape" />
      ) : !data ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <MacroCrossAsset
          title="Session tape"
          subtitle="Intraday (barras de 5 min) normalizado no open da sessão."
          data={data}
          changeLabel="na sessão"
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
