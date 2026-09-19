import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';
import { camelToSnake, snakeToCamel, createSupabaseSync, isSyncedMetaKey } from '../supabaseSync';

function makeDs() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId: 'dev-sync', bus, channel: null });
  return { ds };
}

// Mock de supabase `from` que captura upsert/select.
function mockSupabase() {
  const calls: { upsert: Array<{ table: string; rows: unknown[]; onConflict?: string }>; select: Array<{ table: string; from: number; to: number }>; selectResults?: Record<string, unknown[]>; subscribedTables: string[] } = { upsert: [], select: [], subscribedTables: [] };
  const make = (table: string) => ({
    upsert: async (rows: unknown[], opts?: { onConflict?: string }) => {
      calls.upsert.push({ table, rows, onConflict: opts?.onConflict });
      return { error: null };
    },
    select: () => ({
      eq: (_k: string, _v: unknown) => ({
        range: async (from: number, to: number) => {
          calls.select.push({ table, from, to });
          return calls.selectResults?.[table] ?? [];
        },
      }),
    }),
  });
  const channel = (_name: string) => {
    const ch: any = {
      on: (_evt: string, filter: { table: string }, _cb: () => void) => {
        calls.subscribedTables.push(filter.table);
        return ch;
      },
      subscribe: () => ch,
    };
    return ch;
  };
  const supabase = { from: make, channel, removeChannel: () => undefined };
  return { supabase, calls };
}

/** Mock com resultados de select pré-carregados por tabela. */
function mockSupabaseWith(selectResults: Record<string, unknown[]>) {
  const m = mockSupabase();
  m.calls.selectResults = selectResults;
  return m;
}

