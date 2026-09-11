// Firms (empresas/corretoras) — registro editável persistido em `meta` (como as
// categorias de Gastos). A cor da firm propaga para contas, pills e gráficos.
// Nenhuma fórmula financeira aqui.
import type { DataService } from './DataService';

const FIRMS_META_KEY = 'firms:registry';

export const DEFAULT_FIRM_COLOR = '#7c5cff';

export const FIRM_TYPES = ['Futures', 'Forex', 'Cripto', 'Personal', 'Corretora', 'Outro'];

export interface FirmDef {
  id: string;
  name: string;
  type: string;
  color: string; // hex
  logo?: string; // data URL (pequeno)
  notes?: string;
}

function normalize(f: unknown): FirmDef | null {
  if (!f || typeof f !== 'object') return null;
  const o = f as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || !o.name.trim()) return null;
  return {
    id: o.id,
    name: o.name,
    type: typeof o.type === 'string' && o.type ? o.type : 'Outro',
    color: typeof o.color === 'string' && o.color ? o.color : DEFAULT_FIRM_COLOR,
    logo: typeof o.logo === 'string' ? o.logo : undefined,
    notes: typeof o.notes === 'string' ? o.notes : undefined,
  };
}

/** Lista firms salvas (ordenadas por nome). */
export async function listFirms(ds: DataService): Promise<FirmDef[]> {
  const rec = await ds.meta.getKey(FIRMS_META_KEY);
  const raw = Array.isArray(rec?.value) ? rec.value : [];
  return raw.map(normalize).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)) as FirmDef[];
}

/** Cria/atualiza uma firm. `id` ausente gera id por slug+nome. */
export async function saveFirm(ds: DataService, firm: Partial<FirmDef>): Promise<FirmDef[]> {
  const name = (firm.name ?? '').trim();
  if (!name) return listFirms(ds);
  const current = await listFirms(ds);
  const id = firm.id || `firm-${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now().toString(36)}`;
  const next: FirmDef = {
    id,
    name,
    type: firm.type || 'Outro',
    color: firm.color || DEFAULT_FIRM_COLOR,
    logo: firm.logo,
    notes: firm.notes,
  };
  const byId = new Map(current.map((f) => [f.id, f]));
  byId.set(id, next);
  const value = [...byId.values()];
  await ds.meta.setKey(FIRMS_META_KEY, value);
  return value.sort((a, b) => a.name.localeCompare(b.name));
}

/** Remove uma firm do registro (não mexe nas contas). */
export async function deleteFirm(ds: DataService, id: string): Promise<FirmDef[]> {
  const current = await listFirms(ds);
  const value = current.filter((f) => f.id !== id);
  await ds.meta.setKey(FIRMS_META_KEY, value);
  return value;
}

/** Mapa id -> cor (para pintar contas/gráficos). */
export function firmColorById(firms: FirmDef[]): Record<string, string> {
  return Object.fromEntries(firms.map((f) => [f.id, f.color]));
}
