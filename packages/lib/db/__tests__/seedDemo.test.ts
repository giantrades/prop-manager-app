// Seed de demonstração (VITE_DEMO_MODE) — garante que o boot não quebra e que os
// dados de teste (firms, R dos trades, posições outras/RF) são criados.
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus } from '../events';
import { seedDemoData } from '../seedDemo';
import { listFirms } from '../firms';
import { hasUserData, clearDemoData, isDemoDisabled } from '../demoMode';

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

    // Opções demo: cadeia (cache), pernas e template custom.
    const optChain = await ds.optionChain.list();
    expect(optChain.length).toBe(36); // 2 vencimentos × 9 strikes × 2 lados
    expect(optChain.every((q) => q.multiplier === 100 && q.iv != null)).toBe(true);
    const optLegs = await ds.optionLegs.list();
    expect(optLegs).toHaveLength(5);
    expect(optLegs.some((l) => l.groupId === 'grp-demo-cc' && l.right === 'call' && l.qty < 0)).toBe(true);
    const optTemplates = await ds.optionTemplates.list();
    expect(optTemplates.map((t) => t.id)).toContain('tpl-demo-wheel');
    const txs = await ds.transactions.list();
    expect(txs.filter((t) => t.kind === 'option_premium')).toHaveLength(2);
  });

  it('conta própria liga hasUserData; clearDemoData remove só o demo e desliga', async () => {
    const { ds, chain } = makeEngine();
    await seedDemoData(ds, chain);
    expect(await hasUserData(ds)).toBe(false);

    await ds.accounts.put(
      { id: 'acct-user', kind: 'bank', name: 'Meu Banco', currency: 'BRL', hidden: false, defaultWeight: 1, updatedAt: new Date().toISOString(), deviceId: 'x', version: 0 },
      { source: 'local' },
    );
    expect(await hasUserData(ds)).toBe(true);

    await clearDemoData(ds);
    const accounts = await ds.accounts.list();
    expect(accounts.map((a) => a.id)).toEqual(['acct-user']);
    expect(await ds.trades.list()).toHaveLength(0);
    expect(await ds.optionLegs.list()).toHaveLength(0);
    expect(await ds.optionChain.list()).toHaveLength(0);
    expect(await ds.optionTemplates.list()).toHaveLength(0);
    expect(await isDemoDisabled(ds)).toBe(true);
  });
});
