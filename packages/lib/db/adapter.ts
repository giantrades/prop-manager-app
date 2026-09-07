// STAGE 2 — DbAdapter: abstração de storage pra que o DataService/DataChainEngine
// sejam testáveis sem IndexedDB real. Produção usa IndexedDbAdapter (app-db v3),
// testes usam MemoryDbAdapter (mesma interface, mesmo comportamento).

import type { IDBPDatabase } from 'idb';
import { STORE_NAMES, type StoreName } from './types';

/** keyPath primário por store (mesmo do appDb.ts). prop_extensions usa accountId. */
export function keyPathFor(store: StoreName): string {
  switch (store) {
    case 'prop_extensions':
      return 'accountId';
    default:
      return 'id';
  }
}

function keyOf(store: StoreName, value: Record<string, unknown>): string {
  const kp = keyPathFor(store);
  const key = value[kp];
  return typeof key === 'string' ? key : String(key ?? '');
}

export interface DbAdapter {
  get<T>(store: StoreName, id: string): Promise<T | undefined>;
  put<T>(store: StoreName, value: T): Promise<void>;
  bulkPut<T>(store: StoreName, values: T[]): Promise<void>;
  delete(store: StoreName, id: string): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
  getAllByIndex<T>(
    store: StoreName,
    indexName: string,
    query?: IDBKeyRange | string | number | null,
  ): Promise<T[]>;
  clear(store: StoreName): Promise<void>;
  count(store: StoreName): Promise<number>;
}

// ---------------------------------------------------------------------------
// IndexedDbAdapter — produção (app-db v3 via `idb`)
// ---------------------------------------------------------------------------

export class IndexedDbAdapter implements DbAdapter {
  constructor(private readonly db: IDBPDatabase) {}

  async get<T>(store: StoreName, id: string): Promise<T | undefined> {
    return (await this.db.get(store, id)) as T | undefined;
  }

  async put<T>(store: StoreName, value: T): Promise<void> {
    await this.db.put(store, value);
  }

  async bulkPut<T>(store: StoreName, values: T[]): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    await Promise.all(values.map((v) => tx.store.put(v)));
    await tx.done;
  }

  async delete(store: StoreName, id: string): Promise<void> {
    await this.db.delete(store, id);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return (await this.db.getAll(store)) as T[];
  }

  async getAllByIndex<T>(
    store: StoreName,
    indexName: string,
    query?: IDBKeyRange | string | number | null,
  ): Promise<T[]> {
    if (query === undefined || query === null) {
      return (await this.db.getAllFromIndex(store, indexName)) as T[];
    }
    return (await this.db.getAllFromIndex(store, indexName, query)) as T[];
  }

  async clear(store: StoreName): Promise<void> {
    await this.db.clear(store);
  }

  async count(store: StoreName): Promise<number> {
    return this.db.count(store);
  }
}

// ---------------------------------------------------------------------------
// MemoryDbAdapter — testes. Duas instâncias com o MESMO backend compartilham
// dados, simulando o IndexedDB único compartilhado entre abas.
// ---------------------------------------------------------------------------

export interface MemoryBackend {
  stores: Map<StoreName, Map<string, unknown>>;
  /** Listeners de escrita por store (usados pelo teste multi-tab pra simular BroadcastChannel). */
  writeListeners: Set<(store: StoreName, id: string) => void>;
}

export function createMemoryBackend(): MemoryBackend {
  const stores = new Map<StoreName, Map<string, unknown>>();
  for (const name of STORE_NAMES) stores.set(name, new Map());
  return { stores, writeListeners: new Set() };
}

export class MemoryDbAdapter implements DbAdapter {
  constructor(private readonly backend: MemoryBackend = createMemoryBackend()) {}

  private map(store: StoreName): Map<string, unknown> {
    const m = this.backend.stores.get(store);
    if (!m) throw new Error(`store inexistente: ${store}`);
    return m;
  }

  async get<T>(store: StoreName, id: string): Promise<T | undefined> {
    return this.map(store).get(id) as T | undefined;
  }

  async put<T>(store: StoreName, value: T): Promise<void> {
    const key = keyOf(store, value as Record<string, unknown>);
    this.map(store).set(key, value);
    this.backend.writeListeners.forEach((fn) => fn(store, key));
  }

  async bulkPut<T>(store: StoreName, values: T[]): Promise<void> {
    for (const v of values) await this.put(store, v);
  }

  async delete(store: StoreName, id: string): Promise<void> {
    this.map(store).delete(id);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...this.map(store).values()] as T[];
  }

  async getAllByIndex<T>(
    store: StoreName,
    indexName: string,
    query?: IDBKeyRange | string | number | null,
  ): Promise<T[]> {
    const all = (await this.getAll<T>(store)) as Array<Record<string, unknown>>;
    if (query === undefined || query === null) return all as T[];

    // Índices compostos usam chave no formato "a,b" quando passamos array.
    const q = Array.isArray(query) ? query.join(',') : query;
    const [path, ...rest] = indexName.split(',');
    return all.filter((r) => {
      const value = r[path];
      if (rest.length === 0) return value === q;
      const compound = [value, ...rest.map((p) => r[p])].join(',');
      return compound === q;
    }) as T[];
  }

  async clear(store: StoreName): Promise<void> {
    this.map(store).clear();
  }

  async count(store: StoreName): Promise<number> {
    return this.map(store).size;
  }
}
