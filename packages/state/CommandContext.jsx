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
import { usePeriod } from './PeriodContext';
import { buildCommandSnapshot, buildActions, generateInsights, getActionRules, listManualActions, saveManualAction, deleteManualAction, setActionRules } from '@apps/lib/db';

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
  const { period } = usePeriod();
  const [state, setState] = useState({
    loading: true,
    snapshot: null,
    actions: [],
    insights: [],
    error: null,
  });
  const financeRef = useRef(finance);
  const periodRef = useRef(period);
  periodRef.current = period;

  const refresh = useCallback(async () => {
    const f = financeRef.current;
    if (!f) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const snapshot = await buildCommandSnapshot(f, periodRef.current);
      const [rules, manual] = await Promise.all([getActionRules(f.ds), listManualActions(f.ds)]);
      const derived = buildActions(snapshot).filter((a) => rules.enabled.includes(a.kind));
      const manualItems = manual.map((m) => ({
        id: m.id, kind: 'manual', severity: m.severity, title: m.title, detail: m.detail ?? '', source: 'manual',
      }));
      const actions = [...manualItems, ...derived];
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

  // Re-monta quando o período global muda.
  useEffect(() => {
    if (finance) refresh();
  }, [period, finance, refresh]);

  // Reatividade: qualquer escrita (datastore:change) re-monta o snapshot.
  useEffect(() => {
    if (!finance) return;
    const off = finance.ds.bus.on('datastore:change', () => {
      refresh();
    });
    return off;
  }, [finance, refresh]);

  const value = useMemo(() => ({
    ...state,
    refresh,
    addManualAction: async (action) => {
      const f = financeRef.current;
      if (!f) return;
      await saveManualAction(f.ds, action);
      refresh();
    },
    removeManualAction: async (id) => {
      const f = financeRef.current;
      if (!f) return;
      await deleteManualAction(f.ds, id);
      refresh();
    },
    updateActionRules: async (rules) => {
      const f = financeRef.current;
      if (!f) return;
      await setActionRules(f.ds, rules);
      refresh();
    },
  }), [state, refresh]);

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

/** Lê o snapshot do Command Center (dentro de <CommandProvider>). */
export function useCommandSnapshot() {
  return useContext(CommandContext);
}
