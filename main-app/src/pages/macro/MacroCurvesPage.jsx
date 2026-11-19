// MACRO — Curves (container). Curva de juros US Treasury + spreads.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MacroCurves from '@apps/ui/market/MacroCurves';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { MACRO_SYMBOLS, buildYieldCurve, buildYieldSpreads } from '@apps/lib/db';

export default function MacroCurvesPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('macro', MACRO_SYMBOLS, {
    range: '1mo',
    interval: '1d',
    autoRefreshMs: 120000,
  });

  const curve = useMemo(() => (quotes ? buildYieldCurve(quotes) : null), [quotes]);
  const spreads = useMemo(() => (curve ? buildYieldSpreads(curve) : null), [curve]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Macro</h1>
      </div>
      <ModuleTabs module="macro" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="as curvas" />
      ) : !curve || !spreads ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <MacroCurves curve={curve} spreads={spreads} at={at} loading={loading} stale={stale} error={error} onRefresh={reload} />
      )}
    </div>
  );
}
