import { describe, it, expect } from 'vitest';
import {
  bsmPrice,
  optionStrategyPnlAtExpiry,
  optionStrategyTheoreticalPnl,
  optionTheoreticalCurve,
  optionGreeksCurve,
  optionNakedExposure,
  optionThetaPerDay,
} from '../financialFormulas';
import {
  buildOptionLegFromQuote,
  buildRollPlan,
  closeOptionLeg,
  enrichOptionQuote,
  optionAssignmentEligibility,
  optionQuoteMid,
  summarizeOptionStrategy,
} from '../options';
import { optionCoverage } from '../optionsIntegrations';
import { parseOptionChainCsv, parseOptionLegsCsv } from '../optionsImport';
import type { OptionChainQuote, OptionLeg, Position } from '../types';

const NOW = new Date('2026-10-01T12:00:00Z');

const mk = (over: Partial<OptionLeg>): OptionLeg => ({
  id: 'l', accountId: 'a', underlying: 'AAPL', symbol: 'AAPLC100', right: 'call', strike: 100,
  expiry: '2026-11-15', qty: 1, multiplier: 100, entryPrice: 3, entryDatetime: '2026-10-01T00:00:00Z',
  fees: 0, ivEntry: 0.3, source: 'manual', updatedAt: 'x', deviceId: 'd', version: 0, ...over,
});

const quote = (over: Partial<OptionChainQuote>): OptionChainQuote => ({
  id: 'AAPL:2026-11-15:100:call', underlying: 'AAPL', expiry: '2026-11-15', strike: 100, right: 'call',
  symbol: 'AAPLC100', bid: 3.4, ask: 3.6, last: 3.5, iv: null, oi: null, volume: null, greeks: null,
  multiplier: 100, at: 'x', source: 'manual', ...over,
});

describe('opções — cenários teóricos (T+0 / What-If)', () => {
  it('avançando o tempo até depois do vencimento, a curva teórica = payoff no vencimento', () => {
    const legs = [mk({ qty: 1, entryPrice: 3 }), mk({ id: 'm', qty: -1, strike: 110, entryPrice: 1 })];
    const sc = { r: 0.05, asOf: NOW, daysForward: 400 };
    for (const S of [80, 100, 105, 120]) {
      expect(optionStrategyTheoreticalPnl(legs, S, sc).pnl).toBeCloseTo(optionStrategyPnlAtExpiry(legs, S), 4);
    }
  });

  it('T+0 de call comprada: acima do payoff expirado quando OTM e ganha com choque de vol positivo', () => {
    const legs = [mk({ strike: 110, entryPrice: 1 })];
    const base = optionStrategyTheoreticalPnl(legs, 100, { r: 0.05, asOf: NOW }).pnl;
    const up = optionStrategyTheoreticalPnl(legs, 100, { r: 0.05, asOf: NOW, volShift: 0.1 }).pnl;
    expect(up).toBeGreaterThan(base);
    expect(base).toBeGreaterThan(optionStrategyPnlAtExpiry(legs, 100)); // valor de tempo > 0
  });

  it('o decaimento de tempo reduz o valor de uma call comprada ATM', () => {
    const legs = [mk({ entryPrice: 4 })];
    const t0 = optionStrategyTheoreticalPnl(legs, 100, { r: 0.05, asOf: NOW }).pnl;
    const t20 = optionStrategyTheoreticalPnl(legs, 100, { r: 0.05, asOf: NOW, daysForward: 20 }).pnl;
    expect(t20).toBeLessThan(t0);
  });

  it('perna sem IV não inventa preço: fica em `unpriced`; fallbackIv permite precificar', () => {
    const legs = [mk({ ivEntry: undefined })];
    const r1 = optionStrategyTheoreticalPnl(legs, 100, { r: 0.05, asOf: NOW });
    expect(r1.unpriced).toBe(1);
    expect(r1.pnl).toBe(0);
    const r2 = optionStrategyTheoreticalPnl(legs, 100, { r: 0.05, asOf: NOW, fallbackIv: 0.3 });
    expect(r2.unpriced).toBe(0);
  });

  it('perna fechada contribui com o realizado (constante) em qualquer cenário', () => {
    const closed = mk({ qty: -1, entryPrice: 2, exitPrice: 0.5 });
    const a = optionStrategyTheoreticalPnl([closed], 50, { r: 0.05, asOf: NOW }).pnl;
    const b = optionStrategyTheoreticalPnl([closed], 500, { r: 0.05, asOf: NOW, volShift: 0.5 }).pnl;
    expect(a).toBeCloseTo(150, 6); // -1*100*(0.5-2) = +150
    expect(b).toBeCloseTo(150, 6);
  });

  it('curva teórica e curva de gregas têm o nº de pontos pedido', () => {
    const legs = [mk({})];
    const c = optionTheoreticalCurve(legs, { min: 80, max: 120, points: 41 }, { r: 0.05, asOf: NOW });
    expect(c.points).toHaveLength(41);
    const g = optionGreeksCurve(legs, { min: 80, max: 120, points: 41 }, { r: 0.05, now: NOW });
    expect(g).toHaveLength(41);
    expect(g[40].delta).toBeGreaterThan(g[0].delta); // delta de call cresce com S
  });

  it('theta por dia = theta anual / 365', () => {
    expect(optionThetaPerDay(-36.5)).toBeCloseTo(-0.1, 8);
  });
});

