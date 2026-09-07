import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { runDestructiveWrite } from '../runDestructiveWrite';
import type { Account } from '../types';

function makeAdapter() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  return adapter;
}

describe('runDestructiveWrite', () => {
  it('faz snapshot -> clear + put -> evento, e restaura em caso de falha', async () => {
    const adapter = makeAdapter();
    // Dado pré-existente.
    await adapter.put('accounts', {
      id: 'a1',
      name: 'pre',
      kind: 'wallet',
      currency: 'USD',
      hidden: false,
      defaultWeight: 1,
      updatedAt: '2026-01-01T00:00:00Z',
      deviceId: 'dev',
      version: 1,
    } as Account);

    // Operação que lança erro DEPOIS de limpar (simula falha no meio).
    const result = await runDestructiveWrite(adapter, async (w) => {
      await w.clear('accounts');
      await w.put('accounts', {
        id: 'a2',
        name: 'novo',
        kind: 'cash',
        currency: 'USD',
        hidden: false,
        defaultWeight: 1,
        updatedAt: '2026-01-02T00:00:00Z',
        deviceId: 'dev',
        version: 1,
      } as Account);
      throw new Error('boom');
    });

    expect(result.restored).toBe(true);
    // Snapshot restaurado: dado original de volta, novo não vazou.
    const accounts = await adapter.getAll<Account>('accounts');
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe('a1');
    expect(accounts[0].name).toBe('pre');
  });

  it('não restaura quando a operação tem sucesso', async () => {
    const adapter = makeAdapter();
    const result = await runDestructiveWrite(adapter, async (w) => {
      await w.clear('accounts');
      await w.put('accounts', {
        id: 'a1',
        name: 'ok',
        kind: 'wallet',
        currency: 'USD',
        hidden: false,
        defaultWeight: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        deviceId: 'dev',
        version: 1,
      } as Account);
    });
    expect(result.restored).toBe(false);
    const accounts = await adapter.getAll<Account>('accounts');
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('ok');
  });
});
