// STAGE 7 — supabaseSync. Fio de sync do app-db v3 -> Supabase (borda snake_case).
// Só converte chaves de TOPO (os valores de objeto/array vão como JSONB, preservando
// o camelCase interno do app). NUNCA toca campo financeiro com merge cego — usa o
// SyncEngine (Opção B) pra push, e pull consolidado por página.
//
// // SUPABASE BOUNDARY — snake_case apenas aqui.

import type { DataService } from './DataService';
import type { SyncedRecord, StoreName } from './types';
import { SyncEngine, pullAllPages, FINANCIAL_FIELDS_BY_ENTITY } from './syncEngine';
import { keyPathFor } from './adapter';
import { EVENTS } from './events';
import { nowIso } from './dateUtils';

/** Store -> tabela Supabase. `meta` sincroniza tudo, menos as chaves de device em
 *  `isSyncedMetaKey` (cursores, caches, credenciais da ponte). */
const TABLE_BY_ENTITY: Partial<Record<StoreName, string>> = {
  accounts: 'accounts',
  prop_extensions: 'prop_extensions',
  transactions: 'transactions',
  positions: 'positions',
  trades: 'trades',
  payouts: 'payouts',
  goals: 'goals',
  tax_records: 'tax_records',
  snapshots_networth: 'snapshots_networth',
  firm_costs: 'firm_costs',
  meta: 'app_meta',
};

/**
 * Sync de `meta`: por PADRÃO sincroniza tudo (categorias, orçamento, regras, marcos,
 * checklist, CDI/FX, firms, vínculo conexão...). Só fica local o que é do DEVICE:
 * cursores/caches e credenciais da ponte, conflitos de sync e flags de demo.
 */
const LOCAL_META_EXACT = new Set<string>([
  'sync:conflicts',
  'price:alerts:fired',
  'pricecache-v1',
  'demo:disabled',
  'demo:ids',
  'bridge:url',
  'bridge:token',
]);
const LOCAL_META_PREFIXES = ['bridge:quantower:', 'qt:', 'pricecache'];

/** A chave de meta sincroniza? (denylist: tudo menos estado do device) */
export function isSyncedMetaKey(key: unknown): boolean {
  if (typeof key !== 'string' || !key) return false;
  if (LOCAL_META_EXACT.has(key)) return false;
  return !LOCAL_META_PREFIXES.some((p) => key.startsWith(p));
}

const ENTITY_BY_STORE: Record<string, string> = {
  account: 'accounts',
  transaction: 'transactions',
  trade: 'trades',
  payout: 'payouts',
  goal: 'goals',
  position: 'positions',
  meta: 'meta',
};

/** store -> entityType (para as regras de campo financeiro da Opção B). */
const STORE_ENTITY: Partial<Record<StoreName, string>> = {
  accounts: 'account',
  transactions: 'transaction',
  trades: 'trade',
  payouts: 'payout',
  goals: 'goal',
  positions: 'position',
};

// ---------------------------------------------------------------------------
// camel <-> snake (topo)
// ---------------------------------------------------------------------------

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Converte chaves de topo de camelCase -> snake_case (valores preservados). */
export function camelToSnake(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    out[toSnake(k)] = v;
  }
  return out;
}

/** Converte chaves de topo de snake_case -> camelCase (valores preservados). */
export function snakeToCamel(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'user_id') continue; // borda: não vaza user_id pro domínio.
    out[toCamel(k)] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// createSupabaseSync — push + pull
// ---------------------------------------------------------------------------

export interface SupabaseClientLike {
  from: (t: string) => any;
  channel: (name: string) => any;
  removeChannel: (ch: any) => unknown;
}

export interface SyncConflict {
  /** `${entityType}:${recordId}` */
  id: string;
  entityType: string;
  recordId: string;
  /** Campos financeiros divergentes (Opção B). */
  fields: string[];
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  detectedAt: string;
}

export const SYNC_CONFLICTS_KEY = 'sync:conflicts';
const MAX_CONFLICTS = 50;

