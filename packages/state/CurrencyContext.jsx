import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useFinanceOptional } from './FinanceContext';

const CurrencyContext = createContext(null);

// Chaves no `meta` (sincronizam via Supabase) para a moeda de exibição e o câmbio.
// `fx:USDBRL` é a mesma chave usada pelo motor financeiro (wealth.ts) — taxa ÚNICA.
const CURRENCY_META_KEY = 'ui:currency';
const FX_META_KEY = 'fx:USDBRL';

function readLocalCurrency() {
  try {
    return localStorage.getItem('currency') === 'BRL' ? 'BRL' : 'USD';
  } catch {
    return 'USD';
  }
}
function readLocalRate() {
  try {
    const v = parseFloat(localStorage.getItem('usdBrlRate'));
    return Number.isFinite(v) && v > 0 ? v : 5.0;
  } catch {
    return 5.0;
  }
}

export function CurrencyProvider({ children }) {
  const finance = useFinanceOptional();
  const [currency, setCurrencyState] = useState(readLocalCurrency);
  const [rate, setRateState] = useState(readLocalRate);
  const hydrated = useRef(false);

  // Hidrata da nuvem quando o DataService estiver pronto (localStorage = cache do 1º paint).
  useEffect(() => {
    if (!finance?.ds || hydrated.current) return undefined;
    let alive = true;
    (async () => {
      try {
        const [cur, fx] = await Promise.all([
          finance.ds.meta.getKey(CURRENCY_META_KEY),
          finance.ds.meta.getKey(FX_META_KEY),
        ]);
        if (!alive) return;
        if (cur?.value === 'BRL' || cur?.value === 'USD') {
          setCurrencyState(cur.value);
          try { localStorage.setItem('currency', cur.value); } catch { /* noop */ }
        }
        const r = fx?.value?.rate;
        if (typeof r === 'number' && r > 0) {
          setRateState(r);
          try { localStorage.setItem('usdBrlRate', String(r)); } catch { /* noop */ }
        }
      } catch {
        /* sem meta ainda = mantém o cache local */
      } finally {
        hydrated.current = true;
      }
    })();
    return () => { alive = false; };
  }, [finance]);

  const persist = useCallback((key, value) => {
    try {
      finance?.ds?.meta?.setKey(key, value);
    } catch {
      /* offline: localStorage guarda e o próximo sync sobe */
    }
  }, [finance]);

  const setCurrency = useCallback((next) => {
    const c = next === 'BRL' ? 'BRL' : 'USD';
    setCurrencyState(c);
    try { localStorage.setItem('currency', c); } catch { /* noop */ }
    persist(CURRENCY_META_KEY, c);
  }, [persist]);

  const setRate = useCallback((next) => {
    const n = Number(next) || 0;
    setRateState(n);
    try { localStorage.setItem('usdBrlRate', String(n)); } catch { /* noop */ }
    if (n > 0) persist(FX_META_KEY, { rate: n, at: new Date().toISOString() });
  }, [persist]);

  const format = useMemo(() => (valueUSD) => {
    if (currency === 'USD') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(valueUSD || 0);
    const brl = (valueUSD || 0) * rate;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(brl);
  }, [currency, rate]);

  return <CurrencyContext.Provider value={{ currency, setCurrency, rate, setRate, format }}>{children}</CurrencyContext.Provider>;
}
export const useCurrency = () => useContext(CurrencyContext);
