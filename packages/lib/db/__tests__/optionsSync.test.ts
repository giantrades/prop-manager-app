import { describe, it, expect } from 'vitest';
import { MemoryDbAdapter, createMemoryBackend } from '../adapter';
import { DataService } from '../DataService';
import { EventBus } from '../events';
import { parseOptionSymbol } from '../optionsIngest';
import { syncOptionsFromBridge, type OptionsBridge } from '../optionsSync';
import type { OptionLeg } from '../types';

function makeDs() {
  const adapter = new MemoryDbAdapter(createMemoryBackend());
  return new DataService({ adapter, deviceId: 'dev', bus: new EventBus(), channel: null });
}

describe('opções — parse do símbolo do contrato', () => {
  it('OCC, <strike><C|P> e <C|P><strike>', () => {
    expect(parseOptionSymbol('AAPL250117C00150000')).toEqual({ right: 'call', strike: 150 });
    expect(parseOptionSymbol('PETR4 40C')).toEqual({ right: 'call', strike: 40 });
    expect(parseOptionSymbol('PETR4 P36')).toEqual({ right: 'put', strike: 36 });
    expect(parseOptionSymbol('AAPL C150')).toEqual({ right: 'call', strike: 150 });
    expect(parseOptionSymbol('qualquercoisa')).toBeNull();
  });
});

describe('opções — sync com o bridge', () => {
  const bridge: OptionsBridge = {
    expiries: async (u) => (u === 'PETR4' ? [{ expiry: '2026-11-21' }] : []),
    chain: async (u, e) => ({
      underlying: u,
      expiry: e,
      spot: 38,
      quotes: [
        { symbol: 'PETR4 C40', bid: 1.1, ask: 1.3, last: 1.2, iv: 0.28, multiplier: 100 },
        { symbol: 'PETR4 P36', bid: 0.9, ask: 1.1, last: 1.0, iv: 0.31, multiplier: 100 },
        { symbol: 'SEMSTRIKE', bid: 1, ask: 1, multiplier: 100 }, // rejeitada (sem strike/right)
      ],
    }),
    positions: async () => ({
      positions: [
        { platformPositionId: 'p1', accountId: 'a1', underlying: 'PETR4', symbol: 'PETR4 C40', expiry: '2026-11-21', qty: -1, avgPrice: 1.2, multiplier: 100, iv: 0.28 },
      ],
    }),
  };

  it('grava a cadeia e as posições (derivando strike/right do símbolo)', async () => {
    const ds = makeDs();
    const res = await syncOptionsFromBridge(ds, bridge, { underlyings: ['PETR4'] });
    expect(res.expiries).toBe(1);
    expect(res.quotes).toBe(2);
    expect(res.rejectedQuotes).toBe(1);
    expect(res.legs).toBe(1);

    const chain = await ds.optionChain.list();
    expect(chain).toHaveLength(2);
    expect(chain.find((q) => q.right === 'call')?.strike).toBe(40);
    expect(chain.find((q) => q.right === 'put')?.strike).toBe(36);
    expect(chain.every((q) => q.source === 'bridge')).toBe(true);

    const legs = await ds.optionLegs.list();
    expect(legs).toHaveLength(1);
    expect(legs[0].quantowerId).toBe('p1');
    expect(legs[0].right).toBe('call');
    expect(legs[0].strike).toBe(40);
    expect(legs[0].qty).toBe(-1);
  });

  it('merge preserva o id local e o contexto do usuário (grupo, entrada)', async () => {
    const ds = makeDs();
    const existing: OptionLeg = {
      id: 'local-1', accountId: 'a1', underlying: 'PETR4', symbol: 'PETR4 C40', right: 'call', strike: 40,
      expiry: '2026-11-21', qty: -1, multiplier: 100, entryPrice: 1.0, entryDatetime: '2026-10-01T00:00:00Z',
      fees: 1.5, groupId: 'grp-cc', source: 'quantower', quantowerId: 'p1', updatedAt: 'x', deviceId: 'd', version: 1,
    };
    await ds.optionLegs.put(existing, { source: 'restore' });

    await syncOptionsFromBridge(ds, bridge, { underlyings: ['PETR4'] });
    const legs = await ds.optionLegs.list();
    expect(legs).toHaveLength(1);
    expect(legs[0].id).toBe('local-1'); // id local preservado
    expect(legs[0].groupId).toBe('grp-cc'); // contexto preservado
    expect(legs[0].entryPrice).toBe(1.2); // preço médio do bridge atualizado
  });

  it('bridge off (exceções) não quebra e mantém o que existe', async () => {
    const ds = makeDs();
    const down: OptionsBridge = {
      expiries: async () => { throw new Error('off'); },
      chain: async () => { throw new Error('off'); },
      positions: async () => { throw new Error('off'); },
    };
    const res = await syncOptionsFromBridge(ds, down, { underlyings: ['PETR4'] });
    expect(res).toEqual({ expiries: 0, quotes: 0, rejectedQuotes: 0, legs: 0, rejectedLegs: 0 });
  });
});
