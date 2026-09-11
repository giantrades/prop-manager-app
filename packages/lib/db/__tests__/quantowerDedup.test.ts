// A8 — Dedup garantido no re-sync Quantower. Ingerir o mesmo lote 2x não duplica.
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus } from '../events';
import { ingestQuantowerTrades } from '../quantowerIngest';

function makeEngine() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  const bus = new EventBus();
  const ds = new DataService({ adapter, deviceId: 'dev-dedup', bus, channel: null });
  const chain = new DataChainEngine(ds);
  return { ds, chain };
}

const BATCH = [
  {
    platformTradeId: 'qt_1', symbol: 'EURUSD', side: 'Long', quantity: 1,
    entryPrice: 1.1, exitPrice: 1.11, entryDateTime: '2026-09-08T10:00:00Z',
    exitDateTime: '2026-09-08T11:00:00Z', netPnl: 100, fee: 1,
  },
  {
    platformTradeId: 'qt_2', symbol: 'XAUUSD', side: 'Short', quantity: 2,
    entryPrice: 200, exitPrice: 198, entryDateTime: '2026-09-09T10:00:00Z',
    exitDateTime: '2026-09-09T11:00:00Z', netPnl: 40, fee: 0.5,
  },
];

describe('A8 — dedup no re-sync', () => {
  it('ingerir o mesmo lote 2x: 2º é só update, sem duplicar, PnL intacto', async () => {
    const { ds, chain } = makeEngine();
    const r1 = await ingestQuantowerTrades(ds, chain, BATCH);
    expect(r1).toMatchObject({ created: 2, updated: 0 });
    const r2 = await ingestQuantowerTrades(ds, chain, BATCH);
    expect(r2).toMatchObject({ created: 0, updated: 2, skipped: 0 });
    const all = await ds.trades.list();
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.quantowerId === 'qt_1')?.resultNet).toBe(100);
  });

  it('sem platformTradeId => skipped, nunca cria órfão sem id', async () => {
    const { ds, chain } = makeEngine();
    const r = await ingestQuantowerTrades(ds, chain, [{ ...BATCH[0], platformTradeId: '' }]);
    expect(r).toMatchObject({ created: 0, skipped: 1 });
    expect(await ds.trades.list()).toHaveLength(0);
  });
});
