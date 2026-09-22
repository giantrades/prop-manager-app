import { describe, it, expect } from 'vitest';
import { mergeOrdersIntoPositions } from '../livePositionSlTp';

const pos = (over = {}) => ({
  platformPositionId: 'qt_pos_p1', positionId: 'p1', symbol: 'EURUSD', side: 'Long',
  quantity: 1, openPrice: 100, sl: null, tp: null, platformAccountId: 'acc1', ...over,
});

describe('mergeOrdersIntoPositions — SL/TP a partir das ordens pendentes', () => {
  it('casa por positionId e usa stop→SL / limit→TP', () => {
    const orders = [
      { positionId: 'p1', side: 'Sell', type: 'stop', price: 95, status: 'Opened' },
      { positionId: 'p1', side: 'Sell', type: 'limit', price: 110, status: 'Opened' },
    ];
    const [out] = mergeOrdersIntoPositions([pos()], orders);
    expect(out.sl).toBe(95);
    expect(out.tp).toBe(110);
    expect(out.slDerived).toBe(true);
    expect(out.tpDerived).toBe(true);
  });

  it('mantém o que o bridge já mandou (não sobrescreve)', () => {
    const orders = [{ positionId: 'p1', side: 'Sell', type: 'stop', price: 95, status: 'Opened' }];
    const [out] = mergeOrdersIntoPositions([pos({ sl: 90, tp: 120 })], orders);
    expect(out.sl).toBe(90);
    expect(out.tp).toBe(120);
    expect(out.slDerived).toBeUndefined();
  });

  it('fallback por conta+símbolo e classifica por preço quando o tipo não diz', () => {
    const orders = [
      { symbol: 'EURUSD', side: 'Sell', type: 'unknown', price: 96, status: 'Pending', accountId: 'acc1', quantity: 1 },
      { symbol: 'EURUSD', side: 'Sell', type: 'unknown', price: 108, status: 'Pending', accountId: 'acc1', quantity: 1 },
    ];
    const [out] = mergeOrdersIntoPositions([pos({ positionId: '', platformPositionId: '' })], orders);
    expect(out.sl).toBe(96);
    expect(out.tp).toBe(108);
  });

  it('short inverte a orientação (stop acima = SL)', () => {
    const orders = [
      { positionId: 'p1', side: 'Buy', type: 'stop', price: 105, status: 'Opened' },
      { positionId: 'p1', side: 'Buy', type: 'limit', price: 90, status: 'Opened' },
    ];
    const [out] = mergeOrdersIntoPositions([pos({ side: 'Short' })], orders);
    expect(out.sl).toBe(105);
    expect(out.tp).toBe(90);
  });

  it('ignora ordens executadas/canceladas e do mesmo lado', () => {
    const orders = [
      { positionId: 'p1', side: 'Sell', type: 'stop', price: 95, status: 'Filled' },
      { positionId: 'p1', side: 'Buy', type: 'limit', price: 110, status: 'Opened' },
    ];
    const [out] = mergeOrdersIntoPositions([pos()], orders);
    expect(out.sl).toBeNull();
    expect(out.tp).toBeNull();
  });

  it('sem ordens ou sem posições devolve a entrada como está', () => {
    expect(mergeOrdersIntoPositions([], [])).toEqual([]);
    const p = pos();
    expect(mergeOrdersIntoPositions([p], [])[0]).toBe(p);
  });
});