describe('opções — risco de venda descoberta (A2)', () => {
  const spot = 100;
  it('call vendida sem cobertura: ilimitada e naked', () => {
    const r = optionNakedExposure([mk({ qty: -1, strike: 110, entryPrice: 2 })], { spot, stressPct: 0.2 });
    expect(r.naked).toBe(true);
    expect(r.unbounded).toBe(true);
    expect(r.maxLoss).toBeNull();
    // estresse +20% => S=120: -(120-110-2)*100 = -800
    expect(r.stressLoss).toBeCloseTo(800, 2);
  });

  it('covered call (ações cobrem as calls): não é naked nem ilimitada', () => {
    const r = optionNakedExposure([mk({ qty: -1, strike: 110, entryPrice: 2 })], { spot, stressPct: 0.2, shares: 100 });
    expect(r.naked).toBe(false);
    expect(r.unbounded).toBe(false);
  });

  it('cobertura parcial por ações continua ilimitada na parte descoberta', () => {
    const r = optionNakedExposure([mk({ qty: -2, strike: 110, entryPrice: 2 })], { spot, stressPct: 0.2, shares: 100 });
    expect(r.unbounded).toBe(true);
  });

  it('put vendida: perda máxima FINITA = strike×mult − prêmio', () => {
    const r = optionNakedExposure([mk({ right: 'put', qty: -1, strike: 100, entryPrice: 3 })], { spot, stressPct: 0.2 });
    expect(r.naked).toBe(true);
    expect(r.unbounded).toBe(false);
    expect(r.maxLoss).toBeCloseTo(100 * 100 - 300, 2);
    // estresse -20% => S=80: -(100-80-3)*100 = -1700
    expect(r.stressLoss).toBeCloseTo(1700, 2);
  });

  it('put credit spread e iron condor têm risco definido (não naked)', () => {
    const spread = [
      mk({ id: 'a', right: 'put', qty: -1, strike: 100, entryPrice: 3 }),
      mk({ id: 'b', right: 'put', qty: 1, strike: 95, entryPrice: 1 }),
    ];
    const r1 = optionNakedExposure(spread, { spot, stressPct: 0.2 });
    expect(r1.naked).toBe(false);
    expect(r1.maxLoss).toBeCloseTo((100 - 95) * 100 - 200, 2);
    const condor = [
      ...spread,
      mk({ id: 'c', qty: -1, strike: 110, entryPrice: 2 }),
      mk({ id: 'd', qty: 1, strike: 115, entryPrice: 0.5 }),
    ];
    expect(optionNakedExposure(condor, { spot, stressPct: 0.2 }).naked).toBe(false);
  });

  it('pernas fechadas não entram no risco', () => {
    const r = optionNakedExposure([mk({ qty: -1, strike: 110, entryPrice: 2, exitPrice: 0.1 })], { spot, stressPct: 0.2 });
    expect(r.naked).toBe(false);
  });
});

