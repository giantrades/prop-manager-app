import { useCallback } from 'react';
import { openDB } from 'idb';

export function useRecalcAccountFunding() {
  const recalcAllAccountsFunding = useCallback(async () => {
    try {
      const db = await openDB('journal-db', 1);
      const trades = await db.getAll('trades');

      const ds = await import('@apps/lib/dataStore.js');
      const all = await ds.getAll();
      const accounts = all?.accounts || [];

      for (const acc of accounts) {
        const relatedTrades = trades.filter(t =>
          Array.isArray(t.accounts) && t.accounts.some(a => a.accountId === acc.id)
        );

        const totalPnL = relatedTrades.reduce((sum, t) => {
          const weight = t.accounts.find(a => a.accountId === acc.id)?.weight ?? 1;
          return sum + (Number(t.result_net || 0) * weight);
        }, 0);

        await ds.updateAccount(acc.id, {
          ...acc,
          currentFunding: (acc.initialFunding || 0) + totalPnL,
        });
      }

      console.log('✅ Recalculado funding de todas as contas');
    } catch (error) {
      console.error('❌ Erro ao recalcular funding:', error);
    }
  }, []);

  return { recalcAllAccountsFunding };
}
