// A8 — Dedup garantido no re-sync Quantower. Ingerir o mesmo lote 2x não duplica.
import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { DataChainEngine } from '../DataChainEngine';
import { EventBus } from '../events';
import { ingestQuantowerTrades, quantowerToTrade, rememberDeletedTrades, pruneUnknownTrades } from '../quantowerIngest';

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

describe('fee com sinal: net = gross - |fees|', () => {
  it('fee negativa (conexão reporta custo negativo) não aumenta o net', () => {
    const t = quantowerToTrade({ ...BATCH[0], grossPnl: -100, netPnl: -98, fee: -2 });
    expect(t.fees).toBe(2);
    expect(t.resultNet).toBe(-102);
  });

  it('mantém o netPnl do bridge quando ele já está consistente', () => {
    const t = quantowerToTrade({ ...BATCH[0], grossPnl: -100, netPnl: -102, fee: 2 });
    expect(t.resultNet).toBe(-102);
  });
});

describe('prune de trades fantasma (não existem mais na plataforma)', () => {
  it('remove só o que a ponte não devolve, dentro da janela, e grava lápide', async () => {
    const { ds, chain } = makeEngine();
    await ingestQuantowerTrades(ds, chain, BATCH); // 2 trades da ponte
    // Trade "fantasma" de uma conexão antiga (a ponte não devolve mais).
    await ds.trades.put({
      id: 'ghost', symbol: 'MGC', direction: 'long', entryDatetime: '2026-09-08T10:00:00Z',
      exitDatetime: '2026-09-08T11:00:00Z', qty: 1, entryPrice: 1, exitPrice: 2,
      commission: 0, fees: 0, swap: 0, resultNet: -114.72, resultR: null,
      source: 'quantower', quantowerId: 'qt_ghost', updatedAt: '', deviceId: 'd', version: 0,
    } as never, { source: 'quantower' });

    const r = await pruneUnknownTrades(ds, chain, BATCH, '2026-09-01T00:00:00Z');
    expect(r.removed).toBe(1);
    const left = await ds.trades.list();
    expect(left.map((t) => t.id).sort()).toEqual(['qt_qt_1', 'qt_qt_2']);
  });

  it('não toca em trade fora da janela (histórico antigo preservado)', async () => {
    const { ds, chain } = makeEngine();
    await ds.trades.put({
      id: 'old', symbol: 'ES', direction: 'long', entryDatetime: '2025-01-02T10:00:00Z',
      exitDatetime: '2025-01-02T11:00:00Z', qty: 1, entryPrice: 1, exitPrice: 2,
      commission: 0, fees: 0, swap: 0, resultNet: 10, resultR: null,
      source: 'quantower', quantowerId: 'qt_old', updatedAt: '', deviceId: 'd', version: 0,
    } as never, { source: 'quantower' });
    const r = await pruneUnknownTrades(ds, chain, BATCH, '2026-09-01T00:00:00Z');
    expect(r.removed).toBe(0);
    expect(await ds.trades.list()).toHaveLength(1);
  });
});

describe('anti-fantasma: trade sem entrada/saída ou com data no futuro não entra', () => {
  it('ignora posição aberta, data futura e trade sem entrada', async () => {
    const { ds, chain } = makeEngine();
    const far = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const r = await ingestQuantowerTrades(ds, chain, [
      { ...BATCH[0], platformTradeId: 'qt_open', exitDateTime: null, exitPrice: 0 },
      { ...BATCH[0], platformTradeId: 'qt_future', entryDateTime: far, exitDateTime: far },
      { ...BATCH[0], platformTradeId: 'qt_noentry', entryDateTime: null },
      { ...BATCH[0], platformTradeId: 'qt_ok' },
    ]);
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(3);
    expect(await ds.trades.list()).toHaveLength(1);
  });
});

describe('contract size (multiplier) derivado do dinheiro da plataforma', () => {
  // O bridge não manda `multiplier`; ele é recuperado de grossPnl / (Δpreço × qty).
  const mnq = {
    platformTradeId: 'qt_mnq', symbol: 'MNQ', side: 'Long', quantity: 1,
    entryPrice: 20000, exitPrice: 20010, entryDateTime: '2026-09-08T10:00:00Z',
    exitDateTime: '2026-09-08T11:00:00Z', grossPnl: 20, netPnl: 18, fee: 2, stopPrice: 19990,
  };

  it('deriva MNQ ×2 e o R fica certo (18/20 = 0.9R)', () => {
    const t = quantowerToTrade(mnq);
    expect(t.multiplier).toBe(2);
    expect(t.resultNet).toBe(18);
    expect(t.resultR).toBe(0.9);
  });

  it('respeita o multiplier quando o bridge enviar', () => {
    expect(quantowerToTrade({ ...mnq, multiplier: 20 }).multiplier).toBe(20);
  });

  it('sem grossPnl não inventa multiplier (fica undefined)', () => {
    expect(quantowerToTrade({ ...mnq, grossPnl: undefined }).multiplier).toBeUndefined();
  });
});

describe('A8 — dedup no re-sync', () => {
  it('ingerir o mesmo lote 2x: 2º não duplica nem reescreve (sem mudança)', async () => {
    const { ds, chain } = makeEngine();
    const r1 = await ingestQuantowerTrades(ds, chain, BATCH);
    expect(r1).toMatchObject({ created: 2, updated: 0 });
    const r2 = await ingestQuantowerTrades(ds, chain, BATCH);
    // idêntico => skipped (não reescreve nem duplica).
    expect(r2).toMatchObject({ created: 0, updated: 0, skipped: 2 });
    const all = await ds.trades.list();
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.quantowerId === 'qt_1')?.resultNet).toBe(100);
  });

  it('re-sync com valor DIFERENTE atualiza o trade (não cria novo)', async () => {
    const { ds, chain } = makeEngine();
    await ingestQuantowerTrades(ds, chain, BATCH);
    const r = await ingestQuantowerTrades(ds, chain, [{ ...BATCH[0], netPnl: 250 }]);
    expect(r).toMatchObject({ created: 0, updated: 1 });
    const all = await ds.trades.list();
    expect(all).toHaveLength(2);
    expect(all.find((t) => t.quantowerId === 'qt_1')?.resultNet).toBe(250);
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
