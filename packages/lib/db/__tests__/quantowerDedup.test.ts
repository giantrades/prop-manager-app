// A8 — Dedup garantido no re-sync Quantower. Ingerir o mesmo lote 2x não duplica.
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus } from '../events';
import { ingestQuantowerTrades, quantowerToTrade, rememberDeletedTrades } from '../quantowerIngest';

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

  it('trade apagado (lápide) NÃO volta no re-sync', async () => {
    const { ds, chain } = makeEngine();
    await ingestQuantowerTrades(ds, chain, BATCH);
    const all = await ds.trades.list();
    const t1 = all.find((t) => t.quantowerId === 'qt_1');
    await rememberDeletedTrades(ds, [t1.id, 'qt_1']);
    await ds.trades.remove(t1.id);
    const r = await ingestQuantowerTrades(ds, chain, BATCH);
    expect(r.skipped).toBeGreaterThanOrEqual(1);
    const after = await ds.trades.list();
    expect(after.find((t) => t.quantowerId === 'qt_1')).toBeUndefined();
  });
});

describe('B — stopPrice vindo do bridge gera R', () => {
  it('com stopPrice + multiplier calcula resultR', () => {
    const t = quantowerToTrade({
      platformTradeId: 'qt_r', symbol: 'EURUSD', side: 'Long', quantity: 1,
      entryPrice: 1.1, exitPrice: 1.11, stopPrice: 1.099, multiplier: 100000, netPnl: 1000,
    });
    expect(t.stopPrice).toBe(1.099);
    // risk = |1.1 - 1.099| * 1 * 100000 = 100; pnl = 0.01*100000 = 1000 => R = 10
    expect(t.resultR).toBe(10);
  });

  it('sem stopPrice => resultR null (nunca 0)', () => {
    const t = quantowerToTrade({
      platformTradeId: 'qt_nr', symbol: 'EURUSD', side: 'Long', quantity: 1,
      entryPrice: 1.1, exitPrice: 1.11, netPnl: 1000,
    });
    expect(t.resultR).toBeNull();
  });
});

describe('A3 — MAE/MFE vindos do bridge', () => {
  it('quantowerToTrade mapeia mae/mfe quando presentes', () => {
    const t = quantowerToTrade({
      platformTradeId: 'qt_mae', symbol: 'EURUSD', side: 'Long', quantity: 1,
      entryPrice: 1.1, exitPrice: 1.11, netPnl: 100, mae: -25.5, mfe: 40,
    });
    expect(t.mae).toBe(-25.5);
    expect(t.mfe).toBe(40);
  });

  it('sem mae/mfe do bridge => undefined (nunca 0)', () => {
    const t = quantowerToTrade({
      platformTradeId: 'qt_nomae', symbol: 'EURUSD', side: 'Long', quantity: 1,
      entryPrice: 1.1, exitPrice: 1.11, netPnl: 100,
    });
    expect(t.mae).toBeUndefined();
    expect(t.mfe).toBeUndefined();
  });

  it('re-sync sem mae/mfe NÃO apaga o valor já conhecido', async () => {
    const { ds, chain } = makeEngine();
    await ingestQuantowerTrades(ds, chain, [{ ...BATCH[0], mae: -12, mfe: 30 }]);
    // segunda rodada sem os campos (bridge antigo) — deve preservar
    await ingestQuantowerTrades(ds, chain, [BATCH[0]]);
    const t = (await ds.trades.list()).find((x) => x.quantowerId === 'qt_1');
    expect(t?.mae).toBe(-12);
    expect(t?.mfe).toBe(30);
  });
});
