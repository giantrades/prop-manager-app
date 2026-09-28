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
  EVENTS,
} from '@apps/lib/db';
import { supabase } from '@apps/supabase/client';

const FinanceContext = createContext(undefined);

// ---------------------------------------------------------------------------
// Status da nuvem (visível na UI): último pull/push e erro. Store de módulo para não
// recriar o objeto `finance` a cada atualização.
// ---------------------------------------------------------------------------
let _cloudStatus = null;
const _cloudListeners = new Set();
function publishCloudStatus(patch) {
  _cloudStatus = { ...(_cloudStatus ?? {}), ...patch, at: new Date().toISOString() };
  for (const l of _cloudListeners) {
    try { l(_cloudStatus); } catch { /* noop */ }
  }
}
/** Status do sync com a nuvem (reativo). */
export function useCloudStatus() {
  const [s, setS] = useState(_cloudStatus);
  useEffect(() => {
    _cloudListeners.add(setS);
    setS(_cloudStatus);
    return () => { _cloudListeners.delete(setS); };
  }, []);
  return s;
}

const STORE_BY_ENTITY = {
  account: 'accounts',
  transaction: 'transactions',
  trade: 'trades',
  payout: 'payouts',
  goal: 'goals',
  position: 'positions',
  card: 'cards',
  prop_extension: 'prop_extensions',
  tax_record: 'tax_records',
  snapshot_networth: 'snapshots_networth',
  firm_cost: 'firm_costs',
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
    let pullInterval = null;
    let detachWake = null;

    async function boot() {
      let dsAdapter = adapter;
      if (!dsAdapter) {
        // Produção: app-db v3 (IndexedDB). Dinâmico p/ não pesar o bundle no primeiro paint.
        const { createProductionAdapter } = await import('@apps/lib/db');
        dsAdapter = await createProductionAdapter();
      }
      // deviceId ESTÁVEL por aparelho (antes era gerado a cada boot: os registros do
      // próprio usuário pareciam de "outro device" e a reconciliação chegou a apagá-los).
      let deviceId;
      try {
        deviceId = localStorage.getItem('appdb:deviceId') || undefined;
        if (!deviceId) {
          deviceId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
            ? crypto.randomUUID()
            : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
          localStorage.setItem('appdb:deviceId', deviceId);
        }
      } catch {
        deviceId = undefined;
      }
      const ds = new DataService({ adapter: dsAdapter, deviceId });
      const chain = new DataChainEngine(ds);
      const money = new MoneyService(ds, chain);
      const wealth = new WealthService(ds);
      const risk = new RiskService(ds, chain);

      // Demo automático: só em build com VITE_DEMO_MODE=1 e banco vazio.
      // NÃO apaga sozinho — o usuário controla pelo botão "Apagar dados demo"
      // (Sistema → Dados), assim o demo pode conviver com os dados reais.
      try {
        if (import.meta.env?.VITE_DEMO_MODE === '1') {
          const { seedDemoData, isDemoDisabled } = await import('@apps/lib/db');
          if (!(await isDemoDisabled(ds))) {
            const existingAccounts = await ds.accounts.list();
            if (existingAccounts.length === 0) await seedDemoData(ds, chain);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[demo] falhou', e);
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

      // Espelha o estado do sync para a UI (Settings → Sincronização).
      ds.bus.on(EVENTS.SYNC_PULLED, (p) => publishCloudStatus({ applied: p?.count ?? 0, entityCounts: p?.entityCounts ?? {}, error: null }));
      ds.bus.on(EVENTS.SYNC_PUSHED, (p) => publishCloudStatus({ pushed: p?.count ?? 0, error: null }));
      ds.bus.on(EVENTS.SYNC_ERROR, (p) => {
        // Loga o motivo REAL (tabela/coluna/constraint) — antes só aparecia o 400 cru no
        // console e o usuário não sabia qual campo quebrava o push.
        // eslint-disable-next-line no-console
        console.error(`[sync] ${p?.phase ?? 'sync'} falhou: ${p?.message ?? 'erro desconhecido'}`);
        publishCloudStatus({ error: p?.message ?? 'erro no sync', phase: p?.phase ?? null });
      });
      publishCloudStatus({ userId: (await getUserId()) ? 'ok' : 'sem-login' });

      // Enfileira mudanças locais (ignora pull/restore pra não re-push em loop).
      offChange = ds.bus.on('datastore:change', async (payload) => {
        if (payload.source === 'sync:pull' || payload.source === 'restore') return;
        const store = STORE_BY_ENTITY[payload.entityType];
        if (!store || !payload.entityIds) return;
        for (const id of payload.entityIds) {
          const rec = await ds.get(store, id);
          if (!rec) {
            // EXCLUSÃO local → apaga na nuvem (antes era ignorado: o registro sumia só
            // aqui e continuava existindo no Supabase e nos outros aparelhos).
            supabaseSync.remove?.(payload.entityType, String(id)).catch((e) => console.error('[sync] delete falhou', e));
            continue;
          }
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

      const flushSoon = () => {
        try {
          const p = syncEngine?.flushNow?.();
          if (p && typeof p.catch === 'function') p.catch(() => { /* re-tenta sozinho */ });
        } catch {
          /* noop */
        }
      };

      // Volta ao foco/rede: puxa o que o OUTRO aparelho mudou e envia o que ficou na fila.
      const wake = () => { schedulePull(); flushSoon(); };
      const onVisibility = () => {
        if (typeof document !== 'undefined' && document.hidden) flushSoon();
        else wake();
      };
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', wake);
        window.addEventListener('online', wake);
      }
      detachWake = () => {
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
        if (typeof window !== 'undefined') {
          window.removeEventListener('focus', wake);
          window.removeEventListener('online', wake);
        }
      };
      // Rede de segurança: puxa de tempos em tempos enquanto a aba está visível.
      pullInterval = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        schedulePull();
      }, 60000);

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
        // Backfill: sobe o meta local do usuário que ainda não está no remoto
        // (categorias, orçamento, regras, marcos, checklist, CDI/FX, firms...).
        try {
          const allMeta = await ds.meta.list();
          for (const m of allMeta) if (isSyncedMetaKey(m.key)) syncEngine?.enqueue('meta', m);
        } catch {
          /* noop */
        }
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
      if (pullInterval) clearInterval(pullInterval);
      detachWake?.();
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

/** Igual ao `useFinance`, mas devolve `undefined` fora do Provider (sem lançar).
 *  Útil para contextos que podem ser montados sem os motores (ex.: moeda em teste). */
export function useFinanceOptional() {
  return useContext(FinanceContext);
}

export default FinanceProvider;
