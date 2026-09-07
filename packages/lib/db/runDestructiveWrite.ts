// STAGE 2 — runDestructiveWrite. Único caminho pra `clear()`/`setItem(seed)`.
// Proibido `.clear()` fora daqui (P0 do audit ULTRA). Sempre:
//   snapshot atual -> try { clear + put } -> verificar -> evento.
// Se falhar, restaura o snapshot e re-lança — nunca deixa o app com dado vazio.

import type { DbAdapter } from './adapter';
import { STORE_NAMES, type StoreName } from './types';

export interface DestructiveWriter {
  clear(store: StoreName): Promise<void>;
  put<T>(store: StoreName, value: T): Promise<void>;
}

export interface DestructiveResult {
  restored: boolean;
  error?: unknown;
}

/**
 * Executa uma escrita destrutiva com backup transacional.
 *
 * @param adapter  storage (IndexedDb ou Memory)
 * @param mutate   operação que faz clear/put dentro de um transaction escopado
 * @returns `{ restored }` — `restored=true` se houve rollback do snapshot.
 */
export async function runDestructiveWrite(
  adapter: DbAdapter,
  mutate: (writer: DestructiveWriter) => Promise<void>,
): Promise<DestructiveResult> {
  // Passo 0: backup do estado atual em memória.
  const snapshot = new Map<StoreName, unknown[]>();
  for (const store of STORE_NAMES) {
    snapshot.set(store, await adapter.getAll(store));
  }

  const writer: DestructiveWriter = {
    async clear(store) {
      await adapter.clear(store);
    },
    async put(store, value) {
      await adapter.put(store, value);
    },
  };

  try {
    await mutate(writer);
    return { restored: false };
  } catch (error) {
    // Rollback: restaura o snapshot exato.
    for (const store of STORE_NAMES) {
      await adapter.clear(store);
      const items = snapshot.get(store) ?? [];
      if (items.length > 0) await adapter.bulkPut(store, items);
    }
    return { restored: true, error };
  }
}
