// SCANNER — Screener (container). Reusa o fetch do Market (chave 'market').
// Regras/filtros/campos personalizados persistem em localStorage; fundamentos vêm de um
// feed plugável (`useFundamentals`), exibindo "aguardando feed" quando não configurado.
import React, { useEffect, useMemo, useState } from 'react';
import ModuleTabs from '../../ModuleTabs';
import useMarketData from '../../useMarketData';
import useFundamentals from '../../useFundamentals';
import MarketScreener from '@apps/ui/market/MarketScreener';
import { DashSkeleton, ActionableError } from '@apps/ui/DataState';
import {
  MARKET_FULL_SYMBOLS,
  CONSTITUENT_SYMBOLS,
  FUNDAMENTAL_FIELD_KEYS,
  DEFAULT_SCREENER_FILTERS,
  buildScreener,
  compileCustomFields,
  toFundamentalValues,
} from '@apps/lib/db';

const FILTERS_KEY = 'scanner:filters:v1';
const CUSTOM_KEY = 'scanner:custom-fields:v1';

function loadFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return DEFAULT_SCREENER_FILTERS;
    return { ...DEFAULT_SCREENER_FILTERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SCREENER_FILTERS;
  }
}

function loadCustomFields() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ScannerScreenerPage() {
  const { quotes, loading, error, at, stale, reload } = useMarketData('market', MARKET_FULL_SYMBOLS, {
    range: '5d',
    interval: '1d',
    autoRefreshMs: 60000,
  });
  const [filters, setFilters] = useState(loadFilters);
  const [customFields, setCustomFields] = useState(loadCustomFields);

  const fundamentals = useFundamentals('fundamentals', CONSTITUENT_SYMBOLS, {});

  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch { /* noop */ }
  }, [filters]);

  useEffect(() => {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customFields)); } catch { /* noop */ }
  }, [customFields]);

  const compiledCustomFields = useMemo(
    () => compileCustomFields(customFields, { allowedFields: FUNDAMENTAL_FIELD_KEYS }),
    [customFields],
  );

  const fundamentalValues = useMemo(
    () => (fundamentals.result ? toFundamentalValues(fundamentals.result.items) : new Map()),
    [fundamentals.result],
  );

  const result = useMemo(
    () => (quotes
      ? buildScreener(quotes, filters, {
        customFields: compiledCustomFields,
        fundamentalValues,
        fundamentalFields: FUNDAMENTAL_FIELD_KEYS,
      })
      : null),
    [quotes, filters, compiledCustomFields, fundamentalValues],
  );

  const fundamentalsStatus = fundamentals.loading
    ? 'loading'
    : (fundamentals.result?.status ?? 'not_configured');

  return (
    <div className="cmd-page">
      <div className="cmd-page-head">
        <h1 className="cmd-page-title">Scanner</h1>
      </div>
      <ModuleTabs module="scanner" />

      {error && (!quotes || quotes.size === 0) ? (
        <ActionableError error={error} onRetry={reload} label="o screener" />
      ) : !result ? (
        <DashSkeleton cards={1} widgets={1} />
      ) : (
        <MarketScreener
          filters={filters}
          onChange={setFilters}
          result={result}
          customFields={customFields}
          compiledCustomFields={compiledCustomFields}
          onCustomFieldsChange={setCustomFields}
          fundamentalsStatus={fundamentalsStatus}
          fundamentalsAt={fundamentals.result?.at ?? null}
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