describe('opções — construção de perna, enriquecimento e ciclo de vida', () => {
  it('buildOptionLegFromQuote exige multiplier (nunca assume 100)', () => {
    expect(() => buildOptionLegFromQuote(quote({ multiplier: 0 }), { accountId: 'a', qty: 1 })).toThrow(/Multiplicador/);
    const leg = buildOptionLegFromQuote(quote({ multiplier: 0 }), { accountId: 'a', qty: 1, multiplier: 10 });
    expect(leg.multiplier).toBe(10);
    const ok = buildOptionLegFromQuote(quote({ multiplier: 1 }), { accountId: 'a', qty: -1 });
    expect(ok.multiplier).toBe(1);
    expect(ok.entryPrice).toBeCloseTo(3.5, 6);
  });

  it('optionQuoteMid cai para last/ask/bid e null quando não há nada', () => {
    expect(optionQuoteMid({ bid: 1, ask: 2, last: null })).toBe(1.5);
    expect(optionQuoteMid({ bid: 0, ask: 2, last: 1.8 })).toBe(1.8);
    expect(optionQuoteMid({ bid: null, ask: null, last: null })).toBeNull();
  });

  it('enrichOptionQuote recupera IV do mid, calcula gregas e marca a proveniência', () => {
    const T = 45 / 365;
    const px = bsmPrice({ S: 100, K: 100, T, r: 0.05, sigma: 0.3, right: 'call' })!;
    const q = enrichOptionQuote(quote({ bid: px - 0.01, ask: px + 0.01 }), { spot: 100, r: 0.05, now: NOW });
    expect(q.iv).toBeCloseTo(0.3, 2);
    expect(q.greeks?.delta).toBeGreaterThan(0.4);
    expect(q.derivedFields).toEqual(expect.arrayContaining(['iv', 'greeks']));
  });

  it('enrichOptionQuote não mexe no que veio da fonte e não faz nada sem spot', () => {
    const src = quote({ iv: 0.25, greeks: { delta: 0.5, gamma: 0.01, theta: -0.02, vega: 0.1, rho: 0.05 } });
    expect(enrichOptionQuote(src, { spot: 100, r: 0.05, now: NOW })).toBe(src);
    expect(enrichOptionQuote(quote({}), { r: 0.05, now: NOW }).iv).toBeNull();
  });

  it('elegibilidade de assignment: só short, aberta e ITM; antes do vencimento é "early"', () => {
    const shortPut = mk({ right: 'put', qty: -1, strike: 100 });
    expect(optionAssignmentEligibility(shortPut, { spot: 105, now: NOW }).ok).toBe(false); // OTM
    expect(optionAssignmentEligibility(shortPut, { now: NOW }).reason).toMatch(/spot/i);
    const itm = optionAssignmentEligibility(shortPut, { spot: 95, now: NOW });
    expect(itm.ok).toBe(true);
    expect(itm.early).toBe(true);
    const after = optionAssignmentEligibility(shortPut, { spot: 95, now: new Date('2026-11-20T00:00:00Z') });
    expect(after.ok && after.expired && !after.early).toBe(true);
    expect(optionAssignmentEligibility(mk({ qty: 1 }), { spot: 120, now: NOW }).ok).toBe(false);
    expect(optionAssignmentEligibility(mk({ qty: -1, exitPrice: 0 }), { spot: 120, now: NOW }).ok).toBe(false);
  });

  it('closeOptionLeg soma taxas e preserva o resto; rejeita preço negativo', () => {
    const closed = closeOptionLeg(mk({ qty: -1, entryPrice: 2, fees: 1 }), { exitPrice: 0.5, fees: 1.5 });
    expect(closed.exitPrice).toBe(0.5);
    expect(closed.fees).toBe(2.5);
    expect(closed.exitDatetime).toBeTruthy();
    expect(() => closeOptionLeg(mk({}), { exitPrice: -1 })).toThrow();
  });

  it('plano de rolagem: crédito/débito líquido e pernas novas no vencimento alvo', () => {
    const shortCall = mk({ qty: -1, strike: 100, entryPrice: 3, groupId: 'g1' });
    const quotes = [
      quote({ id: 'AAPL:2026-11-15:100:call', bid: 1.9, ask: 2.1 }),
      quote({ id: 'AAPL:2026-12-20:100:call', expiry: '2026-12-20', bid: 3.9, ask: 4.1 }),
    ];
    const plan = buildRollPlan([shortCall], quotes, { targetExpiry: '2026-12-20', now: NOW });
    expect(plan.complete).toBe(true);
    // fecha short a 2.0 (paga 200) e abre short a 4.0 (recebe 400) => +200
    expect(plan.netCredit).toBeCloseTo(200, 2);
    expect(plan.items[0].next?.expiry).toBe('2026-12-20');
    expect(plan.items[0].next?.qty).toBe(-1);
    expect(plan.items[0].next?.groupId).toBe(plan.groupId);
  });

  it('rolagem sem cotação do vencimento alvo fica incompleta (não inventa preço)', () => {
    const plan = buildRollPlan([mk({ qty: -1 })], [quote({ bid: 1.9, ask: 2.1 })], { targetExpiry: '2026-12-20', now: NOW });
    expect(plan.complete).toBe(false);
    expect(plan.netCredit).toBeNull();
    expect(plan.items[0].reason).toMatch(/Sem cotação/);
  });

  it('summarizeOptionStrategy: risco/gregas só das pernas abertas; realizado do grupo todo', () => {
    const closed = mk({ id: 'c', qty: -1, strike: 90, entryPrice: 5, exitPrice: 1 });
    const open = mk({ id: 'o', qty: 1, strike: 100, entryPrice: 3 });
    const s = summarizeOptionStrategy([closed, open], { S: 100, r: 0.05, now: NOW });
    expect(s.realizedPnl).toBeCloseTo(400, 4); // -1*100*(1-5)
    expect(s.maxLossUnbounded).toBe(false); // a call vendida FECHADA não gera risco ilimitado
    expect(s.maxLoss).toBeCloseTo(-300, 2);
  });
});