export interface SupabaseSync {
  push: (batch: Array<{ entityType: string; record: SyncedRecord }>) => Promise<{ count: number; entityCounts: Record<string, number> }>;
  pull: () => Promise<{ applied: number; conflicts: number }>;
  listConflicts: () => Promise<SyncConflict[]>;
  resolveConflictChoice: (conflictId: string, choice: 'mine' | 'theirs') => Promise<boolean>;
  /** Assina mudanças remotas (trades/transactions) → chama `onRemoteChange`. Retorna unsubscribe. */
  subscribe: (onRemoteChange: () => void) => Promise<() => void>;
}

/** Igualdade com tolerância numérica (NUMERIC do Postgres pode vir como string). */
function numEq(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return a === b;
  return Math.abs(na - nb) < 1e-9;
}

/**
 * Cria as funções de push/pull ligadas ao `supabase` client. `getUserId` lê o usuário
 * autenticado (retorna null se não logado → sync vira no-op, RLS protege).
 */
export function createSupabaseSync(
  supabase: SupabaseClientLike,
  ds: DataService,
  getUserId: () => Promise<string | null>,
): SupabaseSync {
  const push = async (batch) => {
    const userId = await getUserId();
    if (!userId) return { count: 0, entityCounts: {} };

    const byTable = new Map<string, Array<Record<string, unknown>>>();
    for (const { entityType, record } of batch) {
      const store = ENTITY_BY_STORE[entityType];
      const table = store ? TABLE_BY_ENTITY[store as StoreName] : undefined;
      if (!table) continue;
      // Meta: sobe tudo menos estado do device (denylist).
      if (store === 'meta' && !isSyncedMetaKey((record as unknown as { key?: string }).key)) continue;
      if (!byTable.has(table)) byTable.set(table, []);
      byTable.get(table)!.push({ ...camelToSnake(record as Record<string, unknown>), user_id: userId });
    }

    let count = 0;
    const entityCounts: Record<string, number> = {};
    for (const [table, rows] of byTable) {
      if (rows.length === 0) continue;
      // upsert por id; ignora conflito de construtor único (ex.: positions UNIQUE user+account+symbol).
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) {
        // app_meta é opcional (migration pode não ter rodado) — não derruba o sync dos demais.
        if (table === 'app_meta') {
          // eslint-disable-next-line no-console
          console.warn('[sync] app_meta indisponível — rode 003_app_meta.sql:', error.message);
          continue;
        }
        throw error;
      }
      count += rows.length;
      entityCounts[table] = (entityCounts[table] ?? 0) + rows.length;
    }
    return { count, entityCounts };
  };

  const pull = async () => {
    const userId = await getUserId();
    if (!userId) return { applied: 0, conflicts: 0 };
    const startedAt = Date.now();
    const entityCounts: Record<string, number> = {};
    let applied = 0;
    let conflicts = 0;
    for (const [store, table] of Object.entries(TABLE_BY_ENTITY)) {
      if (!table) continue;
      const storeName = store as StoreName;
      const entity = STORE_ENTITY[storeName] ?? storeName;
      let rows: unknown[];
      try {
        rows = await pullAllPages((win) =>
          supabase.from(table).select('*').eq('user_id', userId).range(win.from, win.to),
        );
      } catch (e) {
        // app_meta pode não existir ainda — segue sem ele.
        if (table === 'app_meta') continue;
        throw e;
      }
      for (const row of rows) {
        const rec = snakeToCamel(row as Record<string, unknown>) as unknown as SyncedRecord;
        // Meta: ignora chaves de device (defesa extra).
        if (storeName === 'meta' && !isSyncedMetaKey((rec as unknown as { key?: string }).key)) continue;
        // Chave primária real de cada store (prop_extensions usa accountId).
        const key = (rec as unknown as Record<string, unknown>)[keyPathFor(storeName)] ?? rec.id;
        if (key == null) continue;
        const local = await ds.get<SyncedRecord>(storeName, String(key));
        if (!local) {
          await ds.put(storeName, rec, { source: 'sync:pull' });
          applied += 1;
          entityCounts[storeName] = (entityCounts[storeName] ?? 0) + 1;
          continue;
        }
        if (local.updatedAt === rec.updatedAt && local.deviceId === rec.deviceId) continue;
        const fields = FINANCIAL_FIELDS_BY_ENTITY[entity] ?? [];
        const differs = fields.filter(
          (f) => !numEq((local as unknown as Record<string, unknown>)[f], (rec as unknown as Record<string, unknown>)[f]),
        );
        if (differs.length > 0) {
          // Opção B: campo financeiro mexido dos dois lados → NÃO sobrescreve;
          // registra o conflito e mantém o local até decisão humana.
          await recordConflict(ds, {
            id: `${entity}:${String(key)}`,
            entityType: entity,
            recordId: String(key),
            fields: differs,
            local: local as unknown as Record<string, unknown>,
            remote: rec as unknown as Record<string, unknown>,
            detectedAt: nowIso(),
          });
          conflicts += 1;
          continue;
        }
        // Sem divergência financeira: vence o mais recente (LWW por updatedAt).
        if (Date.parse(rec.updatedAt) >= Date.parse(local.updatedAt)) {
          await ds.put(storeName, rec, { source: 'sync:pull' });
          applied += 1;
          entityCounts[storeName] = (entityCounts[storeName] ?? 0) + 1;
        }
      }
    }
    ds.bus.emit(EVENTS.SYNC_PULLED, { count: applied, entityCounts, durationMs: Date.now() - startedAt });
    return { applied, conflicts };
  };

  const listConflicts = async (): Promise<SyncConflict[]> => {
    const rec = await ds.meta.getKey(SYNC_CONFLICTS_KEY);
    const v = rec?.value;
    return Array.isArray(v) ? (v as SyncConflict[]) : [];
  };

  const resolveConflictChoice = async (conflictId: string, choice: 'mine' | 'theirs'): Promise<boolean> => {
    const userId = await getUserId();
    const list = await listConflicts();
    const found = list.find((c) => c.id === conflictId);
    if (!found || !userId) return false;
    const store = ENTITY_BY_STORE[found.entityType] as StoreName | undefined;
    const table = store ? TABLE_BY_ENTITY[store] : undefined;
    if (!store || !table) return false;
    if (choice === 'theirs') {
      await ds.put(store, found.remote as unknown as SyncedRecord, { source: 'sync:pull' });
    } else {
      const { error } = await supabase
        .from(table)
        .upsert([{ ...camelToSnake(found.local), user_id: userId }], { onConflict: 'id' });
      if (error) throw error;
    }
    await ds.meta.setKey(
      SYNC_CONFLICTS_KEY,
      list.filter((c) => c.id !== conflictId),
    );
    return true;
  };

  const subscribe = async (onRemoteChange: () => void): Promise<() => void> => {
    const userId = await getUserId();
    if (!userId) return () => undefined;
    const ch = supabase
      .channel('appdb-v3')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => onRemoteChange())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => onRemoteChange())
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
  };

  return { push, pull, listConflicts, resolveConflictChoice, subscribe };
}

async function recordConflict(ds: DataService, conflict: SyncConflict): Promise<void> {
  const rec = await ds.meta.getKey(SYNC_CONFLICTS_KEY);
  const list = (Array.isArray(rec?.value) ? (rec.value as SyncConflict[]) : []).filter(
    (c) => c.id !== conflict.id,
  );
  list.unshift(conflict);
  await ds.meta.setKey(SYNC_CONFLICTS_KEY, list.slice(0, MAX_CONFLICTS));
}

/** SyncEngine configurado com o push acima. */
export function makeSupabaseSyncEngine(supabaseSync: SupabaseSync) {
  return new SyncEngine({ push: supabaseSync.push });
}
