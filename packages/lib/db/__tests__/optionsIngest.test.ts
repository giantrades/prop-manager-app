import { describe, it, expect } from 'vitest';
import { normalizeOptionChain, normalizeOptionPositions, mergeOptionLegs } from '../optionsIngest';
import type { OptionLeg } from '../types';

describe('opções — ingest do bridge (F3)', () => {
  it('normaliza a cadeia (id determinístico, multiplier default, source bridge)', () => {
    const quotes = normalizeOptionChain({
      underlying: 'PETR4',
      expiry: '2026-11-21',
      spot: 38,
      quotes: [
        { strike: 38, right: 'call', bid: 1.1, ask: 1.3, last: 1.2, iv: 0.29, oi: 1200, greeks: { delta: 0.52, gamma: 0.02, theta: -0.01, vega: 0.03, rho: 0.01 } },
        { strike: 38, right: 'put', bid: 0.9, ask: 1.1, last: 1.0 },
      ],
    });
    expect(quotes).toHaveLength(2);
    expect(quotes[0].id).toBe('PETR4:2026-11-21:38:call');
    expect(quotes[0].multiplier).toBe(100);
    expect(quotes[0].source).toBe('bridge');
    expect(quotes[0].greeks?.delta).toBeCloseTo(0.52, 6);
    expect(quotes[1].iv).toBeNull();
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

  it('merge casa por quantowerId (atualiza no lugar, mantém id local) e adiciona novos', () => {
    const existing: OptionLeg[] = [
      { id: 'local-1', accountId: 'a1', underlying: 'PETR4', symbol: 'PETR4C40', right: 'call', strike: 40, expiry: '2026-11-21', qty: -1, multiplier: 100, entryPrice: 1.2, entryDatetime: '2026-10-01T00:00:00Z', fees: 0, source: 'quantower', quantowerId: 'p1', updatedAt: 'x', deviceId: 'd', version: 1 },
    ];
    const incoming: OptionLeg[] = [
      { id: 'opt_p1', accountId: 'a1', underlying: 'PETR4', symbol: 'PETR4C40', right: 'call', strike: 40, expiry: '2026-11-21', qty: -2, multiplier: 100, entryPrice: 1.3, entryDatetime: '2026-10-02T00:00:00Z', fees: 0, source: 'quantower', quantowerId: 'p1', updatedAt: 'y', deviceId: 'd', version: 0 },
      { id: 'opt_p2', accountId: 'a1', underlying: 'PETR4', symbol: 'PETR4P36', right: 'put', strike: 36, expiry: '2026-11-21', qty: -1, multiplier: 100, entryPrice: 1.5, entryDatetime: '2026-10-02T00:00:00Z', fees: 0, source: 'quantower', quantowerId: 'p2', updatedAt: 'y', deviceId: 'd', version: 0 },
    ];
    const merged = mergeOptionLegs(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('local-1'); // mantém id local
    expect(merged[0].qty).toBe(-2); // atualizado
    expect(merged[1].quantowerId).toBe('p2');
  });
});
