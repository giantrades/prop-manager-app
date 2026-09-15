// Ações do Command Center — parte EDITÁVEL pelo usuário:
// - Ações MANUAIS (lembretes) criadas pelo dono.
// - Regras: quais kinds derivados disparam (risk/goal/payout/tax/price).
// Persistido em `meta` (como categorias/firms). Nenhuma fórmula financeira aqui.
import type { DataService } from './DataService';
import type { ActionKind } from './financialIntelligence';

const MANUAL_KEY = 'actions:manual';
const RULES_KEY = 'actions:rules';

export type ManualActionSeverity = 'warn' | 'info' | 'good';

export interface ManualAction {
  id: string;
  title: string;
  detail?: string;
  severity: ManualActionSeverity;
  dueDate?: string;
}

export interface ActionRules {
  enabled: ActionKind[];
}

export const ALL_ACTION_KINDS: ActionKind[] = ['risk', 'goal', 'payout', 'price', 'manual'];
export const ACTION_KIND_LABEL: Record<string, string> = {
  risk: 'Risco (conta em STOP/WARN)',
  goal: 'Meta concluída/próxima',
  payout: 'Payout disponível/pendente',
  price: 'Alerta de preço disparado',
  manual: 'Ações manuais (lembretes)',
};

/** Lê as ações manuais salvas. */
export async function listManualActions(ds: DataService): Promise<ManualAction[]> {
  const rec = await ds.meta.getKey(MANUAL_KEY);
  const raw = Array.isArray(rec?.value) ? (rec.value as ManualAction[]) : [];
  return raw
    .filter((a) => a && typeof a.id === 'string' && typeof a.title === 'string')
    .sort((a, b) => String(a.dueDate ?? '').localeCompare(String(b.dueDate ?? '')));
}

/** Cria/atualiza uma ação manual. */
export async function saveManualAction(ds: DataService, action: Partial<ManualAction>): Promise<ManualAction[]> {
  const title = (action.title ?? '').trim();
  if (!title) return listManualActions(ds);
  const current = await listManualActions(ds);
  const rec: ManualAction = {
    id: action.id || `ma-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    detail: action.detail,
    severity: action.severity || 'info',
    dueDate: action.dueDate,
  };
  const byId = new Map(current.map((a) => [a.id, a]));
  byId.set(rec.id, rec);
  await ds.meta.setKey(MANUAL_KEY, [...byId.values()]);
  return listManualActions(ds);
}

/** Remove uma ação manual. */
export async function deleteManualAction(ds: DataService, id: string): Promise<ManualAction[]> {
  const current = await listManualActions(ds);
  await ds.meta.setKey(MANUAL_KEY, current.filter((a) => a.id !== id));
  return listManualActions(ds);
}

/** Regras: quais kinds disparam (default: todos). */
export async function getActionRules(ds: DataService): Promise<ActionRules> {
  const rec = await ds.meta.getKey(RULES_KEY);
  const value = rec?.value as ActionRules | undefined;
  const enabled = Array.isArray(value?.enabled) ? value!.enabled.filter((k) => ALL_ACTION_KINDS.includes(k)) : ALL_ACTION_KINDS;
  return { enabled };
}

export async function setActionRules(ds: DataService, rules: ActionRules): Promise<ActionRules> {
  const clean = { enabled: (rules.enabled ?? []).filter((k) => ALL_ACTION_KINDS.includes(k)) };
  await ds.meta.setKey(RULES_KEY, clean);
  return clean;
}
