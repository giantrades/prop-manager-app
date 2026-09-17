// J1–J7 — journalAnalytics. Datasets sintéticos com valores calculados à mão.
// Fórmula PnL: (exit-entry)*dir*qty*mult - commission - fees - swap - slippage.
import { describe, it, expect } from 'vitest';
import {
  calendarPnl,
  directionSplit,
  symbolBreakdown,
  heatmapBySymbol,
  heatmapBySession,
  rDistribution,
  durationStats,
  sessionAnalysis,
  maeMfe,
  weeklyReview,
  tradeReplay,
  drawdownAnalysis,
} from '../journalAnalytics';
import { tradeNetPnl } from '../financialFormulas';
import type { Trade } from '../types';

function trade(over: Partial<Trade> & { id: string }): Trade {
  return {
    accountId: 'a1',
    symbol: 'XAUUSD',
    direction: 'long',
    entryDatetime: '2026-09-08T10:00:00Z',
    qty: 1,
    entryPrice: 100,
    commission: 0,
    swap: 0,
    rebate: 0,
    fees: 0,
    source: 'manual',
    resultNet: 0,
    resultR: null,
    updatedAt: '2026-09-08T10:00:00Z',
    deviceId: 'test',
    version: 0,
    ...over,
  } as Trade;
}

describe('calendarPnl (J1)', () => {
  // A: long 100->110 x2, comm 1, fees 0.5 => gross 20, net 18.5 (win, dia 08)
  // B: short 50->55 x1, sem custo => gross -5, net -5 (loss, dia 08)
  // C: long 200->200 x1 => 0 (breakeven, dia 09: conta trade, nem W nem L)
  // D: agosto, net 999 => fora de setembro
  // E: aberto (sem exitPrice) => fora do calendário realizado
  const trades = [
    trade({ id: 'A', exitPrice: 110, qty: 2, commission: 1, fees: 0.5, exitDatetime: '2026-09-08T15:00:00Z', resultNet: 18.5 }),
    trade({ id: 'B', direction: 'short', entryPrice: 50, exitPrice: 55, exitDatetime: '2026-09-08T17:00:00Z', resultNet: -5 }),
    trade({ id: 'C', entryPrice: 200, exitPrice: 200, exitDatetime: '2026-09-09T15:00:00Z', resultNet: 0 }),
    trade({ id: 'D', entryPrice: 0, exitPrice: 999, exitDatetime: '2026-08-20T15:00:00Z', resultNet: 999 }),
    trade({ id: 'E', exitPrice: undefined, exitDatetime: undefined, resultNet: 0 }),
  ];

  it('agrupa por dia local com PnL somado (cálculo à mão)', () => {
    const m = calendarPnl(trades, 2026, 9);
    expect(m.days).toHaveLength(2);
    // dia 08: 18.5 + (-5) = 13.5, 2 trades, 1W/1L
    expect(m.days[0]).toMatchObject({ date: '2026-09-08', pnl: 13.5, trades: 2, wins: 1, losses: 1 });
    // dia 09: breakeven conta trade mas nem W nem L
    expect(m.days[1]).toMatchObject({ date: '2026-09-09', pnl: 0, trades: 1, wins: 0, losses: 0 });
  });

  it('totais do mês + melhor/pior dia', () => {
    const m = calendarPnl(trades, 2026, 9);
    expect(m.monthPnl).toBe(13.5);
    expect(m.monthTrades).toBe(3);
    expect(m.monthWins).toBe(1);
    expect(m.monthLosses).toBe(1);
    expect(m.bestDay?.date).toBe('2026-09-08');
    expect(m.worstDay?.date).toBe('2026-09-09');
  });

  it('ignora outros meses, inclui o mês pedido', () => {
    const aug = calendarPnl(trades, 2026, 8);
    expect(aug.monthPnl).toBe(999);
    expect(aug.monthTrades).toBe(1);
  });

  it('mês vazio retorna zeros e nulls (nunca NaN)', () => {
    const m = calendarPnl(trades, 2026, 10);
    expect(m.days).toHaveLength(0);
    expect(m.monthPnl).toBe(0);
    expect(m.monthTrades).toBe(0);
    expect(m.bestDay).toBeNull();
    expect(m.worstDay).toBeNull();
  });
});

