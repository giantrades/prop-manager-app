// CRYPTO — Overview (container). Majors via Yahoo (mesmo fetchMarketQuotes).
import React, { useMemo } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import CryptoOverview from '@apps/ui/market/CryptoOverview';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import { CRYPTO_SYMBOLS, buildCryptoBoard } from '@apps/lib/db';

export default function CryptoOverviewPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('crypto', CRYPTO_SYMBOLS, {
    range: '1mo',
    interval: '1d',
    autoRefreshMs: 60000,
  });

  const board = useMemo(() => (quotes ? buildCryptoBoard(quotes) : null), [quotes]);

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Crypto</h1>
      </div>
      <ModuleTabs module="crypto" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o painel cripto" />
      ) : !board ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <CryptoOverview board={board} at={at} loading={loading} stale={stale} error={error} onRefresh={reload} />
      )}
    </div>
  );
}