describe('opções — cobertura sem multiplier fixo', () => {
  const pos = (qty: number): Position => ({
    id: 'p', accountId: 'a', symbol: 'AAPL', qty, avgPrice: 100, currency: 'USD', assetKind: 'equity',
    updatedAt: 'x', deviceId: 'd', version: 0,
  } as Position);

  it('usa o multiplier de cada perna', () => {
    const rows = optionCoverage([mk({ qty: -2, multiplier: 100 })], [pos(150)]);
    expect(rows[0].coveredContracts).toBe(1);
    const unit = optionCoverage([mk({ qty: -50, multiplier: 1 })], [pos(50)]);
    expect(unit[0].coveredContracts).toBe(50);
    expect(unit[0].coveragePct).toBe(1);
  });
});

describe('opções — import CSV (A6)', () => {
  it('cadeia: aceita ; e vírgula decimal, IV em %, e exige multiplicador', () => {
    const csv = [
      'ativo;vencimento;strike;tipo;bid;ask;iv;oi;multiplicador',
      'petr4;21/11/2026;38,5;call;1,10;1,30;29%;1200;100',
      'petr4;21/11/2026;38,5;put;0,9;1,1;31;800;',
      'petr4;21/11/2026;40;call;2;1;30;10;100',
    ].join('\n');
    const { quotes, errors } = parseOptionChainCsv(csv);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ id: 'PETR4:2026-11-21:38.5:call', bid: 1.1, ask: 1.3, iv: 0.29, oi: 1200, multiplier: 100, source: 'manual' });
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
    expect(errors[0].message).toMatch(/Multiplicador/);
    expect(errors[1].message).toMatch(/Bid maior/);
  });

  it('cadeia: defaultMultiplier do usuário supre a coluna ausente', () => {
    const { quotes } = parseOptionChainCsv('underlying,expiry,strike,right,bid,ask\nAAPL,2026-11-20,200,put,2,2.2', { defaultMultiplier: 100 });
    expect(quotes[0].multiplier).toBe(100);
  });

  it('pernas: lado compra/venda vira qty com sinal; reimportar gera os MESMOS ids', () => {
    const csv = [
      'underlying,right,strike,expiry,side,qty,price,date,fees,multiplier',
      'AAPL,put,100,2026-11-20,sell,2,3.10,2026-10-01 10:00,1.5,100',
      'AAPL,call,110,2026-11-20,buy,1,1.20,2026-10-01 10:05,0.75,100',
    ].join('\n');
    const a = parseOptionLegsCsv(csv, { accountId: 'acc1' });
    const b = parseOptionLegsCsv(csv, { accountId: 'acc1' });
    expect(a.errors).toEqual([]);
    expect(a.legs.map((l) => l.qty)).toEqual([-2, 1]);
    expect(a.legs.map((l) => l.id)).toEqual(b.legs.map((l) => l.id));
    expect(a.legs[0].accountId).toBe('acc1');
  });

  it('pernas: execuções idênticas no mesmo arquivo continuam distintas; sem multiplicador é erro', () => {
    const row = 'AAPL,put,100,2026-11-20,-1,3,2026-10-01 10:00,0,100';
    const hdr = 'underlying,right,strike,expiry,qty,price,date,fees,multiplier';
    const dup = parseOptionLegsCsv([hdr, row, row].join('\n'), { accountId: 'a' });
    expect(new Set(dup.legs.map((l) => l.id)).size).toBe(2);
    const noMult = parseOptionLegsCsv([hdr, 'AAPL,put,100,2026-11-20,-1,3,2026-10-01 10:00,0,'].join('\n'), { accountId: 'a' });
    expect(noMult.legs).toHaveLength(0);
    expect(noMult.errors[0].message).toMatch(/Multiplicador/);
  });

  it('cabeçalho incompleto devolve erro claro', () => {
    expect(parseOptionLegsCsv('a,b\n1,2', { accountId: 'a' }).errors[0].message).toMatch(/sem coluna/);
    expect(parseOptionChainCsv('a,b\n1,2').errors[0].message).toMatch(/strike/);
  });
});

