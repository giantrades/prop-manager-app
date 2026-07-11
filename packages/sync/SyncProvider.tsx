import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../auth';
import { pullAllData, pushChanges, subscribeToChanges } from './index';
import { getAll, save } from '@apps/lib/dataStore';

interface SyncContextType {
  pull: () => Promise<void>;
  push: () => Promise<void>;
  syncing: boolean;
  lastSync: Date | null;
}

const SyncContext = createContext<SyncContextType | null>(null);

export const SyncProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const isPulling = useRef(false);
  const isPushing = useRef(false);

  const pull = useCallback(async () => {
    if (!user) return;
    if (isPulling.current) return;
    isPulling.current = true;
    setSyncing(true);
    try {
      const remote = await pullAllData(user.id);
      
      // Merge: remote wins for conflicts (server wins)
      const local = getAll();
      const merged = {
        ...local,
        firms: remote.firms,
        accounts: remote.accounts,
        payouts: remote.payouts,
        trades: remote.trades,
        settings: { ...local.settings, ...remote.settings },
      };
      
      save(merged);
      const pulledTotal = remote.firms.length + remote.accounts.length + remote.payouts.length + remote.trades.length;
      if (pulledTotal > 0) console.log(`✅ Sync: pulled ${remote.firms.length} firms, ${remote.accounts.length} accounts, ${remote.payouts.length} payouts, ${remote.trades.length} trades`);
      window.dispatchEvent(new CustomEvent('sync:pulled', { detail: remote }));
      setLastSync(new Date());
    } catch (e) {
      console.error('Pull failed:', e);
    } finally {
      isPulling.current = false;
      setSyncing(false);
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

  // Auto-sync
  useEffect(() => {
    if (!user) return;
    
    console.log('🔄 Sync: connecting to cloud...');
    pull();
    const interval = setInterval(pull, 30000); // 30s
    const onFocus = () => pull();
    window.addEventListener('focus', onFocus);

    const unsubscribe = subscribeToChanges(user.id, () => { if (!isPushing.current) pull(); });

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [user, pull]);

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