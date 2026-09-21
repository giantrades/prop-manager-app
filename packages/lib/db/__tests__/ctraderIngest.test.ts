// F5 — ctraderIngest. Um deal cTrader (execução com PnL realizado) precisa entrar como
// trade FECHADO; senão fica "aberto" para sempre no mapa de sessões (regressão real).
import { describe, it, expect } from 'vitest';
import { ctraderToTrade } from '../ctraderIngest';

describe('ctraderIngest — deal vira trade fechado', () => {
  it('preenche exitDatetime/exitPrice no próprio deal (nunca fica aberto)', () => {
    const t = ctraderToTrade({
      platformTradeId: 'ct_1',
      symbol: 'EURUSD',
      side: 'Buy',
      quantity: 1,
      price: 1.1,
      dateTime: '2026-09-10T12:00:00Z',
      netPnl: 5,
    });
    expect(t.entryDatetime).toBe('2026-09-10T12:00:00Z');
    expect(t.exitDatetime).toBe('2026-09-10T12:00:00Z');
    expect(t.exitPrice).toBe(1.1);
    expect(t.resultNet).toBe(5);
    // Regra única do journal (`closedTrades`): tem saída → fechado.
    expect(t.exitDatetime != null).toBe(true);
  });

  it('short cTrader também fecha e mantém a direção', () => {
    const t = ctraderToTrade({ platformTradeId: 'ct_2', symbol: 'XAUUSD', side: 'Sell', quantity: 2, price: 2500, netPnl: -3 });
    expect(t.direction).toBe('short');
    expect(t.exitDatetime).toBeTruthy();
    expect(t.exitPrice).toBe(2500);
  });
});