import { optionStrategyMarkPnl } from '../financialFormulas';

describe('opções — P/L de mercado (marca) vs teórico', () => {
  it('marca pernas abertas e soma o realizado; sem marca = unmarked', () => {
    const open = mk({ id: 'o', qty: -1, entryPrice: 2, fees: 1 });
    const closed = mk({ id: 'c', qty: 1, entryPrice: 1, exitPrice: 3 });
    const full = optionStrategyMarkPnl([open, closed], { o: 1.5 });
    // aberta: -1*100*(1.5-2) - 1 = 49 ; fechada: +200
    expect(full.pnl).toBeCloseTo(249, 6);
    expect(full.unmarked).toBe(0);
    const partial = optionStrategyMarkPnl([open, closed], {});
    expect(partial.unmarked).toBe(1);
    expect(partial.pnl).toBeCloseTo(200, 6);
  });
});

import { optionVegaPerPoint, optionRhoPerPoint } from '../financialFormulas';
describe('opções — escalas de exibição das gregas', () => {
  it('vega e rho por ponto = cru / 100', () => {
    expect(optionVegaPerPoint(20)).toBeCloseTo(0.2, 8);
    expect(optionRhoPerPoint(-5)).toBeCloseTo(-0.05, 8);
  });
});

import { optionMaxProfitLoss } from '../financialFormulas';
import { optionDividendRisks, optionAnalyticsByUnderlying, optionIncomeRows } from '../optionsIntegrations';

