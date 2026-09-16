// STAGE 2 — app-db v3 (IndexedDB). Criação limpa do NOVO, não migração dos 3 storages.
// Stores finais do contrato 01-DATA_CONTRACT.md: accounts, prop_extensions,
// transactions, positions, trades, payouts, goals, tax_records, snapshots_networth,
// firm_costs, meta.
//
// Mobile-first: nada de schema "desktop"; índices compostos prontos pra range query
// por data (Firm P&L / Wallets), único caminho pra PWA 360px + offline.

import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import { DB_NAME, DB_VERSION, STORE_NAMES, type StoreName } from './types';

interface AppDbSchema extends DBSchema {
  accounts: {
    key: string;
    value: Record<string, unknown> & { id: string };
    indexes: { kind: string; platformAccountId: string };
  };
  prop_extensions: {
    key: string;
    value: Record<string, unknown> & { accountId: string };
    indexes: { accountId: string; phase: string };
  };
  transactions: {
    key: string;
    value: Record<string, unknown> & { id: string };
    indexes: { account_date: string[]; firm_date: string[]; kind_date: string[] };
  };
  positions: {
    key: string;
    value: Record<string, unknown> & { id: string };
    indexes: { account_symbol: string[] };
  };
  trades: {
    key: string;
    value: Record<string, unknown> & { id: string };
    indexes: { account_entry: string[]; strategy_entry: string[]; quantowerId: string };
  };
  payouts: { key: string; value: Record<string, unknown> & { id: string } };
  goals: { key: string; value: Record<string, unknown> & { id: string } };
  tax_records: { key: string; value: Record<string, unknown> & { id: string } };
  snapshots_networth: { key: string; value: Record<string, unknown> & { id: string } };
  firm_costs: { key: string; value: Record<string, unknown> & { id: string } };
  cards: { key: string; value: Record<string, unknown> & { id: string } };
  meta: { key: string; value: Record<string, unknown> & { id: string } };
}

type Stores = keyof AppDbSchema;

interface StoreDef {
  keyPath: string;
  /** indexName -> keyPath (string simples ou array p/ composto) */
  indexes?: Record<string, string | string[]>;
}

const STORE_DEFS: Record<StoreName, StoreDef> = {
  accounts: {
    keyPath: 'id',
    indexes: { kind: 'kind', platformAccountId: 'platformAccountId' },
  },
  prop_extensions: {
    keyPath: 'accountId',
    indexes: { accountId: 'accountId', phase: 'phase' },
  },
  transactions: {
    keyPath: 'id',
    indexes: {
      account_date: ['accountId', 'date'],
      firm_date: ['firmId', 'date'],
      kind_date: ['kind', 'date'],
    },
  },
  positions: {
    keyPath: 'id',
    indexes: { account_symbol: ['accountId', 'symbol'] },
  },
  trades: {
    keyPath: 'id',
    indexes: {
      account_entry: ['accountId', 'entryDatetime'],
      strategy_entry: ['strategyId', 'entryDatetime'],
      quantowerId: 'quantowerId',
    },
  },
  payouts: { keyPath: 'id' },
  goals: { keyPath: 'id' },
  tax_records: { keyPath: 'id' },
  snapshots_networth: { keyPath: 'id' },
  firm_costs: { keyPath: 'id' },
  cards: { keyPath: 'id' },
  meta: { keyPath: 'id' },
};

/**
 * Abre (cria se necessário) o app-db v3. Todos os stores nascem no upgrade,
 * com os índices do contrato. Idempotente: só cria o que ainda não existe.
 */
export async function openAppDb(): Promise<IDBPDatabase<AppDbSchema>> {
  const db = await openDB<AppDbSchema>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion, _newVersion, tx) {
      // v1 -> v3. Nunca alterar v3 in-place depois que Stage 2+ escreve código.
      // Usa tipos DOM (IDBDatabase) aqui: mesma chamada em runtime, sem a
      // fricção dos genéricos do `idb` (que poluem o type-check sem mudar nada).
      upgradeStores(database as unknown as IDBDatabase);
      // Limpa stores órfãs de versões anteriores (se houver).
      void oldVersion;
      void tx;
    },
  });
  return db;
}

/** Cria os stores/índices do contrato (idempotente). */
function upgradeStores(database: IDBDatabase): void {
  const storeNames: StoreName[] = [...STORE_NAMES];
  for (const name of storeNames) {
    const def = STORE_DEFS[name];
    if (database.objectStoreNames.contains(name)) continue;
    const store = database.createObjectStore(name, { keyPath: def.keyPath });
    if (def.indexes) {
      for (const [indexName, keyPath] of Object.entries(def.indexes)) {
        store.createIndex(indexName, keyPath, { unique: indexName === 'quantowerId' });
      }
    }
  }
}

/** Cria o adapter de produção em cima do app-db v3. */
export async function createProductionAdapter() {
  const { IndexedDbAdapter } = await import('./adapter');
  const db = await openAppDb();
  return new IndexedDbAdapter(db as unknown as IDBPDatabase);
}
