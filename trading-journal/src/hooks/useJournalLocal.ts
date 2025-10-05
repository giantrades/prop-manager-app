// src/hooks/useJournalLocal.ts
// Lightweight hook that wraps journalService and exposes in-component data.
// Use this in pages/components directly. If you have a central JournalProvider, you can replace this hook by that provider.

import { useEffect, useMemo, useState } from 'react';
import * as svc from '../services/journalService';
import type { Trade } from '../types/trade';
import {getAll, createAccount, updateAccount, deleteAccount, getAccountStats, createPayout,  updatePayout,deletePayout,getFirms,createFirm,updateFirm,deleteFirm,getFirmStats} from '@apps/lib/dataStore';


export function useJournalLocal() {
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [error, setError] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const loaded = await svc.loadJournalFromDrive();
        if (loaded) {
          setTrades(loaded.trades || []);
          setStrategies(loaded.strategies || []);
        } else {
          // keep in-memory defaults
          const s = svc.getStore();
          setTrades(s.trades || []);
          setStrategies(s.strategies || []);
        }
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refresh = () => {
    setTrades(svc.listTrades());
    setStrategies(svc.listStrategies());
  };

  const addTrade = async (payload: Partial<Trade>) => {
    const t = svc.addTrade(payload);
    setTrades([...svc.listTrades()]);
    try { await svc.saveJournalToDrive(); } catch(_) {}
    return t;
  };

  const editTrade = async (id: string, changes: Partial<Trade>) => {
    const t = svc.updateTrade(id, changes);
    setTrades([...svc.listTrades()]);
    try { await svc.saveJournalToDrive(); } catch(_) {}
    return t;
  };

  const removeTrade = async (id: string) => {
    svc.deleteTrade(id);
    setTrades([...svc.listTrades()]);
    try { await svc.saveJournalToDrive(); } catch(_) {}
  };

  const addStrategy = (payload: any) => {
    const s = { id: `str_${Date.now()}`, createdAt: new Date().toISOString(), ...payload };
    const store = svc.getStore();
    store.strategies = store.strategies || [];
    store.strategies.push(s);
    svc.setStore(store);
    setStrategies([...store.strategies]);
    try { svc.saveJournalToDrive(); } catch(_) {}
    return s;
  };

  const removeStrategy = (id: string) => {
    const store = svc.getStore();
    store.strategies = (store.strategies || []).filter((x:any)=>x.id !== id);
    svc.setStore(store);
    setStrategies([...store.strategies]);
    try { svc.saveJournalToDrive(); } catch(_) {}
  };

  const stats = useMemo(() => {
    // minimal KPI calc (expand later)
    const wins = trades.filter(t => (t.result_net || 0) > 0).length;
    const total = trades.length || 1;
    const wr = Math.round((wins / total) * 1000) / 10;
    const totalPnL = trades.reduce((s, t) => s + (t.result_net || 0), 0);
    const avgR = trades.reduce((s,t) => s + (t.result_R || 0), 0) / total;
    return { wins, total: trades.length, winrate: wr, totalPnL, avgR };
  }, [trades]);

  return {
    loading, error, trades, strategies,
    refresh,
    addTrade, editTrade, removeTrade,
    addStrategy, removeStrategy,
    stats
  };
}
