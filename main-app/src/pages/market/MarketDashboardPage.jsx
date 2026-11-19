// MARKET — Environment (container). Liga o motor de mercado (`useMarketData` +
// builders puros) à UI `MarketOverview`. Não calcula nada: só compõe.
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import MarketOverview from '@apps/ui/market/MarketOverview';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import {
  MARKET_FULL_SYMBOLS,
  buildOverview,
  buildRiskComposite,
  buildHeatmap,
  buildBreadth,
} from '@apps/lib/db';

export default function MarketDashboardPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('market', MARKET_FULL_SYMBOLS, {
    range: '5d',
    interval: '1d',
    autoRefreshMs: 60000,
  });

  const derived = useMemo(() => {
    if (!quotes) return null;
    const groups = buildOverview(quotes);
    const risk = buildRiskComposite(quotes);
    const sectors = buildHeatmap(quotes);
    const breadth = buildBreadth(quotes, sectors);
    let advancers = 0;
    let decliners = 0;
    for (const s of sectors) { advancers += s.advancers; decliners += s.decliners; }
    const sectorsUp = sectors.filter((s) => (s.etfChangePct ?? 0) > 0).length;
    return {
      groups,
      risk,
      breadth,
      summary: { advancers, decliners, total: advancers + decliners, sectorsUp, sectorsTotal: sectors.length },
      vix: quotes.get('^VIX') ?? null,
    };
  }, [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Market</h1>
      </div>
      <ModuleTabs module="market" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o Market" />
      ) : !derived ? (
        <DashSkeleton cards={4} widgets={4} />
      ) : (
        <MarketOverview
          groups={derived.groups}
          risk={derived.risk}
          breadth={derived.breadth}
          summary={derived.summary}
          vix={derived.vix}
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
