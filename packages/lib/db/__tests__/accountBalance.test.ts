// Regra única de "balance" e de PnL do trade — usada por TODOS os widgets de
// Contas/Firms/Journal. Fonte da plataforma (bridge) manda; derivado é fallback.
import { describe, it, expect } from 'vitest';
import { accountBalance } from '../platformBalances';
import { tradeNetPnl } from '../financialFormulas';

const trade = (o: Record<string, unknown>) => ({
  id: 't1', symbol: 'MNQ', direction: 'long', qty: 1,
  entryPrice: 100, exitPrice: 110, entryDatetime: '2026-09-01T12:00:00Z',
  exitDatetime: '2026-09-01T13:00:00Z', commission: 0, fees: 0, swap: 0,
  resultNet: 0, resultR: null, multiplier: 1,
  updatedAt: '', deviceId: 'd', version: 1,
  ...o,
});

describe('accountBalance — plataforma manda, ledger é fallback', () => {
  it('usa platformBalance quando existir (mesmo 0)', () => {
    expect(accountBalance({ platformBalance: 49179 }, 100000)).toBe(49179);
    expect(accountBalance({ platformBalance: 0 }, 100000)).toBe(0);
  });

  it('cai no fallback quando a plataforma nunca reportou', () => {
    expect(accountBalance({}, 1234.56)).toBe(1234.56);
    expect(accountBalance({ platformBalance: NaN }, 1234.56)).toBe(1234.56);
    expect(accountBalance(null, 10)).toBe(10);
    expect(accountBalance(undefined, undefined)).toBe(0);
  });
});

describe('tradeNetPnl — fonte única do PnL do trade', () => {
  it('prefere resultNet numérico', () => {
    expect(tradeNetPnl(trade({ resultNet: -821 }) as never)).toBe(-821);
    expect(tradeNetPnl(trade({ resultNet: 0, exitPrice: 110 }) as never)).toBe(0);
  });

  it('aceita string numérica (CSV/bridge antigo)', () => {
    expect(tradeNetPnl(trade({ resultNet: '-821.5' }) as never)).toBe(-821.5);
  });

  it('cai na fórmula quando resultNet falta/inválido', () => {
    expect(tradeNetPnl(trade({ resultNet: null }) as never)).toBe(10);
    expect(tradeNetPnl(trade({ resultNet: undefined }) as never)).toBe(10);
    expect(tradeNetPnl(trade({ resultNet: '' }) as never)).toBe(10);
    expect(tradeNetPnl(trade({ resultNet: 'abc' }) as never)).toBe(10);
  });
});