describe('J2–J7 — análises (cálculo à mão)', () => {
  // T1 long XAU 100->110 (60min, 10:00Z)  => +10, R 2.0   (London)
  // T2 long XAU 100->96  (30min, 14:00Z)  => -4,  R -1.0  (NewYork)
  // T3 short EUR 50->44  (120min, 03:00Z) => +6,  R 1.5   (Asian)
  // T4 short EUR 50->48  (15min, 09:00Z)  => +2,  R 0.5   (London)
  // T5 long XAU 100->98  (45min, 22:00Z)  => -2,  R -0.5  (Off)
  const base = { symbol: 'XAUUSD', direction: 'long', qty: 1, entryPrice: 100, commission: 0, swap: 0, rebate: 0, fees: 0 } as const;
  const jTrades = [
    trade({ ...base, id: 'T1', entryDatetime: '2026-09-08T10:00:00Z', exitDatetime: '2026-09-08T11:00:00Z', exitPrice: 110, resultNet: 10, resultR: 2.0 }),
    trade({ ...base, id: 'T2', entryDatetime: '2026-09-08T14:00:00Z', exitDatetime: '2026-09-08T14:30:00Z', exitPrice: 96, resultNet: -4, resultR: -1.0 }),
    trade({ ...base, id: 'T3', symbol: 'EURUSD', direction: 'short', entryPrice: 50, exitPrice: 44, entryDatetime: '2026-09-09T03:00:00Z', exitDatetime: '2026-09-09T05:00:00Z', resultNet: 6, resultR: 1.5 }),
    trade({ ...base, id: 'T4', symbol: 'EURUSD', direction: 'short', entryPrice: 50, exitPrice: 48, entryDatetime: '2026-09-09T09:00:00Z', exitDatetime: '2026-09-09T09:15:00Z', resultNet: 2, resultR: 0.5 }),
    trade({ ...base, id: 'T5', entryDatetime: '2026-09-09T22:00:00Z', exitDatetime: '2026-09-09T22:45:00Z', exitPrice: 98, resultNet: -2, resultR: -0.5 }),
  ];

  it('J5 directionSplit: long 3 trades +4 / short 2 trades +8', () => {
    const { long, short } = directionSplit(jTrades);
    expect(long).toMatchObject({ trades: 3, wins: 1, losses: 2, pnl: 4 });
    expect(long.winrate).toBeCloseTo(1 / 3, 6);
    expect(long.profitFactor).toBeCloseTo(10 / 6, 4);
    expect(long.avgR).toBeCloseTo(0.17, 2); // (2-1-0.5)/3
    expect(long.expectancy).toBeCloseTo(1.33, 2); // (1/3)*10-(2/3)*3
    expect(short).toMatchObject({ trades: 2, wins: 2, losses: 0, pnl: 8 });
    expect(short.winrate).toBe(1);
    expect(short.profitFactor).toBe('infinity'); // sem loss: símbolo, nunca Infinity cru
  });

  it('J6 symbolBreakdown ordenado por PnL + sampleOk (n<20)', () => {
    const rows = symbolBreakdown(jTrades);
    expect(rows.map((r) => r.symbol)).toEqual(['EURUSD', 'XAUUSD']);
    expect(rows[0]).toMatchObject({ trades: 2, pnl: 8 });
    expect(rows[1]).toMatchObject({ trades: 3, pnl: 4 });
    expect(rows[0].sampleOk).toBe(false); // 2 < 20
    expect(rows[1].sampleOk).toBe(false); // 3 < 20
  });

  it('J2 heatmapBySymbol top N por |PnL|', () => {
    const top = heatmapBySymbol(jTrades, 1);
    expect(top).toHaveLength(1);
    expect(top[0].symbol).toBe('EURUSD'); // |8| > |4|
  });

  it('A3 sessions custom: 2 buckets dividem diferente do padrão', () => {
    const custom = [
      { id: 'manha', label: 'Manhã 00–11', startH: 0, endH: 12 },
      { id: 'tarde', label: 'Tarde 12–23', startH: 12, endH: 24 },
    ];
    const s = sessionAnalysis(jTrades, custom);
    expect(s).toHaveLength(2);
    const by = Object.fromEntries(s.map((x) => [x.session, x]));
    // T1 10Z +10, T3 03Z +6, T4 09Z +2 => manhã (18, 3 trades); T2 14Z -4 + T5 22Z -2 => tarde
    expect(by.manha).toMatchObject({ trades: 3, pnl: 18 });
    expect(by.tarde).toMatchObject({ trades: 2, pnl: -6 });
  });

  it('A3 sem config usa o padrão (regressão J7)', () => {
    const s = sessionAnalysis(jTrades);
    expect(s.map((x) => x.session)).toEqual(['Asian', 'London', 'NewYork', 'Off']);
  });

  it('J7 sessionAnalysis buckets UTC (Asian/London/NY/Off)', () => {
    const s = sessionAnalysis(jTrades);
    const by = Object.fromEntries(s.map((x) => [x.session, x]));
    expect(by.Asian).toMatchObject({ trades: 1, pnl: 6 }); // T3 03Z
    expect(by.London).toMatchObject({ trades: 2, pnl: 12 }); // T1 10Z + T4 09Z
    expect(by.NewYork).toMatchObject({ trades: 1, pnl: -4 }); // T2 14Z
    expect(by.Off).toMatchObject({ trades: 1, pnl: -2 }); // T5 22Z
    expect(heatmapBySession(jTrades)).toHaveLength(4);
  });

  it('J3 rDistribution buckets 0.5R + avg/mediana/std à mão', () => {
    const d = rDistribution(jTrades, 0.5);
    // rs [-1,-0.5,0.5,1.5,2] => buckets [-1,-0.5),[-0.5,0),[0,0.5),[0.5,1),[1,1.5),[1.5,2]
    expect(d.count).toBe(5);
    expect(d.buckets.map((b) => b.count)).toEqual([1, 1, 0, 1, 0, 2]);
    expect(d.avg).toBe(0.5);
    expect(d.median).toBe(0.5);
    expect(d.std).toBeCloseTo(1.14, 2); // var 6.5/5=1.3
  });

  it('J3 vazio retorna nulls (nunca NaN)', () => {
    const d = rDistribution([], 0.5);
    expect(d.count).toBe(0);
    expect(d.avg).toBeNull();
    expect(d.buckets).toHaveLength(0);
  });

  it('A7 bucket 0.25 vs 1.0: nº de barras coerente, total preservado', () => {
    const fine = rDistribution(jTrades, 0.25);
    const coarse = rDistribution(jTrades, 1.0);
    expect(fine.buckets).toHaveLength(12); // -1..2 passo 0.25
    expect(fine.buckets.map((b) => b.count)).toEqual([1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1]);
    expect(fine.buckets.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(coarse.buckets).toHaveLength(3); // [-1,0),[0,1),[1,2]
    expect(coarse.buckets.map((b) => b.count)).toEqual([2, 1, 2]);
    expect(coarse.buckets.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(coarse.avg).toBe(fine.avg); // estatísticas independem do bucket
  });

  it('J4 durationStats minutos à mão (60,30,120,15,45)', () => {
    const d = durationStats(jTrades);
    expect(d.count).toBe(5);
    expect(d.avgMin).toBe(54); // 270/5
    expect(d.medianMin).toBe(45);
    expect(d.minMin).toBe(15);
    expect(d.maxMin).toBe(120);
    expect(d.byDirection.long).toMatchObject({ count: 3, avgMin: 45 });
    expect(d.byDirection.short).toMatchObject({ count: 2, avgMin: 67.5 });
  });
});

describe('J10–J11 — MAE/MFE e review semanal (cálculo à mão)', () => {
  const base = { symbol: 'XAUUSD', direction: 'long', qty: 1, entryPrice: 100, commission: 0, swap: 0, rebate: 0, fees: 0 } as const;

  it('tradeNetPnl prefere resultNet; cai na fórmula sem resultNet (não distorce sem multiplier)', () => {
    expect(tradeNetPnl(trade({ id: 'n1', exitPrice: 110, resultNet: 42 }))).toBe(42);
    const t = trade({ id: 'n2', exitPrice: 110, resultNet: undefined as unknown as number });
    expect(tradeNetPnl(t)).toBe(10);
  });

  it('J10 maeMfe via fills: long fills [102,105,98] x2 => MFE 10, MAE -4', () => {
    const t = trade({
      ...base, id: 'M1', exitPrice: 105,
      entryDatetime: '2026-09-08T10:00:00Z', exitDatetime: '2026-09-08T11:00:00Z',
      qty: 2, resultNet: 10, resultR: 2.0,
      executions: [
        { side: 'entry', price: 102, quantity: 2, timestamp: '2026-09-08T10:05:00Z' },
        { side: 'entry', price: 105, quantity: 2, timestamp: '2026-09-08T10:20:00Z' },
        { side: 'entry', price: 98, quantity: 2, timestamp: '2026-09-08T10:40:00Z' },
      ],
    });
    // signed: (102-100)*2=4, (105-100)*2=10, (98-100)*2=-4
    expect(maeMfe(t)).toEqual({ mfe: 10, mae: -4 });
  });

  it('J10 maeMfe short: fills [48,52] entry 50 x1 => MFE 2, MAE -2', () => {
    const t = trade({
      ...base, id: 'M2', direction: 'short', entryPrice: 50, exitPrice: 48,
      entryDatetime: '2026-09-09T10:00:00Z', exitDatetime: '2026-09-09T11:00:00Z',
      resultNet: 2, resultR: 1.0,
      executions: [
        { side: 'entry', price: 48, quantity: 1, timestamp: '2026-09-09T10:05:00Z' },
        { side: 'entry', price: 52, quantity: 1, timestamp: '2026-09-09T10:20:00Z' },
      ],
    });
    // signed: (48-50)*-1=2, (52-50)*-1=-2
    expect(maeMfe(t)).toEqual({ mfe: 2, mae: -2 });
  });

  it('J10 sem fills retorna nulls (nunca 0 — 0 esconderia "sem dado")', () => {
    const t = trade({ ...base, id: 'M3', exitPrice: 110, exitDatetime: '2026-09-08T11:00:00Z', resultNet: 10 });
    expect(maeMfe(t)).toEqual({ mae: null, mfe: null });
  });

  it('A2 campos mae/mfe reais têm prioridade sobre o proxy via fills', () => {
    const t = trade({
      ...base, id: 'M4', exitPrice: 110, exitDatetime: '2026-09-08T11:00:00Z',
      resultNet: 10, mae: -7.5, mfe: 22.25,
      executions: [
        { side: 'entry', price: 102, quantity: 1, timestamp: '2026-09-08T10:05:00Z' },
      ],
    });
    // fills dariam MFE 2 / MAE 0 — os campos reais vencem
    expect(maeMfe(t)).toEqual({ mae: -7.5, mfe: 22.25 });
  });

  it('J11 weeklyReview semana 07–13/set (ref 09/set, quarta)', () => {
    // W1 seg 08: long +10 R2.0 XAU | W2 qua 09: long -4 R-1.0 XAU | W3 dom 13: short +2 R0.5 EUR
    // W4 seg 14 (+999) fica FORA da semana
    const w = [
      trade({ ...base, id: 'W1', entryDatetime: '2026-09-08T10:00:00Z', exitDatetime: '2026-09-08T11:00:00Z', exitPrice: 110, resultNet: 10, resultR: 2.0 }),
      trade({ ...base, id: 'W2', entryDatetime: '2026-09-09T10:00:00Z', exitDatetime: '2026-09-09T11:00:00Z', exitPrice: 96, resultNet: -4, resultR: -1.0 }),
      trade({ ...base, id: 'W3', symbol: 'EURUSD', direction: 'short', entryPrice: 50, exitPrice: 48, entryDatetime: '2026-09-13T10:00:00Z', exitDatetime: '2026-09-13T11:00:00Z', resultNet: 2, resultR: 0.5 }),
      trade({ ...base, id: 'W4', entryDatetime: '2026-09-14T10:00:00Z', exitDatetime: '2026-09-14T11:00:00Z', exitPrice: 200, resultNet: 999, resultR: 5.0 }),
    ];
    const r = weeklyReview(w, '2026-09-09T12:00:00Z');
    expect(r.weekStart).toBe('2026-09-07');
    expect(r.weekEnd).toBe('2026-09-13');
    expect(r).toMatchObject({ trades: 3, pnl: 8, wins: 2, losses: 1 });
    expect(r.winrate).toBe(0.666667);
    expect(r.avgR).toBe(0.5); // (2-1+0.5)/3
    expect(r.bestDay?.date).toBe('2026-09-08');
    expect(r.worstDay?.date).toBe('2026-09-09');
    expect(r.bestSymbol).toBe('XAUUSD'); // +6 vs +2
    expect(r.worstSymbol).toBe('EURUSD');
  });

  it('J11 semana vazia retorna zeros e nulls', () => {
    const r = weeklyReview([], '2026-09-09T12:00:00Z');
    expect(r).toMatchObject({ trades: 0, pnl: 0, wins: 0, losses: 0, winrate: 0 });
    expect(r.avgR).toBeNull();
    expect(r.bestSymbol).toBeNull();
  });
});

describe('B1 — tradeReplay (sequência temporal)', () => {
  const b1base = { symbol: 'XAUUSD', direction: 'long' as const, qty: 1, entryPrice: 100, commission: 0, swap: 0, rebate: 0, fees: 0 };
  it('entry → fills ordenados → exit + MAE/MFE + notas', () => {
    const t = trade({
      ...b1base, id: 'R1', exitPrice: 105,
      entryDatetime: '2026-09-08T10:00:00Z', exitDatetime: '2026-09-08T12:00:00Z',
      resultNet: 10, notes: 'rompimento limpo',
      executions: [
        { side: 'entry', price: 104, quantity: 2, timestamp: '2026-09-08T10:20:00Z' },
        { side: 'entry', price: 102, quantity: 2, timestamp: '2026-09-08T10:05:00Z' },
      ],
    });
    const r = tradeReplay(t);
    expect(r.points.map((p) => p.label)).toEqual(['Entrada', 'Fill 1 (entry)', 'Fill 2 (entry)', 'Saída']);
    expect(r.points.map((p) => p.price)).toEqual([100, 102, 104, 105]);
    expect(r.points.map((p) => p.kind)).toEqual(['entry', 'fill', 'fill', 'exit']);
    expect(r.notes).toBe('rompimento limpo');
    expect(r.mfe).toBe(4); // fills 102/104, entry 100, qty 1
    expect(r.mae).toBe(0);
  });

  it('sem fills mostra s� entry?exit', () => {
    const t = trade({ ...b1base, id: 'R2', exitPrice: 110, exitDatetime: '2026-09-08T11:00:00Z', resultNet: 10 });
    const r = tradeReplay(t);
    expect(r.points.map((p) => p.kind)).toEqual(['entry', 'exit']);
  });
});


describe('journalAnalytics � drawdownAnalysis', () => {
  const t = (id: string, net: number, at: string) => trade({ id, resultNet: net, exitDatetime: at, entryDatetime: at });

  it('detecta drawdown peak->trough e marca n�o recuperado', () => {
    const r = drawdownAnalysis([
      t('d1', 1000, '2026-09-01T12:00:00Z'),
      t('d2', -3000, '2026-09-05T12:00:00Z'),
      t('d3', 500, '2026-09-10T12:00:00Z'),
    ], 10000);
    // equity: 10000 (capital inicial) -> 11000, 8000, 8500
    expect(r.series.map((s) => s.equity)).toEqual([10000, 11000, 8000, 8500]);
    expect(r.drawdowns).toHaveLength(1);
    expect(r.drawdowns[0].recovered).toBe(false);
    expect(r.drawdowns[0].drawdownAbs).toBe(3000);
    expect(r.drawdowns[0].drawdownPct).toBeCloseTo(27.27, 1);
    expect(r.maxDD.drawdownAbs).toBe(3000);
    expect(r.atPeak).toBe(false);
  });

  it('captura drawdown j� no 1� trade (capital inicial entra como pico)', () => {
    const r = drawdownAnalysis([
      t('f1', -1000, '2026-09-01T12:00:00Z'),
      t('f2', -500, '2026-09-02T12:00:00Z'),
    ], 10000);
    expect(r.drawdowns).toHaveLength(1);
    expect(r.drawdowns[0].drawdownAbs).toBe(1500);
    expect(r.maxDD.drawdownPct).toBeCloseTo(15, 1);
    expect(r.drawdowns[0].recovered).toBe(false);
  });

  it('recupera��o fecha o drawdown e volta ao pico', () => {
    const r = drawdownAnalysis([
      t('r1', 1000, '2026-09-01T12:00:00Z'),
      t('r2', -2000, '2026-09-03T12:00:00Z'),
      t('r3', 2500, '2026-09-08T12:00:00Z'),
    ], 10000);
    // equity: 11000, 9000, 11500 -> DD recuperado no 3�
    expect(r.drawdowns[0].recovered).toBe(true);
    expect(r.recoveryRate).toBe(100);
    expect(r.atPeak).toBe(true);
  });

  it('sem trades retorna s�rie vazia e m�ximos zerados', () => {
    const r = drawdownAnalysis([], 5000);
    expect(r.series).toHaveLength(0);
    expect(r.maxDD.drawdownPct).toBe(0);
  });
});
