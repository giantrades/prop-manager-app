// Ordens do bridge: o tipo precisa sair legível e o preço de STOP precisa vir do
// `triggerPrice` (no Quantower o `price` de uma stop costuma ser 0/-1).
import { describe, it, expect } from 'vitest';
import { QuantowerAdapter } from '../adapters/quantowerAdapter.js';

describe('QuantowerAdapter.normalizeOrder', () => {
  it('limit usa o price e mantém o tipo', () => {
    const o = QuantowerAdapter.normalizeOrder({
      id: 'o1', symbol: 'EURUSD', side: 'Sell', quantity: 1,
      price: 1.105, orderTypeId: 'Limit', status: 'Opened',
    });
    expect(o.type).toBe('limit');
    expect(o.price).toBe(1.105);
    expect(o.platformOrderId).toBe('qt_ord_o1');
  });

  it('stop usa o triggerPrice (não o price zerado)', () => {
    const o = QuantowerAdapter.normalizeOrder({
      id: 'o2', symbol: 'EURUSD', side: 'Buy', quantity: 1,
      price: 0, triggerPrice: 1.095, orderTypeId: 'Stop', status: 'Opened',
    });
    expect(o.type).toBe('stop');
    expect(o.price).toBe(1.095);
    expect(o.triggerPrice).toBe(1.095);
  });

  it('stop-limit prioriza o trigger e preserva os dois níveis', () => {
    const o = QuantowerAdapter.normalizeOrder({
      id: 'o3', side: 'Sell', price: 1.2, triggerPrice: 1.19, orderTypeId: 'StopLimit',
    });
    expect(o.type).toBe('stop limit');
    expect(o.price).toBe(1.19);
    expect(o.limitPrice).toBe(1.2);
  });

  it('aceita enum numérico de versões antigas', () => {
    expect(QuantowerAdapter.normalizeOrderType(1)).toBe('limit');
    expect(QuantowerAdapter.normalizeOrderType(2)).toBe('stop');
  });

  it('é idempotente (não re-normaliza o que já tem platformOrderId)', () => {
    const already = { platformOrderId: 'qt_ord_x', type: 'stop', price: 10 };
    expect(QuantowerAdapter.normalizeOrder(already)).toBe(already);
  });
});
