// Normalização de posição do bridge. O SSE `/stream` entrega o payload CRU (sem
// `platformPositionId`); ele PRECISA passar pela mesma normalização do polling, senão o
// reconciliador vê a mesma posição sob duas chaves (linha duplicada + botão de fechar
// quebrado, pois `closePosition` depende do `platformPositionId`).
import { describe, it, expect } from 'vitest';
import { QuantowerAdapter } from '../adapters/quantowerAdapter.js';

describe('QuantowerAdapter.normalizePosition', () => {
  it('payload CRU do bridge ganha platformPositionId e mantém connectionId', () => {
    const raw = {
      id: 'abc-123',
      symbol: 'XAUUSD',
      side: 'Buy',
      quantity: 2,
      openPrice: 2000,
      currentPrice: 2005,
      netPnl: 10,
      accountId: 'ACC1',
      connectionId: 'CONN1',
      openTime: '2026-01-01T10:00:00.000Z',
    };
    const p = QuantowerAdapter.normalizePosition(raw);
    expect(p.platformPositionId).toBe('qt_pos_abc-123');
    expect(p.connectionId).toBe('CONN1');
    expect(p.side).toBe('Long');
    expect(p.quantity).toBe(2);
    expect(p.openTime).toBe('2026-01-01T10:00:00.000Z');
  });

  it('side "Sell"/"Short" vira Short', () => {
    expect(QuantowerAdapter.normalizePosition({ id: 'x', side: 'Sell' }).side).toBe('Short');
    expect(QuantowerAdapter.normalizePosition({ id: 'x', side: 'short' }).side).toBe('Short');
  });

  it('openTime "0001..." (MinValue) vira vazio', () => {
    const p = QuantowerAdapter.normalizePosition({ id: 'x', openTime: '0001-01-01T00:00:00' });
    expect(p.openTime).toBe('');
    expect(p.entryTime).toBe('');
  });

  it('é idempotente (não re-normaliza o que já tem platformPositionId)', () => {
    const already = { platformPositionId: 'qt_pos_z', connectionId: 'c', symbol: 'ES' };
    expect(QuantowerAdapter.normalizePosition(already)).toBe(already);
  });

  it('posição normalizada do CRU tem a MESMA chave do polling', () => {
    const raw = { id: 'same', side: 'Buy', connectionId: 'c' };
    const fromStream = QuantowerAdapter.normalizePosition(raw);
    // o polling normaliza o mesmo CRU — as chaves têm que bater
    const fromPoll = QuantowerAdapter.normalizePosition({ ...raw });
    expect(fromStream.platformPositionId).toBe(fromPoll.platformPositionId);
  });
});
