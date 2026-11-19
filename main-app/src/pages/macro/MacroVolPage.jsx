// MACRO — Vol regime (container). VIX, estrutura a termo e contango/backwardation.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MacroVol from '@apps/ui/market/MacroVol';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { MACRO_SYMBOLS, buildVolRegime } from '@apps/lib/db';

export default function MacroVolPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('macro', MACRO_SYMBOLS, {
    range: '1mo',
    interval: '1d',
    autoRefreshMs: 120000,
  });

  const vol = useMemo(() => (quotes ? buildVolRegime(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Macro</h1>
      </div>
      <ModuleTabs module="macro" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o vol regime" />
      ) : !vol ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <MacroVol vol={vol} at={at} loading={loading} stale={stale} error={error} onRefresh={reload} />
      )}
    </div>
  );
}
