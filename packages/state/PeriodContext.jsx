// Período global dos dashboards/widgets (mês · intervalo X→Y · tudo). Persistido no
// `meta` (sincroniza entre devices) com cache em localStorage p/ paint instantâneo.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useFinance } from './FinanceContext';

const KEY = 'ui:period';
const DEFAULT = { mode: 'all' };

const PeriodCtx = createContext(null);

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw && raw.mode ? raw : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function PeriodProvider({ children }) {
  const finance = useFinance();
  const [period, setPeriodState] = useState(readCache);

  // Hidrata do meta sincronizado.
  useEffect(() => {
    if (!finance) return undefined;
    let alive = true;
    (async () => {
      try {
        const rec = await finance.ds.meta.getKey(KEY);
        const remote = rec?.value;
        if (alive && remote && remote.mode) setPeriodState(remote);
      } catch {
        /* noop */
      }
    })();
    return () => { alive = false; };
  }, [finance]);

  const setPeriod = useCallback((next) => {
    setPeriodState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
    try {
      finance?.ds?.meta.setKey(KEY, next);
    } catch {
      /* noop */
    }
  }, [finance]);

  const value = useMemo(() => ({ period, setPeriod }), [period, setPeriod]);
  return <PeriodCtx.Provider value={value}>{children}</PeriodCtx.Provider>;
}

/** Acessa o período global. */
export function usePeriod() {
  const v = useContext(PeriodCtx);
  if (!v) throw new Error('usePeriod precisa estar dentro de <PeriodProvider>');
  return v;
}

export default PeriodProvider;
