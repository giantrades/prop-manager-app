// Vínculo conexão (bridge) -> firm. Persistido em `meta` (local; a firm da conta,
// essa sim, é sincronizada em `Account.firmId`). A cor/ícone da firm da conexão
// pintam o card e são propagados para todas as contas daquela conexão.
import type { DataService } from './DataService';

const CONN_FIRMS_KEY = 'bridge:connectionFirms';

export type ConnectionFirmMap = Record<string, string>;

/** Mapa connectionId -> firmId. */
export async function listConnectionFirms(ds: DataService): Promise<ConnectionFirmMap> {
  const rec = await ds.meta.getKey(CONN_FIRMS_KEY);
  const v = rec?.value;
  return v && typeof v === 'object' ? (v as ConnectionFirmMap) : {};
}

/** Define (ou limpa, passando vazio) a firm de uma conexão. */
export async function setConnectionFirm(
  ds: DataService,
  connectionId: string,
  firmId: string | null,
): Promise<ConnectionFirmMap> {
  const current = await listConnectionFirms(ds);
  const next = { ...current };
  if (firmId) next[connectionId] = firmId;
  else delete next[connectionId];
  await ds.meta.setKey(CONN_FIRMS_KEY, next);
  return next;
}
