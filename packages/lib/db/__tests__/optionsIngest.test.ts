import { describe, it, expect } from 'vitest';
import {
  normalizeOptionChain,
  normalizeOptionChainDetailed,
  normalizeOptionPositions,
  normalizeOptionPositionsDetailed,
  mergeOptionLegs,
} from '../optionsIngest';
import type { OptionLeg } from '../types';

const leg = (over: Partial<OptionLeg>): OptionLeg => ({
  id: 'local-1', accountId: 'a1', underlying: 'PETR4', symbol: 'PETR4C40', right: 'call', strike: 40,
  expiry: '2026-11-21', qty: -1, multiplier: 100, entryPrice: 1.2, entryDatetime: '2026-10-01T00:00:00Z',
  fees: 0, source: 'quantower', quantowerId: 'p1', updatedAt: 'x', deviceId: 'd', version: 1, ...over,
});

describe('opções — ingest do bridge (F3)', () => {
  it('normaliza a cadeia (id determinístico, multiplier do contrato, source bridge)', () => {
    const quotes = normalizeOptionChain({
      underlying: 'PETR4',
      expiry: '2026-11-21',
      spot: 38,
      quotes: [
        { strike: 38, right: 'call', multiplier: 100, bid: 1.1, ask: 1.3, last: 1.2, iv: 0.29, oi: 1200, greeks: { delta: 0.52, gamma: 0.02, theta: -0.01, vega: 0.03, rho: 0.01 } },
        { strike: 38, right: 'put', multiplier: 100, bid: 0.9, ask: 1.1, last: 1.0 },
      ],
    });
    expect(quotes).toHaveLength(2);
    expect(quotes[0].id).toBe('PETR4:2026-11-21:38:call');
    expect(quotes[0].multiplier).toBe(100);
    expect(quotes[0].source).toBe('bridge');
    expect(quotes[0].greeks?.delta).toBeCloseTo(0.52, 6);
    expect(quotes[1].iv).toBeNull();
  });

  it('multiplier ausente NÃO vira 100: linha rejeitada e listada', () => {
    const res = normalizeOptionChainDetailed({
      underlying: 'PETR4', expiry: '2026-11-21',
      quotes: [{ strike: 38, right: 'call', bid: 1, ask: 1.2 }, { strike: 40, right: 'call', multiplier: 1, bid: 1, ask: 1.2 }],
    });
    expect(res.quotes).toHaveLength(1);
    expect(res.quotes[0].multiplier).toBe(1);
    expect(res.rejected).toHaveLength(1);
    expect(res.rejected[0].index).toBe(0);
  });

  it('defaultMultiplier informado pelo usuário é aceito quando a linha não traz', () => {
    const quotes = normalizeOptionChain(
      { underlying: 'AAPL', expiry: '2026-11-21', quotes: [{ strike: 200, right: 'put', bid: 2, ask: 2.2 }] },
      { defaultMultiplier: 100 },
    );
    expect(quotes[0].multiplier).toBe(100);
  });

  it('normaliza posições com id e quantowerId estáveis', () => {
    const legs = normalizeOptionPositions({
      positions: [
        { platformPositionId: 'p1', accountId: 'a1', underlying: 'PETR4', right: 'call', strike: 40, expiry: '2026-11-21', qty: -1, avgPrice: 1.2, multiplier: 100 },
      ],
    });
    expect(legs).toHaveLength(1);
    expect(legs[0].id).toBe('opt_p1');
    expect(legs[0].quantowerId).toBe('p1');
    expect(legs[0].source).toBe('quantower');
    expect(legs[0].multiplier).toBe(100);
  });

  it('posição sem multiplier é rejeitada; openedAt do bridge vira a data de entrada', () => {
    const res = normalizeOptionPositionsDetailed({
      positions: [
        { platformPositionId: 'p1', accountId: 'a1', underlying: 'X', right: 'call', strike: 1, expiry: '2026-11-21', qty: 1, avgPrice: 1 },
        { platformPositionId: 'p2', accountId: 'a1', underlying: 'X', right: 'put', strike: 1, expiry: '2026-11-21', qty: 1, avgPrice: 1, multiplier: 100, openedAt: '2026-09-15T14:30:00-03:00' },
      ],
    });
    expect(res.legs).toHaveLength(1);
    expect(res.legs[0].entryDatetime).toBe('2026-09-15T14:30:00-03:00');
    expect(res.rejected).toHaveLength(1);
  });

  it('merge casa por quantowerId (atualiza no lugar, mantém id local) e adiciona novos', () => {
    const existing = [leg({})];
    const incoming = [
      leg({ id: 'opt_p1', qty: -2, entryPrice: 1.3, entryDatetime: '2026-10-02T00:00:00Z', version: 0 }),
      leg({ id: 'opt_p2', quantowerId: 'p2', symbol: 'PETR4P36', right: 'put', strike: 36, qty: -1, entryPrice: 1.5, version: 0 }),
    ];
    const merged = mergeOptionLegs(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('local-1');
    expect(merged[0].qty).toBe(-2);
    expect(merged[1].quantowerId).toBe('p2');
  });

  it('merge NÃO sobrescreve data de entrada, grupo, estratégia, IV de entrada nem saída registrada', () => {
    const existing = [leg({
      groupId: 'grp_a', strategyId: 'cc', ivEntry: 0.31, tags: ['renda'], fees: 2.5,
      exitPrice: 0.4, exitDatetime: '2026-10-20T10:00:00Z',
    })];
    const incoming = [leg({ id: 'opt_p1', entryDatetime: '2026-11-01T00:00:00Z', qty: -1, entryPrice: 1.25, ivEntry: undefined, fees: 0 })];
    const [m] = mergeOptionLegs(existing, incoming);
    expect(m.entryDatetime).toBe('2026-10-01T00:00:00Z');
    expect(m.groupId).toBe('grp_a');
    expect(m.strategyId).toBe('cc');
    expect(m.ivEntry).toBe(0.31);
    expect(m.tags).toEqual(['renda']);
    expect(m.fees).toBe(2.5);
    expect(m.exitPrice).toBe(0.4);
    expect(m.entryPrice).toBe(1.25); // dado de mercado atualiza
  });
});
