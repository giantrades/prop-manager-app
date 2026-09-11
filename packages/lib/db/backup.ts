// Borda de backup/restore do app-db v3 (dump JSON completo). Usado pelo backup no
// Drive (Navbar) e pela página de Settings. Lê/escreve SÓ via DataService.

import type { DataService } from './DataService';
import { STORE_NAMES, type StoreName } from './types';
import type { WriteOpts } from './repositories';

/** Exporta todos os stores como `{ store: registros[] }` (para download/Drive). */
export async function dumpAppDb(ds: DataService): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const store of STORE_NAMES) {
    out[store] = await ds.list(store);
  }
  return out;
}

/** Restaura um dump (ignora stores ausentes/vazias). */
export async function restoreAppDb(
  ds: DataService,
  data: Record<string, unknown[]>,
  opts?: WriteOpts,
): Promise<void> {
  for (const store of STORE_NAMES) {
    const rows = (data as Record<string, unknown[]> | null)?.[store];
    if (Array.isArray(rows) && rows.length > 0) {
      await ds.bulkPut(store as StoreName, rows as never[], opts ?? { source: 'restore' });
    }
  }
}
