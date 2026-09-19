// Saldo das contas da PLATAFORMA (bridge) → contas do app.
// O app deriva saldo do ledger; para contas ligadas à ponte, guardamos também o saldo
// que a plataforma reporta (`Account.platformBalance`) — referência p/ a UI e base do
// capital nominal de contas prop sem nominal. Nada de fórmula: é só persistência.

import type { DataService } from './DataService';

export interface BridgeAccountLike {
  platformAccountId?: string;
  balance?: number;
}

/**
 * BALANCE da conta — valor único usado por TODOS os widgets de Contas/Firms.
 * Fonte: `platformBalance` (o que a PLATAFORMA reporta, via bridge) quando existe;
 * senão o fallback (ledger/derivado). Nada de fórmula nova: é só precedência.
 */
export function accountBalance(
  account: { platformBalance?: number } | null | undefined,
  fallback = 0,
): number {
  const p = account?.platformBalance;
  if (typeof p === 'number' && Number.isFinite(p)) return p;
  return Number(fallback) || 0;
}

/**
 * Grava `platformBalance` nas contas associadas (match por `platformAccountId`) e usa o
 * saldo como capital nominal de conta prop que ainda não tem um. Só escreve o que mudou.
 * @returns quantas contas foram atualizadas.
 */
export async function syncPlatformBalances(ds: DataService, bridgeAccounts: BridgeAccountLike[]): Promise<number> {
  if (!Array.isArray(bridgeAccounts) || bridgeAccounts.length === 0) return 0;
  const balByPid = new Map<string, number>();
  for (const b of bridgeAccounts) {
    if (!b.platformAccountId) continue;
    balByPid.set(b.platformAccountId, Number(b.balance) || 0);
  }
  if (balByPid.size === 0) return 0;

  const accounts = await ds.accounts.list();
  let updated = 0;
  for (const a of accounts) {
    if (a.disabled) continue; // conta desabilitada sai das conexões (não recebe saldo).
    if (!a.platformAccountId) continue;
    const bal = balByPid.get(a.platformAccountId);
    if (bal == null) continue;

    const needBal = Number(a.platformBalance ?? NaN) !== bal;
    let prop = null;
    if (a.kind === 'prop') prop = await ds.propExtensions.byAccountId(a.id).catch(() => null);
    const needNominal = a.kind === 'prop' && prop && !(Number(prop.nominalSize) > 0) && bal > 0;
    if (!needBal && !needNominal) continue;

    await ds.accounts.put(
      { ...a, platformBalance: bal, platformBalanceAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { source: 'local' },
    );
    if (needNominal) {
      await ds.propExtensions.put({ ...prop, nominalSize: bal, updatedAt: new Date().toISOString() }, { source: 'local' });
    }
    updated += 1;
  }
  return updated;
}
