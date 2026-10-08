// Modo demo (VITE_DEMO_MODE). Marca os registros criados pelo seed de demonstração.
// Assim que o usuário cadastra a PRIMEIRA conta própria, o modo demo se desliga e os
// dados de demonstração são removidos — sem precisar mexer no `.env`.
//
// Regra de detecção: "dado do usuário" = conta cujo id NÃO pertence ao seed. Contas são
// a entidade-âncora (evita falso positivo de transações criadas pelo próprio seed via
// DataChainEngine).
import type { DataService } from './DataService';
import { deleteFirm } from './firms';

const DEMO_IDS_KEY = 'demo:ids';
const DEMO_DISABLED_KEY = 'demo:disabled';

export interface DemoIds {
  accounts: string[];
  transactions: string[];
  trades: string[];
  payouts: string[];
  goals: string[];
  positions: string[];
  propExtensions: string[];
  firms: string[];
  optionLegs?: string[];
  optionTemplates?: string[];
  optionChain?: string[];
}

type StoreKey =
  | 'accounts'
  | 'transactions'
  | 'trades'
  | 'payouts'
  | 'goals'
  | 'positions'
  | 'propExtensions'
  | 'optionLegs'
  | 'optionTemplates'
  | 'optionChain';

const STORES: Array<[keyof DemoIds, StoreKey]> = [
  ['accounts', 'accounts'],
  ['transactions', 'transactions'],
  ['trades', 'trades'],
  ['payouts', 'payouts'],
  ['goals', 'goals'],
  ['positions', 'positions'],
  ['propExtensions', 'propExtensions'],
  ['optionLegs', 'optionLegs'],
  ['optionTemplates', 'optionTemplates'],
  ['optionChain', 'optionChain'],
];

/** Ids gravados pelo seed (null se o seed nunca rodou). */
export async function getDemoIds(ds: DataService): Promise<DemoIds | null> {
  const rec = await ds.meta.getKey(DEMO_IDS_KEY);
  const v = rec?.value as DemoIds | undefined;
  return v && typeof v === 'object' ? v : null;
}

/** Registra os ids criados pelo seed. */
export async function setDemoIds(ds: DataService, ids: DemoIds): Promise<void> {
  await ds.meta.setKey(DEMO_IDS_KEY, ids);
}

/** O modo demo já foi desligado (não volta nem com banco vazio). */
export async function isDemoDisabled(ds: DataService): Promise<boolean> {
  const rec = await ds.meta.getKey(DEMO_DISABLED_KEY);
  return rec?.value === true;
}

/** Desliga o modo demo permanentemente. */
export async function disableDemo(ds: DataService): Promise<void> {
  await ds.meta.setKey(DEMO_DISABLED_KEY, true);
}

/**
 * O usuário já tem dados próprios? Considera apenas contas: a primeira conta que não é
 * do seed significa que ele começou a usar o app de verdade.
 */
export async function hasUserData(ds: DataService): Promise<boolean> {
  const ids = await getDemoIds(ds);
  const demoAccounts = new Set(ids?.accounts ?? []);
  const accounts = await ds.accounts.list();
  return accounts.some((a) => !demoAccounts.has(a.id));
}

/**
 * Remove os registros de demonstração (pelos ids do seed) e desliga o modo demo.
 * Nunca toca em registros do usuário.
 */
export async function clearDemoData(ds: DataService): Promise<void> {
  const ids = await getDemoIds(ds);
  if (ids) {
    for (const [idKey, store] of STORES) {
      const list = ids[idKey] ?? [];
      if (!Array.isArray(list) || list.length === 0) continue;
      // `ds[store]` é o repositório correspondente (todos expõem remove(id)).
      const repo = ds[store] as unknown as { remove: (id: string, opts?: { source?: string }) => Promise<void> };
      for (const id of list) {
        try {
          await repo.remove(id, { source: 'restore' });
        } catch {
          /* registro já ausente — segue */
        }
      }
    }
    for (const firmId of ids.firms ?? []) {
      try {
        await deleteFirm(ds, firmId);
      } catch {
        /* noop */
      }
    }
  }
  await disableDemo(ds);
  // Limpa o marcador para não repetir o trabalho.
  await ds.meta.setKey(DEMO_IDS_KEY, null);
}