describe('opções — data-com (A1)', () => {
  const div = [{ symbol: 'AAPL', exDate: '2026-10-20', amountPerShare: 0.5 }];
  const shortCall = mk({ qty: -1, strike: 100, expiry: '2026-11-15' });

  it('call vendida ITM com extrínseco < dividendo = high', () => {
    const r = optionDividendRisks([shortCall], div, { spots: { AAPL: 110 }, marks: { l: 10.2 }, now: NOW });
    expect(r).toHaveLength(1);
    expect(r[0].level).toBe('high'); // extrínseco 0.2 < 0.5
    expect(r[0].extrinsic).toBeCloseTo(0.2, 4);
    expect(r[0].daysToExDate).toBeGreaterThan(0);
  });

  it('ITM com extrínseco alto = watch; OTM/sem spot = info', () => {
    expect(optionDividendRisks([shortCall], div, { spots: { AAPL: 110 }, marks: { l: 13 }, now: NOW })[0].level).toBe('watch');
    expect(optionDividendRisks([shortCall], div, { spots: { AAPL: 90 }, now: NOW })[0].level).toBe('info');
    expect(optionDividendRisks([shortCall], div, { now: NOW })[0].itm).toBeNull();
  });

  it('ignora: call comprada, put vendida, data-com depois do vencimento ou já passada, outro ativo', () => {
    expect(optionDividendRisks([mk({ qty: 1 })], div, { now: NOW })).toHaveLength(0);
    expect(optionDividendRisks([mk({ qty: -1, right: 'put' })], div, { now: NOW })).toHaveLength(0);
    expect(optionDividendRisks([mk({ qty: -1, expiry: '2026-10-10' })], div, { now: NOW })).toHaveLength(0);
    expect(optionDividendRisks([shortCall], [{ symbol: 'AAPL', exDate: '2026-09-01' }], { now: NOW })).toHaveLength(0);
    expect(optionDividendRisks([shortCall], [{ symbol: 'MSFT', exDate: '2026-10-20' }], { now: NOW })).toHaveLength(0);
    expect(optionDividendRisks([mk({ qty: -1, exitPrice: 0 })], div, { now: NOW })).toHaveLength(0);
  });
});

