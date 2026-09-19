// Saldo da plataforma (bridge) → contas do app. Cobre a regra de DESABILITADAS:
// uma conta desabilitada sai das conexões e NÃO recebe mais platformBalance.
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';
import { syncPlatformBalances, accountBalance } from '../platformBalances';
import type { Account } from '../types';

function makeDs(): DataService {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  return new DataService({ adapter, deviceId: 'dev-bridge', bus, channel: null });
}

function account(overrides: Partial<Account> & { id: string }): Account {
  return {
    kind: 'prop', name: overrides.id, currency: 'USD', hidden: false, defaultWeight: 1,
    updatedAt: '2026-09-18T10:00:00Z', deviceId: 'dev-bridge', version: 0,
    ...overrides,
  } as Account;
}

describe('syncPlatformBalances — conta desabilitada', () => {
  it('atualiza a conta ativa e ignora a desabilitada', async () => {
    const ds = makeDs();
    await ds.accounts.put(account({ id: 'a1', platformAccountId: 'qt1' }));
    await ds.accounts.put(account({ id: 'a2', platformAccountId: 'qt2', disabled: true }));

    const updated = await syncPlatformBalances(ds, [
      { platformAccountId: 'qt1', balance: 1234 },
      { platformAccountId: 'qt2', balance: 9999 },
    ]);

    expect(updated).toBe(1);
    const a1 = await ds.accounts.get('a1');
    const a2 = await ds.accounts.get('a2');
    expect(accountBalance(a1)).toBe(1234);
    expect(a2?.platformBalance).toBeUndefined();
  });
});
