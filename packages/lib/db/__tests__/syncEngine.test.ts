import { describe, it, expect, vi } from 'vitest';
import {
  SyncEngine,
  resolveConflict,
  rangeForPage,
  pullAllPages,
  SYNC_BATCH_SIZE,
  type PushRecord,
} from '../syncEngine';
import { EVENTS } from '../events';
import type { SyncedRecord, Trade, Transaction } from '../types';

function rec(overrides: Partial<SyncedRecord> = {}): SyncedRecord {
  return {
    id: 'r1',
    updatedAt: '2026-01-01T00:00:00Z',
    deviceId: 'dev',
    version: 1,
    ...overrides,
  };
}

describe('resolveConflict — Opção B (campo financeiro nunca merge automático)', () => {
  it('merge por registro quando só um lado mudou campo financeiro (last-writer-wins)', () => {
    const local: Transaction = {
      ...rec({ id: 'tx1', updatedAt: '2026-01-02T00:00:00Z' }),
      accountId: 'a',
      kind: 'payout_in',
      amount: 100,
      currency: 'USD',
      date: '2026-01-01T00:00:00Z',
    } as Transaction;
    const remote: Transaction = {
      ...rec({ id: 'tx1', updatedAt: '2026-01-01T00:00:00Z' }),
      accountId: 'a',
      kind: 'payout_in',
      amount: 90,
      currency: 'USD',
      date: '2026-01-01T00:00:00Z',
    } as Transaction;
    const result = resolveConflict('transaction', local, remote, {
      ...local,
      amount: 90,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    // local mudou amount, remote não desde o base -> local vence (LWW por updatedAt).
    expect(result.conflict).toBe(false);
    expect(result.resolved?.amount).toBe(100);
  });

  it('marca CONFLICT quando os dois devices mudaram o campo financeiro', () => {
    const local: Transaction = {
      ...rec({ id: 'tx1', updatedAt: '2026-01-02T00:00:00Z' }),
      accountId: 'a',
      kind: 'payout_in',
      amount: 100,
      currency: 'USD',
      date: '2026-01-01T00:00:00Z',
    } as Transaction;
    const remote: Transaction = {
      ...rec({ id: 'tx1', updatedAt: '2026-01-02T00:00:00Z' }),
      accountId: 'a',
      kind: 'payout_in',
      amount: 90,
      currency: 'USD',
      date: '2026-01-01T00:00:00Z',
    } as Transaction;
    const base: Transaction = {
      ...local,
      amount: 50,
    } as Transaction;
    const result = resolveConflict('transaction', local, remote, base);
    expect(result.conflict).toBe(true);
    expect(result.resolved).toBeNull();
    expect(result.localVersion?.amount).toBe(100);
    expect(result.remoteVersion?.amount).toBe(90);
  });

  it('campo não-financeiro (note) segue last-writer-wins normal', () => {
    const local: Trade = {
      ...rec({ id: 't1', updatedAt: '2026-01-02T00:00:00Z' }),
      symbol: 'EURUSD',
      direction: 'long',
      entryDatetime: '2026-01-01T00:00:00Z',
      qty: 1,
      entryPrice: 1,
      commission: 0,
      swap: 0,
      rebate: 0,
      fees: 0,
      source: 'manual',
      resultNet: 1,
      resultR: null,
      notes: 'local note',
    } as Trade;
    const remote: Trade = {
      ...local,
      updatedAt: '2026-01-01T00:00:00Z',
      notes: 'remote note',
    } as Trade;
    const result = resolveConflict('trade', local, remote);
    expect(result.conflict).toBe(false);
    expect(result.resolved?.notes).toBe('local note'); // LWW por updatedAt
  });
});

describe('SyncEngine — debounce 3s + batch 500', () => {
  it('enfileira e faz flush com debounce', async () => {
    const push = vi.fn(async (batch: unknown[]) => ({ count: batch.length, entityCounts: { trade: batch.length } }));
    const engine = new SyncEngine({ push, debounceMs: 20 });
    engine.enqueue('trade', rec({ id: 't1' }));
    engine.enqueue('trade', rec({ id: 't2' }));
    await new Promise((r) => setTimeout(r, 40));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0]).toHaveLength(2);
    engine.dispose();
  });

  it('dedup por id mantém a versão mais recente na fila', async () => {
    const push = vi.fn(async (batch: unknown[]) => ({ count: batch.length, entityCounts: {} }));
    const engine = new SyncEngine({ push, debounceMs: 20 });
    engine.enqueue('trade', rec({ id: 't1', version: 1 }));
    engine.enqueue('trade', rec({ id: 't1', version: 2 }));
    await new Promise((r) => setTimeout(r, 40));
    expect(push.mock.calls[0][0]).toHaveLength(1);
    expect((push.mock.calls[0][0][0] as PushRecord).record.version).toBe(2);
    engine.dispose();
  });

  it('quebra em batches de 500', async () => {
    const push = vi.fn(async (batch: unknown[]) => ({ count: batch.length, entityCounts: {} }));
    const engine = new SyncEngine({ push, debounceMs: 10000, batchSize: SYNC_BATCH_SIZE });
    for (let i = 0; i < 1200; i++) {
      engine.enqueue('trade', rec({ id: `t${i}` }));
    }
    await engine.flush();
    expect(push).toHaveBeenCalledTimes(3); // 500 + 500 + 200
    expect(push.mock.calls[0][0]).toHaveLength(500);
    expect(push.mock.calls[2][0]).toHaveLength(200);
    engine.dispose();
  });

  it('emite sync:error e mantém a fila (não perde dado local)', async () => {
    const push = vi.fn(async () => {
      throw new Error('network down');
    });
    const errors: unknown[] = [];
    const engine = new SyncEngine({ push, debounceMs: 10, onError: (p) => errors.push(p) });
    const onSyncError = engine as unknown as { bus?: unknown };
    void onSyncError;
    engine.enqueue('trade', rec({ id: 't1' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(push).toHaveBeenCalled();
    expect(errors.length).toBeGreaterThan(0);
    // Fila não perdeu o registro.
    expect(engine.pending).toBeGreaterThan(0);
    engine.dispose();
  });
});

describe('range / pullAllPages', () => {
  it('rangeForPage calcula janelas corretas', () => {
    expect(rangeForPage(0, 500)).toEqual({ from: 0, to: 499 });
    expect(rangeForPage(1, 500)).toEqual({ from: 500, to: 999 });
  });

  it('pullAllPages itera até página incompleta', async () => {
    const data = Array.from({ length: 1200 }, (_, i) => ({ id: `r${i}` }));
    let calls = 0;
    const fetchRange = async ({ from, to }: { from: number; to: number }) => {
      calls += 1;
      return data.slice(from, to + 1);
    };
    const all = await pullAllPages(fetchRange, 500);
    expect(all).toHaveLength(1200);
    expect(calls).toBe(3);
  });
});
