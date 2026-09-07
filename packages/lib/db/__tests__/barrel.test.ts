import { describe, it, expect } from 'vitest';
// Importa o barrel (caminho de consumo real: `@apps/lib/db`).
import {
  DataService,
  DataChainEngine,
  MemoryDbAdapter,
  createMemoryBackend,
  EventBus,
  runDestructiveWrite,
  isEntryFill,
  resolveConflict,
  importPayouts,
  normalizeLegacyPayout,
  withLock,
  createMultiTabCoordinator,
  STORE_NAMES,
  EVENTS,
} from '../index';

describe('barrel @apps/lib/db — consumo sem circular import', () => {
  it('expõe todos os símbolos principais', () => {
    expect(typeof DataService).toBe('function');
    expect(typeof DataChainEngine).toBe('function');
    expect(typeof MemoryDbAdapter).toBe('function');
    expect(typeof createMemoryBackend).toBe('function');
    expect(typeof EventBus).toBe('function');
    expect(typeof runDestructiveWrite).toBe('function');
    expect(typeof isEntryFill).toBe('function');
    expect(typeof resolveConflict).toBe('function');
    expect(typeof importPayouts).toBe('function');
    expect(typeof normalizeLegacyPayout).toBe('function');
    expect(typeof withLock).toBe('function');
    expect(typeof createMultiTabCoordinator).toBe('function');
  });

  it('STORE_NAMES contém os 11 stores do contrato', () => {
    expect(STORE_NAMES).toEqual([
      'accounts',
      'prop_extensions',
      'transactions',
      'positions',
      'trades',
      'payouts',
      'goals',
      'tax_records',
      'snapshots_networth',
      'firm_costs',
      'meta',
    ]);
  });

  it('instancia DataService + DataChainEngine end-to-end via barrel', async () => {
    const adapter = new MemoryDbAdapter(createMemoryBackend());
    const ds = new DataService({ adapter, deviceId: 'dev-barrel', bus: new EventBus(), channel: null });
    const chain = new DataChainEngine(ds);
    await ds.accounts.put({
      id: 'a1',
      kind: 'prop',
      name: 'FTMO',
      currency: 'USD',
      hidden: false,
      defaultWeight: 1,
    } as never);
    await ds.propExtensions.put({
      accountId: 'a1',
      nominalSize: 100000,
      challengeCost: 0,
      phase: 'funded',
      target: 100000,
      maxDD: 0.1,
      trailingDD: 0.1,
      dailyDD: 0.05,
      consistencyPct: 1,
      minDays: 1,
      payoutRules: { minProfit: 0, minDaysSincePayout: 1, feePct: 0.2, method: 'Rise' },
      profitSplit: 0.8,
      payoutFrequency: 'monthly',
      updatedAt: '2026-01-01T00:00:00Z',
      deviceId: 'dev-barrel',
      version: 0,
    } as never);
    const equity = await chain.computeEquity('a1');
    expect(equity).toBe(100000);
  });
});
