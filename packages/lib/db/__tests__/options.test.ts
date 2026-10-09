import { describe, it, expect } from 'vitest';
import {
  bsmPrice,
  bsmGreeks,
  impliedVolatility,
  optionIntrinsic,
  optionPayoffCurve,
  optionBreakevens,
  optionMaxProfitLoss,
  optionNetPremium,
  optionStrategyPnlAtExpiry,
  netOptionGreeks,
  optionDeltaNotional,
  assignmentPutCostBasis,
  assignmentCallProceeds,
  coveredCallYield,
  cashSecuredPutYield,
} from '../financialFormulas';
import {
  DEFAULT_OPTION_TEMPLATES,
  optionTemplatesByCategory,
  groupOptionLegs,
  summarizeOptionStrategy,
  optionQuoteId,
  nearestStrike,
  optionDaysToExpiry,
  optionIncomeByMonth,
} from '../options';
import type { OptionChainQuote, OptionLeg, OptionRight } from '../types';

function leg(partial: Partial<OptionLeg> & { right: OptionRight; strike: number; qty: number }): OptionLeg {
  return {
    id: partial.id ?? `leg_${Math.random().toString(36).slice(2, 8)}`,
    accountId: partial.accountId ?? 'a1',
    underlying: partial.underlying ?? 'TEST',
    symbol: partial.symbol ?? `TEST${partial.strike}${partial.right[0].toUpperCase()}`,
    right: partial.right,
    strike: partial.strike,
    expiry: partial.expiry ?? '2027-01-15',
    qty: partial.qty,
    multiplier: partial.multiplier ?? 1,
    entryPrice: partial.entryPrice ?? 0,
    entryDatetime: partial.entryDatetime ?? '2026-10-01T00:00:00Z',
    exitPrice: partial.exitPrice,
    exitDatetime: partial.exitDatetime,
    fees: partial.fees ?? 0,
    ivEntry: partial.ivEntry,
    groupId: partial.groupId,
    source: partial.source ?? 'manual',
    updatedAt: partial.updatedAt ?? '2026-10-01T00:00:00Z',
    deviceId: partial.deviceId ?? 'dev-test',
    version: partial.version ?? 0,
  };
}

describe('opções — Black-Scholes-Merton e gregas', () => {
  const base = { S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2 };

  it('preço BSM bate com a referência (call 10.4506 / put 5.5735)', () => {
    expect(bsmPrice({ ...base, right: 'call' })).toBeCloseTo(10.4506, 3);
    expect(bsmPrice({ ...base, right: 'put' })).toBeCloseTo(5.5735, 3);
  });

  it('gregas BSM batem com a referência', () => {
    const call = bsmGreeks({ ...base, right: 'call' });
    expect(call).not.toBeNull();
    expect(call!.delta).toBeCloseTo(0.636831, 3);
    expect(call!.gamma).toBeCloseTo(0.018762, 5);
    expect(call!.vega).toBeCloseTo(37.524, 2);
    expect(call!.theta).toBeCloseTo(-6.414, 2);
    expect(call!.rho).toBeCloseTo(53.2305, 2);

    const put = bsmGreeks({ ...base, right: 'put' });
    expect(put!.delta).toBeCloseTo(-0.363169, 3);
  });

  it('T<=0 ou sigma<=0 devolve intrínseco / gregas null (nunca zero mudo)', () => {
    expect(bsmPrice({ ...base, T: 0, right: 'call' })).toBe(0); // ATM expira sem valor
    expect(bsmPrice({ S: 120, K: 100, T: 0, r: 0.05, sigma: 0.2, right: 'call' })).toBe(20);
    expect(bsmPrice({ ...base, sigma: 0, right: 'put' })).toBe(0); // ATM put intrínseco 0
    expect(bsmGreeks({ ...base, T: 0, right: 'call' })).toBeNull();
    expect(bsmGreeks({ ...base, sigma: 0, right: 'call' })).toBeNull();
  });

  it('IV faz round-trip do preço (0.25)', () => {
    const price = bsmPrice({ ...base, sigma: 0.25, right: 'call' })!;
    const iv = impliedVolatility({ S: 100, K: 100, T: 1, r: 0.05, right: 'call', price });
    expect(iv).not.toBeNull();
    expect(iv!).toBeCloseTo(0.25, 3);
  });

  it('IV sem solução (preço abaixo do arbitrário) devolve null', () => {
    const iv = impliedVolatility({ S: 100, K: 100, T: 1, r: 0.05, right: 'call', price: 0.00001 });
    expect(iv).toBeNull();
  });

  it('intrínseco', () => {
    expect(optionIntrinsic(120, 100, 'call')).toBe(20);
    expect(optionIntrinsic(80, 100, 'call')).toBe(0);
    expect(optionIntrinsic(80, 100, 'put')).toBe(20);
  });
});