describe('Fase 6/7 — supabaseSync (borda snake_case)', () => {
  it('camelToSnake converte chaves de topo (valores preservados)', () => {
    const out = camelToSnake({ accountId: 'a', defaultWeight: 2, payoutRules: { feePct: 0.2 } });
    expect(out.account_id).toBe('a');
    expect(out.default_weight).toBe(2);
    // objeto interno (JSONB) preserva camelCase
    expect(out.payout_rules).toEqual({ feePct: 0.2 });
  });

  it('snakeToCamel converte e remove user_id (borda)', () => {
    const out = snakeToCamel({ id: 'x', user_id: 'u', default_weight: 2, updated_at: 't' });
    expect(out.id).toBe('x');
    expect(out.defaultWeight).toBe(2);
    expect(out.updatedAt).toBe('t');
    expect('user_id' in out).toBe(false);
  });

  it('camelToSnake/snakeToCamel tratam acrônimos DD (maxDD → max_dd, não max_d_d)', () => {
    expect(camelToSnake({ maxDD: 0.1, trailingDD: 0.08, dailyDD: 0.05 })).toEqual({
      max_dd: 0.1,
      trailing_dd: 0.08,
      daily_dd: 0.05,
    });
    expect(snakeToCamel({ max_dd: 0.1, trailing_dd: 0.08, daily_dd: 0.05 })).toEqual({
      maxDD: 0.1,
      trailingDD: 0.08,
      dailyDD: 0.05,
    });
  });

  it('push de prop_extensions usa onConflict account_id e coluna daily_dd', async () => {
    const { ds } = makeDs();
    const { supabase, calls } = mockSupabase();
    const sync = createSupabaseSync(supabase as any, ds, async () => 'user-1');
    await sync.push([
      {
        entityType: 'prop_extension',
        record: {
          accountId: 'a1', nominalSize: 100000, maxDD: 0.1, trailingDD: 0.08,
          dailyDD: 0.05, updatedAt: 't', deviceId: 'd', version: 1,
        } as any,
      },
    ]);
    expect(calls.upsert).toHaveLength(1);
    expect(calls.upsert[0].table).toBe('prop_extensions');
    expect(calls.upsert[0].onConflict).toBe('account_id');
    const row = calls.upsert[0].rows[0] as Record<string, unknown>;
    expect(row.account_id).toBe('a1');
    expect(row.daily_dd).toBe(0.05);
    expect('daily_d_d' in row).toBe(false);
  });

  it('push agrupa por tabela e injeta user_id', async () => {
    const { ds } = makeDs();
    const { supabase, calls } = mockSupabase();
    const sync = createSupabaseSync(supabase as any, ds, async () => 'user-1');
    const result = await sync.push([
      { entityType: 'account', record: { id: 'a1', kind: 'wallet', name: 'Wise', updatedAt: 't', deviceId: 'd', version: 0 } as any },
      { entityType: 'account', record: { id: 'a2', kind: 'bank', name: 'C6', updatedAt: 't', deviceId: 'd', version: 0 } as any },
    ]);
    expect(result.count).toBe(2);
    expect(calls.upsert).toHaveLength(1);
    expect(calls.upsert[0].table).toBe('accounts');
    expect(calls.upsert[0].rows).toHaveLength(2);
    const r0 = calls.upsert[0].rows[0] as Record<string, unknown>;
    expect(r0.user_id).toBe('user-1');
    expect(r0.kind).toBe('wallet');
  });

  it('meta sincroniza por denylist: dados do usuário sobem, estado do device não', async () => {
    const { ds } = makeDs();
    const { supabase, calls } = mockSupabase();
    const sync = createSupabaseSync(supabase as any, ds, async () => 'user-1');
    await sync.push([
      { entityType: 'meta', record: { id: 'meta:expense:categories', key: 'expense:categories', value: [], updatedAt: 't', deviceId: 'd', version: 0 } as any },
      { entityType: 'meta', record: { id: 'meta:firms:registry', key: 'firms:registry', value: [], updatedAt: 't', deviceId: 'd', version: 0 } as any },
      { entityType: 'meta', record: { id: 'meta:sync:conflicts', key: 'sync:conflicts', value: [], updatedAt: 't', deviceId: 'd', version: 0 } as any },
    ]);
    expect(isSyncedMetaKey('expense:categories')).toBe(true);
    expect(isSyncedMetaKey('firms:registry')).toBe(true);
    expect(isSyncedMetaKey('bridge:connectionFirms')).toBe(true);
    expect(isSyncedMetaKey('sync:conflicts')).toBe(false);
    expect(isSyncedMetaKey('qt:lastSync')).toBe(false);
    expect(isSyncedMetaKey('bridge:quantower:lastSync')).toBe(false);
    expect(calls.upsert).toHaveLength(1);
    expect(calls.upsert[0].table).toBe('app_meta');
    expect(calls.upsert[0].rows).toHaveLength(2);
  });

  it('subscribe assina TODAS as tabelas sincronizadas (não só trades/transactions)', async () => {
    const { ds } = makeDs();
    const { supabase, calls } = mockSupabase();
    const sync = createSupabaseSync(supabase as any, ds, async () => 'user-1');
    await sync.subscribe(() => {});
    expect(calls.subscribedTables).toContain('trades');
    expect(calls.subscribedTables).toContain('transactions');
    expect(calls.subscribedTables).toContain('accounts');
    expect(calls.subscribedTables).toContain('prop_extensions');
    expect(calls.subscribedTables).toContain('goals');
    expect(calls.subscribedTables).toContain('app_meta');
    // sem duplicatas
    expect(new Set(calls.subscribedTables).size).toBe(calls.subscribedTables.length);
  });

  it('push é no-op sem usuário logado', async () => {
    const { ds } = makeDs();
    const { supabase, calls } = mockSupabase();
    const sync = createSupabaseSync(supabase as any, ds, async () => null);
    const result = await sync.push([
      { entityType: 'account', record: { id: 'a1', kind: 'wallet', name: 'Wise', updatedAt: 't', deviceId: 'd', version: 0 } as any },
    ]);
    expect(result.count).toBe(0);
    expect(calls.upsert).toHaveLength(0);
  });

  it('pull grava no DataService (source sync:pull) e remove user_id', async () => {
    const { ds } = makeDs();
    const { supabase, calls } = mockSupabase();
    calls.selectResults = {
      accounts: [
        { id: 'a1', user_id: 'u1', kind: 'wallet', name: 'Wise', default_weight: 1, hidden: false, currency: 'USD', updated_at: 't', device_id: 'd', version: 0 },
      ],
    };
    const sync = createSupabaseSync(supabase as any, ds, async () => 'user-1');
    await sync.pull();
    const accounts = await ds.accounts.list();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].kind).toBe('wallet');
    expect(accounts[0].defaultWeight).toBe(1);
    expect('user_id' in accounts[0]).toBe(false);
  });

  it('pull registra conflito Opção B sem sobrescrever o local', async () => {
    const adapter = new MemoryDbAdapter(createMemoryBackend());
    const bus = new EventBus();
    const ds = new DataService({ adapter, deviceId: 'dev-sync', bus, channel: null });
    // Seed direto no adapter (sem carimbo) para controlar updatedAt/deviceId.
    await adapter.put('transactions', {
      id: 't1', accountId: 'w', kind: 'payout_in', amount: 1000, currency: 'USD',
      date: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', deviceId: 'dev-A', version: 1,
    });
    const { supabase } = mockSupabaseWith({
      transactions: [
        {
          id: 't1', user_id: 'u1', account_id: 'w', kind: 'payout_in', amount: 2000,
          currency: 'USD', date: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z',
          device_id: 'dev-B', version: 1,
        },
      ],
    });
    const sync = createSupabaseSync(supabase as any, ds, async () => 'user-1');
    const res = await sync.pull();
    expect(res.conflicts).toBe(1);
    // Local preservado.
    expect((await ds.transactions.get('t1'))?.amount).toBe(1000);
    const conflicts = await sync.listConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].entityType).toBe('transaction');
    expect(conflicts[0].fields).toContain('amount');
  });

  it("resolve 'theirs' aplica a nuvem; resolve 'mine' sobe o local", async () => {
    const adapter = new MemoryDbAdapter(createMemoryBackend());
    const bus = new EventBus();
    const ds = new DataService({ adapter, deviceId: 'dev-sync', bus, channel: null });
    await adapter.put('transactions', {
      id: 't1', accountId: 'w', kind: 'payout_in', amount: 1000, currency: 'USD',
      date: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', deviceId: 'dev-A', version: 1,
    });
    const { supabase, calls } = mockSupabaseWith({
      transactions: [
        {
          id: 't1', user_id: 'u1', account_id: 'w', kind: 'payout_in', amount: 2000,
          currency: 'USD', date: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z',
          device_id: 'dev-B', version: 1,
        },
      ],
    });
    const sync = createSupabaseSync(supabase as any, ds, async () => 'user-1');
    await sync.pull();
    const [c] = await sync.listConflicts();

    await sync.resolveConflictChoice(c.id, 'theirs');
    expect((await ds.transactions.get('t1'))?.amount).toBe(2000);
    expect(await sync.listConflicts()).toHaveLength(0);
  });

  it("resolve 'mine' faz upsert do local na tabela", async () => {
    const adapter = new MemoryDbAdapter(createMemoryBackend());
    const bus = new EventBus();
    const ds = new DataService({ adapter, deviceId: 'dev-sync', bus, channel: null });
    await adapter.put('transactions', {
      id: 't1', accountId: 'w', kind: 'payout_in', amount: 1000, currency: 'USD',
      date: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', deviceId: 'dev-A', version: 1,
    });
    const { supabase, calls } = mockSupabaseWith({
      transactions: [
        {
          id: 't1', user_id: 'u1', account_id: 'w', kind: 'payout_in', amount: 2000,
          currency: 'USD', date: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z',
          device_id: 'dev-B', version: 1,
        },
      ],
    });
    const sync = createSupabaseSync(supabase as any, ds, async () => 'user-1');
    await sync.pull();
    const [c] = await sync.listConflicts();
    const ok = await sync.resolveConflictChoice(c.id, 'mine');
    expect(ok).toBe(true);
    const up = calls.upsert.find((u) => u.table === 'transactions');
    expect(up).toBeDefined();
    expect((up!.rows[0] as Record<string, unknown>).amount).toBe(1000);
    expect((up!.rows[0] as Record<string, unknown>).user_id).toBe('user-1');
    expect(await sync.listConflicts()).toHaveLength(0);
  });
});
