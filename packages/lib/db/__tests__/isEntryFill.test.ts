import { describe, it, expect } from 'vitest';
import { isEntryFill, shouldKeepTrade } from '../isEntryFill';

describe('isEntryFill (único util)', () => {
  it('detecta entry fill: pnl=0 sem exit datetime', () => {
    expect(isEntryFill({ netPnl: 0, exitDatetime: null, exitPrice: 1.2 })).toBe(true);
    expect(isEntryFill({ netPnl: 0, exit_datetime: null, exit_price: 1.2 })).toBe(true);
  });

  it('detecta entry fill: exit igual a entry ou exitPrice ausente', () => {
    expect(
      isEntryFill({ netPnl: 0, exitDatetime: '2026-01-01T00:00:00Z', entryDatetime: '2026-01-01T00:00:00Z', exitPrice: 1.2 }),
    ).toBe(true);
    expect(isEntryFill({ netPnl: 0, exitDatetime: '2026-01-01T00:00:00Z', exitPrice: null })).toBe(true);
  });

  it('não marca como entry fill quando pnl != 0', () => {
    expect(isEntryFill({ netPnl: 5, exitDatetime: '2026-01-01T00:00:00Z', exitPrice: 1.2 })).toBe(false);
  });

  it('não marca como entry fill trade completo', () => {
    expect(
      isEntryFill({ netPnl: 3, exitDatetime: '2026-01-01T00:00:00Z', entryDatetime: '2026-01-01T00:00:00Z', exitPrice: 1.2 }),
    ).toBe(false);
  });

  it('aceita resultado snake_case (dado antigo)', () => {
    expect(isEntryFill({ result_net: 0, exit_datetime: '2026-01-01T00:00:00Z', exit_price: 1.2 })).toBe(false);
  });

  it('shouldKeepTrade é a negação', () => {
    expect(shouldKeepTrade({ netPnl: 5 })).toBe(true);
    expect(shouldKeepTrade({ netPnl: 0 })).toBe(false);
  });
});