describe('opções — analytics por subjacente (Journal)', () => {
  it('prêmio, win rate, P/L médio e R (perda máxima definida)', () => {
    // vertical de crédito fechada com lucro: short put 100 @3, long put 95 @1; risco = 5*100-200 = 300
    const win = [
      mk({ id: 'a1', right: 'put', qty: -1, strike: 100, entryPrice: 3, exitPrice: 1, groupId: 'w' }),
      mk({ id: 'a2', right: 'put', qty: 1, strike: 95, entryPrice: 1, exitPrice: 0.2, groupId: 'w' }),
    ];
    // put vendida simples fechada com prejuízo
    const loss = [mk({ id: 'b1', right: 'put', qty: -1, strike: 50, entryPrice: 1, exitPrice: 3, groupId: 'l' })];
    // call vendida descoberta fechada (risco ilimitado → fora do R)
    const naked = [mk({ id: 'c1', qty: -1, strike: 120, entryPrice: 1, exitPrice: 0.5, groupId: 'n' })];
    const open = [mk({ id: 'd1', qty: -1, strike: 130, entryPrice: 2, groupId: 'o' })];
    const [row] = optionAnalyticsByUnderlying([...win, ...loss, ...naked, ...open]);
    expect(row.underlying).toBe('AAPL');
    expect(row.closedGroups).toBe(3);
    expect(row.wins).toBe(2);
    expect(row.winRate).toBeCloseTo(2 / 3, 6);
    // win: (-1*100*(1-3)) + (1*100*(0.2-1)) = 200-80 = 120 ; loss: -1*100*(3-1) = -200 ; naked: +50
    expect(row.realized).toBeCloseTo(-30, 2);
    expect(row.rSamples).toBe(2);
    expect(row.openGroups).toBe(1);
    expect(row.openPremium).toBeCloseTo(200, 2);
    // R: vertical = 120/300 = 0.4 ; put vendida simples 50 = -200/4900 ; média de 2 amostras
    expect(row.avgR).toBeCloseTo((120 / 300 + -200 / 4900) / 2, 3);
  });

  it('subjacente sem fechadas: winRate/avgPnl/avgR nulos', () => {
    const [row] = optionAnalyticsByUnderlying([mk({ qty: -1 })]);
    expect(row.winRate).toBeNull();
    expect(row.avgPnl).toBeNull();
    expect(row.avgR).toBeNull();
  });
});

describe('opções — renda (covered call / CSP)', () => {
  it('yield de covered call usa o spot; CSP usa o strike; ambos anualizam', () => {
    const cc = mk({ id: 'cc', qty: -2, strike: 110, entryPrice: 2, groupId: 'g1', expiry: '2026-10-31' });
    const csp = mk({ id: 'p', right: 'put', qty: -1, strike: 100, entryPrice: 3, groupId: 'g2', expiry: '2026-10-31' });
    const rows = optionIncomeRows([cc, csp], { spots: { AAPL: 105 }, now: NOW });
    const c = rows.find((r) => r.kind === 'covered-call')!;
    const p = rows.find((r) => r.kind === 'cash-secured-put')!;
    expect(c.netPremium).toBeCloseTo(400, 2);
    expect(c.yieldPct).toBeCloseTo(400 / (105 * 100 * 2), 5);
    expect(c.annualizedPct!).toBeGreaterThan(c.yieldPct!);
    expect(p.yieldPct).toBeCloseTo(300 / (100 * 100), 5);
  });

  it('call sem spot não inventa yield; estratégias multi-perna ficam de fora', () => {
    const [c] = optionIncomeRows([mk({ qty: -1, groupId: 'g1' })], { now: NOW });
    expect(c.yieldPct).toBeNull();
    expect(c.basis).toBeNull();
    const spread = [mk({ id: 'x', qty: -1, groupId: 'g' }), mk({ id: 'y', qty: 1, strike: 110, groupId: 'g' })];
    expect(optionIncomeRows(spread, { now: NOW })).toHaveLength(0);
  });
});

describe('opções — máx lucro/perda: piso em S=0 e ilimitado só para cima', () => {
  const window = { min: 50, max: 150 };
  it('put vendida: perda FINITA (strike×mult − prêmio), não "ilimitada"', () => {
    const r = optionMaxProfitLoss([mk({ right: 'put', qty: -1, strike: 100, entryPrice: 3 })], window);
    expect(r.maxLossUnbounded).toBe(false);
    expect(r.maxLoss).toBeCloseTo(-(100 * 100 - 300), 2);
    expect(r.maxProfit).toBeCloseTo(300, 2);
  });
  it('put comprada: lucro finito (strike×mult − prêmio) no piso', () => {
    const r = optionMaxProfitLoss([mk({ right: 'put', qty: 1, strike: 100, entryPrice: 3 })], window);
    expect(r.maxProfitUnbounded).toBe(false);
    expect(r.maxProfit).toBeCloseTo(100 * 100 - 300, 2);
  });
});
