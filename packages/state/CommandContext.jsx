// STAGE 6 — CommandProvider + useCommandSnapshot. Agrega os motores num único
// snapshot reativo (leituras derivadas) + deriva Actions e Insights. É a ÚNICA
// fonte de dados do Command Center (Home / Calendar / Action Center / Navbar badge).
//
// Regra dura: aqui NÃO existe lógica financeira nova — só chamadas de SELECTOR
// (buildCommandSnapshot) + derivação de flags já expostas pelos motores.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md + 01-tasks.md (T6.1/T6.3/T6.4).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFinance } from './FinanceContext';
import { buildCommandSnapshot, buildActions, generateInsights } from '@apps/lib/db';

const CommandContext = createContext({
  loading: true,
  snapshot: null,
  actions: [],
  insights: [],
  error: null,
  refresh: async () => undefined,
});

/**
 * Provider que mantém o snapshot do Command Center reativo (re-monta em
 * `datastore:change`). Compartilhado por Home / Action Center / Navbar badge.
 */
export function CommandProvider({ children }) {
  const finance = useFinance();
  const [state, setState] = useState({
    loading: true,
    snapshot: null,
    actions: [],
    insights: [],
    error: null,
  });
  const financeRef = useRef(finance);

  const refresh = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const snapshot = await buildCommandSnapshot(f);
      const actions = buildActions(snapshot);
      const insights = generateInsights(snapshot);
      setState({ loading: false, snapshot, actions, insights, error: null });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[command] falha ao montar snapshot', err);
      setState((s) => ({ ...s, loading: false, error: err }));
    }
  }, []);

  useEffect(() => {
    financeRef.current = finance;
    if (finance) refresh();
  }, [finance, refresh]);

  // Reatividade: qualquer escrita (datastore:change) re-monta o snapshot.
  useEffect(() => {
    if (!finance) return;
    const off = finance.ds.bus.on('datastore:change', () => {
      refresh();
    });
    return off;
  }, [finance, refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

/** Lê o snapshot do Command Center (dentro de <CommandProvider>). */
export function useCommandSnapshot() {
  return useContext(CommandContext);
}
