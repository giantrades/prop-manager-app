import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../auth';
import { pullAllData, pushChanges, subscribeToChanges, subscribeToLivePositions } from './index';
import { getAll, save } from '@apps/lib/dataStore';
import { supabase } from '../supabase/client';

interface SyncContextType {
  pull: () => Promise<void>;
  push: () => Promise<void>;
  syncing: boolean;
  lastSync: Date | null;
}

const SyncContext = createContext<SyncContextType | null>(null);

function toCamelCase(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  const out: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    out[camelKey] = toCamelCase(value);
  }
  return out;
}

export const SyncProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const isPulling = useRef(false);
  const isPushing = useRef(false);
  const isVisible = useRef(typeof document !== 'undefined' ? document.visibilityState === 'visible' : true);
  const livePositionsRealtimeUnsub = useRef<(() => void) | null>(null);
  const generalRealtimeUnsub = useRef<(() => void) | null>(null);
  const livePollInterval = useRef<NodeJS.Timeout | null>(null);
  const fullPollInterval = useRef<NodeJS.Timeout | null>(null);

  const pull = useCallback(async () => {
    if (!user) return;
    if (isPulling.current) return;
    isPulling.current = true;
    setSyncing(true);
    try {
      const remote = await pullAllData(user.id);
      
      const local = getAll();

      function fillMissing<T extends Record<string, any>>(remoteItems: T[], localItems: T[]): T[] {
        if (!remoteItems?.length) return localItems;
        if (!localItems?.length) return remoteItems;
        return remoteItems.map(r => {
          const l = localItems.find(x => x.id === r.id);
          if (!l) return r;
          const out = { ...r };
          for (const key of Object.keys(l)) {
            if (!(key in r) || r[key] === null || r[key] === undefined) {
              (out as any)[key] = l[key];
            }
          }
          return out;
        });
      }

      const merged = {
        ...local,
        firms: remote.firms?.length ? fillMissing(remote.firms, local.firms) : local.firms,
        accounts: remote.accounts?.length ? fillMissing(remote.accounts, local.accounts) : local.accounts,
        payouts: remote.payouts?.length ? remote.payouts : local.payouts,
        trades: remote.trades?.length ? remote.trades : local.trades,
        livePositions: local.livePositions,
        strategies: remote.strategies?.length ? remote.strategies : local.strategies,
        settings: { ...local.settings, ...remote.settings },
      };
      
      save(merged);
      const pulledTotal = remote.firms.length + remote.accounts.length + remote.payouts.length + remote.trades.length + remote.livePositions.length + remote.strategies.length;
      if (pulledTotal > 0) console.log(`✅ Sync: pulled ${remote.firms.length} firms, ${remote.accounts.length} accounts, ${remote.payouts.length} payouts, ${remote.trades.length} trades, ${remote.livePositions.length} live positions, ${remote.strategies.length} strategies`);
      window.dispatchEvent(new CustomEvent('sync:pulled', { detail: remote }));
      setLastSync(new Date());
    } catch (e) {
      console.error('Pull failed:', e);
    } finally {
      isPulling.current = false;
      setSyncing(false);
    }
  }, [user]);

  const pullLivePositionsOnly = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.from('live_positions').select('*').eq('user_id', user.id);
      if (error) throw error;
      if (data && data.length > 0) {
        window.dispatchEvent(new CustomEvent('sync:livePositions', { detail: data }));
      }
    } catch (e) {
      console.error('Live positions poll failed:', e);
    }
  }, [user]);

  const push = useCallback(async () => {
    if (!user) return;
    if (isPushing.current) return;
    isPushing.current = true;
    setSyncing(true);
    try {
      const local = getAll();
      await pushChanges(local, user.id);
      const totalRecords = (local.firms?.length || 0) + (local.accounts?.length || 0) + (local.payouts?.length || 0) + (local.trades?.length || 0);
      if (totalRecords > 0) console.log(`✅ Sync: pushed ${totalRecords} records`);
      window.dispatchEvent(new CustomEvent('sync:pushed'));
    } catch (e) {
      console.error('Push failed:', e);
    } finally {
      isPushing.current = false;
      setSyncing(false);
    }
  }, [user]);

  // Start/stop realtime subscriptions based on visibility
  const startRealtime = useCallback(() => {
    if (!user) return;
    console.log('🔄 Sync: starting realtime (visible)');
    
    // Initial pull on mount
    pull();
    
    // General realtime for all tables except live_positions
    generalRealtimeUnsub.current = subscribeToChanges(user.id, () => { 
      if (!isPushing.current) pull(); 
    });
    
    // Dedicated realtime for live_positions
    livePositionsRealtimeUnsub.current = subscribeToLivePositions(user.id, (position) => {
      window.dispatchEvent(new CustomEvent('sync:livePositions', { detail: [position] }));
    });
  }, [user, pull]);

  const stopRealtime = useCallback(() => {
    console.log('🔄 Sync: stopping realtime (hidden)');
    if (livePositionsRealtimeUnsub.current) {
      livePositionsRealtimeUnsub.current();
      livePositionsRealtimeUnsub.current = null;
    }
    if (generalRealtimeUnsub.current) {
      generalRealtimeUnsub.current();
      generalRealtimeUnsub.current = null;
    }
  }, []);

  // Start/stop polling based on visibility
  const startPolling = useCallback(() => {
    if (!user) return;
    console.log('🔄 Sync: starting polling (hidden)');
    
    // Live positions: 1h (same as full pull when hidden)
    livePollInterval.current = setInterval(pullLivePositionsOnly, 3600000);
    pullLivePositionsOnly(); // initial
    
    // Full pull: 1h
    fullPollInterval.current = setInterval(pull, 3600000);
    pull(); // initial
  }, [user, pull, pullLivePositionsOnly]);

  const stopPolling = useCallback(() => {
    console.log('🔄 Sync: stopping polling (visible)');
    if (livePollInterval.current) {
      clearInterval(livePollInterval.current);
      livePollInterval.current = null;
    }
    if (fullPollInterval.current) {
      clearInterval(fullPollInterval.current);
      fullPollInterval.current = null;
    }
  }, []);

  // Visibility change handler
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisible.current = document.visibilityState === 'visible';
      if (isVisible.current) {
        stopPolling();
        startRealtime();
      } else {
        stopRealtime();
        startPolling();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initial state
    if (isVisible.current) {
      startRealtime();
    } else {
      startPolling();
    }
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopRealtime();
      stopPolling();
    };
  }, [user, startRealtime, stopRealtime, startPolling, stopPolling]);

  // Focus pull (when returning to tab)
  useEffect(() => {
    const onFocus = () => { if (isVisible.current) pull(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [pull]);

  // Push on local changes
  useEffect(() => {
    const handler = () => { if (!isPulling.current) push(); };
    window.addEventListener('datastore:change', handler);
    return () => window.removeEventListener('datastore:change', handler);
  }, [push]);

  return (
    <SyncContext.Provider value={{ pull, push, syncing, lastSync }}>
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
};