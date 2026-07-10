import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const pull = useCallback(async () => {
    if (!user) return;
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
      window.dispatchEvent(new CustomEvent('sync:pulled', { detail: remote }));
      setLastSync(new Date());
    } catch (e) {
      console.error('Pull failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [user]);

  const push = useCallback(async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const local = getAll();
      await pushChanges(local, user.id);
      window.dispatchEvent(new CustomEvent('sync:pushed'));
    } catch (e) {
      console.error('Push failed:', e);
    } finally {
      setSyncing(false);
    }
  }, [user]);

  // Auto-sync
  useEffect(() => {
    if (!user) return;
    
    pull();
    const interval = setInterval(pull, 30000); // 30s
    const onFocus = () => pull();
    window.addEventListener('focus', onFocus);

    const unsubscribe = subscribeToChanges(user.id, () => pull());

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [user, pull]);

  // Push on local changes
  useEffect(() => {
    const handler = () => push();
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