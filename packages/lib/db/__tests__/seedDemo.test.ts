// Seed de demonstração (VITE_DEMO_MODE) — garante que o boot não quebra e que os
// dados de teste (firms, R dos trades, posições outras/RF) são criados.
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus } from '../events';
import { seedDemoData } from '../seedDemo';
import { listFirms } from '../firms';

function makeEngine() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId: 'dev-demo', bus, channel: null });
  const chain = new DataChainEngine(ds);
  return { ds, chain };
}

describe('seedDemoData', () => {
  it('cria firms, contas com firmId, trades com R e posições outras/RF', async () => {
    const { ds, chain } = makeEngine();
    const n = await seedDemoData(ds, chain);
    expect(n).toBe(24);

    const firms = await listFirms(ds);
    expect(firms.map((f) => f.name)).toEqual(expect.arrayContaining(['FTMO', 'E8 Markets', 'XP']));

    const accounts = await ds.accounts.list();
    const e8 = accounts.find((a) => a.id === 'acct-e8');
    expect(e8?.firmId).toBeTruthy();
    expect(e8?.platformAccountId).toBe('qt_demo_1');

    const trades = await ds.trades.list();
    expect(trades).toHaveLength(24);
    expect(trades.every((t) => t.stopPrice != null && t.resultR != null)).toBe(true);

    const positions = await ds.positions.list();
    expect(positions.find((p) => p.assetKind === 'other')).toBeTruthy();
    expect(positions.find((p) => p.assetKind === 'fixed')).toBeTruthy();
  });
});