describe('opções — payoff, breakevens, prêmio e exposição', () => {
  it('long call: breakeven = strike + prêmio; lucro/perda ilimitados nos extremos', () => {
    const legs = [leg({ right: 'call', strike: 100, qty: 1, entryPrice: 10 })];
    const be = optionBreakevens(legs, { min: 50, max: 150 });
    expect(be.length).toBe(1);
    expect(be[0]).toBeCloseTo(110, 2);

    const maxPL = optionMaxProfitLoss(legs, { min: 50, max: 150 });
    expect(maxPL.maxLoss).toBeCloseTo(-10, 2);
    expect(maxPL.maxProfitUnbounded).toBe(true);
    expect(maxPL.maxLossUnbounded).toBe(false);
  });

  it('short call: máx lucro = prêmio; perda ilimitada; breakeven acima do strike', () => {
    const legs = [leg({ right: 'call', strike: 110, qty: -1, entryPrice: 3 })];
    expect(optionStrategyPnlAtExpiry(legs, 100)).toBeCloseTo(3, 2);
    const be = optionBreakevens(legs, { min: 50, max: 150 });
    expect(be[be.length - 1]).toBeCloseTo(113, 2);
    const maxPL = optionMaxProfitLoss(legs, { min: 50, max: 150 });
    expect(maxPL.maxProfit).toBeCloseTo(3, 2);
    expect(maxPL.maxLossUnbounded).toBe(true);
  });

  it('máx lucro considera strikes fora da janela (spread com strikes distantes)', () => {
    const legs = [
      leg({ right: 'call', strike: 100, qty: 1, entryPrice: 5 }),
      leg({ right: 'call', strike: 200, qty: -1, entryPrice: 1 }),
    ];
    // Janela NÃO alcança o strike 200 — antes o máx lucro saía subestimado.
    const pl = optionMaxProfitLoss(legs, { min: 50, max: 150 });
    expect(pl.maxProfit).toBeCloseTo(96, 2); // (200-100) - (5-1)
    expect(pl.maxProfitUnbounded).toBe(false);
    expect(pl.maxLoss).toBeCloseTo(-4, 2);
  });

  it('prêmio líquido: crédito positivo, débito negativo', () => {
    const credit = [leg({ right: 'call', strike: 110, qty: -1, entryPrice: 3 })];
    expect(optionNetPremium(credit)).toBeCloseTo(3, 6);
    const debit = [leg({ right: 'call', strike: 100, qty: 1, entryPrice: 10 })];
    expect(optionNetPremium(debit)).toBeCloseTo(-10, 6);
  });

  it('curva de payoff ordenada e contínua', () => {
    const legs = [leg({ right: 'call', strike: 100, qty: 1, entryPrice: 10 })];
    const curve = optionPayoffCurve(legs, { min: 80, max: 120, points: 5 });
    expect(curve).toHaveLength(5);
    expect(curve[0].S).toBe(80);
    expect(curve[4].S).toBe(120);
    expect(curve[4].pnl).toBeGreaterThan(curve[0].pnl);
  });

  it('gregas líquidas e delta notional', () => {
    const legs = [leg({ right: 'call', strike: 100, qty: 2, entryPrice: 10, ivEntry: 0.2, multiplier: 100 })];
    const g = netOptionGreeks(legs, { S: 100, r: 0.05, now: new Date('2026-01-01T00:00:00Z') });
    expect(g.delta).toBeGreaterThan(0);
    const dn = optionDeltaNotional(legs, { S: 100, r: 0.05, now: new Date('2026-01-01T00:00:00Z') });
    expect(dn.netDelta).toBe(g.delta);
    expect(dn.deltaNotional).toBeCloseTo(Math.abs(g.delta) * 100, 2);
  });

  it('assignment: cost basis da put e recebido da call', () => {
    expect(assignmentPutCostBasis({ strike: 90, shares: 100, netPremium: 250 })).toBeCloseTo(87.5, 6);
    expect(assignmentCallProceeds({ strike: 110, shares: 100, netPremium: 250 })).toBeCloseTo(112.5, 6);
  });

  it('yields de renda (covered call / CSP), simples e anualizados', () => {
    expect(coveredCallYield({ netPremium: 250, spot: 100, multiplier: 100, contracts: 1, daysToExpiry: 30 })).toBeCloseTo(0.025, 6);
    expect(coveredCallYield({ netPremium: 250, spot: 100, multiplier: 100, contracts: 1, daysToExpiry: 30, annualize: true })).toBeCloseTo(0.304167, 5);
    expect(cashSecuredPutYield({ netPremium: 200, strike: 90, multiplier: 100, contracts: 1, daysToExpiry: 30 })).toBeCloseTo(200 / 9000, 6);
  });
});

