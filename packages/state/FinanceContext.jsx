// STAGE 6/7 — FinanceProvider. Fio de ligação dos MOTORES (DataService + services)
// com o React + Sync Supabase (app-db v3 -> nuvem). Único lugar que instancia o
// DataService em produção (via app-db v3).
//
// Regra dura: a UI NUNCA constrói DataService / escreve saldo direto. Aqui só
// montamos os serviços + o SyncEngine (push/pull) e expomos via `useFinance()`.
//
// Fonte: DOCS/07_STAGE6_COMMAND/00-produto.md + DOCS/08_STAGE7_INTEGRATION/00-plano.md (T7.8).

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DataService,
  DataChainEngine,
  MoneyService,
  WealthService,
  RiskService,
  createSupabaseSync,
  makeSupabaseSyncEngine,
  isSyncedMetaKey,
} from '@apps/lib/db';
import { supabase } from '@apps/supabase/client';

const FinanceContext = createContext(undefined);

const STORE_BY_ENTITY = {
  account: 'accounts',
  transaction: 'transactions',
  trade: 'trades',
  payout: 'payouts',
  goal: 'goals',
  position: 'positions',
  meta: 'meta',
};

/**
 * @param {object} props
 * @param {import('react').ReactNode} props.children
 * @param {import('@apps/lib/db').DbAdapter | null} [props.adapter] — injetável em teste/demo.
 */
export function FinanceProvider({ children, adapter = null }) {
  const [finance, setFinance] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let syncEngine = null;
    let offChange = null;
    let unsubCloud = null;
    let pullTimer = null;

    async function boot() {
      let dsAdapter = adapter;
      if (!dsAdapter) {
        // Produção: app-db v3 (IndexedDB). Dinâmico p/ não pesar o bundle no primeiro paint.
        const { createProductionAdapter } = await import('@apps/lib/db');
        dsAdapter = await createProductionAdapter();
      }
      const ds = new DataService({ adapter: dsAdapter });
      const chain = new DataChainEngine(ds);
      const money = new MoneyService(ds, chain);
      const wealth = new WealthService(ds);
      const risk = new RiskService(ds, chain);

      // Demo mode (VITE_DEMO_MODE=1):
      //  - banco vazio e demo ainda ativo => popula com o seed;
      //  - usuário já cadastrou conta própria => remove os dados demo e desliga o modo.
      if (import.meta.env?.VITE_DEMO_MODE === '1') {
        try {
          const { seedDemoData, isDemoDisabled, hasUserData, clearDemoData } = await import('@apps/lib/db');
          if (!(await isDemoDisabled(ds))) {
            const existingAccounts = await ds.accounts.list();
            if (existingAccounts.length === 0) {
              await seedDemoData(ds, chain);
            } else if (await hasUserData(ds)) {
              await clearDemoData(ds);
            }
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[demo] seed falhou', e);
        }
      }

      // Sync Supabase (T7.8/T13): só sincroniza se houver usuário logado; senão no-op.
      const getUserId = async () => {
        try {
          const { data } = await supabase.auth.getUser();
          return data?.user?.id ?? null;
        } catch {
          return null;
        }
      };
      const supabaseSync = createSupabaseSync(supabase, ds, getUserId);
      syncEngine = makeSupabaseSyncEngine(supabaseSync);

      // Enfileira mudanças locais (ignora pull/restore pra não re-push em loop).
      offChange = ds.bus.on('datastore:change', async (payload) => {
        if (payload.source === 'sync:pull' || payload.source === 'restore') return;
        const store = STORE_BY_ENTITY[payload.entityType];
        if (!store || !payload.entityIds) return;
        for (const id of payload.entityIds) {
          const rec = await ds.get(store, id);
          if (!rec) continue;
          // Meta: só sincroniza chaves na whitelist (firms/conexões).
          if (payload.entityType === 'meta' && !isSyncedMetaKey(rec.key)) continue;
          syncEngine?.enqueue(payload.entityType, rec);
        }
      });

      const schedulePull = () => {
        if (pullTimer) clearTimeout(pullTimer);
        pullTimer = setTimeout(() => {
          supabaseSync.pull().catch((e) => console.error('[sync] pull falhou', e));
        }, 2000);
      };

      const ensureCloud = async () => {
        if (unsubCloud) {
          try {
            unsubCloud();
          } catch {
            /* noop */
          }
          unsubCloud = null;
        }
        // Pull inicial (consolidação remota -> local).
        await supabaseSync.pull().catch((e) => console.error('[sync] pull falhou', e));
        if (cancelled) return;
        // Realtime: mudança remota agenda um pull (debounce).
        unsubCloud = await supabaseSync.subscribe(schedulePull);
      };

      await ensureCloud();
      // Login/logout depois do boot: re-consolida e re-assina.
      const { data: authSub } = supabase.auth.onAuthStateChange(() => {
        ensureCloud();
      });

      if (!cancelled) {
        setFinance({ ds, chain, money, wealth, risk, sync: syncEngine, cloud: supabaseSync });
      }

      return () => {
        authSub.subscription.unsubscribe();
      };
    }

    let disposeAuth = null;
    boot()
      .then((dispose) => {
        disposeAuth = dispose || null;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[finance] falha ao inicializar motores', err);
      });

    return () => {
      cancelled = true;
      offChange?.();
      syncEngine?.dispose?.();
      if (pullTimer) clearTimeout(pullTimer);
      if (unsubCloud) {
        try {
          unsubCloud();
        } catch {
          /* noop */
        }
      }
      disposeAuth?.();
    };
  }, [adapter]);

  const value = useMemo(() => finance, [finance]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

/** Acessa os motores. Lança erro se usado fora do Provider; retorna null enquanto
 * os serviços ainda estão inicializando (boot assíncrono do IndexedDB). */
export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (ctx === undefined) {
    throw new Error('useFinance() precisa estar dentro de <FinanceProvider>');
  }
  return ctx;
}

export default FinanceProvider;
