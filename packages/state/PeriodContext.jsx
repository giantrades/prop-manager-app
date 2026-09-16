// Filtros globais dos dashboards: PERÍODO (mês · intervalo · tudo) + entidade
// (conta · estratégia). Persistido no `meta` (sincroniza) com cache em localStorage.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useFinance } from './FinanceContext';

const KEY = 'ui:period';
const FILTERS_KEY = 'ui:filters';
const DEFAULT = { mode: 'all' };
const DEFAULT_FILTERS = { accountId: '', strategyId: '' };

const PeriodCtx = createContext(null);

function readCache(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    return raw && typeof raw === 'object' ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function PeriodProvider({ children }) {
  const finance = useFinance();
  const [period, setPeriodState] = useState(() => {
    const raw = readCache(KEY, DEFAULT);
    return raw.mode ? raw : DEFAULT;
  });
  const [filters, setFiltersState] = useState(() => readCache(FILTERS_KEY, DEFAULT_FILTERS));

  // Hidrata do meta sincronizado.
  useEffect(() => {
    if (!finance) return undefined;
    let alive = true;
    (async () => {
      try {
        const [p, f] = await Promise.all([
          finance.ds.meta.getKey(KEY),
          finance.ds.meta.getKey(FILTERS_KEY),
        ]);
        if (!alive) return;
        if (p?.value?.mode) setPeriodState(p.value);
        if (f?.value) setFiltersState({ ...DEFAULT_FILTERS, ...f.value });
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [finance]);

  const setPeriod = useCallback((next) => {
    setPeriodState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
    try { finance?.ds?.meta.setKey(KEY, next); } catch { /* noop */ }
  }, [finance]);

  const setFilters = useCallback((next) => {
    setFiltersState(next);
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(next)); } catch { /* noop */ }
    try { finance?.ds?.meta.setKey(FILTERS_KEY, next); } catch { /* noop */ }
  }, [finance]);

  const value = useMemo(() => ({ period, setPeriod, filters, setFilters }), [period, setPeriod, filters, setFilters]);
  return <PeriodCtx.Provider value={value}>{children}</PeriodCtx.Provider>;
}

/** Acessa período + filtros globais. */
export function usePeriod() {
  const v = useContext(PeriodCtx);
  if (!v) throw new Error('usePeriod precisa estar dentro de <PeriodProvider>');
  return v;
}

export default PeriodProvider;