describe('opções — domínio (domínio: grupos, cadeia, templates)', () => {
  it('agrupa pernas por groupId e classifica vertical', () => {
    const legs = [
      leg({ right: 'call', strike: 100, qty: 1, entryPrice: 5, groupId: 'g1' }),
      leg({ right: 'call', strike: 110, qty: -1, entryPrice: 2, groupId: 'g1' }),
      leg({ right: 'put', strike: 90, qty: 1, entryPrice: 3 }),
    ];
    const groups = groupOptionLegs(legs);
    expect(groups).toHaveLength(2);
    const vertical = groups.find((g) => g.id === 'g1')!;
    expect(vertical.kind).toBe('vertical');
    expect(vertical.netPremium).toBeCloseTo(-3, 6); // -5 + 2 = -3 (débito)
    expect(vertical.open).toBe(true);
  });

  it('id de cotação e strike mais próximo', () => {
    expect(optionQuoteId('PETR4', '2026-11-21', 38.5, 'call')).toBe('PETR4:2026-11-21:38.5:call');
    const quotes = [
      { strike: 37 } as OptionChainQuote,
      { strike: 38 } as OptionChainQuote,
      { strike: 39 } as OptionChainQuote,
    ];
    expect(nearestStrike(quotes, 38.4)).toBe(38);
    expect(nearestStrike([], 38)).toBeNull();
  });

  it('dias até o vencimento', () => {
    // Tolerante a fuso: vencimento é data do mercado; o cálculo usa parseDate.
    expect(optionDaysToExpiry('2026-11-21', new Date('2026-11-01T00:00:00Z'))).toBeGreaterThanOrEqual(20);
  });

  it('resumo da estratégia (long call)', () => {
    const legs = [leg({ right: 'call', strike: 100, qty: 1, entryPrice: 10, ivEntry: 0.2, multiplier: 100 })];
    const s = summarizeOptionStrategy(legs, { S: 100, r: 0.05, now: new Date('2026-01-01T00:00:00Z') });
    expect(s.netPremium).toBeCloseTo(-1000, 6); // 1 contrato × 100 × $10 (débito)
    expect(s.payoff.length).toBe(121);
    expect(s.maxProfitUnbounded).toBe(true);
    expect(s.deltaNotional).toBeGreaterThan(0);
  });

  it('renda por mês', () => {
    const legs = [
      leg({ right: 'call', strike: 100, qty: -1, entryPrice: 3, exitPrice: 1, entryDatetime: '2026-01-05T00:00:00Z', exitDatetime: '2026-01-20T00:00:00Z' }),
      leg({ right: 'put', strike: 90, qty: -1, entryPrice: 2, exitPrice: 0, entryDatetime: '2026-02-05T00:00:00Z', exitDatetime: '2026-02-20T00:00:00Z' }),
    ];
    const byMonth = optionIncomeByMonth(legs);
    expect(byMonth.map((m) => m.month)).toEqual(['2026-01', '2026-02']);
    expect(byMonth[0].premium).toBeCloseTo(2, 2);
    expect(byMonth[1].premium).toBeCloseTo(2, 2);
  });

  it('37 templates nas 4 categorias (9/8/13/7)', () => {
    expect(DEFAULT_OPTION_TEMPLATES).toHaveLength(37);
    expect(optionTemplatesByCategory('up')).toHaveLength(9);
    expect(optionTemplatesByCategory('down')).toHaveLength(8);
    expect(optionTemplatesByCategory('vol')).toHaveLength(13);
    expect(optionTemplatesByCategory('arb')).toHaveLength(7);
  });
});
